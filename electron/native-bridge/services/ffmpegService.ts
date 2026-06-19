import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type {
	FfmpegFrameExportCancelResult,
	FfmpegFrameExportFinishResult,
	FfmpegFrameExportRequest,
	FfmpegFrameExportStartResult,
	FfmpegFrameExportWriteResult,
} from "../../../src/lib/exporter/ffmpegExportTypes";
import {
	detectFfmpegHardwareAcceleration,
	type FfmpegBinaryResolution,
	resolveFfmpegBinary,
} from "../../ffmpeg/ffmpegResolver";

type EncoderChoice = {
	encoder: string;
	hardwareAcceleration: string | null;
};

type ActiveExportSession = {
	id: string;
	request: FfmpegFrameExportRequest;
	tempPath: string;
	ffmpegPath: string;
	encoder: string;
	hardwareAcceleration: string | null;
	proc: ChildProcessWithoutNullStreams;
	logs: string[];
	exitPromise: Promise<number>;
	cancelled: boolean;
};

const FRAME_WRITE_DRAIN_TIMEOUT_MS = 30_000;
const CANCEL_EXIT_TIMEOUT_MS = 5_000;

export class FfmpegService {
	private sessions = new Map<string, ActiveExportSession>();
	private encoderCache: Set<string> | null = null;

	async probe(): Promise<{
		available: boolean;
		ffmpegPath?: string;
		version?: string;
		hardwareAcceleration?: string | null;
		encoders?: string[];
	}> {
		const binary = await resolveFfmpegBinary();
		if (!binary) {
			return { available: false };
		}

		return {
			available: true,
			ffmpegPath: binary.executablePath,
			version: binary.version,
			hardwareAcceleration: detectFfmpegHardwareAcceleration(),
			encoders: Array.from(await this.getEncoderSet(binary)).sort(),
		};
	}

	async startFrameExport(request: FfmpegFrameExportRequest): Promise<FfmpegFrameExportStartResult> {
		const binary = await resolveFfmpegBinary();
		if (!binary) {
			return { success: false, error: "FFmpeg binary not available" };
		}

		const tempPath = await this.createTempOutputPath(request.outputPath);
		const encoderChoice = await this.selectVideoEncoder(binary, request.hardwarePreference);
		const args = this.buildFrameExportArgs(request, tempPath, encoderChoice.encoder);
		const logs: string[] = [];
		const proc = spawn(binary.executablePath, args, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => reject(error);
			proc.once("error", onError);
			proc.once("spawn", () => {
				proc.removeListener("error", onError);
				resolve();
			});
		});

		proc.stdout.on("data", (chunk) => {
			logs.push(String(chunk));
		});
		proc.stderr.on("data", (chunk) => {
			logs.push(String(chunk));
		});

		const exitPromise = new Promise<number>((resolve) => {
			proc.once("exit", (code) => resolve(code ?? 1));
		});

