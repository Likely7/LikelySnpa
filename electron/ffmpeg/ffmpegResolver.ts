import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { app } from "electron";

export type FfmpegHardwarePreference = "auto" | "prefer-hardware" | "compatibility-cpu";

export interface FfmpegBinaryResolution {
	executablePath: string;
	source: "bundled" | "env" | "system";
	version?: string;
}

const require = createRequire(import.meta.url);

export async function resolveFfmpegBinary(): Promise<FfmpegBinaryResolution | null> {
	const envPath = process.env["LIKELYSNAP_FFMPEG_PATH"] || process.env["FFMPEG_PATH"];
	const candidates: Array<{ source: FfmpegBinaryResolution["source"]; executablePath: string }> =
		[];

	if (envPath) {
		candidates.push({ source: "env", executablePath: envPath });
	}

	if (app.isPackaged) {
		candidates.push({ source: "bundled", executablePath: bundledFfmpegPath() });
	}

	const installerPath = resolveFfmpegInstallerPath();
	if (installerPath) {
		candidates.push({ source: "bundled", executablePath: installerPath });
	}

	candidates.push({ source: "system", executablePath: ffmpegBinaryName() });

	for (const candidate of candidates) {
		const resolved = await validateFfmpegExecutable(candidate.executablePath);
		if (resolved) {
			return { ...candidate, version: resolved };
		}
	}

	return null;
}

function bundledFfmpegPath(): string {
	const platformDir = `${process.platform}-${process.arch}`;
	return path.join(process.resourcesPath, "electron", "ffmpeg", platformDir, ffmpegBinaryName());
}

function resolveFfmpegInstallerPath(): string | null {
	try {
		const installer = require("@ffmpeg-installer/ffmpeg") as { path?: string };
		return installer.path || null;
	} catch (error) {
		console.warn("[FFmpeg] Could not resolve @ffmpeg-installer/ffmpeg:", error);
		return null;
	}
}

export function detectFfmpegHardwareAcceleration(
	platform = process.platform,
): "videotoolbox" | "nvenc" | "qsv" | "amf" | null {
	if (platform === "darwin") return "videotoolbox";
	if (platform === "win32") return "nvenc";
	return null;
}

function ffmpegBinaryName(): string {
	return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

async function validateFfmpegExecutable(executablePath: string): Promise<string | null> {
	try {
		await fs.access(executablePath);
		const result = spawnSync(executablePath, ["-version"], { encoding: "utf-8" });
		if (result.status !== 0) {
			return null;
		}
		const firstLine = result.stdout.split(/\r?\n/, 1)[0];
		return firstLine || null;
	} catch {
		return null;
	}
}
