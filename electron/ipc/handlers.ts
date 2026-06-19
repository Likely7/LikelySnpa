import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DesktopCapturerSource, Rectangle } from "electron";
import {
	app,
	BrowserWindow,
	desktopCapturer,
	dialog,
	ipcMain,
	screen,
	shell,
	systemPreferences,
} from "electron";
import type { FfmpegFrameExportRequest } from "../../src/lib/exporter/ffmpegExportTypes";
import type { NativeMacRecordingRequest } from "../../src/lib/nativeMacRecording";
import {
	type NativeWindowsRecordingRequest,
	readNativeWindowsRecordingStoppedInfo,
	readNativeWindowsWebcamFormatFromOutput,
} from "../../src/lib/nativeWindowsRecording";
import {
	type CursorCaptureMode,
	normalizeCursorCaptureMode,
	normalizeProjectMedia,
	normalizeRecordingSession,
	type ProjectMedia,
	type RecordedVideoAssetInput,
	type RecordingSession,
	type StoreRecordedSessionInput,
} from "../../src/lib/recordingSession";
import type {
	CursorProviderKind,
	CursorRecordingData,
	CursorRecordingSample,
	NativeCursorAsset,
	ProjectFileResult,
	ProjectPathResult,
} from "../../src/native/contracts";
import { mainT } from "../i18n";
import { RECORDINGS_DIR as LEGACY_RECORDINGS_DIR } from "../main";
import { createCursorRecordingSession } from "../native-bridge/cursor/recording/factory";
import {
	findMacCursorHelperPath,
	requestMacCursorAccessibilityAccess,
} from "../native-bridge/cursor/recording/macNativeCursorRecordingSession";
import type { CursorRecordingSession } from "../native-bridge/cursor/recording/session";
import { FfmpegService } from "../native-bridge/services/ffmpegService";
import { patchWebmDurationOnDisk } from "../recording/webm-duration";
import { registerNativeBridgeHandlers } from "./nativeBridge";
import {
	buildRecordingPackageManifest,
	buildRecoveredRecordingPackageManifest,
	getCursorPreviewPathForVideo,
	getCursorTelemetryPathForVideo,
	getRecordingManifestPathForVideo,
	getRecordingPackageDirForVideoPath,
	getRecordingPackagePaths,
	isRecordingPackagePath,
	normalizeRecordingPackageManifest,
	RECORDING_PACKAGE_LEGACY_WEBCAM_VIDEO,
	RECORDING_PACKAGE_WEBCAM_VIDEO,
	resolveRecordingOutputPathInDirectory,
} from "./recordingPackage";
import { RecordingStreamRegistry, registerRecordingStreamHandlers } from "./recordingStream";

const PROJECT_FILE_EXTENSION = "likelysnap";
export const SHORTCUTS_FILE = path.join(app.getPath("userData"), "shortcuts.json");
const RECORDING_SESSION_SUFFIX = ".session.json";
const ALLOWED_IMPORT_VIDEO_EXTENSIONS = new Set([
	".webm",
	".mp4",
	".mov",
	".avi",
	".mkv",
	".m4v",
	".wmv",
	".flv",
	".ts",
]);
const APP_SETTINGS_FILE = path.join(app.getPath("userData"), "app-settings.json");
const RECORDING_SETTINGS_FILE = path.join(app.getPath("userData"), "recording-settings.json");
const RECORDING_DIRECTORY_WRITE_TEST_FILE = ".likelysnap-write-test";
const WAVEFORM_PEAKS_PER_SECOND = 200;
const nativeMacCaptureEvents = new EventEmitter();
let activeRecordingsDir = getDefaultRecordingsDir();
const ffmpegFrameExportService = new FfmpegService();

type RecordingQuality = "standard" | "high" | "ultra" | "custom";
type RecordingResolutionMode = "source" | "1080p" | "1440p" | "4k" | "custom";
type RecordingFrameRateMode = "preset" | "custom";
type RecordingBitrateMode = "preset" | "custom";
type RecordingFrameRatePreset = 24 | 30 | 60;

type AppSettings = {
	recordingDirectory: string;
	projectDirectory: string;
	cacheDirectory: string;
	recordingQuality: RecordingQuality;
	recordingResolutionMode: RecordingResolutionMode;
	recordingCustomWidth: number;
	recordingCustomHeight: number;
	recordingFrameRateMode: RecordingFrameRateMode;
	defaultFrameRate: RecordingFrameRatePreset;
	recordingCustomFrameRate: number;
	recordingBitrateMode: RecordingBitrateMode;
	recordingCustomBitrateMbps: number;
	defaultEditableCursor: boolean;
	defaultMicrophoneEnabled: boolean;
	defaultSystemAudioEnabled: boolean;
	defaultWebcamEnabled: boolean;
};

type CursorPreviewFile = {
	schemaVersion: 1;
	source: {
		path: string;
		size: number;
		mtimeMs: number;
	};
	version: number;
	provider: CursorProviderKind;
	samples: CursorRecordingSample[];
	originalSampleCount: number;
	sampleIntervalMs: number;
};

// Paths the user approved via file picker or project load (i.e. outside the default dirs).
const approvedPaths = new Set<string>();

function approveFilePath(filePath: string): void {
	approvedPaths.add(path.resolve(filePath));
}

function getAllowedReadDirs(): string[] {
	return Array.from(new Set([LEGACY_RECORDINGS_DIR, activeRecordingsDir]));
}

function getDefaultRecordingsDir() {
	const baseDir = process.platform === "darwin" ? "Movies" : "Videos";
	return path.join(os.homedir(), baseDir, "LikelySnap");
}

function getDefaultProjectDir() {
	return path.join(os.homedir(), "Documents", "LikelySnap");
}

function getDefaultCacheDir() {
	return path.join(app.getPath("userData"), "cache");
}

function normalizeQuality(value: unknown): RecordingQuality {
	return value === "standard" || value === "high" || value === "ultra" || value === "custom"
		? value
		: "high";
}

function normalizeResolutionMode(value: unknown): RecordingResolutionMode {
	return value === "source" ||
		value === "1080p" ||
		value === "1440p" ||
		value === "4k" ||
		value === "custom"
		? value
		: "source";
}

function normalizeFrameRateMode(value: unknown): RecordingFrameRateMode {
	return value === "custom" ? "custom" : "preset";
}

function normalizeBitrateMode(value: unknown): RecordingBitrateMode {
	return value === "custom" ? "custom" : "preset";
}

function normalizeFrameRate(value: unknown): RecordingFrameRatePreset {
	return value === 24 || value === 30 || value === 60 ? value : 30;
}

function normalizeBoundedNumber(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim()
				? Number(value)
				: NaN;
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.round(Math.min(maximum, Math.max(minimum, parsed)));
}

function normalizeBoundedDecimal(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim()
				? Number(value)
				: NaN;
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.round(Math.min(maximum, Math.max(minimum, parsed)) * 10) / 10;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

async function loadAppSettings(): Promise<AppSettings> {
	let raw: Record<string, unknown> = {};
	try {
		raw = JSON.parse(await fs.readFile(APP_SETTINGS_FILE, "utf-8")) as Record<string, unknown>;
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code !== "ENOENT") {
			console.warn("Failed to load app settings:", error);
		}
	}

	const configuredRecordingDir = await loadRecordingDirectorySetting();
	const recordingDirectory =
		normalizeRecordingDirectoryPath(raw.recordingDirectory) ??
		configuredRecordingDir ??
		getDefaultRecordingsDir();

	return {
		recordingDirectory,
		projectDirectory:
			normalizeRecordingDirectoryPath(raw.projectDirectory) ?? getDefaultProjectDir(),
		cacheDirectory: normalizeRecordingDirectoryPath(raw.cacheDirectory) ?? getDefaultCacheDir(),
		recordingQuality: normalizeQuality(raw.recordingQuality),
		recordingResolutionMode: normalizeResolutionMode(raw.recordingResolutionMode),
		recordingCustomWidth: normalizeBoundedNumber(raw.recordingCustomWidth, 1920, 320, 7680),
		recordingCustomHeight: normalizeBoundedNumber(raw.recordingCustomHeight, 1080, 240, 4320),
		recordingFrameRateMode: normalizeFrameRateMode(raw.recordingFrameRateMode),
		defaultFrameRate: normalizeFrameRate(raw.defaultFrameRate),
		recordingCustomFrameRate: normalizeBoundedNumber(raw.recordingCustomFrameRate, 30, 1, 120),
		recordingBitrateMode: normalizeBitrateMode(raw.recordingBitrateMode),
		recordingCustomBitrateMbps: normalizeBoundedDecimal(raw.recordingCustomBitrateMbps, 12, 1, 60),
		defaultEditableCursor: normalizeBoolean(raw.defaultEditableCursor, true),
		defaultMicrophoneEnabled: normalizeBoolean(raw.defaultMicrophoneEnabled, false),
		defaultSystemAudioEnabled: normalizeBoolean(raw.defaultSystemAudioEnabled, false),
		defaultWebcamEnabled: normalizeBoolean(raw.defaultWebcamEnabled, false),
	};
}

