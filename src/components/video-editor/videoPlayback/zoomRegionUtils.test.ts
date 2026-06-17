import { describe, expect, it } from "vitest";
import { findDominantRegion } from "./zoomRegionUtils";

describe("findDominantRegion cursor follow", () => {
	it("resolves auto-focus zoom regions from cursor telemetry at playback time", () => {
		const result = findDominantRegion(
			[
				{
					id: "zoom-1",
					startMs: 0,
					endMs: 3000,
					depth: 2,
					customScale: 1.8,
					focus: { cx: 0.5, cy: 0.5 },
					focusMode: "auto",
				},
			],
			1500,
			{
				cursorTelemetry: [
					{ timeMs: 0, cx: 0.1, cy: 0.2 },
					{ timeMs: 3000, cx: 0.7, cy: 0.8 },
				],
			},
		);

		expect(result.region?.focus.cx).toBeCloseTo(0.4, 5);
		expect(result.region?.focus.cy).toBeCloseTo(0.5, 5);
	});

	it("keeps manual zoom regions on their stored focus", () => {
		const result = findDominantRegion(
			[
				{
					id: "zoom-1",
					startMs: 0,
					endMs: 3000,
					depth: 2,
					customScale: 1.8,
					focus: { cx: 0.3, cy: 0.35 },
					focusMode: "manual",
				},
			],
			1500,
			{
				cursorTelemetry: [
					{ timeMs: 0, cx: 0.1, cy: 0.2 },
					{ timeMs: 3000, cx: 0.7, cy: 0.8 },
				],
			},
		);

		expect(result.region?.focus.cx).toBeCloseTo(0.3, 5);
		expect(result.region?.focus.cy).toBeCloseTo(0.35, 5);
	});
});
