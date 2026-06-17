import type { ExportTimelineSegment } from "./exportTimeline";

export type FfmpegHardwarePreference = "auto" | "prefer-hardware" | "compatibility-cpu";

export interface FfmpegFrameExportRequest {
	outputPath: string;
	inputAudioPath?: string;
	hasAudio: boolean;
	width: number;
	height: number;
	frameRate: number;
	bitrate: number;
	videoCodec: "h264";
	audioCodec: "aac";
	hardwarePreference: FfmpegHardwarePreference;
	audioTimeline: ExportTimelineSegment[];
	sourceDurationSec: number;
}

export interface FfmpegFrameExportStartResult {
	success: boolean;
	sessionId?: string;
	tempPath?: string;
	ffmpegPath?: string;
	encoder?: string;
	hardwareAcceleration?: string | null;
	message?: string;
	error?: string;
	log?: string[];
}

export interface FfmpegFrameExportFinishResult {
	success: boolean;
	outputPath?: string;
	tempPath?: string;
	ffmpegPath?: string;
	encoder?: string;
	hardwareAcceleration?: string | null;
	message?: string;
	error?: string;
	log?: string[];
}

export interface FfmpegFrameExportWriteResult {
	success: boolean;
	error?: string;
}

export interface FfmpegFrameExportCancelResult {
	success: boolean;
	error?: string;
}
