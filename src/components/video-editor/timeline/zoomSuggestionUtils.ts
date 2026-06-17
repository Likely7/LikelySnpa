import type { CursorTelemetryPoint, ZoomFocus } from "../types";

export const MIN_DWELL_DURATION_MS = 450;
export const MAX_DWELL_DURATION_MS = 2600;
export const DWELL_MOVE_THRESHOLD = 0.02;
export const CLICK_SUGGESTION_STRENGTH_MS = MAX_DWELL_DURATION_MS + 1;
export const MIN_DRAG_FOLLOW_DURATION_MS = 250;
export const MIN_AUTO_ZOOM_DURATION_MS = 1200;
export const MAX_AUTO_ZOOM_DURATION_MS = 30_000;
export const AUTO_ZOOM_CONTEXT_PADDING_MS = 600;
export const DWELL_MERGE_GAP_MS = 800;
export const DWELL_MERGE_DISTANCE = 0.04;
/** Minimum spacing between two accepted suggestion centres. */
export const SUGGESTION_SPACING_MS = 1800;

export interface ZoomDwellCandidate {
	centerTimeMs: number;
	focus: ZoomFocus;
	strength: number;
	span: { start: number; end: number };
	kind: "dwell" | "click";
}

function isClickInteractionType(interactionType: CursorTelemetryPoint["interactionType"]) {
	return (
		interactionType === "click" ||
		interactionType === "double-click" ||
		interactionType === "right-click" ||
		interactionType === "middle-click"
	);
}

function normalizeTelemetrySample(
	sample: CursorTelemetryPoint,
	totalMs: number,
): CursorTelemetryPoint {
	return {
		timeMs: Math.max(0, Math.min(sample.timeMs, totalMs)),
		cx: Math.max(0, Math.min(sample.cx, 1)),
		cy: Math.max(0, Math.min(sample.cy, 1)),
		...(sample.interactionType ? { interactionType: sample.interactionType } : {}),
	};
}

export function normalizeCursorTelemetry(
	telemetry: CursorTelemetryPoint[],
	totalMs: number,
): CursorTelemetryPoint[] {
	return [...telemetry]
		.filter(
			(sample) =>
				Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy),
		)
		.sort((a, b) => a.timeMs - b.timeMs)
		.map((sample) => normalizeTelemetrySample(sample, totalMs));
}

export function detectZoomDwellCandidates(samples: CursorTelemetryPoint[]): ZoomDwellCandidate[] {
	if (samples.length < 2) {
		return [];
	}

	const dwellCandidates: ZoomDwellCandidate[] = [];
	let runStart = 0;

	const pushRunIfDwell = (startIndex: number, endIndexExclusive: number) => {
		if (endIndexExclusive - startIndex < 2) {
			return;
		}

		const start = samples[startIndex];
		const end = samples[endIndexExclusive - 1];
		const runDuration = end.timeMs - start.timeMs;
		if (runDuration < MIN_DWELL_DURATION_MS) {
			return;
		}

		const runSamples = samples.slice(startIndex, endIndexExclusive);
		const avgCx = runSamples.reduce((sum, sample) => sum + sample.cx, 0) / runSamples.length;
		const avgCy = runSamples.reduce((sum, sample) => sum + sample.cy, 0) / runSamples.length;

		dwellCandidates.push({
			centerTimeMs: Math.round((start.timeMs + end.timeMs) / 2),
			focus: { cx: avgCx, cy: avgCy },
			strength: Math.min(runDuration, MAX_DWELL_DURATION_MS),
			span: { start: start.timeMs, end: end.timeMs },
			kind: "dwell",
		});
	};

	for (let index = 1; index < samples.length; index += 1) {
		const prev = samples[index - 1];
		const curr = samples[index];
		const distance = Math.hypot(curr.cx - prev.cx, curr.cy - prev.cy);

		if (distance > DWELL_MOVE_THRESHOLD) {
			pushRunIfDwell(runStart, index);
			runStart = index;
		}
	}
	pushRunIfDwell(runStart, samples.length);

	const mergedDwellCandidates = mergeAdjacentDwellCandidates(dwellCandidates);

	for (const sample of samples) {
		if (!isClickInteractionType(sample.interactionType)) {
			continue;
		}
		if (
			mergedDwellCandidates.some(
				(candidate) => sample.timeMs >= candidate.span.start && sample.timeMs <= candidate.span.end,
			)
		) {
			continue;
		}

		mergedDwellCandidates.push({
			centerTimeMs: Math.round(sample.timeMs),
			focus: { cx: sample.cx, cy: sample.cy },
			strength: CLICK_SUGGESTION_STRENGTH_MS,
			span: { start: sample.timeMs, end: sample.timeMs },
			kind: "click",
		});
	}

	return mergedDwellCandidates;
}

export interface AutoZoomSuggestion {
	span: { start: number; end: number };
	focus: ZoomFocus;
	focusMode?: "auto" | "manual";
}

/**
 * Build non-overlapping zoom suggestions from cursor telemetry: detect dwell moments,
 * rank by duration, space by SUGGESTION_SPACING_MS, drop any overlapping an existing
 * region. Pure, shared by the magic-wand toggle and the on-load auto-suggest pass.
 */
