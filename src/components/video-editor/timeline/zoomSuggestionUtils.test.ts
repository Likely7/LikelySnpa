import { describe, expect, it } from "vitest";
import {
	AUTO_ZOOM_CONTEXT_PADDING_MS,
	AUTO_ZOOM_SUGGESTION_MERGE_GAP_MS,
	buildAutoZoomSuggestions,
	detectZoomDwellCandidates,
	hasPressedCursorDuringSpan,
	LONG_DWELL_DURATION_MS,
	MAX_DWELL_DURATION_MS,
	MIN_DWELL_DURATION_MS,
} from "./zoomSuggestionUtils";

describe("zoomSuggestionUtils", () => {
	it("keeps long cursor dwells as one auto zoom candidate instead of dropping them", () => {
		const candidates = detectZoomDwellCandidates([
			{ timeMs: 0, cx: 0.4, cy: 0.4 },
			{ timeMs: 1_000, cx: 0.402, cy: 0.402 },
			{ timeMs: 2_000, cx: 0.404, cy: 0.404 },
			{ timeMs: 3_000, cx: 0.405, cy: 0.405 },
			{ timeMs: MAX_DWELL_DURATION_MS + 2000, cx: 0.405, cy: 0.405 },
		]);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].strength).toBe(MAX_DWELL_DURATION_MS);
	});

	it("uses dwell span plus context padding but keeps generated zooms bounded", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.4, cy: 0.4 },
				{ timeMs: 1_000, cx: 0.402, cy: 0.402 },
				{ timeMs: 2_000, cx: 0.404, cy: 0.404 },
				{ timeMs: 3_000, cx: 0.405, cy: 0.405 },
				{ timeMs: 4_000, cx: 0.405, cy: 0.405 },
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

	it("waits for the longer dwell confirmation window before creating a short zoom", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.2, cy: 0.2 },
				{ timeMs: 500, cx: 0.205, cy: 0.205 },
				{ timeMs: 900, cx: 0.21, cy: 0.21 },
				{ timeMs: 1200, cx: 0.22, cy: 0.22 },
			],
			totalMs: 3_000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span.start).toBe(0);
		expect(suggestions[0].span.end - suggestions[0].span.start).toBe(2400);
		expect(MIN_DWELL_DURATION_MS).toBe(1000);
	});

	it("still recognizes long stable explanations and keeps them long", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 2_000, cx: 0.2, cy: 0.2 },
				{ timeMs: 3_000, cx: 0.202, cy: 0.202 },
				{ timeMs: 4_000, cx: 0.204, cy: 0.203 },
				{ timeMs: 5_000, cx: 0.205, cy: 0.205 },
				{ timeMs: 6_000, cx: 0.206, cy: 0.206 },
				{ timeMs: 7_000, cx: 0.207, cy: 0.207 },
				{ timeMs: 8_000, cx: 0.208, cy: 0.208 },
				{ timeMs: 9_000, cx: 0.209, cy: 0.209 },
				{ timeMs: 10_000, cx: 0.205, cy: 0.205 },
				{ timeMs: 11_000, cx: 0.206, cy: 0.206 },
				{ timeMs: 12_000, cx: 0.207, cy: 0.207 },
				{ timeMs: 13_000, cx: 0.208, cy: 0.208 },
				{ timeMs: 14_000, cx: 0.209, cy: 0.209 },
				{ timeMs: 15_000, cx: 0.207, cy: 0.207 },
				{ timeMs: 16_000, cx: 0.208, cy: 0.208 },
				{ timeMs: 17_000, cx: 0.209, cy: 0.209 },
				{ timeMs: 18_000, cx: 0.21, cy: 0.21 },
				{ timeMs: 19_000, cx: 0.211, cy: 0.21 },
				{ timeMs: 20_000, cx: 0.212, cy: 0.211 },
				{ timeMs: 21_000, cx: 0.211, cy: 0.21 },
				{ timeMs: 22_000, cx: 0.21, cy: 0.21 },
				{ timeMs: 23_000, cx: 0.209, cy: 0.209 },
				{ timeMs: 24_000, cx: 0.21, cy: 0.21 },
				{ timeMs: 25_000, cx: 0.21, cy: 0.21 },
				{ timeMs: 26_000, cx: 0.211, cy: 0.21 },
				{ timeMs: 27_000, cx: 0.212, cy: 0.211 },
				{ timeMs: 28_000, cx: 0.211, cy: 0.21 },
				{ timeMs: 29_000, cx: 0.21, cy: 0.21 },
				{ timeMs: 30_000, cx: 0.209, cy: 0.209 },
				{ timeMs: 31_000, cx: 0.21, cy: 0.21 },
				{ timeMs: 32_000, cx: 0.211, cy: 0.21 },
				{ timeMs: 33_000, cx: 0.212, cy: 0.211 },
				{ timeMs: 34_000, cx: 0.211, cy: 0.21 },
				{ timeMs: 35_000, cx: 0.212, cy: 0.211 },
			],
			totalMs: 40_000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span.start).toBe(1400);
		expect(suggestions[0].span.end - suggestions[0].span.start).toBe(34_200);
		expect(suggestions[0].span.end - suggestions[0].span.start).toBeGreaterThan(
			LONG_DWELL_DURATION_MS,
		);
	});

	it("treats small-area cursor motion as one explanation dwell", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 2_000, cx: 0.4, cy: 0.4 },
				{ timeMs: 3_000, cx: 0.428, cy: 0.399 },
				{ timeMs: 4_000, cx: 0.392, cy: 0.42 },
				{ timeMs: 5_000, cx: 0.417, cy: 0.387 },
				{ timeMs: 6_000, cx: 0.405, cy: 0.411 },
				{ timeMs: 7_000, cx: 0.425, cy: 0.391 },
				{ timeMs: 8_000, cx: 0.394, cy: 0.418 },
				{ timeMs: 9_000, cx: 0.418, cy: 0.389 },
				{ timeMs: 10_000, cx: 0.407, cy: 0.412 },
				{ timeMs: 11_000, cx: 0.421, cy: 0.392 },
				{ timeMs: 12_000, cx: 0.398, cy: 0.416 },
				{ timeMs: 13_000, cx: 0.417, cy: 0.387 },
			],
			totalMs: 20_000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span.start).toBe(1400);
		expect(suggestions[0].span.end).toBe(13_600);
	});

	it("merges nearby dwell runs in the same area so long explanations do not jump", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.4, cy: 0.4 },
				{ timeMs: 600, cx: 0.402, cy: 0.402 },
				{ timeMs: 1_200, cx: 0.405, cy: 0.405 },
				{ timeMs: 4_100, cx: 0.41, cy: 0.41 },
				{ timeMs: 4_700, cx: 0.411, cy: 0.411 },
				{ timeMs: 5_300, cx: 0.412, cy: 0.412 },
			],
			totalMs: 8_000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span.end - suggestions[0].span.start).toBe(5_900);
	});

	it("merges nearby zoom suggestions when the gap stays under 1.5 seconds", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.2, cy: 0.2 },
				{ timeMs: 600, cx: 0.202, cy: 0.202 },
				{ timeMs: 1_200, cx: 0.205, cy: 0.205 },
				{ timeMs: 3_000, cx: 0.45, cy: 0.45 },
				{ timeMs: 3_600, cx: 0.452, cy: 0.452 },
				{ timeMs: 4_300, cx: 0.455, cy: 0.455 },
			],
			totalMs: 10_000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span.end - suggestions[0].span.start).toBeGreaterThan(
			AUTO_ZOOM_SUGGESTION_MERGE_GAP_MS,
		);
	});

	it("keeps zoom suggestions separate when the gap exceeds 1.5 seconds", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.2, cy: 0.2 },
				{ timeMs: 600, cx: 0.202, cy: 0.202 },
				{ timeMs: 1_200, cx: 0.205, cy: 0.205 },
				{ timeMs: 5_200, cx: 0.45, cy: 0.45 },
				{ timeMs: 5_800, cx: 0.452, cy: 0.452 },
				{ timeMs: 6_500, cx: 0.455, cy: 0.455 },
			],
			totalMs: 12_000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(2);
		expect(AUTO_ZOOM_SUGGESTION_MERGE_GAP_MS).toBe(1500);
	});

	it("ignores isolated single clicks because they are usually UI noise", () => {
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

		expect(suggestions).toHaveLength(0);
	});

	it("keeps repeated clicks as intentional auto zoom candidates", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.2, cy: 0.2 },
				{ timeMs: 1000, cx: 0.7, cy: 0.3, interactionType: "click" },
				{ timeMs: 1400, cx: 0.705, cy: 0.305, interactionType: "click" },
				{ timeMs: 3000, cx: 0.75, cy: 0.35 },
			],
			totalMs: 5000,
			existingRegions: [],
			defaultDurationMs: 1000,
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].span).toEqual({ start: 400, end: 1600 });
		expect(suggestions[0].focus).toEqual({ cx: 0.7, cy: 0.3 });
		expect(suggestions[0].focusMode).toBe("smart");
	});

	it("keeps double clicks as intentional auto zoom candidates", () => {
		const suggestions = buildAutoZoomSuggestions({
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.2, cy: 0.2 },
				{ timeMs: 1000, cx: 0.7, cy: 0.3, interactionType: "double-click" },
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
					{ timeMs: 1300, cx: 0.6, cy: 0.6, interactionType: "mouseup" },
				],
				{ start: 600, end: 1150 },
			),
		).toBe(true);
	});
});
