import type { CursorTelemetryPoint, ZoomFocus } from "../types";
import { getFocusBoundsForScale } from "./focusUtils";

/** Binary-search the sorted telemetry and lerp the cursor position at the given playback time. */
export function interpolateCursorAt(
	telemetry: CursorTelemetryPoint[],
	timeMs: number,
): ZoomFocus | null {
	if (telemetry.length === 0) return null;

	if (timeMs <= telemetry[0].timeMs) {
		return { cx: telemetry[0].cx, cy: telemetry[0].cy };
	}

	const last = telemetry[telemetry.length - 1];
	if (timeMs >= last.timeMs) {
		return { cx: last.cx, cy: last.cy };
	}

	let lo = 0;
	let hi = telemetry.length - 1;

	while (lo < hi - 1) {
		const mid = (lo + hi) >>> 1;
		if (telemetry[mid].timeMs <= timeMs) {
			lo = mid;
		} else {
			hi = mid;
		}
	}

	const before = telemetry[lo];
	const after = telemetry[hi];
	const span = after.timeMs - before.timeMs;
	const t = span > 0 ? (timeMs - before.timeMs) / span : 0;

	return {
		cx: before.cx + (after.cx - before.cx) * t,
		cy: before.cy + (after.cy - before.cy) * t,
	};
}

/**
 * Exponential smoothing to reduce jitter from high-frequency cursor data.
 * Lower factor = smoother/more lag, higher = more responsive.
 */
export function smoothCursorFocus(raw: ZoomFocus, prev: ZoomFocus, factor: number): ZoomFocus {
	return {
		cx: prev.cx + (raw.cx - prev.cx) * factor,
		cy: prev.cy + (raw.cy - prev.cy) * factor,
	};
}

export interface FollowParams {
	minFactor: number;
	maxFactor: number;
	rampDistance: number;
	referenceMs: number;
	deadZone?: number;
	maxSpeedPerSecond?: number;
}

export interface SmartFollowParams extends FollowParams {
	/** Fraction of the visible zoom window that should remain quiet before the camera pans. */
	safeAreaRatio: number;
	/** Minimum normalized safety margin per axis so high zoom levels still get usable lead room. */
	minSafeMargin: number;
	/** Maximum normalized safety margin per axis so low zoom levels do not overreact. */
	maxSafeMargin: number;
}

/**
 * Advance the auto-follow focus from `prev` toward target `raw` over `dtMs` of content time. The
 * distance-adaptive factor is reframed against `referenceMs` so convergence is content-time based and
 * matches between preview and export. Returns `prev` unchanged when paused so the camera holds still.
 */
export function advanceFollowFocus(
	prev: ZoomFocus,
	raw: ZoomFocus,
	dtMs: number,
	params: FollowParams,
): ZoomFocus {
	if (!(dtMs > 0)) return prev;
	const dx = raw.cx - prev.cx;
	const dy = raw.cy - prev.cy;
	const distance = Math.sqrt(dx * dx + dy * dy);

	if (params.deadZone !== undefined && distance <= params.deadZone) {
		return prev;
	}

	const base = adaptiveSmoothFactor(
		raw,
		prev,
		params.minFactor,
		params.maxFactor,
		params.rampDistance,
	);
	const factor = timeCorrectedFollowFactor(base, dtMs, params.referenceMs);
	const next = smoothCursorFocus(raw, prev, factor);

	if (!(params.maxSpeedPerSecond && params.maxSpeedPerSecond > 0)) {
		return next;
	}

	const maxStep = params.maxSpeedPerSecond * (dtMs / 1000);
	const nextDx = next.cx - prev.cx;
	const nextDy = next.cy - prev.cy;
	const nextDistance = Math.sqrt(nextDx * nextDx + nextDy * nextDy);

	if (nextDistance <= maxStep || nextDistance === 0) {
		return next;
	}

	const ratio = maxStep / nextDistance;
	return {
		cx: prev.cx + nextDx * ratio,
		cy: prev.cy + nextDy * ratio,
	};
}

export function resolveSmartFollowTarget(
	anchor: ZoomFocus,
	cursor: ZoomFocus,
	zoomScale: number,
	params: Pick<SmartFollowParams, "safeAreaRatio" | "minSafeMargin" | "maxSafeMargin">,
): ZoomFocus {
	const bounds = getFocusBoundsForScale(zoomScale);
	const visibleHalfX = Math.max(0, 0.5 / Math.max(1, zoomScale));
	const visibleHalfY = Math.max(0, 0.5 / Math.max(1, zoomScale));
	const safeHalfX = Math.max(
		params.minSafeMargin,
		Math.min(params.maxSafeMargin, visibleHalfX * params.safeAreaRatio),
	);
	const safeHalfY = Math.max(
		params.minSafeMargin,
		Math.min(params.maxSafeMargin, visibleHalfY * params.safeAreaRatio),
	);

	const minCursorX = anchor.cx - safeHalfX;
	const maxCursorX = anchor.cx + safeHalfX;
	const minCursorY = anchor.cy - safeHalfY;
	const maxCursorY = anchor.cy + safeHalfY;

	let targetX = anchor.cx;
	let targetY = anchor.cy;

	if (cursor.cx < minCursorX) {
		targetX = cursor.cx + safeHalfX;
	} else if (cursor.cx > maxCursorX) {
		targetX = cursor.cx - safeHalfX;
	}

	if (cursor.cy < minCursorY) {
		targetY = cursor.cy + safeHalfY;
	} else if (cursor.cy > maxCursorY) {
		targetY = cursor.cy - safeHalfY;
	}

	return {
		cx: Math.max(bounds.minX, Math.min(bounds.maxX, targetX)),
		cy: Math.max(bounds.minY, Math.min(bounds.maxY, targetY)),
	};
}

export function advanceSmartFollowFocus(
	prev: ZoomFocus,
	anchor: ZoomFocus,
	cursor: ZoomFocus,
	zoomScale: number,
	dtMs: number,
	params: SmartFollowParams,
): ZoomFocus {
	const target = resolveSmartFollowTarget(anchor, cursor, zoomScale, params);
	return advanceFollowFocus(prev, target, dtMs, params);
}

/**
 * Make a per-frame smoothing `baseFactor` frame-rate independent by reframing it in content time.
 * The camera converges as `(1 - baseFactor)^(dtMs / referenceMs)` regardless of frame chunking, so
 * preview (variable fps) and export (fixed fps) follow at the same speed. Larger `referenceMs` =
 * floatier. Returns 0 when paused so the camera holds still.
 */
export function timeCorrectedFollowFactor(
	baseFactor: number,
	dtMs: number,
	referenceMs: number,
): number {
	if (!(dtMs > 0) || !(referenceMs > 0)) return 0;
	return 1 - (1 - baseFactor) ** (dtMs / referenceMs);
}

/**
 * Adaptive smoothing factor that scales with distance: far from target = faster (maxFactor), close =
 * slower (minFactor). Replaces a hard deadzone with a natural deceleration curve.
 */
export function adaptiveSmoothFactor(
	raw: ZoomFocus,
	prev: ZoomFocus,
	minFactor: number,
	maxFactor: number,
	rampDistance: number,
): number {
	const dx = raw.cx - prev.cx;
	const dy = raw.cy - prev.cy;
	const distance = Math.sqrt(dx * dx + dy * dy);
	const t = Math.min(1, distance / rampDistance);
	return minFactor + (maxFactor - minFactor) * t;
}
