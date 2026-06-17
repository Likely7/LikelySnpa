import type {
	CursorCapabilities,
	CursorPreviewData,
	CursorRecordingData,
} from "../../../src/native/contracts";
import type { CursorNativeAdapter, CursorTelemetryLoadResult } from "./adapter";

interface TelemetryCursorAdapterOptions {
	loadRecordingData: (videoPath: string) => Promise<CursorRecordingData>;
	resolveVideoPath: (videoPath?: string | null) => string | null;
	loadTelemetry: (videoPath: string) => Promise<CursorTelemetryLoadResult>;
}

export class TelemetryCursorAdapter implements CursorNativeAdapter {
	readonly kind = "none" as const;

	constructor(private readonly options: TelemetryCursorAdapterOptions) {}

	async getCapabilities(): Promise<CursorCapabilities> {
		return {
			telemetry: true,
			systemAssets: false,
			provider: this.kind,
		};
	}

	async getRecordingData(videoPath?: string | null): Promise<CursorRecordingData> {
		const resolvedVideoPath = this.options.resolveVideoPath(videoPath);
		if (!resolvedVideoPath) {
			return {
				version: 2,
				provider: this.kind,
				samples: [],
				assets: [],
			};
		}

		return this.options.loadRecordingData(resolvedVideoPath);
	}

	async getPreviewData(
		videoPath?: string | null,
		sampleIntervalMs?: number,
	): Promise<CursorPreviewData> {
		const recordingData = await this.getRecordingData(videoPath);
		const intervalMs =
			typeof sampleIntervalMs === "number" && Number.isFinite(sampleIntervalMs)
				? Math.max(16, Math.round(sampleIntervalMs))
				: 100;
		const samples = downsampleCursorSamples(recordingData.samples, intervalMs);

		return {
			version: recordingData.version,
			provider: recordingData.provider,
			samples,
			originalSampleCount: recordingData.samples.length,
			sampleIntervalMs: intervalMs,
		};
	}

	async getTelemetry(videoPath?: string | null) {
		const resolvedVideoPath = this.options.resolveVideoPath(videoPath);
		if (!resolvedVideoPath) {
			return {
				success: false,
				message: "No video path is available for cursor telemetry",
				samples: [],
			} satisfies CursorTelemetryLoadResult;
		}

		return this.options.loadTelemetry(resolvedVideoPath);
	}
}

function downsampleCursorSamples(
	samples: CursorRecordingData["samples"],
	sampleIntervalMs: number,
): CursorRecordingData["samples"] {
	if (samples.length <= 2) {
		return samples;
	}

	const downsampled: CursorRecordingData["samples"] = [];
	let lastKeptTimeMs = Number.NEGATIVE_INFINITY;

	for (const sample of samples) {
		const keepForTime = sample.timeMs - lastKeptTimeMs >= sampleIntervalMs;
		const keepForInteraction = sample.interactionType && sample.interactionType !== "move";
		if (keepForTime || keepForInteraction) {
			downsampled.push(sample);
			lastKeptTimeMs = sample.timeMs;
		}
	}

	const finalSample = samples[samples.length - 1];
	if (downsampled[downsampled.length - 1] !== finalSample) {
		downsampled.push(finalSample);
	}

	return downsampled;
}
