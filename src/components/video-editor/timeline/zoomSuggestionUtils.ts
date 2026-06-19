import type { CursorTelemetryPoint, ZoomFocus } from "../types";

export const MIN_DWELL_DURATION_MS = 450;
export const MAX_DWELL_DURATION_MS = 2600;
export const DWELL_MOVE_THRESHOLD = 0.02;
export const DWELL_AREA_THRESHOLD = 0.055;
export const MIN_DRAG_FOLLOW_DURATION_MS = 450;
export const MIN_AUTO_ZOOM_DURATION_MS = 1200;
export const MAX_AUTO_ZOOM_DURATION_MS = 6_000;
export const LONG_DWELL_DURATION_MS = 8_000;
export const MAX_LONG_AUTO_ZOOM_DURATION_MS = 45_000;
export const AUTO_ZOOM_CONTEXT_PADDING_MS = 600;
export const DWELL_MERGE_GAP_MS = 800;
export const DWELL_MERGE_DISTANCE = 0.04;
export const CLICK_STAY_WINDOW_MS = 850;
export const CLICK_STAY_DISTANCE = 0.045;
export const CLICK_LEAVE_DISTANCE = 0.12;
export const CLICK_LEAVE_WINDOW_MS = 650;
export const MIN_CLICK_INTENT_SCORE = 900;
/** Minimum spacing between two accepted suggestion centres. */
export const SUGGESTION_SPACING_MS = 1800;

export interface ZoomDwellCandidate {
	centerTimeMs: number;
	focus: ZoomFocus;
	strength: number;
	span: { start: number; end: number };
	kind: "dwell" | "long-dwell" | "click" | "press";
	focusMode?: "smart" | "manual";
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
	let runAnchor = samples[0];

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

		const kind = runDuration >= LONG_DWELL_DURATION_MS ? "long-dwell" : "dwell";
		dwellCandidates.push({
			centerTimeMs: Math.round((start.timeMs + end.timeMs) / 2),
			focus: { cx: avgCx, cy: avgCy },
			strength:
				kind === "long-dwell"
					? MAX_DWELL_DURATION_MS + Math.min(runDuration, MAX_LONG_AUTO_ZOOM_DURATION_MS)
					: Math.min(runDuration, MAX_DWELL_DURATION_MS),
			span: { start: start.timeMs, end: end.timeMs },
			kind,
		});
	};

	for (let index = 1; index < samples.length; index += 1) {
		const prev = samples[index - 1];
		const curr = samples[index];
		const distance = Math.hypot(curr.cx - prev.cx, curr.cy - prev.cy);
		const distanceFromAnchor = Math.hypot(curr.cx - runAnchor.cx, curr.cy - runAnchor.cy);

		if (distance > DWELL_MOVE_THRESHOLD || distanceFromAnchor > DWELL_AREA_THRESHOLD) {
			pushRunIfDwell(runStart, index);
			runStart = index;
			runAnchor = curr;
		}
	}
	pushRunIfDwell(runStart, samples.length);

	const mergedDwellCandidates = mergeAdjacentDwellCandidates(dwellCandidates);
	const interactionCandidates = detectInteractionCandidates(samples, mergedDwellCandidates);

	return [...mergedDwellCandidates, ...interactionCandidates];
}

export interface AutoZoomSuggestion {
	span: { start: number; end: number };
	focus: ZoomFocus;
	focusMode?: "smart" | "manual";
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
			focusMode:
				candidate.focusMode ??
				(hasPressedCursorDuringSpan(normalizedSamples, span) ? "smart" : "manual"),
		});
	}

	return suggestions.sort((a, b) => a.span.start - b.span.start);
}

function detectInteractionCandidates(
	samples: CursorTelemetryPoint[],
	dwellCandidates: ZoomDwellCandidate[],
): ZoomDwellCandidate[] {
	const candidates: ZoomDwellCandidate[] = [];
	for (let index = 0; index < samples.length; index += 1) {
		const sample = samples[index];
		if (!isClickInteractionType(sample.interactionType)) {
			continue;
		}

		const releaseIndex = findMouseUpIndex(samples, index);
		const release = releaseIndex >= 0 ? samples[releaseIndex] : null;
		const pressDuration = release ? release.timeMs - sample.timeMs : 0;
		const isPress = pressDuration >= MIN_DRAG_FOLLOW_DURATION_MS;
		const repeated = hasNearbyClick(samples, index);
		const isDoubleClick = sample.interactionType === "double-click";
		const stayScore = computeClickStayScore(samples, index);
		const leavePenalty = computeClickLeavePenalty(samples, index);
		const overlappingDwell = dwellCandidates.find(
			(candidate) => sample.timeMs >= candidate.span.start && sample.timeMs <= candidate.span.end,
		);

		if (overlappingDwell) {
			overlappingDwell.strength += Math.max(300, stayScore * 0.5) + (isPress ? 900 : 0);
			if (isPress || repeated) {
				overlappingDwell.focusMode = "smart";
			}
			overlappingDwell.focus = isPress ? sample : overlappingDwell.focus;
			continue;
		}

		if (!isDoubleClick && !repeated && !isPress) {
			continue;
		}

		const base = isDoubleClick ? 2600 : repeated ? 2300 : 2400;
		const score = base + stayScore - leavePenalty;
		if (score < MIN_CLICK_INTENT_SCORE) {
			continue;
		}

		const end = release ? release.timeMs : sample.timeMs;
		candidates.push({
			centerTimeMs: Math.round(isPress ? (sample.timeMs + end) / 2 : sample.timeMs),
			focus: { cx: sample.cx, cy: sample.cy },
			strength: score,
			span: { start: sample.timeMs, end },
			kind: isPress ? "press" : "click",
			focusMode: isPress || repeated ? "smart" : "manual",
		});
	}
	return candidates;
}

