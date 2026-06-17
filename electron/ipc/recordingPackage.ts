import path from "node:path";
import type { CursorCaptureMode, RecordingSession } from "../../src/lib/recordingSession";
import {
	normalizeCursorCaptureMode,
	normalizeRecordingSession,
} from "../../src/lib/recordingSession";

export const RECORDING_PACKAGE_EXTENSION = ".likelysnap";
export const RECORDING_PACKAGE_MANIFEST = "manifest.json";
export const RECORDING_PACKAGE_SCREEN_VIDEO = "screen.mp4";
export const RECORDING_PACKAGE_WEBCAM_VIDEO = "webcam.webm";
export const RECORDING_PACKAGE_CURSOR_TELEMETRY = "cursor.json";
export const RECORDING_PACKAGE_SCHEMA_VERSION = 1;

const ALLOWED_PACKAGE_CHILDREN = new Set([
	RECORDING_PACKAGE_MANIFEST,
	RECORDING_PACKAGE_SCREEN_VIDEO,
	RECORDING_PACKAGE_WEBCAM_VIDEO,
	RECORDING_PACKAGE_CURSOR_TELEMETRY,
]);

export type RecordingPackageStatus =
	| "recording"
	| "finalizing"
	| "ready"
	| "recoverable"
	| "failed";

export type RecordingPackageManifest = {
	schemaVersion: 1;
	createdAt: number;
	brand: "LikelySnap";
	media: {
		screenVideoPath: string;
		webcamVideoPath?: string;
		webcamStartOffsetMs?: number;
		cursorTelemetryPath?: string;
		cursorCaptureMode?: CursorCaptureMode;
	};
	recording: {
		status: RecordingPackageStatus;
		cursorCaptureMode?: CursorCaptureMode;
	};
	diagnostics?: Record<string, unknown>;
};

export type RecordingPackagePaths = {
	packageDir: string;
	manifestPath: string;
	screenVideoPath: string;
	webcamVideoPath: string;
	cursorTelemetryPath: string;
};

function normalizeNonNegativeNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function normalizePackageStatus(value: unknown): RecordingPackageStatus {
	switch (value) {
		case "recording":
		case "finalizing":
		case "ready":
		case "recoverable":
		case "failed":
			return value;
		default:
			return "recoverable";
	}
}

function normalizeRelativePackageChildPath(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	if (!trimmed || path.isAbsolute(trimmed) || trimmed.includes("/") || trimmed.includes("\\")) {
		return undefined;
	}

	const parsed = path.parse(trimmed);
	if (parsed.base !== trimmed || !ALLOWED_PACKAGE_CHILDREN.has(trimmed)) {
		return undefined;
	}

	return trimmed;
}

export function isRecordingPackagePath(filePath?: string | null): boolean {
	if (typeof filePath !== "string" || !filePath.trim()) {
		return false;
	}
	return path.extname(path.resolve(filePath)).toLowerCase() === RECORDING_PACKAGE_EXTENSION;
}

export function getRecordingPackageDirForVideoPath(videoPath: string): string | null {
	const resolved = path.resolve(videoPath);
	const dir = path.dirname(resolved);
	return isRecordingPackagePath(dir) ? dir : null;
}

export function getRecordingPackagePaths(
	recordingDir: string,
	recordingId: number,
): RecordingPackagePaths {
	const packageDir = path.join(
		recordingDir,
		`recording-${recordingId}${RECORDING_PACKAGE_EXTENSION}`,
	);
	return {
		packageDir,
		manifestPath: path.join(packageDir, RECORDING_PACKAGE_MANIFEST),
		screenVideoPath: path.join(packageDir, RECORDING_PACKAGE_SCREEN_VIDEO),
		webcamVideoPath: path.join(packageDir, RECORDING_PACKAGE_WEBCAM_VIDEO),
		cursorTelemetryPath: path.join(packageDir, RECORDING_PACKAGE_CURSOR_TELEMETRY),
	};
}

export function resolveRecordingPackageChildPath(
	packageDir: string,
	childPath: string,
): string | null {
	const child = normalizeRelativePackageChildPath(childPath);
	if (!child) {
		return null;
	}

	const resolvedPackageDir = path.resolve(packageDir);
	const resolved = path.resolve(resolvedPackageDir, child);
	return path.dirname(resolved) === resolvedPackageDir ? resolved : null;
}

export function resolveRecordingOutputPathInDirectory(
	requestedPath: string,
	recordingDir: string,
): string {
	const trimmed = requestedPath.trim();
	if (!trimmed) {
		throw new Error("Invalid recording file path");
	}

	const normalizedSegments = trimmed.split(/[\\/]+/).filter(Boolean);
	if (normalizedSegments.some((segment) => segment === "..") || path.isAbsolute(trimmed)) {
		throw new Error("Recording file path must stay inside the recording directory");
	}

	if (normalizedSegments.length === 2 && isRecordingPackagePath(normalizedSegments[0])) {
		const child = normalizeRelativePackageChildPath(normalizedSegments[1]);
		if (!child) {
			throw new Error("Recording package child path is not allowed");
		}
		return path.join(recordingDir, normalizedSegments[0], child);
	}

	if (normalizedSegments.length === 1) {
		const parsedPath = path.parse(trimmed);
		if (parsedPath.base === trimmed) {
			return path.join(recordingDir, parsedPath.base);
		}
	}

	throw new Error("Recording file path must be a file name or a supported package child path");
}

