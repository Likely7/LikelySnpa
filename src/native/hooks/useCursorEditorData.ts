import { useEffect, useMemo, useState } from "react";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import type { CursorPreviewData, CursorRecordingData } from "@/native/contracts";
import { nativeBridgeClient } from "../client";

const EDITOR_CURSOR_PREVIEW_INTERVAL_MS = 100;

interface UseCursorEditorDataResult {
	recordingData: CursorRecordingData | null;
	telemetry: CursorTelemetryPoint[];
	loading: boolean;
	error: string | null;
	originalSampleCount: number;
	sampleIntervalMs: number;
	loadFullRecordingData: () => Promise<CursorRecordingData>;
}

function toTelemetrySamples(data: CursorRecordingData | null): CursorTelemetryPoint[] {
	if (!data?.samples?.length) {
		return [];
	}

	return data.samples.map((sample) => ({
		timeMs: sample.timeMs,
		cx: sample.cx,
		cy: sample.cy,
		...(sample.interactionType ? { interactionType: sample.interactionType } : {}),
	}));
}

/**
 * Single-source cursor loader for the editor. Older editor code loaded the same
 * cursor.json twice: once as preview telemetry and once as native recording data.
 * Keeping one load path avoids duplicate JSON parse, IPC transfer, and React state
 * churn; this hook is also the future replacement point for cursor indexes.
 */
export function useCursorEditorData(videoPath: string | null): UseCursorEditorDataResult {
	const [recordingData, setRecordingData] = useState<CursorRecordingData | null>(null);
	const [previewMeta, setPreviewMeta] = useState<{
		originalSampleCount: number;
		sampleIntervalMs: number;
	}>({
		originalSampleCount: 0,
		sampleIntervalMs: EDITOR_CURSOR_PREVIEW_INTERVAL_MS,
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function loadCursorData() {
			if (!videoPath) {
				setRecordingData(null);
				setPreviewMeta({
					originalSampleCount: 0,
					sampleIntervalMs: EDITOR_CURSOR_PREVIEW_INTERVAL_MS,
				});
				setLoading(false);
				setError(null);
				return;
			}

			const startedAt = performance.now();
			setLoading(true);
			setError(null);

			try {
				const previewData = await nativeBridgeClient.cursor.getPreviewData(
					videoPath,
					EDITOR_CURSOR_PREVIEW_INTERVAL_MS,
				);
				const nextData = toPreviewRecordingData(previewData);
				if (!cancelled) {
					setRecordingData(nextData);
					setPreviewMeta({
						originalSampleCount: previewData.originalSampleCount,
						sampleIntervalMs: previewData.sampleIntervalMs,
					});
					console.info("[editor-open] cursor recording data loaded", {
						videoPath,
						samples: nextData.samples.length,
						originalSamples: previewData.originalSampleCount,
						sampleIntervalMs: previewData.sampleIntervalMs,
						assets: nextData.assets.length,
						durationMs: Math.round(performance.now() - startedAt),
					});
				}
			} catch (nextError) {
				if (!cancelled) {
					setRecordingData(null);
					setError(nextError instanceof Error ? nextError.message : "Failed to load cursor data");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		loadCursorData();

		return () => {
			cancelled = true;
		};
	}, [videoPath]);

	const telemetry = useMemo(() => toTelemetrySamples(recordingData), [recordingData]);
	const loadFullRecordingData = useMemo(
		() => async () => {
			if (!videoPath) {
				return {
					version: 2,
					provider: "none" as const,
					samples: [],
					assets: [],
				};
			}

			const startedAt = performance.now();
			const data = await nativeBridgeClient.cursor.getRecordingData(videoPath);
			console.info("[export] full cursor recording data loaded", {
				videoPath,
				samples: data.samples.length,
				assets: data.assets.length,
				durationMs: Math.round(performance.now() - startedAt),
			});
			return data;
		},
		[videoPath],
	);

	return {
		recordingData,
		telemetry,
		loading,
		error,
		originalSampleCount: previewMeta.originalSampleCount,
		sampleIntervalMs: previewMeta.sampleIntervalMs,
		loadFullRecordingData,
	};
}

function toPreviewRecordingData(data: CursorPreviewData): CursorRecordingData {
	return {
		version: data.version,
		provider: data.provider,
		samples: data.samples,
		assets: [],
	};
}
