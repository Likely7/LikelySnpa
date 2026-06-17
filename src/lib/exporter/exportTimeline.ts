import type { SpeedRegion, TrimRegion } from "@/components/video-editor/types";

const EPSILON_SEC = 0.001;

export interface ExportTimelineSegment {
	startSec: number;
	endSec: number;
	speed: number;
}

/**
 * Converts trim regions into the source-time segments that should be kept.
 * Returns a single full-duration segment when no trim regions are present.
 */
export function computeExportKeepSegments(
	totalDurationSec: number,
	trimRegions?: TrimRegion[],
): Array<{ startSec: number; endSec: number }> {
	const safeDuration = Math.max(0, totalDurationSec);
	if (!trimRegions || trimRegions.length === 0) {
		return [{ startSec: 0, endSec: safeDuration }];
	}

	const sorted = [...trimRegions].sort((a, b) => a.startMs - b.startMs);
	const segments: Array<{ startSec: number; endSec: number }> = [];
	let cursor = 0;

	for (const trim of sorted) {
		const trimStart = Math.max(0, Math.min(safeDuration, trim.startMs / 1000));
		const trimEnd = Math.max(trimStart, Math.min(safeDuration, trim.endMs / 1000));
		if (cursor < trimStart) {
			segments.push({ startSec: cursor, endSec: trimStart });
		}
		cursor = Math.max(cursor, trimEnd);
	}

	if (cursor < safeDuration) {
		segments.push({ startSec: cursor, endSec: safeDuration });
	}

	return segments;
}

/**
 * Splits keep-segments by overlapping speed regions, annotating each sub-segment
 * with its playback speed multiplier.
 */
export function splitExportSegmentsBySpeed(
	segments: Array<{ startSec: number; endSec: number }>,
	speedRegions?: SpeedRegion[],
): ExportTimelineSegment[] {
	if (!speedRegions || speedRegions.length === 0) {
		return segments.map((segment) => ({ ...segment, speed: 1 }));
	}

	const result: ExportTimelineSegment[] = [];
	for (const segment of segments) {
		const overlapping = speedRegions
			.filter(
				(region) =>
					region.startMs / 1000 < segment.endSec && region.endMs / 1000 > segment.startSec,
			)
			.sort((a, b) => a.startMs - b.startMs);

		if (overlapping.length === 0) {
			result.push({ ...segment, speed: 1 });
			continue;
		}

		let cursor = segment.startSec;
		for (const region of overlapping) {
			const regionStart = Math.max(region.startMs / 1000, segment.startSec);
			const regionEnd = Math.min(region.endMs / 1000, segment.endSec);
			if (cursor < regionStart) {
				result.push({ startSec: cursor, endSec: regionStart, speed: 1 });
			}
			result.push({ startSec: regionStart, endSec: regionEnd, speed: region.speed });
			cursor = regionEnd;
		}
		if (cursor < segment.endSec) {
			result.push({ startSec: cursor, endSec: segment.endSec, speed: 1 });
		}
	}

	return result.filter((segment) => segment.endSec - segment.startSec > 0.0001);
}

export function buildExportTimeline(
	totalDurationSec: number,
	trimRegions?: TrimRegion[],
	speedRegions?: SpeedRegion[],
): ExportTimelineSegment[] {
	return splitExportSegmentsBySpeed(
		computeExportKeepSegments(totalDurationSec, trimRegions),
		speedRegions,
	);
}

export function getExportTimelineMetrics(
	totalDurationSec: number,
	targetFrameRate: number,
	trimRegions?: TrimRegion[],
	speedRegions?: SpeedRegion[],
): { effectiveDuration: number; totalFrames: number; segments: ExportTimelineSegment[] } {
	const segments = buildExportTimeline(totalDurationSec, trimRegions, speedRegions);
	return {
		segments,
		effectiveDuration: segments.reduce(
			(sum, segment) => sum + (segment.endSec - segment.startSec) / segment.speed,
			0,
		),
		totalFrames: segments.reduce((sum, segment) => {
			const segmentDurationSec = segment.endSec - segment.startSec - EPSILON_SEC;
			return sum + Math.max(0, Math.ceil((segmentDurationSec / segment.speed) * targetFrameRate));
		}, 0),
	};
}
