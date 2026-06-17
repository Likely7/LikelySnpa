import { describe, expect, it } from "vitest";
import { advanceFollowFocus } from "./cursorFollowUtils";

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
