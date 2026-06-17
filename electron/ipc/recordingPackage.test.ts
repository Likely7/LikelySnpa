import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildRecordingPackageManifest,
	getCursorTelemetryPathForVideo,
	getRecordingManifestPathForVideo,
	getRecordingPackageDirForVideoPath,
	getRecordingPackagePaths,
	normalizeRecordingPackageManifest,
	resolveRecordingOutputPathInDirectory,
} from "./recordingPackage";

describe("recording package paths", () => {
	it("builds canonical package paths for a recording id", () => {
		const paths = getRecordingPackagePaths("/recordings", 123);

		expect(paths.packageDir).toBe(path.join("/recordings", "recording-123.likelysnap"));
		expect(paths.screenVideoPath).toBe(
			path.join("/recordings", "recording-123.likelysnap", "screen.mp4"),
		);
		expect(paths.webcamVideoPath).toBe(
			path.join("/recordings", "recording-123.likelysnap", "webcam.mp4"),
		);
		expect(paths.cursorTelemetryPath).toBe(
			path.join("/recordings", "recording-123.likelysnap", "cursor.json"),
		);
	});

	it("allows only known package child paths under the recording directory", () => {
		expect(resolveRecordingOutputPathInDirectory("recording-123.likelysnap/screen.mp4", "/r")).toBe(
			path.join("/r", "recording-123.likelysnap", "screen.mp4"),
		);
		expect(resolveRecordingOutputPathInDirectory("recording-123.likelysnap/webcam.mp4", "/r")).toBe(
			path.join("/r", "recording-123.likelysnap", "webcam.mp4"),
		);
		expect(
			resolveRecordingOutputPathInDirectory("recording-123.likelysnap/webcam.webm", "/r"),
		).toBe(path.join("/r", "recording-123.likelysnap", "webcam.webm"));
		expect(resolveRecordingOutputPathInDirectory("recording-123.webm", "/r")).toBe(
			path.join("/r", "recording-123.webm"),
		);

		expect(() =>
			resolveRecordingOutputPathInDirectory("recording-123.likelysnap/../screen.mp4", "/r"),
		).toThrow();
		expect(() =>
			resolveRecordingOutputPathInDirectory("recording-123.likelysnap/evil.webm", "/r"),
		).toThrow();
		expect(() => resolveRecordingOutputPathInDirectory("/tmp/screen.mp4", "/r")).toThrow();
	});

	it("uses package-local cursor and manifest paths when screen video lives in a package", () => {
		const screenPath = path.join("/r", "recording-123.likelysnap", "screen.mp4");

		expect(getRecordingPackageDirForVideoPath(screenPath)).toBe(
			path.join("/r", "recording-123.likelysnap"),
		);
		expect(getCursorTelemetryPathForVideo(screenPath)).toBe(
			path.join("/r", "recording-123.likelysnap", "cursor.json"),
		);
		expect(getRecordingManifestPathForVideo(screenPath, ".session.json")).toBe(
			path.join("/r", "recording-123.likelysnap", "manifest.json"),
		);
	});

	it("keeps legacy loose manifest and cursor sidecar paths", () => {
		const screenPath = path.join("/r", "recording-123.mp4");

		expect(getRecordingPackageDirForVideoPath(screenPath)).toBeNull();
		expect(getCursorTelemetryPathForVideo(screenPath)).toBe(`${screenPath}.cursor.json`);
		expect(getRecordingManifestPathForVideo(screenPath, ".session.json")).toBe(
			path.join("/r", "recording-123.session.json"),
		);
	});

	it("round-trips package manifest relative media paths to absolute session paths", () => {
		const packageDir = path.join("/r", "recording-123.likelysnap");
		const screenVideoPath = path.join(packageDir, "screen.mp4");
		const webcamVideoPath = path.join(packageDir, "webcam.mp4");
		const manifest = buildRecordingPackageManifest(
			{
				screenVideoPath,
				webcamVideoPath,
				webcamStartOffsetMs: 250,
				cursorCaptureMode: "editable-overlay",
				createdAt: 123,
			},
			"ready",
			{ diagnostics: { ok: true } },
		);

		expect(manifest).toMatchObject({
			createdAt: 123,
			media: {
				screenVideoPath: "screen.mp4",
				webcamVideoPath: "webcam.mp4",
				webcamStartOffsetMs: 250,
				cursorTelemetryPath: "cursor.json",
				cursorCaptureMode: "editable-overlay",
			},
			recording: {
				status: "ready",
				cursorCaptureMode: "editable-overlay",
			},
			diagnostics: { ok: true },
		});

		expect(normalizeRecordingPackageManifest(manifest, packageDir)).toEqual({
			screenVideoPath,
			webcamVideoPath,
			webcamStartOffsetMs: 250,
			cursorCaptureMode: "editable-overlay",
			createdAt: 123,
		});
	});

	it("keeps legacy package manifests with webcam.webm loadable", () => {
		const packageDir = path.join("/r", "recording-123.likelysnap");
		const manifest = {
			schemaVersion: 1,
			createdAt: 123,
			brand: "LikelySnap",
			media: {
				screenVideoPath: "screen.mp4",
				webcamVideoPath: "webcam.webm",
				cursorTelemetryPath: "cursor.json",
			},
			recording: {
				status: "ready",
			},
		};

		expect(normalizeRecordingPackageManifest(manifest, packageDir)).toEqual({
			screenVideoPath: path.join(packageDir, "screen.mp4"),
			webcamVideoPath: path.join(packageDir, "webcam.webm"),
			createdAt: 123,
		});
	});
});