		const sessionId = `ffmpeg-export-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		this.sessions.set(sessionId, {
			id: sessionId,
			request,
			tempPath,
			ffmpegPath: binary.executablePath,
			encoder: encoderChoice.encoder,
			hardwareAcceleration: encoderChoice.hardwareAcceleration,
			proc,
			logs,
			exitPromise,
			cancelled: false,
		});

		return {
			success: true,
			sessionId,
			tempPath,
			ffmpegPath: binary.executablePath,
			encoder: encoderChoice.encoder,
			hardwareAcceleration: encoderChoice.hardwareAcceleration,
			log: logs.slice(-20),
		};
	}

	async writeFrameChunk(
		sessionId: string,
		chunk: ArrayBuffer | Uint8Array,
	): Promise<FfmpegFrameExportWriteResult> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return { success: false, error: "Export cancelled" };
		}
		if (session.cancelled || session.proc.killed || session.proc.stdin.destroyed) {
			return { success: false, error: "Export cancelled", log: session.logs.slice(-20) };
		}

		const bytes =
			chunk instanceof Uint8Array
				? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
				: Buffer.from(chunk);

		let writeAccepted = false;
		try {
			writeAccepted = session.proc.stdin.write(bytes);
		} catch (error) {
			return {
				success: false,
				error: session.cancelled ? "Export cancelled" : String(error),
				log: session.logs.slice(-20),
			};
		}

		if (!writeAccepted) {
			const drained = await this.waitForFrameDrain(session);

			if (drained !== "drain") {
				if (drained === "timeout") {
					session.cancelled = true;
					session.proc.stdin.destroy();
					session.proc.kill("SIGTERM");
					this.sessions.delete(sessionId);
					await fs.rm(session.tempPath, { force: true }).catch(() => undefined);
				}
				return {
					success: false,
					error:
						drained === "timeout"
							? "FFmpeg did not accept video frames for 30 seconds"
							: session.cancelled
								? "Export cancelled"
								: "FFmpeg stopped while receiving video frames",
					log: session.logs.slice(-20),
				};
			}
		}

		return { success: true };
	}

	private waitForFrameDrain(
		session: ActiveExportSession,
	): Promise<"drain" | "error" | "exit" | "cancelled" | "timeout"> {
		return new Promise((resolve) => {
			let settled = false;
			let timeout: NodeJS.Timeout;

			const finish = (result: "drain" | "error" | "exit" | "cancelled" | "timeout") => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve(result);
			};

			const onDrain = () => {
				finish("drain");
			};

			const onError = () => {
				finish("error");
			};

			const onExit = () => {
				finish(session.cancelled ? "cancelled" : "exit");
			};

			const cleanup = () => {
				session.proc.stdin.off("drain", onDrain);
				session.proc.stdin.off("error", onError);
				session.proc.off("exit", onExit);
				clearTimeout(timeout);
			};

			timeout = setTimeout(() => {
				finish(session.cancelled ? "cancelled" : "timeout");
			}, FRAME_WRITE_DRAIN_TIMEOUT_MS);

			session.proc.stdin.once("drain", onDrain);
			session.proc.stdin.once("error", onError);
			session.proc.once("exit", onExit);
		});
	}

	async finishFrameExport(sessionId: string): Promise<FfmpegFrameExportFinishResult> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return { success: false, error: "Export cancelled" };
		}

		this.sessions.delete(sessionId);
		session.proc.stdin.end();

		const exitCode = await session.exitPromise;

		if (exitCode !== 0) {
			await fs.rm(session.tempPath, { force: true }).catch(() => undefined);
			return {
				success: false,
				ffmpegPath: session.ffmpegPath,
				tempPath: session.tempPath,
				encoder: session.encoder,
				hardwareAcceleration: session.hardwareAcceleration,
				log: session.logs.slice(-20),
				error: `FFmpeg exited with code ${exitCode}`,
			};
		}

		await fs.rm(session.request.outputPath, { force: true }).catch(() => undefined);
		await fs.rename(session.tempPath, session.request.outputPath);
		return {
			success: true,
			outputPath: session.request.outputPath,
			tempPath: session.tempPath,
			ffmpegPath: session.ffmpegPath,
			encoder: session.encoder,
			hardwareAcceleration: session.hardwareAcceleration,
			log: session.logs.slice(-20),
		};
	}

	async cancelFrameExport(sessionId: string): Promise<FfmpegFrameExportCancelResult> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return { success: true };
		}

		this.sessions.delete(sessionId);
		session.cancelled = true;
		session.proc.stdin.destroy();
		session.proc.kill("SIGTERM");
		await Promise.race([
			session.exitPromise.catch(() => undefined),
			new Promise<void>((resolve) => setTimeout(resolve, CANCEL_EXIT_TIMEOUT_MS)),
		]);
		await fs.rm(session.tempPath, { force: true }).catch(() => undefined);
		return { success: true };
	}

	private buildFrameExportArgs(
		request: FfmpegFrameExportRequest,
		outputPath: string,
		videoEncoder: string,
	): string[] {
		const args: string[] = [
			"-y",
			"-hide_banner",
			"-loglevel",
			"warning",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"-s:v",
			`${request.width}x${request.height}`,
			"-r",
			String(request.frameRate),
			"-i",
			"pipe:0",
		];

		if (request.hasAudio && request.inputAudioPath) {
			args.push("-i", request.inputAudioPath);
		}

		args.push("-map", "0:v:0");

		if (request.hasAudio && request.inputAudioPath) {
			const audioFilter = this.buildAudioFilterComplex(
				request.audioTimeline,
				request.sourceDurationSec,
			);
			if (audioFilter) {
				args.push("-filter_complex", audioFilter, "-map", "[aout]");
			} else {
				args.push("-map", "1:a:0?");
			}
			args.push("-c:a", "aac", "-b:a", "192k");
		} else {
			args.push("-an");
		}

		args.push(
			"-c:v",
			videoEncoder,
			"-b:v",
			String(Math.max(1_000_000, request.bitrate)),
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			outputPath,
		);
		return args;
	}

	private buildAudioFilterComplex(
		timeline: FfmpegFrameExportRequest["audioTimeline"],
		sourceDurationSec: number,
	): string | null {
		const segments = timeline.filter(
			(segment) =>
				Number.isFinite(segment.startSec) &&
				Number.isFinite(segment.endSec) &&
				segment.endSec > segment.startSec,
		);
		if (segments.length === 0) {
			return null;
		}

		const effectiveSegments =
			segments.length > 0 ? segments : [{ startSec: 0, endSec: sourceDurationSec, speed: 1 }];
		if (
			effectiveSegments.length === 1 &&
			Math.abs(effectiveSegments[0].startSec) < 0.0001 &&
			Math.abs(effectiveSegments[0].endSec - sourceDurationSec) < 0.25 &&
			Math.abs(effectiveSegments[0].speed - 1) < 0.0001
		) {
			return null;
		}

		const parts: string[] = [];
		effectiveSegments.forEach((segment, index) => {
			const label = `a${index}`;
			const filters = [
				`atrim=start=${Math.max(0, segment.startSec).toFixed(6)}:end=${Math.max(segment.startSec, segment.endSec).toFixed(6)}`,
				"asetpts=PTS-STARTPTS",
				...this.buildAtempoFilters(segment.speed),
			];
			parts.push(`[1:a]${filters.join(",")}[${label}]`);
		});

		if (effectiveSegments.length === 1) {
			return parts[0].replace(/\[a0\]$/, "[aout]");
		}

		const concatInputs = effectiveSegments.map((_, index) => `[a${index}]`).join("");
		parts.push(`${concatInputs}concat=n=${effectiveSegments.length}:v=0:a=1[aout]`);
		return parts.join(";");
	}

	private buildAtempoFilters(speed: number): string[] {
		if (!Number.isFinite(speed) || speed <= 0 || Math.abs(speed - 1) < 0.0001) {
			return [];
		}

		const filters: string[] = [];
		let remaining = speed;
		while (remaining > 2) {
			filters.push("atempo=2");
			remaining /= 2;
		}
		while (remaining < 0.5) {
			filters.push("atempo=0.5");
			remaining /= 0.5;
		}
		filters.push(`atempo=${remaining.toFixed(6)}`);
		return filters;
	}

	private async selectVideoEncoder(
		binary: FfmpegBinaryResolution,
		preference: FfmpegFrameExportRequest["hardwarePreference"],
	): Promise<EncoderChoice> {
		if (preference === "compatibility-cpu") {
			return { encoder: "libx264", hardwareAcceleration: null };
		}

		const encoders = await this.getEncoderSet(binary);
		if (process.platform === "win32") {
			return { encoder: encoders.has("libx264") ? "libx264" : "h264", hardwareAcceleration: null };
		}

		const hardware = detectFfmpegHardwareAcceleration();
		const hardwareEncoder =
			hardware === "videotoolbox"
				? "h264_videotoolbox"
				: hardware === "nvenc"
					? "h264_nvenc"
					: hardware === "qsv"
						? "h264_qsv"
						: hardware === "amf"
							? "h264_amf"
							: null;

		if (hardwareEncoder && encoders.has(hardwareEncoder)) {
			return { encoder: hardwareEncoder, hardwareAcceleration: hardware };
		}

		return { encoder: encoders.has("libx264") ? "libx264" : "h264", hardwareAcceleration: null };
	}

	private async getEncoderSet(binary: FfmpegBinaryResolution): Promise<Set<string>> {
		if (this.encoderCache) {
			return this.encoderCache;
		}

		const result = await new Promise<string>((resolve) => {
			const proc = spawn(binary.executablePath, ["-hide_banner", "-encoders"], {
				stdio: ["ignore", "pipe", "pipe"],
			});
			let output = "";
			proc.stdout.on("data", (chunk) => {
				output += String(chunk);
			});
			proc.stderr.on("data", (chunk) => {
				output += String(chunk);
			});
			proc.once("error", () => resolve(""));
			proc.once("exit", () => resolve(output));
		});

		const encoders = new Set<string>();
		for (const line of result.split(/\r?\n/)) {
			const match = line.match(/^\s*[A-Z.]{6}\s+(\S+)/);
			if (match) {
				encoders.add(match[1]);
			}
		}

		this.encoderCache = encoders;
		return encoders;
	}

	private async createTempOutputPath(outputPath: string): Promise<string> {
		const dir = path.dirname(outputPath);
		await fs.mkdir(dir, { recursive: true });
		return path.join(dir, `.likelysnap-export-${Date.now()}-${process.pid}.tmp.mp4`);
	}
}
