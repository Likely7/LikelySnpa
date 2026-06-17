import { ALL_FORMATS, type AudioSample, AudioSampleSink, Input, UrlSource } from "mediabunny";
import { useEffect, useRef, useState } from "react";

const WAVEFORM_PEAKS_PER_SECOND = 200;
const WAVEFORM_MAX_PEAK_BLOCKS = 24_000;
const SOURCE_CACHE_BYTES = 24 * 1024 * 1024;
const LOCAL_RANGE_CHUNK_BYTES = 1024 * 1024;

type AudioPeaksState = {
	peaks: Float32Array | null;
	loading: boolean;
	error: string | null;
};

type PeakCachePayload = {
	durationSec: number;
	peaksPerSecond: number;
	peaks: number[];
};

function fileUrlToPath(fileUrl: string): string | null {
	try {
		const url = new URL(fileUrl);
		if (url.protocol !== "file:") {
			return null;
		}

		const pathname = decodeURIComponent(url.pathname);
		if (url.host && url.host !== "localhost") {
			return `//${url.host}${pathname}`;
		}
		if (/^\/[a-zA-Z]:/.test(pathname)) {
			return pathname.slice(1);
		}
		return pathname;
	} catch {
		return null;
	}
}

function parseRangeHeader(value: string | null): { start: number; endExclusive?: number } {
	if (!value) {
		return { start: 0 };
	}

	const match = /^bytes=(\d+)-(\d*)$/i.exec(value.trim());
	if (!match) {
		return { start: 0 };
	}

	const start = Number(match[1]);
	const endInclusive = match[2] ? Number(match[2]) : undefined;
	return {
		start: Number.isFinite(start) ? start : 0,
		endExclusive:
			typeof endInclusive === "number" && Number.isFinite(endInclusive)
				? endInclusive + 1
				: undefined,
	};
}

async function createLocalRangeResponse(
	filePath: string,
	requestInit?: RequestInit,
): Promise<Response> {
	if (!window.electronAPI?.statFile || !window.electronAPI?.readFileRange) {
		throw new Error("Local ranged file reads are unavailable.");
	}

	const stat = await window.electronAPI.statFile(filePath);
	if (!stat.success || typeof stat.size !== "number") {
		throw new Error(stat.error || "Could not stat source file.");
	}

	const { start, endExclusive } = parseRangeHeader(new Headers(requestInit?.headers).get("Range"));
	const safeStart = Math.max(0, Math.min(Math.floor(start), stat.size));
	const requestedEnd =
		typeof endExclusive === "number"
			? Math.floor(endExclusive)
			: safeStart + LOCAL_RANGE_CHUNK_BYTES;
	const safeEnd = Math.max(
		safeStart,
		Math.min(requestedEnd, safeStart + LOCAL_RANGE_CHUNK_BYTES, stat.size),
	);
	const result = await window.electronAPI.readFileRange(filePath, safeStart, safeEnd);
	if (!result.success || !result.data) {
		throw new Error(result.message || result.error || "Could not read source file range.");
	}

	return new Response(result.data, {
		status: 206,
		headers: {
			"Accept-Ranges": "bytes",
			"Content-Length": String(result.data.byteLength),
			"Content-Range": `bytes ${safeStart}-${Math.max(safeStart, safeEnd) - 1}/${stat.size}`,
			"Content-Type": "application/octet-stream",
		},
	});
}

function createWaveformSource(videoUrl: string) {
	const localPath = fileUrlToPath(videoUrl);
	if (localPath && window.electronAPI) {
		return new UrlSource(`likelysnap-local://${encodeURIComponent(localPath)}`, {
			maxCacheSize: SOURCE_CACHE_BYTES,
			parallelism: 1,
			getRetryDelay: () => null,
			fetchFn: (_url, requestInit) => createLocalRangeResponse(localPath, requestInit),
		});
	}

	return new UrlSource(videoUrl, {
		maxCacheSize: SOURCE_CACHE_BYTES,
		parallelism: 1,
	});
}

function accumulateSamplePeaks(
	sample: AudioSample,
	peaks: Float32Array,
	totalBlocks: number,
	durationSec: number,
) {
	if (
		sample.numberOfFrames <= 0 ||
		sample.numberOfChannels <= 0 ||
		sample.sampleRate <= 0 ||
		durationSec <= 0
	) {
		return;
	}

	const channels: Float32Array[] = [];
	for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
		const plane = new Float32Array(
			sample.allocationSize({ planeIndex: channel, format: "f32-planar" }) /
				Float32Array.BYTES_PER_ELEMENT,
		);
		sample.copyTo(plane, { planeIndex: channel, format: "f32-planar" });
		channels.push(plane);
	}

	for (let frame = 0; frame < sample.numberOfFrames; frame += 1) {
		const timestampSec = sample.timestamp + frame / sample.sampleRate;
		if (timestampSec < 0 || timestampSec > durationSec) {
			continue;
		}

		const blockIndex = Math.min(
			totalBlocks - 1,
			Math.max(0, Math.floor((timestampSec / durationSec) * totalBlocks)),
		);
		let value = 0;
		for (const channel of channels) {
			value += channel[frame] ?? 0;
		}
		value /= channels.length;

		const minIndex = blockIndex * 2;
		const maxIndex = minIndex + 1;
		if (value < peaks[minIndex]) peaks[minIndex] = value;
		if (value > peaks[maxIndex]) peaks[maxIndex] = value;
	}
}

