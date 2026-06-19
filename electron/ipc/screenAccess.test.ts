import { describe, expect, it } from "vitest";
import { resolveScreenAccessResult } from "./screenAccess";

describe("resolveScreenAccessResult", () => {
	it("trusts successful desktop capture probing over stale macOS media status", () => {
		expect(
			resolveScreenAccessResult({ granted: true, status: "capturer-screen-granted" }, "denied"),
		).toEqual({
			success: true,
			granted: true,
			status: "capturer-screen-granted",
		});
	});

	it("uses granted media status as a fallback when probing fails", () => {
		expect(
			resolveScreenAccessResult(
				{ granted: false, status: "capturer-error", error: "probe failed" },
				"granted",
			),
		).toEqual({
			success: true,
			granted: true,
			status: "granted",
			error: "probe failed",
		});
	});

	it("keeps prompting when both probing and media status say access is missing", () => {
		expect(
			resolveScreenAccessResult({ granted: false, status: "capturer-error" }, "not-determined"),
		).toEqual({
			success: true,
			granted: false,
			status: "not-determined",
		});
	});
});