export function getCursorTelemetryPathForVideo(videoPath: string): string {
	const packageDir = getRecordingPackageDirForVideoPath(videoPath);
	return packageDir
		? path.join(packageDir, RECORDING_PACKAGE_CURSOR_TELEMETRY)
		: `${videoPath}.cursor.json`;
}

export function getRecordingManifestPathForVideo(videoPath: string, legacySuffix: string): string {
	const packageDir = getRecordingPackageDirForVideoPath(videoPath);
	if (packageDir) {
		return path.join(packageDir, RECORDING_PACKAGE_MANIFEST);
	}

	const parsedPath = path.parse(videoPath);
	const baseName = parsedPath.name.endsWith("-webcam")
		? parsedPath.name.slice(0, -"-webcam".length)
		: parsedPath.name;
	return path.join(parsedPath.dir, `${baseName}${legacySuffix}`);
}

export function buildRecordingPackageManifest(
	session: RecordingSession,
	status: RecordingPackageStatus,
	extras?: Record<string, unknown> | null,
): RecordingPackageManifest | null {
	const packageDir = getRecordingPackageDirForVideoPath(session.screenVideoPath);
	if (!packageDir) {
		return null;
	}

	const screenVideoPath = path.relative(packageDir, session.screenVideoPath);
	const webcamVideoPath = session.webcamVideoPath
		? path.relative(packageDir, session.webcamVideoPath)
		: undefined;
	const cursorTelemetryPath = path.relative(
		packageDir,
		getCursorTelemetryPathForVideo(session.screenVideoPath),
	);
	const cursorCaptureMode = normalizeCursorCaptureMode(session.cursorCaptureMode);
	const manifest: RecordingPackageManifest = {
		schemaVersion: RECORDING_PACKAGE_SCHEMA_VERSION,
		createdAt: session.createdAt,
		brand: "LikelySnap",
		media: {
			screenVideoPath,
			...(webcamVideoPath ? { webcamVideoPath } : {}),
			...(session.webcamStartOffsetMs !== undefined
				? { webcamStartOffsetMs: session.webcamStartOffsetMs }
				: {}),
			cursorTelemetryPath,
			...(cursorCaptureMode ? { cursorCaptureMode } : {}),
		},
		recording: {
			status,
			...(cursorCaptureMode ? { cursorCaptureMode } : {}),
		},
	};

	if (extras?.diagnostics && typeof extras.diagnostics === "object") {
		manifest.diagnostics = extras.diagnostics as Record<string, unknown>;
	}

	return manifest;
}

export function normalizeRecordingPackageManifest(
	candidate: unknown,
	packageDir: string,
): RecordingSession | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const raw = candidate as {
		createdAt?: unknown;
		media?: Record<string, unknown>;
		recording?: Record<string, unknown>;
	};
	const media = raw.media && typeof raw.media === "object" ? raw.media : null;
	const screenChild = normalizeRelativePackageChildPath(media?.screenVideoPath);
	if (!screenChild) {
		return null;
	}

	const screenVideoPath = resolveRecordingPackageChildPath(packageDir, screenChild);
	if (!screenVideoPath) {
		return null;
	}

	const webcamChild = normalizeRelativePackageChildPath(media?.webcamVideoPath);
	const webcamVideoPath = webcamChild
		? (resolveRecordingPackageChildPath(packageDir, webcamChild) ?? undefined)
		: undefined;
	const webcamStartOffsetMs = normalizeNonNegativeNumber(media?.webcamStartOffsetMs);
	const cursorCaptureMode =
		normalizeCursorCaptureMode(media?.cursorCaptureMode) ??
		normalizeCursorCaptureMode(raw.recording?.cursorCaptureMode);

	return normalizeRecordingSession({
		screenVideoPath,
		...(webcamVideoPath ? { webcamVideoPath } : {}),
		...(webcamVideoPath && webcamStartOffsetMs !== undefined ? { webcamStartOffsetMs } : {}),
		...(cursorCaptureMode ? { cursorCaptureMode } : {}),
		createdAt:
			typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
				? raw.createdAt
				: Date.now(),
	});
}

export function buildRecoveredRecordingPackageManifest(
	createdAt = Date.now(),
	status: RecordingPackageStatus = "recoverable",
): RecordingPackageManifest {
	return {
		schemaVersion: RECORDING_PACKAGE_SCHEMA_VERSION,
		createdAt,
		brand: "LikelySnap",
		media: {
			screenVideoPath: RECORDING_PACKAGE_SCREEN_VIDEO,
			webcamVideoPath: RECORDING_PACKAGE_WEBCAM_VIDEO,
			cursorTelemetryPath: RECORDING_PACKAGE_CURSOR_TELEMETRY,
		},
		recording: {
			status,
		},
	};
}

export function normalizeRecordingPackageStatus(value: unknown): RecordingPackageStatus {
	return normalizePackageStatus(value);
}
