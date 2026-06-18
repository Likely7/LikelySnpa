import { describe, expect, it } from "vitest";
import { advanceFollowFocus, resolveSmartFollowTarget } from "./cursorFollowUtils";

const params = {
	minFactor: 0.1,
	maxFactor: 0.25,
	rampDistance: 0.15,
	referenceMs: 25,
	deadZone: 0.006,
	maxSpeedPerSecond: 1.15,
};

describe("advanceFollowFocus", () => {
	it("holds the camera still for tiny cursor jitter", () => {
		const prev = { cx: 0.5, cy: 0.5 };
		const next = advanceFollowFocus(prev, { cx: 0.503, cy: 0.504 }, 25, params);

		expect(next).toEqual(prev);
	});

	it("limits large jumps so auto zoom does not snap tightly to the cursor", () => {
		const prev = { cx: 0.2, cy: 0.2 };
		const next = advanceFollowFocus(prev, { cx: 0.9, cy: 0.9 }, 25, params);
		const distance = Math.hypot(next.cx - prev.cx, next.cy - prev.cy);

		expect(distance).toBeLessThanOrEqual(params.maxSpeedPerSecond * 0.025 + 0.000001);
		expect(next.cx).toBeGreaterThan(prev.cx);
		expect(next.cy).toBeGreaterThan(prev.cy);
	});
});

describe("resolveSmartFollowTarget", () => {
	const smartParams = {
		safeAreaRatio: 0.58,
		minSafeMargin: 0.05,
		maxSafeMargin: 0.18,
	};

	it("keeps the camera anchored while the cursor is inside the scale-aware safe area", () => {
		const anchor = { cx: 0.5, cy: 0.5 };
		const target = resolveSmartFollowTarget(anchor, { cx: 0.58, cy: 0.5 }, 1.8, smartParams);

		expect(target).toEqual(anchor);
	});

	it("starts panning sooner at higher zoom scales because the visible area is smaller", () => {
		const anchor = { cx: 0.5, cy: 0.5 };
		const cursor = { cx: 0.62, cy: 0.5 };
		const lowZoom = resolveSmartFollowTarget(anchor, cursor, 1.8, smartParams);
		const highZoom = resolveSmartFollowTarget(anchor, cursor, 5, smartParams);

		expect(lowZoom.cx).toBeCloseTo(anchor.cx, 5);
		expect(highZoom.cx).toBeGreaterThan(anchor.cx);
		expect(highZoom.cx).toBeLessThan(cursor.cx);
	});
});
