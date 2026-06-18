import type { ZoomFocus } from "../types";

export const DEFAULT_FOCUS: ZoomFocus = { cx: 0.5, cy: 0.5 };
export const TRANSITION_WINDOW_MS = 1015.05;
export const ZOOM_IN_TRANSITION_WINDOW_MS = TRANSITION_WINDOW_MS * 1.5;
export const MIN_DELTA = 0.0001;
export const VIEWPORT_SCALE = 0.8;
export const SMOOTHING_FACTOR = 0.12;
export const ZOOM_TRANSLATION_DEADZONE_PX = 1.25;
export const ZOOM_SCALE_DEADZONE = 0.002;
export const AUTO_FOLLOW_SMOOTHING_FACTOR = 0.1;
export const AUTO_FOLLOW_SMOOTHING_FACTOR_MAX = 0.2;
export const AUTO_FOLLOW_RAMP_DISTANCE = 0.18;
export const AUTO_FOLLOW_DEAD_ZONE = 0.01;
export const AUTO_FOLLOW_MAX_SPEED_PER_SECOND = 0.75;
export const SMART_FOLLOW_SMOOTHING_FACTOR = 0.08;
export const SMART_FOLLOW_SMOOTHING_FACTOR_MAX = 0.18;
export const SMART_FOLLOW_RAMP_DISTANCE = 0.12;
export const SMART_FOLLOW_DEAD_ZONE = 0.006;
export const SMART_FOLLOW_MAX_SPEED_PER_SECOND = 0.85;
export const SMART_FOLLOW_SAFE_AREA_RATIO = 0.58;
export const SMART_FOLLOW_MIN_SAFE_MARGIN = 0.05;
export const SMART_FOLLOW_MAX_SAFE_MARGIN = 0.18;
// Reference frame interval so preview and export normalize their per-frame
// smoothing identically regardless of render fps. Lower fps = floatier follow
// (tuned to the live-preview feel).
export const AUTO_FOLLOW_REFERENCE_MS = 1000 / 40;
// Shared by preview and export so the camera follows the cursor identically.
export const AUTO_FOLLOW_PARAMS = {
	minFactor: AUTO_FOLLOW_SMOOTHING_FACTOR,
	maxFactor: AUTO_FOLLOW_SMOOTHING_FACTOR_MAX,
	rampDistance: AUTO_FOLLOW_RAMP_DISTANCE,
	referenceMs: AUTO_FOLLOW_REFERENCE_MS,
	deadZone: AUTO_FOLLOW_DEAD_ZONE,
	maxSpeedPerSecond: AUTO_FOLLOW_MAX_SPEED_PER_SECOND,
} as const;

export const SMART_FOLLOW_PARAMS = {
	minFactor: SMART_FOLLOW_SMOOTHING_FACTOR,
	maxFactor: SMART_FOLLOW_SMOOTHING_FACTOR_MAX,
	rampDistance: SMART_FOLLOW_RAMP_DISTANCE,
	referenceMs: AUTO_FOLLOW_REFERENCE_MS,
	deadZone: SMART_FOLLOW_DEAD_ZONE,
	maxSpeedPerSecond: SMART_FOLLOW_MAX_SPEED_PER_SECOND,
	safeAreaRatio: SMART_FOLLOW_SAFE_AREA_RATIO,
	minSafeMargin: SMART_FOLLOW_MIN_SAFE_MARGIN,
	maxSafeMargin: SMART_FOLLOW_MAX_SAFE_MARGIN,
} as const;