function findMouseUpIndex(samples: CursorTelemetryPoint[], clickIndex: number): number {
	for (let index = clickIndex + 1; index < samples.length; index += 1) {
		const sample = samples[index];
		if (sample.timeMs - samples[clickIndex].timeMs > 3000) {
			return -1;
		}
		if (sample.interactionType === "mouseup") {
			return index;
		}
		if (isClickInteractionType(sample.interactionType)) {
			return -1;
		}
	}
	return -1;
}

function hasNearbyClick(samples: CursorTelemetryPoint[], clickIndex: number): boolean {
	const click = samples[clickIndex];
	return samples.some((sample, index) => {
		if (index === clickIndex || !isClickInteractionType(sample.interactionType)) return false;
		if (Math.abs(sample.timeMs - click.timeMs) > 900) return false;
		return Math.hypot(sample.cx - click.cx, sample.cy - click.cy) <= CLICK_STAY_DISTANCE;
	});
}

function computeClickStayScore(samples: CursorTelemetryPoint[], clickIndex: number): number {
	const click = samples[clickIndex];
	const until = click.timeMs + CLICK_STAY_WINDOW_MS;
	let latestNearby = click.timeMs;
	let nearbyCount = 0;

	for (let index = clickIndex + 1; index < samples.length; index += 1) {
		const sample = samples[index];
		if (sample.timeMs > until) break;
		const distance = Math.hypot(sample.cx - click.cx, sample.cy - click.cy);
		if (distance <= CLICK_STAY_DISTANCE) {
			latestNearby = sample.timeMs;
			nearbyCount += 1;
		}
	}

	const stayMs = latestNearby - click.timeMs;
	return Math.min(1100, stayMs * 1.1 + nearbyCount * 45);
}

function computeClickLeavePenalty(samples: CursorTelemetryPoint[], clickIndex: number): number {
	const click = samples[clickIndex];
	const until = click.timeMs + CLICK_LEAVE_WINDOW_MS;

	for (let index = clickIndex + 1; index < samples.length; index += 1) {
		const sample = samples[index];
		if (sample.timeMs > until) break;
		const distance = Math.hypot(sample.cx - click.cx, sample.cy - click.cy);
		if (distance >= CLICK_LEAVE_DISTANCE) {
			const speed = distance / Math.max(1, sample.timeMs - click.timeMs);
			return 900 + Math.min(800, speed * 120_000);
		}
	}

	return 0;
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
		const kind = spanDuration >= LONG_DWELL_DURATION_MS ? "long-dwell" : "dwell";
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
			strength:
				kind === "long-dwell"
					? MAX_DWELL_DURATION_MS + Math.min(spanDuration, MAX_LONG_AUTO_ZOOM_DURATION_MS)
					: Math.min(spanDuration, MAX_DWELL_DURATION_MS),
			span,
			kind,
		};
	}

	return merged;
}

function clampDuration(
	durationMs: number,
	totalMs: number,
	maxDurationMs = MAX_AUTO_ZOOM_DURATION_MS,
): number {
	if (totalMs <= 0) {
		return 0;
	}
	const minDuration = Math.min(MIN_AUTO_ZOOM_DURATION_MS, totalMs);
	const maxDuration = Math.min(maxDurationMs, totalMs);
	return Math.max(minDuration, Math.min(Math.round(durationMs), maxDuration));
}

function buildSuggestionSpan(
	candidate: ZoomDwellCandidate,
	totalMs: number,
	defaultDuration: number,
): { start: number; end: number } {
	const rawDuration = candidate.span.end - candidate.span.start;
	const desiredDuration =
		candidate.kind === "dwell" || candidate.kind === "long-dwell"
			? clampDuration(
					rawDuration + AUTO_ZOOM_CONTEXT_PADDING_MS * 2,
					totalMs,
					candidate.kind === "long-dwell"
						? MAX_LONG_AUTO_ZOOM_DURATION_MS
						: MAX_AUTO_ZOOM_DURATION_MS,
				)
			: candidate.kind === "press"
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
