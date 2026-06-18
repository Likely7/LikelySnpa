import { describe, expect, it } from "vitest";
import {
	AUTO_ZOOM_CONTEXT_PADDING_MS,
	buildAutoZoomSuggestions,
	detectZoomDwellCandidates,
	hasPressedCursorDuringSpan,
	MAX_DWELL_DURATION_MS,
} from "./zoomSuggestionUtils";

describe("zoomSuggestionUtils", () => {
	it("keeps long cursor dwells as one auto zoom candidate instead of dropping them", () => {
		const candidates = detectZoomDwellCandidates([
			{ timeMs: 0, cx: 0.4, cy: 0.4 },
			{ timeMs: MAX_DWELL_DURATION_MS + 2000, cx: 0.405, cy: 0.405 },
		]);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].strength).toBe(MAX_DWELL_DURATION_MS);
	});

	it("uses dwell span plus context padding but keeps generated zooms bounded", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.4, cy: 0.4 },
				{ timeMs: 5_000, cx: 0.405, cy: 0.405 },
			],
			totalMs: 10_000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span.end - suggestions[0].span.start).toBe(6_000);
		expect(suggestions[0].focusMode).toBe("manual");
	});

	it("merges nearby dwell runs in the same area so long explanations do not jump", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.4, cy: 0.4 },
				{ timeMs: 1_000, cx: 0.405, cy: 0.405 },
				{ timeMs: 1_200, cx: 0.45, cy: 0.45 },
				{ timeMs: 1_700, cx: 0.41, cy: 0.41 },
				{ timeMs: 4_000, cx: 0.412, cy: 0.412 },
			],
			totalMs: 8_000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span.end - suggestions[0].span.start).toBe(
			4_000 + AUTO_ZOOM_CONTEXT_PADDING_MS * 2,
		);
	});

	it("uses click telemetry as an auto zoom candidate", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.2, cy: 0.2 },
				{ timeMs: 1000, cx: 0.7, cy: 0.3, interactionType: "click" },
				{ timeMs: 3000, cx: 0.75, cy: 0.35 },
			],
			totalMs: 5000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span).toEqual({ start: 400, end: 1600 });
		expect(suggestions[0].focus).toEqual({ cx: 0.7, cy: 0.3 });
		expect(suggestions[0].focusMode).toBe("manual");
	});

	it("marks held mouse suggestions as smart cursor-follow", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.2, cy: 0.2 },
				{ timeMs: 1000, cx: 0.7, cy: 0.3, interactionType: "click" },
				{ timeMs: 1400, cx: 0.74, cy: 0.34, interactionType: "move" },
				{ timeMs: 1700, cx: 0.78, cy: 0.38, interactionType: "mouseup" },
				{ timeMs: 3000, cx: 0.8, cy: 0.4 },
			],
			totalMs: 5000,
			existingRegions: [],
			defaultDurationMs: 1200,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].focusMode).toBe("smart");
	});

	it("down-ranks click-and-leave actions so accidental clicks do not create zooms", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.2, cy: 0.2 },
				{ timeMs: 1000, cx: 0.7, cy: 0.3, interactionType: "click" },
				{ timeMs: 1120, cx: 0.9, cy: 0.5 },
				{ timeMs: 1400, cx: 0.92, cy: 0.52 },
			],
			totalMs: 5000,
			existingRegions: [],
			defaultDurationMs: 1200,
		});

		expect(suggestions).toHaveLength(0);
	});

	it("detects pressed cursor spans across click and mouseup events", () => {
		expect(
			hasPressedCursorDuringSpan(
				[
					{ timeMs: 500, cx: 0.5, cy: 0.5, interactionType: "click" },
					{ timeMs: 900, cx: 0.55, cy: 0.55, interactionType: "move" },
					{ timeMs: 1100, cx: 0.6, cy: 0.6, interactionType: "mouseup" },
				],
				{ start: 600, end: 1000 },
			),
		).toBe(true);
	});
});
