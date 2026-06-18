import type { CursorCaptureMode } from "./recordingSession";

export type RecordingQuality = "standard" | "high" | "ultra";
export type RecordingResolutionMode = "source" | "1080p" | "1440p" | "4k" | "custom";
export type RecordingFrameRateMode = "preset" | "custom";
export type RecordingBitrateMode = "preset" | "custom";
export type RecordingFrameRatePreset = 24 | 30 | 60;

export interface AppSettings {
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
}

export const RECORDING_QUALITY_LABELS: Record<RecordingQuality, string> = {
	standard: "Standard",
	high: "High",
	ultra: "Ultra",
};

export function cursorCaptureModeFromSetting(defaultEditableCursor: boolean): CursorCaptureMode {
	return defaultEditableCursor ? "editable-overlay" : "system";
}