async function commandExists(command: string): Promise<boolean> {
	try {
		await fs.access(command, fsConstants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function runCommand(command: string, args: string[]): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { stdio: "ignore" });
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} exited with code ${code}`));
		});
	});
}

async function applyMacRecordingPackageIcon(packageDir: string): Promise<void> {
	if (process.platform !== "darwin") {
		return;
	}

	const iconSourcePath = await findMacRecordingPackageIconSource();
	if (!iconSourcePath) {
		console.warn("[recording-package] icon source missing");
		return;
	}

	const iconFilePath = path.join(packageDir, "Icon\r");
	const sipsAvailable = await commandExists("/usr/bin/sips");
	const setFileAvailable = await commandExists("/usr/bin/SetFile");
	if (!sipsAvailable || !setFileAvailable) {
		console.warn("[recording-package] macOS icon tools unavailable", {
			sipsAvailable,
			setFileAvailable,
		});
		return;
	}

	await runCommand("/usr/bin/sips", ["-i", iconSourcePath, "--out", iconFilePath]);
	await runCommand("/usr/bin/SetFile", ["-a", "V", iconFilePath]);
	await runCommand("/usr/bin/SetFile", ["-a", "C", packageDir]);
}

async function findMacRecordingPackageIconSource(): Promise<string | null> {
	const appRoot = process.env.APP_ROOT ?? path.join(__dirname, "..");
	const candidates = [
		path.join(process.resourcesPath, "likelysnap.png"),
		path.join(appRoot, "public", "likelysnap.png"),
		path.join(appRoot, "dist", "likelysnap.png"),
		path.join(appRoot, "icons", "icons", "png", "1024x1024.png"),
	];

	for (const candidate of candidates) {
		const stats = await fs.stat(candidate).catch(() => null);
		if (stats?.isFile()) {
			return candidate;
		}
	}

	return null;
}

async function ensureRecordingPackageDirectory(packageDir: string): Promise<void> {
	await fs.mkdir(packageDir, { recursive: true });
	try {
		await applyMacRecordingPackageIcon(packageDir);
	} catch (error) {
		console.warn("[recording-package] failed to apply package icon:", error);
	}
}

async function saveAppSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
	const current = await loadAppSettings();
	const next: AppSettings = {
		...current,
		...partial,
		recordingDirectory:
			normalizeRecordingDirectoryPath(partial.recordingDirectory) ?? current.recordingDirectory,
		projectDirectory:
			normalizeRecordingDirectoryPath(partial.projectDirectory) ?? current.projectDirectory,
		cacheDirectory:
			normalizeRecordingDirectoryPath(partial.cacheDirectory) ?? current.cacheDirectory,
		recordingQuality: normalizeQuality(partial.recordingQuality ?? current.recordingQuality),
		recordingResolutionMode: normalizeResolutionMode(
			partial.recordingResolutionMode ?? current.recordingResolutionMode,
		),
		recordingCustomWidth: normalizeBoundedNumber(
			partial.recordingCustomWidth ?? current.recordingCustomWidth,
			current.recordingCustomWidth,
			320,
			7680,
		),
		recordingCustomHeight: normalizeBoundedNumber(
			partial.recordingCustomHeight ?? current.recordingCustomHeight,
			current.recordingCustomHeight,
			240,
			4320,
		),
		recordingFrameRateMode: normalizeFrameRateMode(
			partial.recordingFrameRateMode ?? current.recordingFrameRateMode,
		),
		defaultFrameRate: normalizeFrameRate(partial.defaultFrameRate ?? current.defaultFrameRate),
		recordingCustomFrameRate: normalizeBoundedNumber(
			partial.recordingCustomFrameRate ?? current.recordingCustomFrameRate,
			current.recordingCustomFrameRate,
			1,
			120,
		),
		recordingBitrateMode: normalizeBitrateMode(
			partial.recordingBitrateMode ?? current.recordingBitrateMode,
		),
		recordingCustomBitrateMbps: normalizeBoundedDecimal(
			partial.recordingCustomBitrateMbps ?? current.recordingCustomBitrateMbps,
			current.recordingCustomBitrateMbps,
			1,
			60,
		),
		defaultEditableCursor: normalizeBoolean(
			partial.defaultEditableCursor,
			current.defaultEditableCursor,
		),
		defaultMicrophoneEnabled: normalizeBoolean(
			partial.defaultMicrophoneEnabled,
			current.defaultMicrophoneEnabled,
		),
		defaultSystemAudioEnabled: normalizeBoolean(
			partial.defaultSystemAudioEnabled,
			current.defaultSystemAudioEnabled,
		),
		defaultWebcamEnabled: normalizeBoolean(
			partial.defaultWebcamEnabled,
			current.defaultWebcamEnabled,
		),
	};

	await fs.mkdir(path.dirname(APP_SETTINGS_FILE), { recursive: true });
	await fs.writeFile(APP_SETTINGS_FILE, JSON.stringify(next, null, 2), "utf-8");
	await saveRecordingDirectorySetting(next.recordingDirectory);
	activeRecordingsDir = next.recordingDirectory;
	approveFilePath(next.recordingDirectory);
	approveFilePath(next.projectDirectory);
	approveFilePath(next.cacheDirectory);
	return next;
}

async function getCacheRootDir(): Promise<string> {
	return (await loadAppSettings()).cacheDirectory;
}

async function getProjectRootDir(): Promise<string> {
	return (await loadAppSettings()).projectDirectory;
}

async function getPreviewAudioDir(): Promise<string> {
	return path.join(await getCacheRootDir(), "preview-audio");
}

async function getWaveformCacheDir(): Promise<string> {
	return path.join(await getCacheRootDir(), "waveform-cache");
}

function normalizeRecordingDirectoryPath(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed ? path.resolve(trimmed) : null;
}

async function loadRecordingDirectorySetting(): Promise<string | null> {
	try {
		const content = await fs.readFile(RECORDING_SETTINGS_FILE, "utf-8");
		const parsed = JSON.parse(content) as { recordingDirectory?: unknown };
		return normalizeRecordingDirectoryPath(parsed.recordingDirectory);
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code !== "ENOENT") {
			console.warn("Failed to load recording directory settings:", error);
		}
		return null;
	}
}

async function saveRecordingDirectorySetting(recordingDirectory: string): Promise<void> {
	await fs.mkdir(path.dirname(RECORDING_SETTINGS_FILE), { recursive: true });
	await fs.writeFile(
		RECORDING_SETTINGS_FILE,
		JSON.stringify({ recordingDirectory: path.resolve(recordingDirectory) }, null, 2),
		"utf-8",
	);
}

async function ensureWritableDirectory(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
	const stats = await fs.stat(dirPath);
	if (!stats.isDirectory()) {
		throw new Error(`${dirPath} is not a directory`);
	}

	const testPath = path.join(dirPath, RECORDING_DIRECTORY_WRITE_TEST_FILE);
	await fs.writeFile(testPath, String(Date.now()), "utf-8");
	await fs.rm(testPath, { force: true });
}

async function refreshActiveRecordingsDir(): Promise<string> {
	const configuredDir = (await loadAppSettings()).recordingDirectory;
	activeRecordingsDir = configuredDir;
	approveFilePath(activeRecordingsDir);
	return activeRecordingsDir;
}

async function getWritableRecordingsDir(): Promise<string> {
	const dirPath = await refreshActiveRecordingsDir();
	await ensureWritableDirectory(dirPath);
	approveFilePath(dirPath);
	return dirPath;
}

async function getRecordingDirectoryInfo() {
	const settings = await loadAppSettings();
	const dirPath = settings.recordingDirectory;
	let writable = true;
	let error: string | undefined;
	try {
		await ensureWritableDirectory(dirPath);
		activeRecordingsDir = dirPath;
		approveFilePath(dirPath);
	} catch (nextError) {
		writable = false;
		error = nextError instanceof Error ? nextError.message : String(nextError);
	}

	return {
		success: true,
		path: dirPath,
		isDefault: path.resolve(dirPath) === path.resolve(getDefaultRecordingsDir()),
		writable,
		...(error ? { error } : {}),
	};
}

function isPathWithinDir(filePath: string, dirPath: string): boolean {
	const resolved = path.resolve(filePath);
	const resolvedDir = path.resolve(dirPath);
	return resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep);
}

function isPathAllowed(filePath: string): boolean {
	const resolved = path.resolve(filePath);
	if (approvedPaths.has(resolved)) return true;
	return getAllowedReadDirs().some((dir) => isPathWithinDir(resolved, dir));
}

function resolveApprovedVideoPath(videoPath?: string | null): string | null {
	const normalizedPath = normalizeVideoSourcePath(videoPath);
	if (!normalizedPath) {
		return null;
	}

	if (!hasAllowedImportVideoExtension(normalizedPath) || !isPathAllowed(normalizedPath)) {
		return null;
	}

	return normalizedPath;
}

// Attach the parent window only when valid, to avoid passing a destroyed BrowserWindow to dialogs.
function buildDialogOptions<T extends Electron.OpenDialogOptions | Electron.SaveDialogOptions>(
	baseOptions: T,
	parentWindow: BrowserWindow | null,
): T & { parent?: BrowserWindow } {
	const mainWindow = parentWindow;
	if (mainWindow && !mainWindow.isDestroyed()) {
		return { ...baseOptions, parent: mainWindow };
	}
	return baseOptions;
}

function hasAllowedImportVideoExtension(filePath: string): boolean {
	return ALLOWED_IMPORT_VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function runProcess(
	command: string,
	args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

function parseAfinfoAudioTrackBitrates(output: string): number[] {
	const bitrates: number[] = [];
	const trackSections = output.split(/\n----\n/g).slice(1);
	for (const section of trackSections) {
		const match = section.match(/\bbit rate:\s*([0-9]+)\s*bits per second/i);
		bitrates.push(match ? Number(match[1]) : 0);
	}
	return bitrates;
}

async function prepareSupplementalPreviewAudioTrack(videoPath: string) {
	const normalizedPath = await approveReadableVideoPath(videoPath);
	if (!normalizedPath) {
		return {
			success: false,
			message: "File path is not approved or is not a supported video file",
		};
	}

	if (process.platform !== "darwin" || path.extname(normalizedPath).toLowerCase() !== ".mp4") {
		return { success: true, path: null };
	}

	const afinfo = await runProcess("/usr/bin/afinfo", [normalizedPath]);
	if (afinfo.code !== 0) {
		return { success: true, path: null };
	}

	const bitrates = parseAfinfoAudioTrackBitrates(`${afinfo.stdout}\n${afinfo.stderr}`);
	if (bitrates.length <= 1) {
		return { success: true, path: null };
	}

	let supplementalTrackIndex = 1;
	for (let index = 2; index < bitrates.length; index += 1) {
		if (bitrates[index] > bitrates[supplementalTrackIndex]) {
			supplementalTrackIndex = index;
		}
	}

	const previewAudioDir = await getPreviewAudioDir();
	await fs.mkdir(previewAudioDir, { recursive: true });
	const sourceStat = await fs.stat(normalizedPath);
	const parsedPath = path.parse(normalizedPath);
	const outputPath = path.join(
		previewAudioDir,
		`${parsedPath.name}.track-${supplementalTrackIndex}.${Math.round(sourceStat.mtimeMs)}.m4a`,
	);

	try {
		const outputStat = await fs.stat(outputPath);
		if (outputStat.mtimeMs >= sourceStat.mtimeMs) {
			return { success: true, path: pathToFileURL(outputPath).toString() };
		}
	} catch {
		// Generate below.
	}

	const conversion = await runProcess("/usr/bin/afconvert", [
		"--read-track",
		String(supplementalTrackIndex),
		"-f",
		"m4af",
		"-d",
		"aac",
		normalizedPath,
		outputPath,
	]);
	if (conversion.code !== 0) {
		return {
			success: false,
			message: conversion.stderr || conversion.stdout || "Failed to prepare preview audio",
		};
	}

	return { success: true, path: pathToFileURL(outputPath).toString() };
}

type WaveformPeakCache = {
	version: 1;
	sourcePath: string;
	sourceSize: number;
	sourceMtimeMs: number;
	durationSec: number;
	peaksPerSecond: number;
	peaks: number[];
};

function sanitizeCacheName(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "media";
}

async function getWaveformCachePath(
	sourcePath: string,
	sourceStat: { size: number; mtimeMs: number },
) {
	const parsedPath = path.parse(sourcePath);
	const fingerprint = Buffer.from(
		`${path.resolve(sourcePath)}:${sourceStat.size}:${Math.round(sourceStat.mtimeMs)}`,
	).toString("base64url");
	return path.join(
		await getWaveformCacheDir(),
		`${sanitizeCacheName(parsedPath.name)}.${fingerprint}.peaks.json`,
	);
}

function isValidWaveformPeakCache(
	value: unknown,
	sourcePath: string,
	sourceStat: { size: number; mtimeMs: number },
): value is WaveformPeakCache {
	if (!value || typeof value !== "object") {
		return false;
	}

	const cache = value as Partial<WaveformPeakCache>;
	return (
		cache.version === 1 &&
		cache.sourcePath === sourcePath &&
		cache.sourceSize === sourceStat.size &&
		cache.sourceMtimeMs === sourceStat.mtimeMs &&
		typeof cache.durationSec === "number" &&
		Number.isFinite(cache.durationSec) &&
		cache.durationSec >= 0 &&
		cache.peaksPerSecond === WAVEFORM_PEAKS_PER_SECOND &&
		Array.isArray(cache.peaks)
	);
}

async function readWaveformPeaksCache(videoPath: string) {
	const normalizedPath = await approveReadableVideoPath(videoPath);
	if (!normalizedPath) {
		return {
			success: false,
			message: "File path is not approved or is not a supported video file",
		};
	}

	const sourceStat = await fs.stat(normalizedPath);
	const cachePath = await getWaveformCachePath(normalizedPath, sourceStat);

	try {
		const cached = JSON.parse(await fs.readFile(cachePath, "utf-8"));
		if (isValidWaveformPeakCache(cached, normalizedPath, sourceStat)) {
			return {
				success: true,
				path: cachePath,
				durationSec: cached.durationSec,
				peaksPerSecond: cached.peaksPerSecond,
				peaks: cached.peaks,
				cached: true,
			};
		}
	} catch {
		// Cache miss.
	}

	return { success: true, cached: false };
}

async function writeWaveformPeaksCache(
	videoPath: string,
	cacheInput: { durationSec: number; peaksPerSecond: number; peaks: number[] },
) {
	const normalizedPath = await approveReadableVideoPath(videoPath);
	if (!normalizedPath) {
		return {
			success: false,
			message: "File path is not approved or is not a supported video file",
		};
	}

	if (
		!cacheInput ||
		typeof cacheInput.durationSec !== "number" ||
		!Number.isFinite(cacheInput.durationSec) ||
		cacheInput.durationSec < 0 ||
		cacheInput.peaksPerSecond !== WAVEFORM_PEAKS_PER_SECOND ||
		!Array.isArray(cacheInput.peaks)
	) {
		return {
			success: false,
			message: "Invalid waveform cache payload",
		};
	}

	const sourceStat = await fs.stat(normalizedPath);
	const cachePath = await getWaveformCachePath(normalizedPath, sourceStat);
	const payload: WaveformPeakCache = {
		version: 1,
		sourcePath: normalizedPath,
		sourceSize: sourceStat.size,
		sourceMtimeMs: sourceStat.mtimeMs,
		durationSec: cacheInput.durationSec,
		peaksPerSecond: WAVEFORM_PEAKS_PER_SECOND,
		peaks: cacheInput.peaks,
	};

	await fs.mkdir(path.dirname(cachePath), { recursive: true });
	await fs.writeFile(cachePath, JSON.stringify(payload), "utf-8");

	return {
		success: true,
		path: cachePath,
		durationSec: cacheInput.durationSec,
		peaksPerSecond: WAVEFORM_PEAKS_PER_SECOND,
		cached: false,
	};
}

async function directorySizeBytes(dirPath: string): Promise<number> {
	let total = 0;
	const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const childPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			total += await directorySizeBytes(childPath);
		} else if (entry.isFile()) {
			const stat = await fs.stat(childPath).catch(() => null);
			total += stat?.size ?? 0;
		}
	}
	return total;
}

async function clearDirectoryContents(dirPath: string): Promise<void> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
	await Promise.all(
		entries.map((entry) => fs.rm(path.join(dirPath, entry.name), { recursive: true, force: true })),
	);
}

async function pickDirectory(
	defaultPath: string,
	title: string,
	parentWindow: BrowserWindow | null,
) {
	const result = await dialog.showOpenDialog(
		buildDialogOptions(
			{
				title,
				defaultPath,
				properties: ["openDirectory", "createDirectory"],
			},
			parentWindow,
		),
	);

	if (result.canceled || result.filePaths.length === 0) {
		return { canceled: true, path: defaultPath };
	}

	const selectedPath = path.resolve(result.filePaths[0]);
	await ensureWritableDirectory(selectedPath);
	approveFilePath(selectedPath);
	return { canceled: false, path: selectedPath };
}

async function approveReadableVideoPath(
	filePath?: string | null,
	trustedDirs?: string[],
): Promise<string | null> {
	const normalizedPath = normalizeVideoSourcePath(filePath);
	if (!normalizedPath) {
		return null;
	}

	if (isPathAllowed(normalizedPath)) {
		return normalizedPath;
	}

	if (!hasAllowedImportVideoExtension(normalizedPath)) {
		return null;
	}

	// With trustedDirs (e.g. project load), only auto-approve paths inside them so a
	// malicious project file can't approve reads to arbitrary locations.
	if (trustedDirs) {
		const resolved = path.resolve(normalizedPath);
		const withinTrusted = trustedDirs.some((dir) => isPathWithinDir(resolved, dir));
		if (!withinTrusted) {
			return null;
		}
	}

	try {
		const stats = await fs.stat(normalizedPath);
		if (!stats.isFile()) {
			return null;
		}
	} catch {
		return null;
	}

	approveFilePath(normalizedPath);
	return normalizedPath;
}

function resolveRecordingOutputPath(fileName: string, recordingDir = activeRecordingsDir): string {
	return resolveRecordingOutputPathInDirectory(fileName, recordingDir);
}

function isValidDurationMs(value: number | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Finalize one recording file: flush/close the stream if it was streamed, else write
 * the buffered bytes (short recording or stream failed to open). Returns whether it was
 * streamed, so the caller knows if the WebM duration needs patching on disk.
 */
async function finalizeRecordingFile(
	registry: RecordingStreamRegistry,
	fileName: string,
	filePath: string,
	videoData?: ArrayBuffer,
): Promise<boolean> {
	const streamed = await registry.finalize(fileName);
	if (!streamed && videoData && videoData.byteLength > 0) {
		await fs.writeFile(filePath, Buffer.from(videoData));
	}
	return streamed;
}

async function getApprovedProjectSession(
	project: unknown,
	projectFilePath?: string,
): Promise<RecordingSession | null> {
	if (!project || typeof project !== "object") {
		return null;
	}

	const rawProject = project as { media?: unknown; videoPath?: unknown };
	const media: ProjectMedia | null =
		normalizeProjectMedia(rawProject.media) ??
		(typeof rawProject.videoPath === "string"
			? {
					screenVideoPath: normalizeVideoSourcePath(rawProject.videoPath) ?? rawProject.videoPath,
				}
			: null);

	if (!media) {
		return null;
	}

	// Only auto-approve media within the project's dir or known recording dirs, so a crafted
	// project file can't approve reads to arbitrary locations.
	const trustedDirs = getAllowedReadDirs();
	if (projectFilePath) {
		trustedDirs.push(path.dirname(path.resolve(projectFilePath)));
	}

	const screenVideoPath = await approveReadableVideoPath(media.screenVideoPath, trustedDirs);
	if (!screenVideoPath) {
		throw new Error("Project references an invalid or unsupported screen video path");
	}

	const webcamVideoPath = media.webcamVideoPath
		? await approveReadableVideoPath(media.webcamVideoPath, trustedDirs)
		: undefined;
	if (media.webcamVideoPath && !webcamVideoPath) {
		throw new Error("Project references an invalid or unsupported webcam video path");
	}

	return webcamVideoPath
		? { screenVideoPath, webcamVideoPath, createdAt: Date.now() }
		: { screenVideoPath, createdAt: Date.now() };
}

type SelectedSource = {
	name: string;
	id?: string;
	display_id?: string;
	[key: string]: unknown;
};

type AttachNativeMacWebcamRecordingInput = {
	screenVideoPath?: string;
	recordingId?: number;
	webcam?: RecordedVideoAssetInput;
	webcamStartOffsetMs?: number;
	webcamDurationMs?: number;
	cursorCaptureMode?: CursorCaptureMode;
};

let selectedSource: SelectedSource | null = null;
let selectedDesktopSource: DesktopCapturerSource | null = null;
let lastEnumeratedSources = new Map<string, DesktopCapturerSource>();
let currentProjectPath: string | null = null;
let currentRecordingSession: RecordingSession | null = null;

// Cached source from the user's pick. Used by setDisplayMediaRequestHandler in main.ts for cursor-free capture.
export function getSelectedDesktopSource(): DesktopCapturerSource | null {
	return selectedDesktopSource;
}
let currentVideoPath: string | null = null;

function normalizePath(filePath: string) {
	return path.resolve(filePath);
}

function normalizeVideoSourcePath(videoPath?: string | null): string | null {
	if (typeof videoPath !== "string") {
		return null;
	}

	const trimmed = videoPath.trim();
	if (!trimmed) {
		return null;
	}

	if (/^file:\/\//i.test(trimmed)) {
		try {
			return fileURLToPath(trimmed);
		} catch {
			// Fall through and keep best-effort string path below.
		}
	}

	return trimmed;
}

function isTrustedProjectPath(filePath?: string | null) {
	if (!filePath || !currentProjectPath) {
		return false;
	}
	return normalizePath(filePath) === normalizePath(currentProjectPath);
}

const CURSOR_TELEMETRY_VERSION = 2;
const CURSOR_SAMPLE_INTERVAL_MS = 33;
const CURSOR_TELEMETRY_FLUSH_INTERVAL_MS = 500;
const MAX_CURSOR_SAMPLES = Number.MAX_SAFE_INTEGER;
const CURSOR_PREVIEW_SCHEMA_VERSION = 1;
const DEFAULT_CURSOR_PREVIEW_INTERVAL_MS = 100;
const cursorRecordingDataCache = new Map<
	string,
	{
		mtimeMs: number;
		size: number;
		data: CursorRecordingData;
	}
>();
const cursorPreviewDataCache = new Map<
	string,
	{
		telemetryMtimeMs: number;
		telemetrySize: number;
		sampleIntervalMs: number;
		data: CursorPreviewFile;
	}
>();

let cursorRecordingSession: CursorRecordingSession | null = null;
let pendingCursorRecordingData: CursorRecordingData | null = null;
let cursorTelemetryLivePath: string | null = null;
let cursorTelemetryLiveOffsetMs = 0;
let cursorTelemetryLastFlushMs = 0;
let cursorTelemetryWriteChain: Promise<void> = Promise.resolve();
let cursorPreviewLivePath: string | null = null;
let nativeWindowsCaptureProcess: ChildProcessWithoutNullStreams | null = null;
let nativeWindowsCaptureOutput = "";
let nativeWindowsCaptureTargetPath: string | null = null;
let nativeWindowsCaptureWebcamTargetPath: string | null = null;
let nativeWindowsCaptureRecordingId: number | null = null;
let nativeWindowsCursorOffsetMs = 0;
let nativeWindowsCursorCaptureMode: CursorCaptureMode = "editable-overlay";
let nativeWindowsCursorRecordingStartMs = 0;
let nativeWindowsPauseStartedAtMs: number | null = null;
let nativeWindowsPauseRanges: Array<{ startMs: number; endMs: number }> = [];
let nativeWindowsIsPaused = false;
const NATIVE_WINDOWS_CAPTURE_STOP_TIMEOUT_MS = 15_000;
let nativeMacCaptureProcess: ChildProcessWithoutNullStreams | null = null;
let nativeMacCaptureOutput = "";
let nativeMacCaptureTargetPath: string | null = null;
let nativeMacCaptureWebcamTargetPath: string | null = null;
let nativeMacCaptureDiagnostics: Record<string, unknown> | null = null;
let nativeMacCaptureRecordingId: number | null = null;
let nativeMacCaptureBounds: Rectangle | null = null;
let nativeMacCursorOffsetMs = 0;
let nativeMacCursorCaptureMode: CursorCaptureMode = "editable-overlay";
let nativeMacCursorRecordingStartMs = 0;
let nativeMacPauseStartedAtMs: number | null = null;
let nativeMacPauseRanges: Array<{ startMs: number; endMs: number }> = [];
let nativeMacIsPaused = false;

function normalizeCursorSample(sample: unknown): CursorRecordingSample | null {
	if (!sample || typeof sample !== "object") {
		return null;
	}

	const point = sample as Partial<CursorRecordingSample>;
	const interactionType =
		point.interactionType === "click" ||
		point.interactionType === "mouseup" ||
		point.interactionType === "move"
			? point.interactionType
			: "move";
	return {
		timeMs:
			typeof point.timeMs === "number" && Number.isFinite(point.timeMs)
				? Math.max(0, point.timeMs)
				: 0,
		cx: typeof point.cx === "number" && Number.isFinite(point.cx) ? point.cx : 0.5,
		cy: typeof point.cy === "number" && Number.isFinite(point.cy) ? point.cy : 0.5,
		assetId: typeof point.assetId === "string" ? point.assetId : null,
		visible: typeof point.visible === "boolean" ? point.visible : true,
		cursorType: typeof point.cursorType === "string" ? point.cursorType : null,
		interactionType,
	};
}

function normalizeCursorAsset(asset: unknown): NativeCursorAsset | null {
	if (!asset || typeof asset !== "object") {
		return null;
	}

	const candidate = asset as Partial<NativeCursorAsset>;
	if (typeof candidate.id !== "string" || typeof candidate.imageDataUrl !== "string") {
		return null;
	}

	return {
		id: candidate.id,
		platform:
			candidate.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux",
		imageDataUrl: candidate.imageDataUrl,
		width:
			typeof candidate.width === "number" && Number.isFinite(candidate.width)
				? Math.max(1, Math.round(candidate.width))
				: 1,
		height:
			typeof candidate.height === "number" && Number.isFinite(candidate.height)
				? Math.max(1, Math.round(candidate.height))
				: 1,
		hotspotX:
			typeof candidate.hotspotX === "number" && Number.isFinite(candidate.hotspotX)
				? Math.max(0, Math.round(candidate.hotspotX))
				: 0,
		hotspotY:
			typeof candidate.hotspotY === "number" && Number.isFinite(candidate.hotspotY)
				? Math.max(0, Math.round(candidate.hotspotY))
				: 0,
		scaleFactor:
			typeof candidate.scaleFactor === "number" && Number.isFinite(candidate.scaleFactor)
				? Math.max(0.1, candidate.scaleFactor)
				: undefined,
		cursorType: typeof candidate.cursorType === "string" ? candidate.cursorType : null,
	};
}

async function readCursorRecordingFile(targetVideoPath: string): Promise<CursorRecordingData> {
	const telemetryPath = getCursorTelemetryPathForVideo(targetVideoPath);
	try {
		const startedAt = Date.now();
		const stat = await fs.stat(telemetryPath);
		const cached = cursorRecordingDataCache.get(telemetryPath);
		if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
			console.info("[editor-open] cursor recording cache hit", {
				telemetryPath,
				samples: cached.data.samples.length,
				assets: cached.data.assets.length,
				size: stat.size,
			});
			return cached.data;
		}

		const content = await fs.readFile(telemetryPath, "utf-8");
		const readDurationMs = Date.now() - startedAt;
		const parseStartedAt = Date.now();
		const parsed = JSON.parse(content);
		const rawSamples = Array.isArray(parsed)
			? parsed
			: Array.isArray(parsed?.samples)
				? parsed.samples
				: [];
		const rawAssets = Array.isArray(parsed?.assets) ? parsed.assets : [];

		const samples = rawSamples
			.map((sample: unknown) => normalizeCursorSample(sample))
			.filter((sample: CursorRecordingSample | null): sample is CursorRecordingSample =>
				Boolean(sample),
			)
			.sort((a: CursorRecordingSample, b: CursorRecordingSample) => a.timeMs - b.timeMs);

		const assets = rawAssets
			.map((asset: unknown) => normalizeCursorAsset(asset))
			.filter((asset: NativeCursorAsset | null): asset is NativeCursorAsset => Boolean(asset));

		const provider: CursorProviderKind = parsed?.provider === "native" ? "native" : "none";
		const data: CursorRecordingData = {
			version:
				typeof parsed?.version === "number" && Number.isFinite(parsed.version) ? parsed.version : 1,
			provider,
			samples,
			assets,
		};
		cursorRecordingDataCache.set(telemetryPath, {
			mtimeMs: stat.mtimeMs,
			size: stat.size,
			data,
		});
		console.info("[editor-open] cursor recording parsed", {
			telemetryPath,
			samples: samples.length,
			assets: assets.length,
			size: stat.size,
			readDurationMs,
			parseDurationMs: Date.now() - parseStartedAt,
			totalDurationMs: Date.now() - startedAt,
		});

		return data;
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code === "ENOENT") {
			return {
				version: CURSOR_TELEMETRY_VERSION,
				provider: "none",
				samples: [],
				assets: [],
			};
		}

		console.error("Failed to load cursor telemetry:", error);
		throw error;
	}
}

function normalizeCursorPreviewInterval(sampleIntervalMs?: number) {
	return typeof sampleIntervalMs === "number" && Number.isFinite(sampleIntervalMs)
		? Math.max(16, Math.round(sampleIntervalMs))
		: DEFAULT_CURSOR_PREVIEW_INTERVAL_MS;
}

function downsampleCursorSamples(
	samples: CursorRecordingSample[],
	sampleIntervalMs: number,
): CursorRecordingSample[] {
	if (samples.length <= 2) {
		return samples;
	}

	const downsampled: CursorRecordingSample[] = [];
	let lastKeptTimeMs = Number.NEGATIVE_INFINITY;

	for (const sample of samples) {
		const keepForTime = sample.timeMs - lastKeptTimeMs >= sampleIntervalMs;
		const keepForInteraction = sample.interactionType && sample.interactionType !== "move";
		if (keepForTime || keepForInteraction) {
			downsampled.push(sample);
			lastKeptTimeMs = sample.timeMs;
		}
	}

	const finalSample = samples[samples.length - 1];
	if (downsampled[downsampled.length - 1] !== finalSample) {
		downsampled.push(finalSample);
	}

	return downsampled;
}

function normalizePreviewSamples(samples: unknown): CursorRecordingSample[] {
	return Array.isArray(samples)
		? samples
				.map((sample) => normalizeCursorSample(sample))
				.filter((sample): sample is CursorRecordingSample => Boolean(sample))
				.sort((a, b) => a.timeMs - b.timeMs)
		: [];
}

function isValidCursorPreviewFile(
	preview: unknown,
	telemetrySourcePath: string,
	telemetryStat: { size: number; mtimeMs: number },
	sampleIntervalMs: number,
): preview is CursorPreviewFile {
	if (!preview || typeof preview !== "object") {
		return false;
	}

	const candidate = preview as Partial<CursorPreviewFile>;
	return (
		candidate.schemaVersion === CURSOR_PREVIEW_SCHEMA_VERSION &&
		candidate.source?.path === telemetrySourcePath &&
		candidate.source.size === telemetryStat.size &&
		candidate.source.mtimeMs === telemetryStat.mtimeMs &&
		candidate.sampleIntervalMs === sampleIntervalMs &&
		typeof candidate.version === "number" &&
		(candidate.provider === "native" || candidate.provider === "none") &&
		typeof candidate.originalSampleCount === "number" &&
		Array.isArray(candidate.samples)
	);
}

function getCursorPreviewSourcePath(telemetryPath: string): string {
	const packageDir = getRecordingPackageDirForVideoPath(telemetryPath);
	return packageDir ? path.relative(packageDir, telemetryPath) : telemetryPath;
}

async function readCursorPreviewFile(
	targetVideoPath: string,
	sampleIntervalMs?: number,
): Promise<CursorPreviewFile> {
	const telemetryPath = getCursorTelemetryPathForVideo(targetVideoPath);
	const previewPath = getCursorPreviewPathForVideo(targetVideoPath);
	const telemetrySourcePath = getCursorPreviewSourcePath(telemetryPath);
	const intervalMs = normalizeCursorPreviewInterval(sampleIntervalMs);

	try {
		const startedAt = Date.now();
		const stat = await fs.stat(telemetryPath);
		const cached = cursorPreviewDataCache.get(previewPath);
		if (
			cached &&
			cached.telemetryMtimeMs === stat.mtimeMs &&
			cached.telemetrySize === stat.size &&
			cached.sampleIntervalMs === intervalMs
		) {
			return cached.data;
		}

		try {
			const parsed = JSON.parse(await fs.readFile(previewPath, "utf-8"));
			if (isValidCursorPreviewFile(parsed, telemetrySourcePath, stat, intervalMs)) {
				const data: CursorPreviewFile = {
					...parsed,
					samples: normalizePreviewSamples(parsed.samples),
				};
				cursorPreviewDataCache.set(previewPath, {
					telemetryMtimeMs: stat.mtimeMs,
					telemetrySize: stat.size,
					sampleIntervalMs: intervalMs,
					data,
				});
				console.info("[editor-open] cursor preview cache hit", {
					previewPath,
					telemetryPath,
					samples: data.samples.length,
					originalSamples: data.originalSampleCount,
					durationMs: Date.now() - startedAt,
				});
				return data;
			}
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code !== "ENOENT") {
				console.warn("[editor-open] cursor preview cache ignored", {
					previewPath,
					error: String(error),
				});
			}
		}

		const recordingData = await readCursorRecordingFile(targetVideoPath);
		const data: CursorPreviewFile = {
			schemaVersion: CURSOR_PREVIEW_SCHEMA_VERSION,
			source: {
				path: telemetrySourcePath,
				size: stat.size,
				mtimeMs: stat.mtimeMs,
			},
			version: recordingData.version,
			provider: recordingData.provider,
			samples: downsampleCursorSamples(recordingData.samples, intervalMs),
			originalSampleCount: recordingData.samples.length,
			sampleIntervalMs: intervalMs,
		};
		cursorPreviewDataCache.set(previewPath, {
			telemetryMtimeMs: stat.mtimeMs,
			telemetrySize: stat.size,
			sampleIntervalMs: intervalMs,
			data,
		});
		await fs.writeFile(previewPath, JSON.stringify(data), "utf-8").catch((error) =>
			console.warn("[editor-open] failed to write cursor preview cache", {
				previewPath,
				error: String(error),
			}),
		);
		console.info("[editor-open] cursor preview prepared", {
			previewPath,
			telemetryPath,
			samples: data.samples.length,
			originalSamples: data.originalSampleCount,
			durationMs: Date.now() - startedAt,
		});
		return data;
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code === "ENOENT") {
			return {
				schemaVersion: CURSOR_PREVIEW_SCHEMA_VERSION,
				source: {
					path: telemetrySourcePath,
					size: 0,
					mtimeMs: 0,
				},
				version: CURSOR_TELEMETRY_VERSION,
				provider: "none",
				samples: [],
				originalSampleCount: 0,
				sampleIntervalMs: intervalMs,
			};
		}
		throw error;
	}
}

async function readCursorTelemetryFile(targetVideoPath: string) {
	try {
		const previewData = await readCursorPreviewFile(targetVideoPath);
		return {
			success: true,
			samples: previewData.samples.map((sample) => ({
				timeMs: sample.timeMs,
				cx: sample.cx,
				cy: sample.cy,
				...(sample.interactionType ? { interactionType: sample.interactionType } : {}),
			})),
		};
	} catch (error) {
		console.error("Failed to load cursor telemetry:", error);
		return {
			success: false,
			message: "Failed to load cursor telemetry",
			error: String(error),
			samples: [],
		};
	}
}

function resolveAssetBasePath() {
	try {
		if (app.isPackaged) {
			const assetPath = path.join(process.resourcesPath, "assets");
			return pathToFileURL(`${assetPath}${path.sep}`).toString();
		}
		const assetPath = path.join(app.getAppPath(), "public", "assets");
		return pathToFileURL(`${assetPath}${path.sep}`).toString();
	} catch (err) {
		console.error("Failed to resolve asset base path:", err);
		return null;
	}
}

function getSelectedSourceBounds() {
	const cursor = screen.getCursorScreenPoint();
	const sourceDisplayId = Number(selectedSource?.display_id);
	const sourceDisplay = Number.isFinite(sourceDisplayId)
		? (screen.getAllDisplays().find((display) => display.id === sourceDisplayId) ?? null)
		: null;
	return (sourceDisplay ?? screen.getDisplayNearestPoint(cursor)).bounds;
}

function getSelectedSourceId() {
	return typeof selectedSource?.id === "string" ? selectedSource.id : null;
}

function getSelectedDisplay() {
	const sourceDisplayId = Number(selectedSource?.display_id);
	if (!Number.isFinite(sourceDisplayId)) {
		return null;
	}

	return screen.getAllDisplays().find((display) => display.id === sourceDisplayId) ?? null;
}

function resolveUnpackedAppPath(...segments: string[]) {
	const resolved = path.join(app.getAppPath(), ...segments);
	if (app.isPackaged) {
		return resolved.replace(/\.asar([/\\])/, ".asar.unpacked$1");
	}

	return resolved;
}

function resolvePackagedResourcePath(...segments: string[]) {
	if (!app.isPackaged) {
		return null;
	}

	return path.join(process.resourcesPath, ...segments);
}

function getNativeWindowsCaptureHelperCandidates() {
	const envPath = process.env.OPENSCREEN_WGC_CAPTURE_EXE?.trim();
	return [
		envPath,
		resolveUnpackedAppPath(
			"electron",
			"native",
			"wgc-capture",
			"build",
			"Release",
			"wgc-capture.exe",
		),
		resolveUnpackedAppPath("electron", "native", "wgc-capture", "build", "wgc-capture.exe"),
		resolveUnpackedAppPath("electron", "native", "bin", "win32-x64", "wgc-capture.exe"),
		resolvePackagedResourcePath("electron", "native", "bin", "win32-x64", "wgc-capture.exe"),
	].filter((candidate): candidate is string => Boolean(candidate));
}

async function findNativeWindowsCaptureHelperPath() {
	if (process.platform !== "win32") {
		return null;
	}

	for (const candidate of getNativeWindowsCaptureHelperCandidates()) {
		try {
			await fs.access(candidate, fsConstants.X_OK);
			return candidate;
		} catch {
			// Try the next configured helper location.
		}
	}

	return null;
}

function getNativeMacCaptureHelperCandidates() {
	const envPath = process.env.OPENSCREEN_SCK_CAPTURE_EXE?.trim();
	const archTag = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
	const helperName = "openscreen-screencapturekit-helper";
	return [
		envPath,
		resolveUnpackedAppPath("electron", "native", "screencapturekit", "build", helperName),
		resolveUnpackedAppPath("electron", "native", "bin", archTag, helperName),
		resolvePackagedResourcePath("electron", "native", "bin", archTag, helperName),
	].filter((candidate): candidate is string => Boolean(candidate));
}

async function findNativeMacCaptureHelperPath() {
	if (process.platform !== "darwin") {
		return null;
	}

	for (const candidate of getNativeMacCaptureHelperCandidates()) {
		try {
			await fs.access(candidate, fsConstants.X_OK);
			return candidate;
		} catch {
			// Try the next configured helper location.
		}
	}

	return null;
}

function isWindowsGraphicsCaptureOsSupported() {
	if (process.platform !== "win32") {
		return false;
	}

	const [, , build] = process.getSystemVersion().split(".").map(Number);
	return Number.isFinite(build) && build >= 19041;
}

function normalizeNativeDeviceName(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function scoreNativeDeviceName(candidateName: string, candidateId: string, requestedName?: string) {
	const candidate = normalizeNativeDeviceName(candidateName);
	const id = normalizeNativeDeviceName(candidateId);
	const requested = normalizeNativeDeviceName(requestedName ?? "");
	if (!requested) {
		return 0;
	}
	if (candidate === requested) {
		return 1000;
	}
	if (candidate.includes(requested) || requested.includes(candidate)) {
		return 900;
	}
	if (id.includes(requested) || requested.includes(id)) {
		return 800;
	}

	return requested
		.split(/\s+/)
		.filter((word) => word.length > 1 && !["camera", "webcam", "video", "input"].includes(word))
		.reduce((score, word) => {
			if (candidate.includes(word)) return score + 100;
			if (id.includes(word)) return score + 50;
			return score;
		}, 0);
}

function queryDirectShowVideoInputRegistry() {
	return new Promise<string>((resolve) => {
		const proc = spawn(
			"reg.exe",
			["query", "HKCR\\CLSID\\{860BB310-5D01-11D0-BD3B-00A0C911CE86}\\Instance", "/s"],
			{ windowsHide: true },
		);
		let stdout = "";
		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf16le").includes("\u0000")
				? chunk.toString("utf16le")
				: chunk.toString();
		});
		proc.on("close", () => resolve(stdout));
		proc.on("error", () => resolve(""));
	});
}

async function resolveDirectShowWebcamClsid(deviceName?: string) {
	if (process.platform !== "win32" || !deviceName?.trim()) {
		return null;
	}

	const output = await queryDirectShowVideoInputRegistry();
	let current: { friendlyName?: string; clsid?: string } = {};
	const entries: Array<{ friendlyName?: string; clsid?: string }> = [];
	for (const rawLine of output.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		if (/^HKEY_/i.test(line)) {
			if (current.friendlyName || current.clsid) entries.push(current);
			current = {};
			continue;
		}
		const match = line.match(/^(\S+)\s+REG_SZ\s+(.+)$/);
		if (!match) continue;
		if (match[1] === "FriendlyName") current.friendlyName = match[2].trim();
		if (match[1] === "CLSID") current.clsid = match[2].trim();
	}
	if (current.friendlyName || current.clsid) entries.push(current);

	let best: { clsid: string; friendlyName?: string; score: number } | null = null;
	for (const entry of entries) {
		if (!entry.clsid) continue;
		const score = scoreNativeDeviceName(entry.friendlyName ?? "", entry.clsid, deviceName);
		if (!best || score > best.score) {
			best = { clsid: entry.clsid, friendlyName: entry.friendlyName, score };
		}
	}

	if (!best || best.score <= 0) {
		return null;
	}

	console.info("[native-wgc] resolved DirectShow webcam filter", {
		requestedName: deviceName,
		filterName: best.friendlyName,
		clsid: best.clsid,
		score: best.score,
	});
	return best.clsid;
}

async function startCursorRecording(
	recordingId?: number,
	telemetryPath?: string,
	getDisplayBounds: () => Rectangle | null = getSelectedSourceBounds,
) {
	if (cursorRecordingSession) {
		pendingCursorRecordingData = await cursorRecordingSession.stop();
		cursorRecordingSession = null;
	}

	pendingCursorRecordingData = null;
	if (telemetryPath) {
		await beginLiveCursorTelemetry(telemetryPath);
	}
	cursorRecordingSession = createCursorRecordingSession({
		getDisplayBounds,
		maxSamples: MAX_CURSOR_SAMPLES,
		platform: process.platform,
		sampleIntervalMs: CURSOR_SAMPLE_INTERVAL_MS,
		sourceId: getSelectedSourceId(),
		startTimeMs:
			typeof recordingId === "number" && Number.isFinite(recordingId) ? recordingId : undefined,
		onUpdate: (data) => {
			pendingCursorRecordingData = data;
			void queueCursorTelemetryWrite(data);
		},
	});

	try {
		await cursorRecordingSession.start();
	} catch (error) {
		console.error("Failed to start cursor recording session:", error);
		cursorRecordingSession = null;
		await endLiveCursorTelemetry(null);
	}
}

async function stopCursorRecording() {
	if (!cursorRecordingSession) {
		return;
	}

	try {
		pendingCursorRecordingData = await cursorRecordingSession.stop();
	} catch (error) {
		console.error("Failed to stop cursor recording session:", error);
		pendingCursorRecordingData = null;
	} finally {
		cursorRecordingSession = null;
	}
}

function buildCursorTelemetrySnapshot(
	data: CursorRecordingData,
	offsetMs = cursorTelemetryLiveOffsetMs,
): CursorRecordingData {
	const normalizedOffset = Number.isFinite(offsetMs) && offsetMs > 0 ? offsetMs : 0;
	return {
		...data,
		samples: data.samples
			.map((sample) => ({
				...sample,
				timeMs: Math.max(0, sample.timeMs - normalizedOffset),
			}))
			.sort((a, b) => a.timeMs - b.timeMs),
		assets: data.assets,
	};
}

function getCursorPreviewPathForTelemetryPath(telemetryPath: string): string {
	if (getRecordingPackageDirForVideoPath(telemetryPath)) {
		return getCursorPreviewPathForVideo(telemetryPath);
	}
	return telemetryPath.endsWith(".cursor.json")
		? telemetryPath.slice(0, -".cursor.json".length) + ".cursor-preview.json"
		: `${telemetryPath}.preview.json`;
}

function buildCursorPreviewSnapshot(
	data: CursorRecordingData,
	sourcePath: string,
	sourceStat: { size: number; mtimeMs: number },
	offsetMs = cursorTelemetryLiveOffsetMs,
	sampleIntervalMs = DEFAULT_CURSOR_PREVIEW_INTERVAL_MS,
): CursorPreviewFile {
	const telemetry = buildCursorTelemetrySnapshot(data, offsetMs);
	const intervalMs = normalizeCursorPreviewInterval(sampleIntervalMs);
	return {
		schemaVersion: CURSOR_PREVIEW_SCHEMA_VERSION,
		source: {
			path: getCursorPreviewSourcePath(sourcePath),
			size: sourceStat.size,
			mtimeMs: sourceStat.mtimeMs,
		},
		version: telemetry.version,
		provider: telemetry.provider,
		samples: downsampleCursorSamples(telemetry.samples, intervalMs),
		originalSampleCount: telemetry.samples.length,
		sampleIntervalMs: intervalMs,
	};
}

function queueCursorTelemetryWrite(data: CursorRecordingData, force = false) {
	if (!cursorTelemetryLivePath) {
		return cursorTelemetryWriteChain;
	}

	const now = Date.now();
	if (!force && now - cursorTelemetryLastFlushMs < CURSOR_TELEMETRY_FLUSH_INTERVAL_MS) {
		return cursorTelemetryWriteChain;
	}

	cursorTelemetryLastFlushMs = now;
	const targetPath = cursorTelemetryLivePath;
	const content = JSON.stringify(buildCursorTelemetrySnapshot(data), null, 2);
	cursorTelemetryWriteChain = cursorTelemetryWriteChain
		.catch(() => undefined)
		.then(async () => {
			await fs.writeFile(targetPath, content, "utf-8");
			if (cursorPreviewLivePath) {
				const stat = await fs.stat(targetPath);
				const preview = buildCursorPreviewSnapshot(data, targetPath, stat);
				await fs.writeFile(cursorPreviewLivePath, JSON.stringify(preview), "utf-8");
			}
		})
		.catch((error) => {
			console.error("Failed to write live cursor telemetry:", error);
		});
	return cursorTelemetryWriteChain;
}

async function beginLiveCursorTelemetry(telemetryPath: string) {
	cursorTelemetryLivePath = telemetryPath;
	cursorPreviewLivePath = getCursorPreviewPathForTelemetryPath(telemetryPath);
	cursorTelemetryLiveOffsetMs = 0;
	cursorTelemetryLastFlushMs = 0;
	await queueCursorTelemetryWrite(
		{ version: CURSOR_TELEMETRY_VERSION, provider: "none", samples: [], assets: [] },
		true,
	);
}

async function endLiveCursorTelemetry(finalData?: CursorRecordingData | null) {
	if (finalData) {
		await queueCursorTelemetryWrite(finalData, true);
	} else {
		await cursorTelemetryWriteChain.catch(() => undefined);
	}
	cursorTelemetryLivePath = null;
	cursorPreviewLivePath = null;
	cursorTelemetryLiveOffsetMs = 0;
	cursorTelemetryLastFlushMs = 0;
}

async function writePendingCursorTelemetry(videoPath: string) {
	const telemetryPath = getCursorTelemetryPathForVideo(videoPath);
	if (pendingCursorRecordingData && pendingCursorRecordingData.samples.length > 0) {
		await fs.writeFile(telemetryPath, JSON.stringify(pendingCursorRecordingData, null, 2), "utf-8");
		const stat = await fs.stat(telemetryPath);
		const preview = buildCursorPreviewSnapshot(pendingCursorRecordingData, telemetryPath, stat);
		await fs
			.writeFile(getCursorPreviewPathForVideo(videoPath), JSON.stringify(preview), "utf-8")
			.catch((error) =>
				console.warn("Failed to write final cursor preview:", {
					telemetryPath,
					error: String(error),
				}),
			);
	}
	await endLiveCursorTelemetry(null);
	pendingCursorRecordingData = null;
}

function shiftPendingCursorTelemetry(offsetMs: number) {
	if (!pendingCursorRecordingData || !Number.isFinite(offsetMs) || offsetMs <= 0) {
		return;
	}

	pendingCursorRecordingData = {
		...pendingCursorRecordingData,
		samples: pendingCursorRecordingData.samples
			.map((sample) => ({
				...sample,
				timeMs: Math.max(0, sample.timeMs - offsetMs),
			}))
			.sort((a, b) => a.timeMs - b.timeMs),
	};
}

function compactPendingCursorTelemetryPauseRanges(
	ranges: Array<{ startMs: number; endMs: number }>,
) {
	if (!pendingCursorRecordingData || ranges.length === 0) {
		return;
	}

	const normalizedRanges = ranges
		.map((range) => ({
			startMs: Math.max(0, Math.min(range.startMs, range.endMs)),
			endMs: Math.max(0, Math.max(range.startMs, range.endMs)),
		}))
		.filter((range) => Number.isFinite(range.startMs) && Number.isFinite(range.endMs))
		.filter((range) => range.endMs > range.startMs)
		.sort((a, b) => a.startMs - b.startMs);

	if (normalizedRanges.length === 0) {
		return;
	}

	pendingCursorRecordingData = {
		...pendingCursorRecordingData,
		samples: pendingCursorRecordingData.samples
			.map((sample) => {
				let pausedBeforeSampleMs = 0;
				for (const range of normalizedRanges) {
					if (sample.timeMs >= range.startMs && sample.timeMs <= range.endMs) {
						return null;
					}
					if (sample.timeMs > range.endMs) {
						pausedBeforeSampleMs += range.endMs - range.startMs;
					}
				}

				return {
					...sample,
					timeMs: Math.max(0, sample.timeMs - pausedBeforeSampleMs),
				};
			})
			.filter((sample): sample is CursorRecordingSample => Boolean(sample))
			.sort((a, b) => a.timeMs - b.timeMs),
	};
}

function completeNativeMacCursorPauseRange(endMs = Date.now()) {
	if (nativeMacPauseStartedAtMs === null || nativeMacCursorRecordingStartMs <= 0) {
		return;
	}

	nativeMacPauseRanges.push({
		startMs: Math.max(0, nativeMacPauseStartedAtMs - nativeMacCursorRecordingStartMs),
		endMs: Math.max(0, endMs - nativeMacCursorRecordingStartMs),
	});
	nativeMacPauseStartedAtMs = null;
}

function completeNativeWindowsCursorPauseRange(endMs = Date.now()) {
	if (nativeWindowsPauseStartedAtMs === null || nativeWindowsCursorRecordingStartMs <= 0) {
		return;
	}

	nativeWindowsPauseRanges.push({
		startMs: Math.max(0, nativeWindowsPauseStartedAtMs - nativeWindowsCursorRecordingStartMs),
		endMs: Math.max(0, endMs - nativeWindowsCursorRecordingStartMs),
	});
	nativeWindowsPauseStartedAtMs = null;
}

function waitForNativeWindowsCaptureStart(proc: ChildProcessWithoutNullStreams) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("Timed out waiting for native Windows capture to start"));
		}, 12000);

		const onOutput = (chunk: Buffer) => {
			nativeWindowsCaptureOutput += chunk.toString();
			if (nativeWindowsCaptureOutput.includes("Recording started")) {
				cleanup();
				resolve();
			}
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const onExit = (code: number | null) => {
			cleanup();
			reject(
				new Error(
					nativeWindowsCaptureOutput.trim() ||
						`Native Windows capture exited before recording started (code=${code ?? "unknown"})`,
				),
			);
		};
		const cleanup = () => {
			clearTimeout(timer);
			proc.stdout.off("data", onOutput);
			proc.stderr.off("data", onOutput);
			proc.off("error", onError);
			proc.off("exit", onExit);
		};

		proc.stdout.on("data", onOutput);
		proc.stderr.on("data", onOutput);
		proc.once("error", onError);
		proc.once("exit", onExit);
	});
}

function waitForNativeWindowsCaptureStop(proc: ChildProcessWithoutNullStreams) {
	return new Promise<string>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			if (!proc.killed) {
				proc.kill();
			}
			reject(
				new Error(
					`Timed out waiting for native Windows capture to stop. Output path: ${
						nativeWindowsCaptureTargetPath ?? "unknown"
					}. Output: ${nativeWindowsCaptureOutput.trim()}`,
				),
			);
		}, NATIVE_WINDOWS_CAPTURE_STOP_TIMEOUT_MS);
		const onOutput = (chunk: Buffer) => {
			nativeWindowsCaptureOutput += chunk.toString();
		};
		const onClose = (code: number | null) => {
			cleanup();
			const stoppedInfo = readNativeWindowsRecordingStoppedInfo(nativeWindowsCaptureOutput);
			if (stoppedInfo?.screenPath) {
				resolve(stoppedInfo.screenPath);
				return;
			}
			const match = nativeWindowsCaptureOutput.match(/Recording stopped\. Output path: (.+)/);
			if (match?.[1]) {
				resolve(match[1].trim());
				return;
			}
			if (code === 0 && nativeWindowsCaptureTargetPath) {
				resolve(nativeWindowsCaptureTargetPath);
				return;
			}
			reject(
				new Error(
					nativeWindowsCaptureOutput.trim() ||
						`Native Windows capture exited with code=${code ?? "unknown"}`,
				),
			);
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const cleanup = () => {
			clearTimeout(timer);
			proc.stdout.off("data", onOutput);
			proc.stderr.off("data", onOutput);
			proc.off("close", onClose);
			proc.off("error", onError);
		};

		proc.stdout.on("data", onOutput);
		proc.stderr.on("data", onOutput);
		proc.once("close", onClose);
		proc.once("error", onError);
	});
}

function readNativeWindowsWebcamFormat(output: string) {
	return readNativeWindowsWebcamFormatFromOutput(output);
}

function tryParseNativeHelperEvent(line: string) {
	try {
		const parsed = JSON.parse(line);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function normalizeRectangle(value: unknown): Rectangle | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const candidate = value as Partial<Rectangle>;
	const x = typeof candidate.x === "number" && Number.isFinite(candidate.x) ? candidate.x : null;
	const y = typeof candidate.y === "number" && Number.isFinite(candidate.y) ? candidate.y : null;
	const width =
		typeof candidate.width === "number" && Number.isFinite(candidate.width)
			? candidate.width
			: null;
	const height =
		typeof candidate.height === "number" && Number.isFinite(candidate.height)
			? candidate.height
			: null;
	if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
		return null;
	}

	return { x, y, width, height };
}

type NativeMacCaptureStartInfo = {
	timestampMs: number;
	captureBounds: Rectangle | null;
	width?: number;
	height?: number;
	fps?: number;
	bitrate?: number;
};

type NativeMacCaptureStopInfo = {
	screenPath: string;
	webcamPath?: string;
	webcamDurationMs?: number;
	webcamSamplesAppended?: number;
};

function normalizePositiveNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function inspectNativeMacCaptureOutput() {
	for (const line of nativeMacCaptureOutput.split(/\r?\n/)) {
		const event = tryParseNativeHelperEvent(line.trim());
		if (event) {
			if (event.event === "recording-diagnostics") {
				nativeMacCaptureDiagnostics = { ...(nativeMacCaptureDiagnostics ?? {}), ...event };
			}
			nativeMacCaptureEvents.emit("helper-event", event);
		}
	}
}

function getNativeMacDiagnosticsForPath(screenVideoPath: string) {
	if (nativeMacCaptureDiagnostics?.screenPath === screenVideoPath) {
		return nativeMacCaptureDiagnostics;
	}
	return null;
}

function attachNativeMacCaptureOutputDrain(proc: ChildProcessWithoutNullStreams) {
	let lineBuffer = "";
	const drain = (chunk: Buffer) => {
		const text = chunk.toString();
		nativeMacCaptureOutput += text;
		lineBuffer += text;
		const lines = lineBuffer.split(/\r?\n/);
		lineBuffer = lines.pop() ?? "";
		for (const line of lines) {
			const event = tryParseNativeHelperEvent(line.trim());
			if (event) {
				if (event.event === "recording-diagnostics") {
					nativeMacCaptureDiagnostics = { ...(nativeMacCaptureDiagnostics ?? {}), ...event };
				}
				if (event.event === "warning") {
					nativeMacCaptureDiagnostics = {
						...(nativeMacCaptureDiagnostics ?? {}),
						warnings: [
							...((nativeMacCaptureDiagnostics?.warnings as
								| Array<Record<string, unknown>>
								| undefined) ?? []),
							event,
						],
					};
				}
				nativeMacCaptureEvents.emit("helper-event", event);
			}
		}
	};
	const cleanup = () => {
		proc.stdout.off("data", drain);
		proc.stderr.off("data", drain);
		proc.off("close", cleanup);
		proc.off("error", cleanup);
	};

	proc.stdout.on("data", drain);
	proc.stderr.on("data", drain);
	proc.once("close", cleanup);
	proc.once("error", cleanup);
}

function waitForNativeMacCaptureStart(proc: ChildProcessWithoutNullStreams) {
	return new Promise<NativeMacCaptureStartInfo>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("Timed out waiting for native macOS capture to start"));
		}, 10_000);

		const inspect = (event: Record<string, unknown>) => {
			if (event.event === "recording-started") {
				cleanup();
				resolve({
					timestampMs:
						typeof event.timestampMs === "number" && Number.isFinite(event.timestampMs)
							? event.timestampMs
							: Date.now(),
					captureBounds: normalizeRectangle(event.captureBounds),
					width: normalizePositiveNumber(event.width),
					height: normalizePositiveNumber(event.height),
					fps: normalizePositiveNumber(event.fps),
					bitrate: normalizePositiveNumber(event.bitrate),
				});
				return;
			}
			if (event.event === "error") {
				cleanup();
				reject(new Error(String(event.message ?? event.code ?? "Native macOS capture failed")));
			}
		};

		const onOutput = (event: Record<string, unknown>) => inspect(event);
		const onClose = (code: number | null) => {
			cleanup();
			reject(
				new Error(
					nativeMacCaptureOutput.trim() ||
						`Native macOS capture exited before recording started (code=${code ?? "unknown"})`,
				),
			);
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const cleanup = () => {
			clearTimeout(timer);
			nativeMacCaptureEvents.off("helper-event", onOutput);
			proc.off("close", onClose);
			proc.off("error", onError);
		};

		nativeMacCaptureEvents.on("helper-event", onOutput);
		proc.once("close", onClose);
		proc.once("error", onError);
		inspectNativeMacCaptureOutput();
	});
}

function waitForNativeMacCaptureStop(proc: ChildProcessWithoutNullStreams) {
	return new Promise<NativeMacCaptureStopInfo>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(
				new Error(
					`Timed out waiting for native macOS capture to stop. Output path: ${
						nativeMacCaptureTargetPath ?? "unknown"
					}. Output: ${nativeMacCaptureOutput.trim()}`,
				),
			);
		}, 30_000);

		const inspect = (event: Record<string, unknown>) => {
			if (event.event === "recording-stopped") {
				cleanup();
				resolve({
					screenPath: String(event.screenPath ?? nativeMacCaptureTargetPath ?? ""),
					...(typeof event.webcamPath === "string" && event.webcamPath.trim()
						? { webcamPath: event.webcamPath }
						: {}),
					...(typeof event.webcamDurationMs === "number" && Number.isFinite(event.webcamDurationMs)
						? { webcamDurationMs: Math.max(0, event.webcamDurationMs) }
						: {}),
					...(typeof event.webcamSamplesAppended === "number" &&
					Number.isFinite(event.webcamSamplesAppended)
						? { webcamSamplesAppended: Math.max(0, event.webcamSamplesAppended) }
						: {}),
				});
				return;
			}
			if (event.event === "error") {
				cleanup();
				reject(new Error(String(event.message ?? event.code ?? "Native macOS capture failed")));
			}
		};

		const onOutput = (event: Record<string, unknown>) => inspect(event);
		const onClose = (code: number | null) => {
			if (code === 0 && nativeMacCaptureTargetPath) {
				cleanup();
				resolve({ screenPath: nativeMacCaptureTargetPath });
				return;
			}
			cleanup();
			reject(
				new Error(
					nativeMacCaptureOutput.trim() ||
						`Native macOS capture exited with code=${code ?? "unknown"}`,
				),
			);
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const cleanup = () => {
			clearTimeout(timer);
			nativeMacCaptureEvents.off("helper-event", onOutput);
			proc.off("close", onClose);
			proc.off("error", onError);
		};

		nativeMacCaptureEvents.on("helper-event", onOutput);
		proc.once("close", onClose);
		proc.once("error", onError);
		inspectNativeMacCaptureOutput();
	});
}

function setCurrentRecordingSessionState(session: RecordingSession | null) {
	currentRecordingSession = session;
	currentVideoPath = session?.screenVideoPath ?? null;
}

function getSessionManifestPathForVideo(videoPath: string) {
	return getRecordingManifestPathForVideo(videoPath, RECORDING_SESSION_SUFFIX);
}

async function writeRecordingSessionManifest(
	session: RecordingSession,
	extras?: Record<string, unknown> | null,
) {
	const sessionManifestPath = getSessionManifestPathForVideo(session.screenVideoPath);
	const packageManifest = buildRecordingPackageManifest(
		session,
		extras?.status === "recording" ||
			extras?.status === "finalizing" ||
			extras?.status === "recoverable" ||
			extras?.status === "failed"
			? extras.status
			: "ready",
		extras,
	);
	await fs.writeFile(
		sessionManifestPath,
		JSON.stringify(packageManifest ?? (extras ? { ...session, ...extras } : session), null, 2),
		"utf-8",
	);
}

async function removeRecordingArtifacts(screenVideoPath: string, webcamVideoPath?: string | null) {
	const packageDir = getRecordingPackageDirForVideoPath(screenVideoPath);
	if (packageDir) {
		await fs.rm(packageDir, { recursive: true, force: true });
		return;
	}

	await Promise.all([
		fs.rm(screenVideoPath, { force: true }),
		webcamVideoPath ? fs.rm(webcamVideoPath, { force: true }) : Promise.resolve(),
		fs.rm(getCursorTelemetryPathForVideo(screenVideoPath), { force: true }),
		fs.rm(getSessionManifestPathForVideo(screenVideoPath), { force: true }),
	]);
}

async function loadRecordedSessionForVideoPath(
	videoPath: string,
): Promise<RecordingSession | null> {
	try {
		const packageDir = getRecordingPackageDirForVideoPath(videoPath);
		if (packageDir) {
			return loadRecordingPackageSession(packageDir);
		}

		const manifestPath = getSessionManifestPathForVideo(videoPath);
		if (!isPathAllowed(manifestPath)) {
			const parsedVideoPath = path.parse(videoPath);
			if (!isPathWithinDir(path.resolve(manifestPath), parsedVideoPath.dir)) {
				return null;
			}
		}

		const content = await fs.readFile(manifestPath, "utf-8");
		const session = normalizeRecordingSession(JSON.parse(content));
		if (!session) {
			return null;
		}

		const normalizedVideoPath = normalizePath(videoPath);
		const matchesScreen = normalizePath(session.screenVideoPath) === normalizedVideoPath;
		const matchesWebcam =
			typeof session.webcamVideoPath === "string" &&
			normalizePath(session.webcamVideoPath) === normalizedVideoPath;
		if (!matchesScreen && !matchesWebcam) {
			return null;
		}

		if (!isPathAllowed(session.screenVideoPath)) {
			const approvedScreen = await approveReadableVideoPath(session.screenVideoPath, [
				path.dirname(manifestPath),
				...getAllowedReadDirs(),
			]);
			if (!approvedScreen) {
				return null;
			}
			session.screenVideoPath = approvedScreen;
		}

		if (session.webcamVideoPath && !isPathAllowed(session.webcamVideoPath)) {
			const approvedWebcam = await approveReadableVideoPath(session.webcamVideoPath, [
				path.dirname(manifestPath),
				...getAllowedReadDirs(),
			]);
			if (!approvedWebcam) {
				session.webcamVideoPath = undefined;
			} else {
				session.webcamVideoPath = approvedWebcam;
			}
		}

		approveFilePath(session.screenVideoPath);
		if (session.webcamVideoPath) {
			approveFilePath(session.webcamVideoPath);
		}
		return session;
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code !== "ENOENT") {
			console.error("Failed to restore recording session manifest:", error);
		}
		return null;
	}
}

async function loadRecordingPackageSession(packageDir: string): Promise<RecordingSession | null> {
	const resolvedPackageDir = path.resolve(packageDir);
	if (!isRecordingPackagePath(resolvedPackageDir)) {
		return null;
	}

	const manifestPath = getSessionManifestPathForVideo(path.join(resolvedPackageDir, "screen.mp4"));
	if (!isPathAllowed(resolvedPackageDir)) {
		const withinAllowedDir = getAllowedReadDirs().some((dir) =>
			isPathWithinDir(resolvedPackageDir, dir),
		);
		if (!withinAllowedDir) {
			return null;
		}
	}

	let session: RecordingSession | null = null;
	try {
		const content = await fs.readFile(manifestPath, "utf-8");
		session = normalizeRecordingPackageManifest(JSON.parse(content), resolvedPackageDir);
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code !== "ENOENT") {
			console.error("Failed to read recording package manifest:", error);
		}
	}

	if (!session) {
		const screenVideoPath = path.join(resolvedPackageDir, "screen.mp4");
		try {
			const screenStats = await fs.stat(screenVideoPath);
			if (!screenStats.isFile()) {
				return null;
			}
		} catch {
			const failedManifest = buildRecoveredRecordingPackageManifest(Date.now(), "failed");
			await fs
				.writeFile(manifestPath, JSON.stringify(failedManifest, null, 2), "utf-8")
				.catch(() => undefined);
			return null;
		}

		let webcamVideoPath: string | undefined;
		for (const childName of [
			RECORDING_PACKAGE_WEBCAM_VIDEO,
			RECORDING_PACKAGE_LEGACY_WEBCAM_VIDEO,
		]) {
			const candidatePath = path.join(resolvedPackageDir, childName);
			const webcamStats = await fs.stat(candidatePath).catch(() => null);
			if (webcamStats?.isFile()) {
				webcamVideoPath = candidatePath;
				break;
			}
		}

		session = {
			screenVideoPath,
			...(webcamVideoPath ? { webcamVideoPath } : {}),
			createdAt: Date.now(),
		};
		const recoveredManifest = buildRecordingPackageManifest(session, "recoverable");
		if (recoveredManifest) {
			await fs
				.writeFile(manifestPath, JSON.stringify(recoveredManifest, null, 2), "utf-8")
				.catch(() => undefined);
		}
	}

	const approvedScreen = await approveReadableVideoPath(session.screenVideoPath, [
		resolvedPackageDir,
		...getAllowedReadDirs(),
	]);
	if (!approvedScreen) {
		return null;
	}

	let approvedWebcam: string | undefined;
	if (session.webcamVideoPath) {
		approvedWebcam =
			(await approveReadableVideoPath(session.webcamVideoPath, [
				resolvedPackageDir,
				...getAllowedReadDirs(),
			])) ?? undefined;
	}

	approveFilePath(resolvedPackageDir);
	approveFilePath(manifestPath);
	session.screenVideoPath = approvedScreen;
	session.webcamVideoPath = approvedWebcam;
	return session;
}

async function findLatestRecordingPackageSession(
	recordingDir: string,
): Promise<RecordingSession | null> {
	const entries = await fs.readdir(recordingDir, { withFileTypes: true });
	const packageDirs = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory() && isRecordingPackagePath(entry.name))
			.map(async (entry) => {
				const packageDir = path.join(recordingDir, entry.name);
				const stats = await fs.stat(packageDir).catch(() => null);
				return stats ? { packageDir, mtimeMs: stats.mtimeMs } : null;
			}),
	);
	const latest = packageDirs
		.filter((entry): entry is { packageDir: string; mtimeMs: number } => Boolean(entry))
		.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
	if (!latest) {
		return null;
	}

	return loadRecordingPackageSession(latest.packageDir);
}

export function registerIpcHandlers(
	createEditorWindow: () => void,
	createSourceSelectorWindow: () => BrowserWindow,
	createCountdownOverlayWindow: () => BrowserWindow,
	getMainWindow: () => BrowserWindow | null,
	getSourceSelectorWindow: () => BrowserWindow | null,
	getCountdownOverlayWindow?: () => BrowserWindow | null,
	onRecordingStateChange?: (recording: boolean, sourceName: string) => void,
	_switchToHud?: () => void,
) {
	void refreshActiveRecordingsDir().catch((error) => {
		console.warn("Failed to preload recording directory setting:", error);
	});

	async function requestScreenAccess() {
		if (process.platform !== "darwin") {
			return { success: true, granted: true, status: "granted" };
		}

		try {
			const status = systemPreferences.getMediaAccessStatus("screen");
			if (status === "granted") {
				return { success: true, granted: true, status };
			}

			const probeResult = await probeDesktopCaptureAccess();
			if (probeResult.granted) {
				return { success: true, granted: true, status: `${status}:capturer-granted` };
			}

			// Screen recording has no askForMediaAccess equivalent, so trigger the
			// TCC prompt without opening LikelySnap's source selector above it.
			if (status === "not-determined") {
				const mainWin = getMainWindow();
				if (mainWin && !mainWin.isDestroyed()) {
					if (!mainWin.isVisible()) {
						mainWin.show();
					}
					mainWin.focus();
				}
				app.focus({ steal: true });
				void probeDesktopCaptureAccess();
				return { success: true, granted: false, status: "not-determined" };
			}

			return { success: true, granted: false, status };
		} catch (error) {
			console.error("Failed to request screen access:", error);
			return { success: false, granted: false, status: "unknown", error: String(error) };
		}
	}

	async function probeDesktopCaptureAccess(): Promise<{ granted: boolean; error?: string }> {
		try {
			const sources = await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: { width: 1, height: 1 },
			});
			return { granted: sources.length > 0 };
		} catch (error) {
			return { granted: false, error: String(error) };
		}
	}

	ipcMain.handle("get-sources", async (_, opts) => {
		const sources = await desktopCapturer.getSources(opts);
		lastEnumeratedSources = new Map(sources.map((source) => [source.id, source]));
		return sources.map((source) => ({
			id: source.id,
			name: source.name,
			display_id: source.display_id,
			thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
			appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
		}));
	});

	ipcMain.handle("select-source", async (_, source: SelectedSource) => {
		selectedSource = source;
		// Reuse the exact source object returned during enumeration to avoid
		// Windows window-source id mismatches across separate getSources() calls.
		selectedDesktopSource =
			typeof source.id === "string" ? (lastEnumeratedSources.get(source.id) ?? null) : null;

		if (!selectedDesktopSource && typeof source.id === "string") {
			try {
				const sources = await desktopCapturer.getSources({
					types: ["screen", "window"],
					thumbnailSize: { width: 0, height: 0 },
					fetchWindowIcons: true,
				});
				lastEnumeratedSources = new Map(sources.map((candidate) => [candidate.id, candidate]));
				selectedDesktopSource = lastEnumeratedSources.get(source.id) ?? null;
			} catch {
				selectedDesktopSource = null;
			}
		}
		const sourceSelectorWin = getSourceSelectorWindow();
		if (sourceSelectorWin) {
			sourceSelectorWin.close();
		}
		return selectedSource;
	});

	ipcMain.handle("get-selected-source", () => {
		return selectedSource;
	});

	ipcMain.handle("request-camera-access", async () => {
		if (process.platform !== "darwin") {
			return { success: true, granted: true, status: "granted" };
		}

		try {
			const status = systemPreferences.getMediaAccessStatus("camera");
			if (status === "granted") {
				return { success: true, granted: true, status };
			}

			if (status === "not-determined") {
				const granted = await systemPreferences.askForMediaAccess("camera");
				return {
					success: true,
					granted,
					status: granted ? "granted" : systemPreferences.getMediaAccessStatus("camera"),
				};
			}

			return { success: true, granted: false, status };
		} catch (error) {
			console.error("Failed to request camera access:", error);
			return {
				success: false,
				granted: false,
				status: "unknown",
				error: String(error),
			};
		}
	});

	ipcMain.handle("request-screen-access", async () => {
		return requestScreenAccess();
	});

	ipcMain.handle("request-native-mac-cursor-access", async () => {
		const access = await requestMacCursorAccessibilityAccess();
		if (access.status === "missing-helper") {
			return access;
		}

		// When the editable cursor can't get Accessibility trust, pop a native dialog
		// that deep-links to the Accessibility pane (mirrors the Screen Recording flow).
		if (process.platform === "darwin" && !access.granted) {
			const mainWin = getMainWindow();
			const detail =
				"Allow LikelySnap under System Settings → Privacy & Security → Accessibility, then press record again to start the countdown.";
			const messageOptions = {
				type: "warning",
				buttons: ["Open Accessibility Settings", "Cancel"],
				defaultId: 0,
				cancelId: 1,
				message: "Accessibility access is required for the editable cursor",
				detail,
			} satisfies Electron.MessageBoxOptions;
			const result =
				mainWin && !mainWin.isDestroyed()
					? await dialog.showMessageBox(mainWin, messageOptions)
					: await dialog.showMessageBox(messageOptions);
			if (result.response === 0) {
				await shell.openExternal(
					"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
				);
			}
		}

		return access;
	});

	ipcMain.handle("open-source-selector", async () => {
		const access = await requestScreenAccess();
		if (!access.granted) {
			if (process.platform === "darwin" && access.status !== "not-determined") {
				const mainWin = getMainWindow();
				const messageOptions = {
					type: "warning",
					buttons: ["Open System Settings", "Cancel"],
					defaultId: 0,
					cancelId: 1,
					message: "Screen Recording permission is required",
					detail:
						"Allow LikelySnap in macOS System Settings, then come back and choose a screen or window.",
				} satisfies Electron.MessageBoxOptions;
				const result =
					mainWin && !mainWin.isDestroyed()
						? await dialog.showMessageBox(mainWin, messageOptions)
						: await dialog.showMessageBox(messageOptions);
				if (result.response === 0) {
					await shell.openExternal(
						"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
					);
				}
			}
			return {
				opened: false,
				reason: "screen-access-required",
				access,
			};
		}

		const sourceSelectorWin = getSourceSelectorWindow();
		if (sourceSelectorWin) {
			sourceSelectorWin.focus();
			return { opened: true };
		}
		createSourceSelectorWindow();
		return { opened: true };
	});

	ipcMain.handle("switch-to-editor", () => {
		// createEditorWindow already closes the current mainWindow (the HUD) before
		// opening the editor. Closing it here too double-closes, leaving ghost
		// transparent windows and compounding the HUD shadow each cycle.
		createEditorWindow();
	});

	ipcMain.handle("switch-to-hud", () => {
		_switchToHud?.();
		return { success: true };
	});

	ipcMain.handle("start-new-recording", () => {
		_switchToHud?.();
		return { success: true };
	});

	ipcMain.handle("countdown-overlay-show", async (_, value: number, runId: number) => {
		const overlayWindow = getCountdownOverlayWindow?.() ?? createCountdownOverlayWindow();
		if (overlayWindow.isDestroyed()) {
			return;
		}

		// Wait for the first frame before showing, else Chromium flashes a black
		// rectangle because it hasn't rendered any pixels yet.
		if (overlayWindow.webContents.isLoading()) {
			await new Promise<void>((resolve) => {
				overlayWindow.once("ready-to-show", resolve);
			});
		}

		if (!overlayWindow.isVisible()) {
			overlayWindow.showInactive();
		}

		overlayWindow.webContents.send("countdown-overlay-value", value, runId);
	});

	ipcMain.handle("countdown-overlay-set-value", (_, value: number, runId: number) => {
		const overlayWindow = getCountdownOverlayWindow?.();
		if (!overlayWindow || overlayWindow.isDestroyed()) {
			return;
		}

		overlayWindow.webContents.send("countdown-overlay-value", value, runId);
	});

	ipcMain.handle("countdown-overlay-hide", (_, runId: number) => {
		const overlayWindow = getCountdownOverlayWindow?.();
		if (!overlayWindow || overlayWindow.isDestroyed()) {
			return;
		}

		overlayWindow.webContents.send("countdown-overlay-value", null, runId);
		overlayWindow.hide();
	});

	ipcMain.handle("is-native-windows-capture-available", async () => {
		if (!isWindowsGraphicsCaptureOsSupported()) {
			return { success: true, available: false, reason: "unsupported-os" };
		}

		const helperPath = await findNativeWindowsCaptureHelperPath();
		return helperPath
			? { success: true, available: true, helperPath }
			: { success: true, available: false, reason: "missing-helper" };
	});

	ipcMain.handle("is-native-mac-capture-available", async () => {
		if (process.platform !== "darwin") {
			return { success: true, available: false, reason: "unsupported-platform" };
		}

		const helperPath = await findNativeMacCaptureHelperPath();
		return helperPath
			? { success: true, available: true, helperPath }
			: { success: true, available: false, reason: "missing-helper" };
	});

	ipcMain.handle(
		"start-native-windows-recording",
		async (_, request: NativeWindowsRecordingRequest) => {
			try {
				if (!isWindowsGraphicsCaptureOsSupported()) {
					return {
						success: false,
						error: "Windows Graphics Capture requires Windows 10 build 19041 or newer.",
					};
				}
				if (nativeWindowsCaptureProcess) {
					return { success: false, error: "Native Windows capture is already running." };
				}

				const helperPath = await findNativeWindowsCaptureHelperPath();
				if (!helperPath) {
					return { success: false, error: "Native Windows capture helper is not available." };
				}

				if (!request?.source?.sourceId) {
					return {
						success: false,
						error: "Native Windows capture request is missing a source.",
					};
				}

				const recordingId =
					typeof request.recordingId === "number" && Number.isFinite(request.recordingId)
						? request.recordingId
						: Date.now();
				const recordingDir = await getWritableRecordingsDir();
				const packagePaths = getRecordingPackagePaths(recordingDir, recordingId);
				const outputPath = packagePaths.screenVideoPath;
				const webcamOutputPath = packagePaths.webcamVideoPath;
				const sourceDisplay =
					request.source.type === "display" && typeof request.source.displayId === "number"
						? (screen.getAllDisplays().find((display) => display.id === request.source.displayId) ??
							null)
						: getSelectedDisplay();
				const bounds = sourceDisplay?.bounds ?? getSelectedSourceBounds();
				const displayId =
					typeof request.source.displayId === "number" && Number.isFinite(request.source.displayId)
						? request.source.displayId
						: Number(selectedSource?.display_id);
				const webcamDirectShowClsid = request.webcam.enabled
					? await resolveDirectShowWebcamClsid(request.webcam.deviceName)
					: null;
				const cursorCaptureMode =
					normalizeCursorCaptureMode(request.cursor?.mode) ?? "editable-overlay";
				const config = {
					schemaVersion: 2,
					recordingId,
					outputPath,
					sourceType: request.source.type,
					sourceId: request.source.sourceId,
					displayId: Number.isFinite(displayId) ? displayId : 0,
					windowHandle: request.source.windowHandle ?? null,
					fps: request.video.fps,
					videoWidth: request.video.width,
					videoHeight: request.video.height,
					videoResolutionMode: request.video.resolutionMode ?? "source",
					videoBitrate: request.video.bitrate ?? 0,
					displayX: bounds.x,
					displayY: bounds.y,
					displayW: bounds.width,
					displayH: bounds.height,
					hasDisplayBounds: true,
					captureSystemAudio: request.audio.system.enabled,
					captureMic: request.audio.microphone.enabled,
					microphoneDeviceId: request.audio.microphone.deviceId ?? null,
					microphoneDeviceName: request.audio.microphone.deviceName ?? null,
					microphoneGain: request.audio.microphone.gain,
					webcamEnabled: request.webcam.enabled,
					webcamDeviceId: request.webcam.deviceId ?? null,
					webcamDeviceName: request.webcam.deviceName ?? null,
					webcamDirectShowClsid,
					webcamWidth: request.webcam.width,
					webcamHeight: request.webcam.height,
					webcamFps: request.webcam.fps,
					captureCursor: cursorCaptureMode === "system",
					cursorCaptureMode,
					outputs: {
						screenPath: outputPath,
						webcamPath: webcamOutputPath,
					},
					source: {
						type: request.source.type,
						sourceId: request.source.sourceId,
						displayId: Number.isFinite(displayId) ? displayId : null,
						windowHandle: request.source.windowHandle ?? null,
						bounds,
					},
					video: request.video,
					audio: request.audio,
					webcam: request.webcam,
					cursor: {
						mode: cursorCaptureMode,
					},
				};

				console.info("[native-wgc] starting Windows capture", {
					helperPath,
					source: request.source,
					audio: request.audio,
					webcam: request.webcam,
					cursor: { mode: cursorCaptureMode },
					bounds,
					sourceId: selectedSource?.id ?? null,
					usedDisplayMatch: Boolean(sourceDisplay),
					outputPath,
				});

				await ensureRecordingPackageDirectory(packagePaths.packageDir);
				await writeRecordingSessionManifest(
					{
						screenVideoPath: outputPath,
						...(request.webcam.enabled ? { webcamVideoPath: webcamOutputPath } : {}),
						createdAt: recordingId,
						cursorCaptureMode,
					},
					{ status: "recording" },
				);
				nativeWindowsCaptureOutput = "";
				nativeWindowsCaptureTargetPath = outputPath;
				nativeWindowsCaptureWebcamTargetPath = request.webcam.enabled ? webcamOutputPath : null;
				nativeWindowsCaptureRecordingId = recordingId;
				nativeWindowsCursorOffsetMs = 0;
				nativeWindowsCursorCaptureMode = cursorCaptureMode;
				nativeWindowsCursorRecordingStartMs = 0;
				nativeWindowsPauseStartedAtMs = null;
				nativeWindowsPauseRanges = [];
				nativeWindowsIsPaused = false;

				const cursorStartTimeMs = Date.now();
				if (cursorCaptureMode === "editable-overlay") {
					nativeWindowsCursorRecordingStartMs = cursorStartTimeMs;
					await startCursorRecording(cursorStartTimeMs, getCursorTelemetryPathForVideo(outputPath));
					console.info("[native-wgc] cursor sampler ready", {
						cursorStartTimeMs,
						warmupMs: Date.now() - cursorStartTimeMs,
					});
				} else {
					pendingCursorRecordingData = null;
				}

				const proc = spawn(helperPath, [JSON.stringify(config)], {
					cwd: packagePaths.packageDir,
					stdio: ["pipe", "pipe", "pipe"],
					windowsHide: true,
				});
				nativeWindowsCaptureProcess = proc;

				await waitForNativeWindowsCaptureStart(proc);
				const captureStartedAtMs = Date.now();
				nativeWindowsCursorOffsetMs =
					cursorCaptureMode === "editable-overlay"
						? Math.max(0, captureStartedAtMs - cursorStartTimeMs)
						: 0;
				cursorTelemetryLiveOffsetMs = nativeWindowsCursorOffsetMs;
				if (pendingCursorRecordingData) {
					await queueCursorTelemetryWrite(pendingCursorRecordingData, true);
				}
				const webcamFormat = readNativeWindowsWebcamFormat(nativeWindowsCaptureOutput);
				console.info("[native-wgc] capture started", {
					captureStartedAtMs,
					cursorOffsetMs: nativeWindowsCursorOffsetMs,
					webcamFormat,
				});

				const source = selectedSource || { name: "Screen" };
				if (onRecordingStateChange) {
					onRecordingStateChange(true, source.name);
				}

				return {
					success: true,
					recordingId,
					path: outputPath,
					helperPath,
				};
			} catch (error) {
				console.error("Failed to start native Windows recording:", error);
				const failedOutputPath = nativeWindowsCaptureTargetPath;
				nativeWindowsCaptureProcess?.kill();
				nativeWindowsCaptureProcess = null;
				nativeWindowsCaptureTargetPath = null;
				nativeWindowsCaptureWebcamTargetPath = null;
				nativeWindowsCaptureRecordingId = null;
				nativeWindowsCursorOffsetMs = 0;
				nativeWindowsCursorCaptureMode = "editable-overlay";
				nativeWindowsCursorRecordingStartMs = 0;
				nativeWindowsPauseStartedAtMs = null;
				nativeWindowsPauseRanges = [];
				nativeWindowsIsPaused = false;
				await stopCursorRecording();
				await endLiveCursorTelemetry(null);
				if (failedOutputPath) {
					await removeRecordingArtifacts(failedOutputPath);
				}
				return { success: false, error: String(error) };
			}
		},
	);

	ipcMain.handle("start-native-mac-recording", async (_, request: NativeMacRecordingRequest) => {
		try {
			if (process.platform !== "darwin") {
				return { success: false, error: "Native macOS capture requires macOS." };
			}
			if (nativeMacCaptureProcess) {
				return { success: false, error: "Native macOS capture is already running." };
			}

			const helperPath = await findNativeMacCaptureHelperPath();
			if (!helperPath) {
				return { success: false, error: "Native macOS capture helper is not available." };
			}

			if (!request?.source?.sourceId) {
				return { success: false, error: "Native macOS capture request is missing a source." };
			}

			const recordingId =
				typeof request.recordingId === "number" && Number.isFinite(request.recordingId)
					? request.recordingId
					: Date.now();
			const recordingDir = await getWritableRecordingsDir();
			const packagePaths = getRecordingPackagePaths(recordingDir, recordingId);
			const outputPath = packagePaths.screenVideoPath;
			const requestedCursorCaptureMode =
				normalizeCursorCaptureMode(request.cursor?.mode) ?? "editable-overlay";
			const cursorCaptureMode =
				requestedCursorCaptureMode === "editable-overlay" && !findMacCursorHelperPath()
					? "system"
					: requestedCursorCaptureMode;
			try {
				await desktopCapturer.getSources({
					types: ["screen"],
					thumbnailSize: { width: 1, height: 1 },
				});
			} catch {
				// The helper reports the final ScreenCaptureKit permission status.
			}
			if (request.audio?.microphone?.enabled) {
				const micStatus = systemPreferences.getMediaAccessStatus("microphone");
				if (micStatus !== "granted") {
					await systemPreferences.askForMediaAccess("microphone");
				}
			}
			const sourceDisplay =
				request.source.type === "display" && typeof request.source.displayId === "number"
					? (screen.getAllDisplays().find((display) => display.id === request.source.displayId) ??
						null)
					: getSelectedDisplay();
			const bounds = request.source.bounds ?? sourceDisplay?.bounds ?? getSelectedSourceBounds();
			const config: NativeMacRecordingRequest = {
				...request,
				schemaVersion: 1,
				recordingId,
				source: {
					...request.source,
					bounds,
				},
				video: {
					...request.video,
					hideSystemCursor: cursorCaptureMode === "editable-overlay",
				},
				webcam: {
					...request.webcam,
				},
				cursor: {
					mode: cursorCaptureMode,
				},
				outputs: {
					screenPath: outputPath,
					...(request.webcam.enabled ? { webcamPath: packagePaths.webcamVideoPath } : {}),
					manifestPath: packagePaths.manifestPath,
				},
			};

			console.info("[native-sck] starting macOS capture", {
				helperPath,
				source: config.source,
				audio: config.audio,
				webcam: config.webcam,
				cursor: config.cursor,
				outputPath,
			});

			await ensureRecordingPackageDirectory(packagePaths.packageDir);
			await writeRecordingSessionManifest(
				{
					screenVideoPath: outputPath,
					createdAt: recordingId,
					cursorCaptureMode,
				},
				{ status: "recording" },
			);
			nativeMacCaptureOutput = "";
			nativeMacCaptureTargetPath = outputPath;
			nativeMacCaptureWebcamTargetPath = request.webcam.enabled
				? packagePaths.webcamVideoPath
				: null;
			nativeMacCaptureDiagnostics = null;
			nativeMacCaptureRecordingId = recordingId;
			nativeMacCaptureBounds = null;
			nativeMacCursorOffsetMs = 0;
			nativeMacCursorCaptureMode = cursorCaptureMode;
			nativeMacCursorRecordingStartMs = 0;
			nativeMacPauseStartedAtMs = null;
			nativeMacPauseRanges = [];
			nativeMacIsPaused = false;

			pendingCursorRecordingData = null;

			const proc = spawn(helperPath, [JSON.stringify(config)], {
				cwd: packagePaths.packageDir,
				stdio: ["pipe", "pipe", "pipe"],
			});
			nativeMacCaptureProcess = proc;
			attachNativeMacCaptureOutputDrain(proc);

			const captureStart = await waitForNativeMacCaptureStart(proc);
			const captureStartedAtMs = captureStart.timestampMs;
			nativeMacCaptureBounds =
				request.source.type === "window" ? (captureStart.captureBounds ?? null) : (bounds ?? null);
			nativeMacCaptureDiagnostics = {
				...(nativeMacCaptureDiagnostics ?? {}),
				recordingStarted: {
					width: captureStart.width,
					height: captureStart.height,
					fps: captureStart.fps,
					bitrate: captureStart.bitrate,
					requestedWidth: request.video.width,
					requestedHeight: request.video.height,
					requestedFps: request.video.fps,
					requestedResolutionMode: request.video.resolutionMode ?? "source",
					requestedBitrate: request.video.bitrate ?? null,
				},
			};
			nativeMacCursorOffsetMs = 0;
			if (cursorCaptureMode === "editable-overlay") {
				nativeMacCursorRecordingStartMs = captureStartedAtMs;
				await startCursorRecording(
					captureStartedAtMs,
					getCursorTelemetryPathForVideo(outputPath),
					() => nativeMacCaptureBounds ?? getSelectedSourceBounds(),
				);
				cursorTelemetryLiveOffsetMs = 0;
			}

			const source = selectedSource || { name: "Screen" };
			if (onRecordingStateChange) {
				onRecordingStateChange(true, source.name);
			}

			return {
				success: true,
				recordingId,
				path: outputPath,
				helperPath,
				captureStartedAtMs,
				...(nativeMacCaptureBounds ? { captureBounds: nativeMacCaptureBounds } : {}),
			};
		} catch (error) {
			console.error("Failed to start native macOS recording:", error);
			const failedOutputPath = nativeMacCaptureTargetPath;
			nativeMacCaptureProcess?.kill();
			nativeMacCaptureProcess = null;
			nativeMacCaptureTargetPath = null;
			nativeMacCaptureWebcamTargetPath = null;
			nativeMacCaptureDiagnostics = null;
			nativeMacCaptureRecordingId = null;
			nativeMacCaptureBounds = null;
			nativeMacCursorOffsetMs = 0;
			nativeMacCursorCaptureMode = "editable-overlay";
			nativeMacCursorRecordingStartMs = 0;
			nativeMacPauseStartedAtMs = null;
			nativeMacPauseRanges = [];
			nativeMacIsPaused = false;
			await stopCursorRecording();
			await endLiveCursorTelemetry(null);
			if (failedOutputPath) {
				await removeRecordingArtifacts(failedOutputPath);
			}
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("pause-native-mac-recording", async () => {
		if (process.platform !== "darwin") {
			return { success: false, error: "Native macOS capture requires macOS." };
		}

		const proc = nativeMacCaptureProcess;
		if (!proc) {
			return { success: false, error: "Native macOS capture is not running." };
		}
		if (nativeMacIsPaused) {
			return { success: true };
		}
		if (!proc.stdin.writable) {
			return { success: false, error: "Native macOS capture command channel is closed." };
		}

		try {
			proc.stdin.write("pause\n");
			nativeMacIsPaused = true;
			nativeMacPauseStartedAtMs = Date.now();
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("resume-native-mac-recording", async () => {
		if (process.platform !== "darwin") {
			return { success: false, error: "Native macOS capture requires macOS." };
		}

		const proc = nativeMacCaptureProcess;
		if (!proc) {
			return { success: false, error: "Native macOS capture is not running." };
		}
		if (!nativeMacIsPaused) {
			return { success: true };
		}
		if (!proc.stdin.writable) {
			return { success: false, error: "Native macOS capture command channel is closed." };
		}

		try {
			proc.stdin.write("resume\n");
			completeNativeMacCursorPauseRange();
			nativeMacIsPaused = false;
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("pause-native-windows-recording", async () => {
		const proc = nativeWindowsCaptureProcess;
		if (!proc) {
			return { success: false, error: "Native Windows capture is not running." };
		}
		if (nativeWindowsIsPaused) {
			return { success: true };
		}
		if (!proc.stdin.writable) {
			return { success: false, error: "Native Windows capture command channel is closed." };
		}

		try {
			proc.stdin.write("pause\n");
			nativeWindowsIsPaused = true;
			nativeWindowsPauseStartedAtMs = Date.now();
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("resume-native-windows-recording", async () => {
		const proc = nativeWindowsCaptureProcess;
		if (!proc) {
			return { success: false, error: "Native Windows capture is not running." };
		}
		if (!nativeWindowsIsPaused) {
			return { success: true };
		}
		if (!proc.stdin.writable) {
			return { success: false, error: "Native Windows capture command channel is closed." };
		}

		try {
			proc.stdin.write("resume\n");
			completeNativeWindowsCursorPauseRange();
			nativeWindowsIsPaused = false;
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("stop-native-windows-recording", async (_, discard?: boolean) => {
		const proc = nativeWindowsCaptureProcess;
		const preferredPath = nativeWindowsCaptureTargetPath;
		const preferredWebcamPath = nativeWindowsCaptureWebcamTargetPath;
		const recordingId = nativeWindowsCaptureRecordingId ?? Date.now();
		const cursorCaptureMode = nativeWindowsCursorCaptureMode;

		if (!proc) {
			return { success: false, error: "Native Windows capture is not running." };
		}

		try {
			completeNativeWindowsCursorPauseRange();
			const stoppedPathPromise = waitForNativeWindowsCaptureStop(proc);
			proc.stdin.write("stop\n");
			const stoppedPath = await stoppedPathPromise;
			const screenVideoPath = stoppedPath || preferredPath;
			if (!screenVideoPath) {
				throw new Error("Native Windows capture did not return an output path.");
			}

			if (cursorCaptureMode === "editable-overlay") {
				await stopCursorRecording();
			} else {
				pendingCursorRecordingData = null;
			}
			if (discard) {
				pendingCursorRecordingData = null;
				await endLiveCursorTelemetry(null);
				await removeRecordingArtifacts(screenVideoPath, preferredWebcamPath);
				return { success: true, discarded: true };
			}

			if (cursorCaptureMode === "editable-overlay") {
				compactPendingCursorTelemetryPauseRanges(nativeWindowsPauseRanges);
				shiftPendingCursorTelemetry(nativeWindowsCursorOffsetMs);
				await writePendingCursorTelemetry(screenVideoPath);
			}
			const stoppedInfo = readNativeWindowsRecordingStoppedInfo(nativeWindowsCaptureOutput);
			const stoppedWebcamPath = stoppedInfo?.webcamPath ?? preferredWebcamPath;
			let webcamVideoPath: string | undefined;
			if (stoppedWebcamPath) {
				const webcamStats = await fs.stat(stoppedWebcamPath).catch(() => null);
				if (webcamStats?.isFile() && webcamStats.size > 0) {
					webcamVideoPath = stoppedWebcamPath;
				}
			}
			const webcamStartOffsetMs =
				webcamVideoPath && typeof stoppedInfo?.webcamStartOffsetMs === "number"
					? stoppedInfo.webcamStartOffsetMs
					: undefined;
			const session: RecordingSession = {
				screenVideoPath,
				...(webcamVideoPath ? { webcamVideoPath } : {}),
				...(webcamStartOffsetMs !== undefined ? { webcamStartOffsetMs } : {}),
				createdAt: recordingId,
				cursorCaptureMode,
			};
			setCurrentRecordingSessionState(session);
			currentProjectPath = null;

			await writeRecordingSessionManifest(session);

			return {
				success: true,
				path: screenVideoPath,
				session,
				message: "Native Windows recording session stored successfully",
			};
		} catch (error) {
			console.error("Failed to stop native Windows recording:", error);
			await stopCursorRecording();
			return { success: false, error: String(error) };
		} finally {
			nativeWindowsCaptureProcess = null;
			nativeWindowsCaptureTargetPath = null;
			nativeWindowsCaptureWebcamTargetPath = null;
			nativeWindowsCaptureRecordingId = null;
			nativeWindowsCursorOffsetMs = 0;
			nativeWindowsCursorCaptureMode = "editable-overlay";
			nativeWindowsCursorRecordingStartMs = 0;
			nativeWindowsPauseStartedAtMs = null;
			nativeWindowsPauseRanges = [];
			nativeWindowsIsPaused = false;
			const source = selectedSource || { name: "Screen" };
			if (onRecordingStateChange) {
				onRecordingStateChange(false, source.name);
			}
		}
	});

	ipcMain.handle("stop-native-mac-recording", async (_, discard?: boolean) => {
		if (process.platform !== "darwin") {
			return { success: false, error: "Native macOS capture requires macOS." };
		}

		const proc = nativeMacCaptureProcess;
		const preferredPath = nativeMacCaptureTargetPath;
		const preferredWebcamPath = nativeMacCaptureWebcamTargetPath;
		const recordingId = nativeMacCaptureRecordingId ?? Date.now();
		const cursorCaptureMode = nativeMacCursorCaptureMode;

		if (!proc) {
			return { success: false, error: "Native macOS capture is not running." };
		}

		try {
			completeNativeMacCursorPauseRange();
			const stoppedPathPromise = waitForNativeMacCaptureStop(proc);
			proc.stdin.write("stop\n");
			const stoppedInfo = await stoppedPathPromise;
			const screenVideoPath = stoppedInfo.screenPath || preferredPath;
			if (!screenVideoPath) {
				throw new Error("Native macOS capture did not return an output path.");
			}

			if (cursorCaptureMode === "editable-overlay") {
				await stopCursorRecording();
			} else {
				pendingCursorRecordingData = null;
			}
			if (discard) {
				pendingCursorRecordingData = null;
				await endLiveCursorTelemetry(null);
				await removeRecordingArtifacts(screenVideoPath, preferredWebcamPath);
				return { success: true, discarded: true };
			}

			if (cursorCaptureMode === "editable-overlay") {
				compactPendingCursorTelemetryPauseRanges(nativeMacPauseRanges);
				shiftPendingCursorTelemetry(nativeMacCursorOffsetMs);
				await writePendingCursorTelemetry(screenVideoPath);
			}

			let webcamVideoPath: string | undefined;
			if (stoppedInfo.webcamPath) {
				const webcamStats = await fs.stat(stoppedInfo.webcamPath).catch(() => null);
				if (webcamStats?.isFile() && webcamStats.size > 0) {
					webcamVideoPath = stoppedInfo.webcamPath;
				} else {
					nativeMacCaptureDiagnostics = {
						...(nativeMacCaptureDiagnostics ?? {}),
						webcamWarning: {
							code: "webcam-output-invalid",
							path: stoppedInfo.webcamPath,
							size: webcamStats?.size ?? 0,
						},
					};
				}
			}

			const session: RecordingSession = {
				screenVideoPath,
				...(webcamVideoPath ? { webcamVideoPath } : {}),
				createdAt: recordingId,
				cursorCaptureMode,
			};
			if (webcamVideoPath) {
				nativeMacCaptureDiagnostics = {
					...(nativeMacCaptureDiagnostics ?? {}),
					webcam: {
						path: webcamVideoPath,
						...(typeof stoppedInfo.webcamDurationMs === "number"
							? { durationMs: stoppedInfo.webcamDurationMs }
							: {}),
						...(typeof stoppedInfo.webcamSamplesAppended === "number"
							? { samplesAppended: stoppedInfo.webcamSamplesAppended }
							: {}),
					},
				};
			}
			const diagnostics = getNativeMacDiagnosticsForPath(screenVideoPath);
			setCurrentRecordingSessionState(session);
			currentProjectPath = null;

			await writeRecordingSessionManifest(session, diagnostics ? { diagnostics } : null);

			return {
				success: true,
				path: screenVideoPath,
				session,
				...(diagnostics ? { diagnostics } : {}),
				message: "Native macOS recording session stored successfully",
			};
		} catch (error) {
			console.error("Failed to stop native macOS recording:", error);
			await stopCursorRecording();
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		} finally {
			nativeMacCaptureProcess = null;
			nativeMacCaptureTargetPath = null;
			nativeMacCaptureWebcamTargetPath = null;
			nativeMacCaptureRecordingId = null;
			nativeMacCaptureBounds = null;
			nativeMacCursorOffsetMs = 0;
			nativeMacCursorCaptureMode = "editable-overlay";
			nativeMacCursorRecordingStartMs = 0;
			nativeMacPauseStartedAtMs = null;
			nativeMacPauseRanges = [];
			nativeMacIsPaused = false;
			const source = selectedSource || { name: "Screen" };
			if (onRecordingStateChange) {
				onRecordingStateChange(false, source.name);
			}
		}
	});

	ipcMain.handle(
		"attach-native-mac-webcam-recording",
		async (_, payload: AttachNativeMacWebcamRecordingInput) => {
			try {
				if (process.platform !== "darwin") {
					return { success: false, error: "Native macOS webcam attachment requires macOS." };
				}

				const screenVideoPath = normalizeVideoSourcePath(payload.screenVideoPath);
				if (!screenVideoPath || !isPathAllowed(screenVideoPath)) {
					return {
						success: false,
						error: "Native macOS webcam attachment requires a recording output path.",
					};
				}

				await fs.access(screenVideoPath, fsConstants.R_OK);

				if (!payload.webcam?.fileName) {
					return { success: false, error: "Native macOS webcam attachment is missing video data." };
				}

				const screenPackageDir = getRecordingPackageDirForVideoPath(screenVideoPath);
				const webcamVideoPath =
					recordingStreams.getPath(payload.webcam.fileName) ??
					resolveRecordingOutputPath(
						payload.webcam.fileName,
						screenPackageDir ? path.dirname(screenPackageDir) : path.dirname(screenVideoPath),
					);
				const webcamStreamed = await finalizeRecordingFile(
					recordingStreams,
					payload.webcam.fileName,
					webcamVideoPath,
					payload.webcam.videoData,
				);
				if (
					!webcamStreamed &&
					(!payload.webcam.videoData || payload.webcam.videoData.byteLength === 0)
				) {
					return {
						success: false,
						error: "Native macOS webcam attachment has no streamed file or buffered data.",
					};
				}
				if (webcamStreamed && isValidDurationMs(payload.webcamDurationMs)) {
					await patchWebmDurationOnDisk(webcamVideoPath, payload.webcamDurationMs);
				}

				const createdAt =
					typeof payload.recordingId === "number" && Number.isFinite(payload.recordingId)
						? payload.recordingId
						: Date.now();
				const cursorCaptureMode = normalizeCursorCaptureMode(payload.cursorCaptureMode);
				const webcamStartOffsetMs =
					typeof payload.webcamStartOffsetMs === "number" &&
					Number.isFinite(payload.webcamStartOffsetMs)
						? Math.max(0, payload.webcamStartOffsetMs)
						: undefined;
				const session: RecordingSession = {
					screenVideoPath,
					webcamVideoPath,
					createdAt,
					...(webcamStartOffsetMs !== undefined ? { webcamStartOffsetMs } : {}),
					...(cursorCaptureMode ? { cursorCaptureMode } : {}),
				};
				const diagnostics = getNativeMacDiagnosticsForPath(screenVideoPath);
				setCurrentRecordingSessionState(session);
				currentProjectPath = null;

				await writeRecordingSessionManifest(session, diagnostics ? { diagnostics } : null);

				return {
					success: true,
					path: screenVideoPath,
					session,
					...(diagnostics ? { diagnostics } : {}),
					message: "Native macOS webcam recording attached successfully",
				};
			} catch (error) {
				console.error("Failed to attach native macOS webcam recording:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// On-disk write streams for in-progress recordings, keyed by output file name.
	// Chunks append as they arrive so the renderer never buffers the full video (#616).
	const recordingStreams = new RecordingStreamRegistry();
	registerRecordingStreamHandlers(ipcMain, recordingStreams, async (fileName) => {
		const targetPath = resolveRecordingOutputPath(fileName, await getWritableRecordingsDir());
		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		return targetPath;
	});

	ipcMain.handle("store-recorded-session", async (_, payload: StoreRecordedSessionInput) => {
		try {
			return await storeRecordedSessionFiles(payload);
		} catch (error) {
			console.error("Failed to store recording session:", error);
			return {
				success: false,
				message: "Failed to store recording session",
				error: String(error),
			};
		}
	});

	async function storeRecordedSessionFiles(payload: StoreRecordedSessionInput) {
		const createdAt =
			typeof payload.createdAt === "number" && Number.isFinite(payload.createdAt)
				? payload.createdAt
				: Date.now();
		const cursorCaptureMode = normalizeCursorCaptureMode(payload.cursorCaptureMode);
		const recordingDir = await getWritableRecordingsDir();
		const screenVideoPath =
			recordingStreams.getPath(payload.screen.fileName) ??
			resolveRecordingOutputPath(payload.screen.fileName, recordingDir);
		const screenStreamed = await finalizeRecordingFile(
			recordingStreams,
			payload.screen.fileName,
			screenVideoPath,
			payload.screen.videoData,
		);

		let webcamVideoPath: string | undefined;
		let webcamStreamed = false;
		if (payload.webcam) {
			webcamVideoPath =
				recordingStreams.getPath(payload.webcam.fileName) ??
				resolveRecordingOutputPath(payload.webcam.fileName, recordingDir);
			webcamStreamed = await finalizeRecordingFile(
				recordingStreams,
				payload.webcam.fileName,
				webcamVideoPath,
				payload.webcam.videoData,
			);
		}

		// Streamed files lack the WebM Duration header (renderer no longer holds the
		// blob), so patch on disk for the editor's seek bar and timeline. Best-effort,
		// independent per file, so they run together.
		if (isValidDurationMs(payload.durationMs)) {
			const patches: Promise<unknown>[] = [];
			if (screenStreamed) {
				patches.push(patchWebmDurationOnDisk(screenVideoPath, payload.durationMs));
			}
			if (webcamStreamed && webcamVideoPath) {
				patches.push(patchWebmDurationOnDisk(webcamVideoPath, payload.durationMs));
			}
			await Promise.all(patches);
		}

		const session: RecordingSession = webcamVideoPath
			? {
					screenVideoPath,
					webcamVideoPath,
					createdAt,
					...(cursorCaptureMode ? { cursorCaptureMode } : {}),
				}
			: { screenVideoPath, createdAt, ...(cursorCaptureMode ? { cursorCaptureMode } : {}) };
		setCurrentRecordingSessionState(session);
		currentProjectPath = null;

		await writePendingCursorTelemetry(screenVideoPath);

		await writeRecordingSessionManifest(session);

		return {
			success: true,
			path: screenVideoPath,
			session,
			message: "Recording session stored successfully",
		};
	}

	ipcMain.handle("store-recorded-video", async (_, videoData: ArrayBuffer, fileName: string) => {
		try {
			return await storeRecordedSessionFiles({
				screen: { videoData, fileName },
				createdAt: Date.now(),
			});
		} catch (error) {
			console.error("Failed to store recorded video:", error);
			return {
				success: false,
				message: "Failed to store recorded video",
				error: String(error),
			};
		}
	});

	ipcMain.handle("get-recorded-video-path", async () => {
		try {
			if (currentRecordingSession?.screenVideoPath) {
				return { success: true, path: currentRecordingSession.screenVideoPath };
			}

			const recordingDir = await refreshActiveRecordingsDir();
			const latestPackageSession = await findLatestRecordingPackageSession(recordingDir);
			if (latestPackageSession) {
				setCurrentRecordingSessionState(latestPackageSession);
				currentProjectPath = null;
				return { success: true, path: latestPackageSession.screenVideoPath };
			}

			const files = await fs.readdir(recordingDir);
			const videoFiles = files.filter((file) => {
				const lower = file.toLowerCase();
				return (
					(lower.endsWith(".webm") || lower.endsWith(".mp4")) &&
					!lower.endsWith("-webcam.webm") &&
					!lower.endsWith("-webcam.mp4")
				);
			});

			if (videoFiles.length === 0) {
				return { success: false, message: "No recorded video found" };
			}

			const latestVideo = videoFiles.sort().reverse()[0];
			const videoPath = path.join(recordingDir, latestVideo);

			return { success: true, path: videoPath };
		} catch (error) {
			console.error("Failed to get video path:", error);
			return { success: false, message: "Failed to get video path", error: String(error) };
		}
	});

	ipcMain.handle("get-recording-directory", async () => {
		return getRecordingDirectoryInfo();
	});

	ipcMain.handle("pick-recording-directory", async () => {
		try {
			const current = await getRecordingDirectoryInfo();
			const result = await pickDirectory(
				current.path,
				mainT("dialogs", "fileDialogs.selectFolder") || "Choose Recording Folder",
				getMainWindow(),
			);

			if (result.canceled) {
				return { success: false, canceled: true, path: current.path };
			}

			const settings = await saveAppSettings({ recordingDirectory: result.path });
			return { success: true, path: settings.recordingDirectory, isDefault: false, writable: true };
		} catch (error) {
			return {
				success: false,
				writable: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	ipcMain.handle("get-app-settings", async () => {
		try {
			const settings = await loadAppSettings();
			approveFilePath(settings.recordingDirectory);
			approveFilePath(settings.projectDirectory);
			approveFilePath(settings.cacheDirectory);
			return { success: true, settings };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("save-app-settings", async (_, partial: Partial<AppSettings>) => {
		try {
			const settings = await saveAppSettings(partial);
			return { success: true, settings };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("pick-app-settings-directory", async (_, kind: string) => {
		try {
			const settings = await loadAppSettings();
			const current =
				kind === "project"
					? settings.projectDirectory
					: kind === "cache"
						? settings.cacheDirectory
						: settings.recordingDirectory;
			const title =
				kind === "project"
					? "Choose Project Folder"
					: kind === "cache"
						? "Choose Cache Folder"
						: "Choose Recording Folder";
			const result = await pickDirectory(current, title, getMainWindow());
			if (result.canceled) {
				return { success: false, canceled: true, path: current };
			}
			const partial: Partial<AppSettings> =
				kind === "project"
					? { projectDirectory: result.path }
					: kind === "cache"
						? { cacheDirectory: result.path }
						: { recordingDirectory: result.path };
			const nextSettings = await saveAppSettings(partial);
			return { success: true, path: result.path, settings: nextSettings };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("get-cache-info", async () => {
		try {
			const cacheDirectory = await getCacheRootDir();
			await fs.mkdir(cacheDirectory, { recursive: true });
			const sizeBytes = await directorySizeBytes(cacheDirectory);
			return { success: true, path: cacheDirectory, sizeBytes };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle("clear-cache", async () => {
		try {
			const cacheDirectory = await getCacheRootDir();
			await fs.mkdir(cacheDirectory, { recursive: true });
			await clearDirectoryContents(cacheDirectory);
			return { success: true, path: cacheDirectory, sizeBytes: 0 };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(
		"set-recording-state",
		async (_, recording: boolean, recordingId?: number, cursorCaptureMode?: CursorCaptureMode) => {
			const normalizedCursorCaptureMode =
				normalizeCursorCaptureMode(cursorCaptureMode) ?? "editable-overlay";
			if (recording && normalizedCursorCaptureMode === "editable-overlay") {
				const normalizedRecordingId =
					typeof recordingId === "number" && Number.isFinite(recordingId)
						? recordingId
						: Date.now();
				const packagePaths = getRecordingPackagePaths(
					await getWritableRecordingsDir(),
					normalizedRecordingId,
				);
				await ensureRecordingPackageDirectory(packagePaths.packageDir);
				await writeRecordingSessionManifest(
					{
						screenVideoPath: packagePaths.screenVideoPath,
						createdAt: normalizedRecordingId,
						cursorCaptureMode: normalizedCursorCaptureMode,
					},
					{ status: "recording" },
				);
				await startCursorRecording(normalizedRecordingId, packagePaths.cursorTelemetryPath);
			} else {
				await stopCursorRecording();
			}

			const source = selectedSource || { name: "Screen" };
			if (onRecordingStateChange) {
				onRecordingStateChange(recording, source.name);
			}
		},
	);

	ipcMain.handle("get-cursor-telemetry", async (_, videoPath?: string) => {
		const targetVideoPath = resolveApprovedVideoPath(
			videoPath ?? currentRecordingSession?.screenVideoPath,
		);
		if (!targetVideoPath) {
			return { success: true, samples: [] };
		}

		return readCursorTelemetryFile(targetVideoPath);
	});

	ipcMain.handle("open-external-url", async (_, url: string) => {
		try {
			await shell.openExternal(url);
			return { success: true };
		} catch (error) {
			console.error("Failed to open URL:", error);
			return { success: false, error: String(error) };
		}
	});

	// Return base path for assets so renderer can resolve file:// paths in production
	ipcMain.handle("get-asset-base-path", () => {
		return resolveAssetBasePath();
	});

	ipcMain.handle("pick-export-save-path", async (_, fileName: string, exportFolder?: string) => {
		try {
			const isGif = fileName.toLowerCase().endsWith(".gif");
			const filters = isGif
				? [{ name: mainT("dialogs", "fileDialogs.gifImage"), extensions: ["gif"] }]
				: [{ name: mainT("dialogs", "fileDialogs.mp4Video"), extensions: ["mp4"] }];

			// Prefer the user's last export folder if it still exists, else ~/Downloads.
			// Validate here because the renderer can't stat the filesystem.
			let defaultDir = app.getPath("downloads");
			if (exportFolder) {
				try {
					const stats = await fs.stat(exportFolder);
					if (stats.isDirectory()) {
						defaultDir = exportFolder;
					}
				} catch (err) {
					console.warn(
						`Could not access remembered export folder "${exportFolder}", falling back to Downloads:`,
						err,
					);
				}
			}
			const dialogOptions = buildDialogOptions(
				{
					title: isGif
						? mainT("dialogs", "fileDialogs.saveGif")
						: mainT("dialogs", "fileDialogs.saveVideo"),
					defaultPath: path.join(defaultDir, fileName),
					filters,
					properties: ["createDirectory", "showOverwriteConfirmation"],
				},
				getMainWindow(),
			);
			const result = await dialog.showSaveDialog(dialogOptions);

			if (result.canceled || !result.filePath) {
				return { success: false, canceled: true, message: "Export canceled" };
			}

			return { success: true, path: path.normalize(result.filePath) };
		} catch (error) {
			console.error("Failed to show save dialog:", error);
			return {
				success: false,
				message: "Failed to show save dialog",
				error: String(error),
			};
		}
	});

	ipcMain.handle("write-export-to-path", async (_, videoData: ArrayBuffer, filePath: string) => {
		try {
			// Sanity-check the path: the renderer is trusted (contextIsolation on), but a
			// stale-state bug shouldn't be able to clobber arbitrary files.
			if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
				return { success: false, message: "Invalid path" };
			}
			const lower = filePath.toLowerCase();
			if (!lower.endsWith(".mp4") && !lower.endsWith(".gif")) {
				return { success: false, message: "Invalid file type" };
			}

			const normalizedPath = path.normalize(filePath);
			await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
			await fs.writeFile(normalizedPath, Buffer.from(videoData));

			return {
				success: true,
				path: normalizedPath,
				message: "Video exported successfully",
			};
		} catch (error) {
			console.error("Failed to write exported video:", error);
			return {
				success: false,
				message: "Failed to save exported video",
				error: String(error),
			};
		}
	});

	ipcMain.handle("ffmpeg-frame-export-start", async (_, request: FfmpegFrameExportRequest) => {
		try {
			if (typeof request.outputPath !== "string" || !path.isAbsolute(request.outputPath)) {
				return { success: false, message: "Invalid export path" };
			}
			if (!request.outputPath.toLowerCase().endsWith(".mp4")) {
				return { success: false, message: "Invalid export file type" };
			}
			if (
				request.inputAudioPath &&
				(typeof request.inputAudioPath !== "string" || !path.isAbsolute(request.inputAudioPath))
			) {
				return { success: false, message: "Invalid audio input path" };
			}

			const normalizedRequest: FfmpegFrameExportRequest = {
				...request,
				outputPath: path.normalize(request.outputPath),
				inputAudioPath: request.inputAudioPath ? path.normalize(request.inputAudioPath) : undefined,
			};
			return await ffmpegFrameExportService.startFrameExport(normalizedRequest);
		} catch (error) {
			console.error("Failed to start FFmpeg frame export:", error);
			return {
				success: false,
				message: "Failed to start FFmpeg export",
				error: String(error),
			};
		}
	});

	ipcMain.handle(
		"ffmpeg-frame-export-write",
		async (_, sessionId: string, chunk: ArrayBuffer | Uint8Array) => {
			try {
				if (typeof sessionId !== "string" || sessionId.length === 0) {
					return { success: false, error: "Invalid FFmpeg export session" };
				}
				return await ffmpegFrameExportService.writeFrameChunk(sessionId, chunk);
			} catch (error) {
				console.error("Failed to write FFmpeg frame chunk:", error);
				return { success: false, error: String(error) };
			}
		},
	);

	ipcMain.handle("ffmpeg-frame-export-finish", async (_, sessionId: string) => {
		try {
			if (typeof sessionId !== "string" || sessionId.length === 0) {
				return { success: false, error: "Invalid FFmpeg export session" };
			}
			return await ffmpegFrameExportService.finishFrameExport(sessionId);
		} catch (error) {
			console.error("Failed to finish FFmpeg frame export:", error);
			return {
				success: false,
				message: "Failed to finish FFmpeg export",
				error: String(error),
			};
		}
	});

	ipcMain.handle("ffmpeg-frame-export-cancel", async (_, sessionId: string) => {
		try {
			if (typeof sessionId !== "string" || sessionId.length === 0) {
				return { success: true };
			}
			return await ffmpegFrameExportService.cancelFrameExport(sessionId);
		} catch (error) {
			console.error("Failed to cancel FFmpeg frame export:", error);
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("open-video-file-picker", async () => {
		try {
			const recordingDir = await refreshActiveRecordingsDir();
			const dialogOptions = buildDialogOptions(
				{
					title: mainT("dialogs", "fileDialogs.selectVideo"),
					defaultPath: recordingDir,
					filters: [
						{
							name: "LikelySnap Recording",
							extensions: ["likelysnap"],
						},
						{
							name: mainT("dialogs", "fileDialogs.videoFiles"),
							extensions: ["webm", "mp4", "mov", "avi", "mkv", "m4v", "wmv", "flv", "ts"],
						},
						{ name: mainT("dialogs", "fileDialogs.allFiles"), extensions: ["*"] },
					],
					properties: ["openFile", "openDirectory"],
				},
				getMainWindow(),
			);
			const result = await dialog.showOpenDialog(dialogOptions);

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false, canceled: true };
			}

			const selectedPath = path.resolve(result.filePaths[0]);
			const selectedStats = await fs.stat(selectedPath).catch(() => null);
			if (selectedStats?.isDirectory() && isRecordingPackagePath(selectedPath)) {
				approveFilePath(selectedPath);
				const session = await loadRecordingPackageSession(selectedPath);
				if (!session) {
					return {
						success: false,
						message: "Selected recording package is not recoverable",
					};
				}
				setCurrentRecordingSessionState(session);
				currentProjectPath = null;
				return {
					success: true,
					path: session.screenVideoPath,
				};
			}

			const normalizedPath = await approveReadableVideoPath(selectedPath);
			if (!normalizedPath) {
				return {
					success: false,
					message: "Selected file is not a supported readable video file",
				};
			}

			currentProjectPath = null;
			return {
				success: true,
				path: normalizedPath,
			};
		} catch (error) {
			console.error("Failed to open file picker:", error);
			return {
				success: false,
				message: "Failed to open file picker",
				error: String(error),
			};
		}
	});

	ipcMain.handle("reveal-in-folder", async (_, filePath: string) => {
		try {
			// showItemInFolder returns nothing, it throws on error
			shell.showItemInFolder(filePath);
			return { success: true };
		} catch (error) {
			console.error(`Error revealing item in folder: ${filePath}`, error);
			// Fall back to opening the directory if revealing fails (file moved/deleted
			// after export, or a path showItemInFolder rejects).
			try {
				const openPathResult = await shell.openPath(path.dirname(filePath));
				if (openPathResult) {
					// openPath returned an error message
					return { success: false, error: openPathResult };
				}
				return { success: true, message: "Could not reveal item, but opened directory." };
			} catch (openError) {
				console.error(`Error opening directory: ${path.dirname(filePath)}`, openError);
				return { success: false, error: String(error) };
			}
		}
	});

	ipcMain.handle("read-binary-file", async (_, filePath: string) => {
		try {
			const normalizedPath = await approveReadableVideoPath(filePath);
			if (!normalizedPath) {
				return {
					success: false,
					message: "File path is not approved or is not a supported video file",
				};
			}

			const data = await fs.readFile(normalizedPath);
			return {
				success: true,
				data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
				path: normalizedPath,
			};
		} catch (error) {
			console.error("Failed to read binary file:", error);
			return {
				success: false,
				message: "Failed to read binary file",
				error: String(error),
			};
		}
	});

	ipcMain.handle("read-file-range", async (_, filePath: string, start: number, end: number) => {
		try {
			const normalizedPath = await approveReadableVideoPath(filePath);
			if (!normalizedPath) {
				return {
					success: false,
					message: "File path is not approved or is not a supported video file",
				};
			}

			if (
				typeof start !== "number" ||
				typeof end !== "number" ||
				!Number.isFinite(start) ||
				!Number.isFinite(end) ||
				start < 0 ||
				end < start
			) {
				return {
					success: false,
					message: "Invalid file range",
				};
			}

			const handle = await fs.open(normalizedPath, "r");
			try {
				const length = Math.max(0, Math.floor(end - start));
				const buffer = Buffer.alloc(length);
				const { bytesRead } = await handle.read(buffer, 0, length, Math.floor(start));
				const data = buffer.subarray(0, bytesRead);
				return {
					success: true,
					data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
					path: normalizedPath,
				};
			} finally {
				await handle.close();
			}
		} catch (error) {
			console.error("Failed to read file range:", error);
			return {
				success: false,
				message: "Failed to read file range",
				error: String(error),
			};
		}
	});

	ipcMain.handle("stat-file", async (_, filePath: string) => {
		try {
			const normalizedPath = await approveReadableVideoPath(filePath);
			if (!normalizedPath) {
				return {
					success: false,
					error: "File path is not approved or is not a supported video file",
				};
			}

			const stats = await fs.stat(normalizedPath);
			return {
				success: true,
				path: normalizedPath,
				size: stats.size,
				isFile: stats.isFile(),
			};
		} catch (error) {
			console.error("Failed to stat file:", error);
			return {
				success: false,
				error: String(error),
			};
		}
	});

	ipcMain.handle("prepare-preview-audio-track", async (_, filePath: string) => {
		try {
			return await prepareSupplementalPreviewAudioTrack(filePath);
		} catch (error) {
			console.error("Failed to prepare preview audio track:", error);
			return {
				success: false,
				message: "Failed to prepare preview audio track",
				error: String(error),
			};
		}
	});

	ipcMain.handle("read-waveform-peaks-cache", async (_, filePath: string) => {
		try {
			return await readWaveformPeaksCache(filePath);
		} catch (error) {
			console.error("Failed to read waveform peaks cache:", error);
			return {
				success: false,
				message: "Failed to read waveform peaks cache",
				error: String(error),
			};
		}
	});

	ipcMain.handle("write-waveform-peaks-cache", async (_, filePath: string, payload: unknown) => {
		try {
			return await writeWaveformPeaksCache(
				filePath,
				payload as { durationSec: number; peaksPerSecond: number; peaks: number[] },
			);
		} catch (error) {
			console.error("Failed to write waveform peaks cache:", error);
			return {
				success: false,
				message: "Failed to write waveform peaks cache",
				error: String(error),
			};
		}
	});

	ipcMain.handle(
		"save-project-file",
		async (_, projectData: unknown, suggestedName?: string, existingProjectPath?: string) => {
			return saveProjectFile(projectData, suggestedName, existingProjectPath);
		},
	);

	async function saveProjectFile(
		projectData: unknown,
		suggestedName?: string,
		existingProjectPath?: string,
	): Promise<ProjectFileResult> {
		try {
			const trustedExistingProjectPath = isTrustedProjectPath(existingProjectPath)
				? existingProjectPath
				: null;

			if (trustedExistingProjectPath) {
				await fs.writeFile(
					trustedExistingProjectPath,
					JSON.stringify(projectData, null, 2),
					"utf-8",
				);
				currentProjectPath = trustedExistingProjectPath;
				return {
					success: true,
					path: trustedExistingProjectPath,
					message: "Project saved successfully",
				};
			}

			const safeName = (suggestedName || `project-${Date.now()}`).replace(/[^a-zA-Z0-9-_]/g, "_");
			const defaultName = safeName.endsWith(`.${PROJECT_FILE_EXTENSION}`)
				? safeName
				: `${safeName}.${PROJECT_FILE_EXTENSION}`;
			let projectDir = await getProjectRootDir();
			try {
				await ensureWritableDirectory(projectDir);
			} catch (error) {
				console.warn(
					`Could not access configured project folder "${projectDir}", falling back to recording directory:`,
					error,
				);
				projectDir = await refreshActiveRecordingsDir();
			}

			const dialogOptions = buildDialogOptions(
				{
					title: mainT("dialogs", "fileDialogs.saveProject"),
					defaultPath: path.join(projectDir, defaultName),
					filters: [
						{
							name: mainT("dialogs", "fileDialogs.likelysnapProject"),
							extensions: [PROJECT_FILE_EXTENSION],
						},
						{ name: "JSON", extensions: ["json"] },
					],
					properties: ["createDirectory", "showOverwriteConfirmation"],
				},
				getMainWindow(),
			);
			const result = await dialog.showSaveDialog(dialogOptions);

			if (result.canceled || !result.filePath) {
				return {
					success: false,
					canceled: true,
					message: "Save project canceled",
				};
			}

			await fs.writeFile(result.filePath, JSON.stringify(projectData, null, 2), "utf-8");
			currentProjectPath = result.filePath;

			return {
				success: true,
				path: result.filePath,
				message: "Project saved successfully",
			};
		} catch (error) {
			console.error("Failed to save project file:", error);
			return {
				success: false,
				message: "Failed to save project file",
				error: String(error),
			};
		}
	}

	ipcMain.handle("load-project-file", async (_, projectFolder?: string) => {
		return loadProjectFile(projectFolder);
	});

	async function loadProjectFile(projectFolder?: string): Promise<ProjectFileResult> {
		try {
			// Prefer the configured project folder, then the user's last opened-project
			// folder if it still exists, else the active recording directory.
			let defaultDir = await getProjectRootDir();
			try {
				const stats = await fs.stat(defaultDir);
				if (!stats.isDirectory()) {
					defaultDir = await refreshActiveRecordingsDir();
				}
			} catch (err) {
				console.warn(
					`Could not access configured project folder "${defaultDir}", falling back to recording directory:`,
					err,
				);
				defaultDir = await refreshActiveRecordingsDir();
			}
			if (projectFolder) {
				try {
					const stats = await fs.stat(projectFolder);
					if (stats.isDirectory()) {
						defaultDir = projectFolder;
					}
				} catch (err) {
					// Stat can fail if the folder was moved/deleted (expected) or on a
					// permission error (worth surfacing). We fall back either way, but log it.
					console.warn(
						`Could not access remembered project folder "${projectFolder}", falling back to recording directory:`,
						err,
					);
				}
			}
			const dialogOptions = buildDialogOptions(
				{
					title: mainT("dialogs", "fileDialogs.openProject"),
					defaultPath: defaultDir,
					filters: [
						{
							name: mainT("dialogs", "fileDialogs.likelysnapProject"),
							extensions: [PROJECT_FILE_EXTENSION],
						},
						{ name: "JSON", extensions: ["json"] },
						{ name: mainT("dialogs", "fileDialogs.allFiles"), extensions: ["*"] },
					],
					properties: ["openFile", "openDirectory"],
				},
				getMainWindow(),
			);
			const result = await dialog.showOpenDialog(dialogOptions);

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false, canceled: true, message: "Open project canceled" };
			}

			const filePath = path.resolve(result.filePaths[0]);
			if (isRecordingPackagePath(filePath)) {
				const stats = await fs.stat(filePath).catch(() => null);
				if (stats?.isDirectory()) {
					approveFilePath(filePath);
					const session = await loadRecordingPackageSession(filePath);
					if (!session) {
						return { success: false, message: "Recording package is not recoverable" };
					}
					setCurrentRecordingSessionState(session);
					currentProjectPath = null;
					return { success: true, path: filePath };
				}
			}
			const content = await fs.readFile(filePath, "utf-8");
			const project = JSON.parse(content);
			currentProjectPath = filePath;
			setCurrentRecordingSessionState(await getApprovedProjectSession(project, filePath));

			return {
				success: true,
				path: filePath,
				project,
			};
		} catch (error) {
			console.error("Failed to load project file:", error);
			return {
				success: false,
				message: "Failed to load project file",
				error: String(error),
			};
		}
	}

	ipcMain.handle("load-project-file-from-path", async (_event, filePath: string) => {
		return loadProjectFileFromPath(filePath);
	});

	async function loadProjectFileFromPath(filePath: string): Promise<ProjectFileResult> {
		try {
			if (!filePath || typeof filePath !== "string") {
				return { success: false, message: "Invalid file path" };
			}
			const resolvedPath = path.resolve(filePath);
			if (isRecordingPackagePath(resolvedPath)) {
				const stats = await fs.stat(resolvedPath).catch(() => null);
				if (stats?.isDirectory()) {
					approveFilePath(resolvedPath);
					const session = await loadRecordingPackageSession(resolvedPath);
					if (!session) {
						return { success: false, message: "Recording package is not recoverable" };
					}
					setCurrentRecordingSessionState(session);
					currentProjectPath = null;
					return { success: true, path: resolvedPath };
				}
			}
			// Validate extension and readability
			const extension = path.extname(resolvedPath).toLowerCase();
			if (extension !== `.${PROJECT_FILE_EXTENSION}`) {
				return { success: false, message: "Not an LikelySnap project file" };
			}
			const stats = await fs.stat(resolvedPath).catch(() => null);
			if (!stats?.isFile()) {
				return { success: false, message: "File not found" };
			}
			const content = await fs.readFile(resolvedPath, "utf-8");
			const project = JSON.parse(content);
			currentProjectPath = resolvedPath;

			// Approve session paths but tolerate failures (e.g. video moved outside trusted
			// dirs) so the project still loads and the renderer can show "video not found".
			let session: import("../../src/lib/recordingSession").RecordingSession | null = null;
			try {
				session = await getApprovedProjectSession(project, resolvedPath);
			} catch (sessionError) {
				console.warn(
					"[loadProjectFileFromPath] Could not approve session paths, proceeding without session:",
					sessionError,
				);
			}
			setCurrentRecordingSessionState(session);
			return { success: true, path: resolvedPath, project };
		} catch (error) {
			console.error("Failed to load project file from path:", error);
			return {
				success: false,
				message: "Failed to load project file",
				error: String(error),
			};
		}
	}

	ipcMain.handle("load-current-project-file", async () => {
		return loadCurrentProjectFile();
	});

	async function loadCurrentProjectFile(): Promise<ProjectFileResult> {
		try {
			if (!currentProjectPath) {
				return { success: false, message: "No active project" };
			}

			const content = await fs.readFile(currentProjectPath, "utf-8");
			const project = JSON.parse(content);
			setCurrentRecordingSessionState(await getApprovedProjectSession(project, currentProjectPath));
			return {
				success: true,
				path: currentProjectPath,
				project,
			};
		} catch (error) {
			console.error("Failed to load current project file:", error);
			return {
				success: false,
				message: "Failed to load current project file",
				error: String(error),
			};
		}
	}

	ipcMain.handle("set-current-video-path", async (_, path: string) => {
		return setCurrentVideoPath(path);
	});

	ipcMain.handle("set-current-recording-session", (_, session: RecordingSession | null) => {
		const normalizedSession = normalizeRecordingSession(session);
		setCurrentRecordingSessionState(normalizedSession);
		currentVideoPath = normalizedSession?.screenVideoPath ?? null;
		currentProjectPath = null;
		return { success: true, session: currentRecordingSession };
	});

	ipcMain.handle("get-current-recording-session", () => {
		return currentRecordingSession
			? { success: true, session: currentRecordingSession }
			: { success: false };
	});

	async function setCurrentVideoPath(path: string): Promise<ProjectPathResult> {
		const normalizedPath = normalizeVideoSourcePath(path);
		if (!normalizedPath) {
			return {
				success: false,
				message: "Video path has not been approved",
			};
		}

		if (isRecordingPackagePath(normalizedPath)) {
			const stats = await fs.stat(normalizedPath).catch(() => null);
			if (!stats?.isDirectory() || !isPathAllowed(normalizedPath)) {
				return {
					success: false,
					message: "Recording package has not been approved",
				};
			}

			const packageSession = await loadRecordingPackageSession(normalizedPath);
			if (!packageSession) {
				return {
					success: false,
					message: "Recording package is not recoverable",
				};
			}
			setCurrentRecordingSessionState(packageSession);
			currentProjectPath = null;
			return { success: true, path: packageSession.screenVideoPath };
		}

		if (!isPathAllowed(normalizedPath)) {
			return {
				success: false,
				message: "Video path has not been approved",
			};
		}

		const restoredSession = await loadRecordedSessionForVideoPath(normalizedPath);
		if (restoredSession) {
			setCurrentRecordingSessionState(restoredSession);
		} else {
			setCurrentRecordingSessionState({
				screenVideoPath: normalizedPath,
				createdAt: Date.now(),
			});
		}
		currentProjectPath = null;
		return { success: true, path: currentVideoPath ?? normalizedPath };
	}

	ipcMain.handle("get-current-video-path", () => {
		return getCurrentVideoPathResult();
	});

	function getCurrentVideoPathResult(): ProjectPathResult {
		return currentVideoPath ? { success: true, path: currentVideoPath } : { success: false };
	}

	ipcMain.handle("clear-current-video-path", () => {
		return clearCurrentVideoPath();
	});

	function clearCurrentVideoPath(): ProjectPathResult {
		currentVideoPath = null;
		currentProjectPath = null;
		setCurrentRecordingSessionState(null);
		return { success: true };
	}

	ipcMain.handle("get-platform", () => {
		return process.platform;
	});

	ipcMain.handle("get-shortcuts", async () => {
		try {
			const data = await fs.readFile(SHORTCUTS_FILE, "utf-8");
			return JSON.parse(data);
		} catch {
			return null;
		}
	});

	ipcMain.handle("save-shortcuts", async (_, shortcuts: unknown) => {
		try {
			await fs.writeFile(SHORTCUTS_FILE, JSON.stringify(shortcuts, null, 2), "utf-8");
			return { success: true };
		} catch (error) {
			console.error("Failed to save shortcuts:", error);
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle(
		"save-diagnostic",
		async (
			_,
			payload: { error: string; stack?: string; projectState: unknown; logs: string[] },
		) => {
			const { filePath, canceled } = await dialog.showSaveDialog({
				title: "Save Diagnostic File",
				defaultPath: `likelysnap-diagnostic-${Date.now()}.json`,
				filters: [{ name: "JSON", extensions: ["json"] }],
			});

			if (canceled || !filePath) return { success: false, canceled: true };

			const diagnostic = {
				timestamp: new Date().toISOString(),
				appVersion: app.getVersion(),
				platform: process.platform,
				arch: process.arch,
				osRelease: os.release(),
				osVersion: os.version(),
				totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
				nodeVersion: process.versions.node,
				electronVersion: process.versions.electron,
				chromeVersion: process.versions.chrome,
				error: payload.error,
				stack: payload.stack,
				projectState: payload.projectState,
				recentLogs: payload.logs,
			};

			try {
				await fs.writeFile(filePath, JSON.stringify(diagnostic, null, 2), "utf-8");
				return { success: true, path: filePath };
			} catch (error) {
				console.error("Failed to write diagnostic file:", error);
				return { success: false, error: String(error) };
			}
		},
	);

	registerNativeBridgeHandlers({
		getPlatform: () => process.platform,
		getCurrentProjectPath: () => currentProjectPath,
		getCurrentVideoPath: () => currentVideoPath,
		saveProjectFile,
		loadProjectFile,
		loadCurrentProjectFile,
		loadProjectFileFromPath,
		setCurrentVideoPath,
		getCurrentVideoPathResult,
		clearCurrentVideoPath,
		resolveAssetBasePath,
		resolveVideoPath: (videoPath?: string | null) =>
			normalizeVideoSourcePath(videoPath ?? currentVideoPath),
		loadCursorRecordingData: readCursorRecordingFile,
		loadCursorPreviewData: readCursorPreviewFile,
		loadCursorTelemetry: readCursorTelemetryFile,
	});
}