async function computeAudioPeaks(videoUrl: string, signal: AbortSignal): Promise<PeakCachePayload> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: createWaveformSource(videoUrl),
	});

	try {
		const audioTrack = await input.getPrimaryAudioTrack();
		if (signal.aborted) throw new DOMException("Aborted", "AbortError");
		if (!audioTrack) {
			return { durationSec: 0, peaksPerSecond: WAVEFORM_PEAKS_PER_SECOND, peaks: [] };
		}

		if (!(await audioTrack.canDecode())) {
			throw new Error("Audio track cannot be decoded for waveform.");
		}

		const durationSec = await input.computeDuration();
		if (!Number.isFinite(durationSec) || durationSec <= 0) {
			return { durationSec: 0, peaksPerSecond: WAVEFORM_PEAKS_PER_SECOND, peaks: [] };
		}

		const totalBlocks = Math.max(
			1,
			Math.min(WAVEFORM_MAX_PEAK_BLOCKS, Math.ceil(durationSec * WAVEFORM_PEAKS_PER_SECOND)),
		);
		const peaks = new Float32Array(totalBlocks * 2);
		const sink = new AudioSampleSink(audioTrack);

		for await (const sample of sink.samples(0, durationSec)) {
			if (signal.aborted) {
				sample.close();
				throw new DOMException("Aborted", "AbortError");
			}
			try {
				accumulateSamplePeaks(sample, peaks, totalBlocks, durationSec);
			} finally {
				sample.close();
			}
		}

		return {
			durationSec,
			peaksPerSecond: WAVEFORM_PEAKS_PER_SECOND,
			peaks: Array.from(peaks, (value) => Number(value.toFixed(6))),
		};
	} finally {
		input.dispose();
	}
}

/**
 * Lazily prepares timeline waveform peaks without loading the full media file
 * into renderer memory. Local Electron files are read through ranged IPC and
 * cached on disk by source path/size/mtime, so long recordings pay the decode
 * cost only when the user enables the waveform and only once per source file.
 */
export function useAudioPeaks(videoUrl?: string): AudioPeaksState {
	const memoryCacheRef = useRef<Map<string, Float32Array>>(new Map());
	const [state, setState] = useState<AudioPeaksState>(() => ({
		peaks: videoUrl ? (memoryCacheRef.current.get(videoUrl) ?? null) : null,
		loading: false,
		error: null,
	}));

	useEffect(() => {
		if (!videoUrl) {
			setState({ peaks: null, loading: false, error: null });
			return;
		}

		const cached = memoryCacheRef.current.get(videoUrl);
		if (cached) {
			setState({ peaks: cached, loading: false, error: null });
			return;
		}

		let cancelled = false;
		const controller = new AbortController();
		setState({ peaks: null, loading: true, error: null });

		(async () => {
			try {
				const localPath = fileUrlToPath(videoUrl);
				if (localPath && window.electronAPI?.readWaveformPeaksCache) {
					const diskCache = await window.electronAPI.readWaveformPeaksCache(localPath);
					if (cancelled) return;
					if (diskCache.success && diskCache.cached && Array.isArray(diskCache.peaks)) {
						const peaks = Float32Array.from(diskCache.peaks);
						memoryCacheRef.current.set(videoUrl, peaks);
						setState({ peaks, loading: false, error: null });
						return;
					}
				}

				const payload = await computeAudioPeaks(videoUrl, controller.signal);
				if (cancelled) return;
				const peaks = Float32Array.from(payload.peaks);
				memoryCacheRef.current.set(videoUrl, peaks);
				setState({ peaks, loading: false, error: null });

				const localPathForWrite = fileUrlToPath(videoUrl);
				if (localPathForWrite && window.electronAPI?.writeWaveformPeaksCache) {
					void window.electronAPI.writeWaveformPeaksCache(localPathForWrite, payload);
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") return;
				const message = err instanceof Error ? err.message : String(err);
				console.warn("useAudioPeaks: could not prepare waveform:", err);
				if (!cancelled) setState({ peaks: null, loading: false, error: message });
			}
		})();

		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [videoUrl]);

	return state;
}