export function buildAutoZoomSuggestions(options: {
	cursorTelemetry: CursorTelemetryPoint[];
	totalMs: number;
	existingRegions: { startMs: number; endMs: number }[];
	defaultDurationMs: number;
}): AutoZoomSuggestion[] {
	const { cursorTelemetry, totalMs, existingRegions, defaultDurationMs } = options;
	if (totalMs <= 0 || cursorTelemetry.length < 2) {
		return [];
	}

	const defaultDuration = clampDuration(defaultDurationMs, totalMs);
	if (defaultDuration <= 0) {
		return [];
	}

	const normalizedSamples = normalizeCursorTelemetry(cursorTelemetry, totalMs);
	if (normalizedSamples.length < 2) {
		return [];
	}

	const dwellCandidates = detectZoomDwellCandidates(normalizedSamples);
	if (dwellCandidates.length === 0) {
		return [];
	}

	const reservedSpans = existingRegions
		.map((region) => ({ start: region.startMs, end: region.endMs }))
		.sort((a, b) => a.start - b.start);

	const sortedCandidates = [...dwellCandidates].sort((a, b) => b.strength - a.strength);
	const acceptedCenters: number[] = [];
	const suggestions: AutoZoomSuggestion[] = [];

	for (const candidate of sortedCandidates) {
		const tooCloseToAccepted = acceptedCenters.some(
			(center) => Math.abs(center - candidate.centerTimeMs) < SUGGESTION_SPACING_MS,
		);
		if (tooCloseToAccepted) {
			continue;
		}

		const span = buildSuggestionSpan(candidate, totalMs, defaultDuration);
		const candidateStart = span.start;
		const candidateEnd = span.end;
		const hasOverlap = reservedSpans.some(
			(span) => candidateEnd > span.start && candidateStart < span.end,
		);
		if (hasOverlap) {
			continue;
		}

		reservedSpans.push({ start: candidateStart, end: candidateEnd });
		acceptedCenters.push(candidate.centerTimeMs);
		suggestions.push({
			span,
			focus: candidate.focus,
			focusMode: hasPressedCursorDuringSpan(normalizedSamples, span) ? "auto" : "manual",
		});
	}

	return suggestions;
}

function mergeAdjacentDwellCandidates(candidates: ZoomDwellCandidate[]): ZoomDwellCandidate[] {
	const sorted = [...candidates].sort((a, b) => a.span.start - b.span.start);
	const merged: ZoomDwellCandidate[] = [];

	for (const candidate of sorted) {
		const previous = merged.at(-1);
		if (!previous) {
			merged.push(candidate);
			continue;
		}

		const gap = candidate.span.start - previous.span.end;
		const focusDistance = Math.hypot(
			candidate.focus.cx - previous.focus.cx,
			candidate.focus.cy - previous.focus.cy,
		);
		if (gap > DWELL_MERGE_GAP_MS || focusDistance > DWELL_MERGE_DISTANCE) {
			merged.push(candidate);
			continue;
		}

		const previousDuration = Math.max(1, previous.span.end - previous.span.start);
		const candidateDuration = Math.max(1, candidate.span.end - candidate.span.start);
		const totalDuration = previousDuration + candidateDuration;
		const span = {
			start: previous.span.start,
			end: Math.max(previous.span.end, candidate.span.end),
		};
		const spanDuration = span.end - span.start;
		merged[merged.length - 1] = {
			centerTimeMs: Math.round((span.start + span.end) / 2),
			focus: {
				cx:
					(previous.focus.cx * previousDuration + candidate.focus.cx * candidateDuration) /
					totalDuration,
				cy:
					(previous.focus.cy * previousDuration + candidate.focus.cy * candidateDuration) /
					totalDuration,
			},
			strength: Math.min(spanDuration, MAX_DWELL_DURATION_MS),
			span,
			kind: "dwell",
		};
	}

	return merged;
}

function clampDuration(durationMs: number, totalMs: number): number {
	if (totalMs <= 0) {
		return 0;
	}
	const minDuration = Math.min(MIN_AUTO_ZOOM_DURATION_MS, totalMs);
	const maxDuration = Math.min(MAX_AUTO_ZOOM_DURATION_MS, totalMs);
	return Math.max(minDuration, Math.min(Math.round(durationMs), maxDuration));
}

function buildSuggestionSpan(
	candidate: ZoomDwellCandidate,
	totalMs: number,
	defaultDuration: number,
): { start: number; end: number } {
	const rawDuration = candidate.span.end - candidate.span.start;
	const desiredDuration =
		candidate.kind === "dwell"
			? clampDuration(rawDuration + AUTO_ZOOM_CONTEXT_PADDING_MS * 2, totalMs)
			: defaultDuration;
	const centeredStart = Math.round(candidate.centerTimeMs - desiredDuration / 2);
	const start = Math.max(0, Math.min(centeredStart, totalMs - desiredDuration));
	return { start, end: start + desiredDuration };
}

export function hasPressedCursorDuringSpan(
	samples: CursorTelemetryPoint[],
	span: { start: number; end: number },
	minDurationMs = MIN_DRAG_FOLLOW_DURATION_MS,
): boolean {
	let pressStart: number | null = null;

	for (const sample of samples) {
		if (sample.timeMs > span.end && pressStart === null) {
			break;
		}

		if (sample.timeMs < span.start) {
			if (isClickInteractionType(sample.interactionType)) {
				pressStart = sample.timeMs;
			} else if (sample.interactionType === "mouseup") {
				pressStart = null;
			}
			continue;
		}

		if (isClickInteractionType(sample.interactionType)) {
			pressStart = sample.timeMs;
			continue;
		}

		if (sample.interactionType !== "mouseup" || pressStart === null) {
			continue;
		}

		const overlapStart = Math.max(pressStart, span.start);
		const overlapEnd = Math.min(sample.timeMs, span.end);
		if (overlapEnd - overlapStart >= minDurationMs) {
			return true;
		}

		pressStart = null;
	}

	return false;
}
