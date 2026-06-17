import type { CursorCaptureMode } from "./recordingSession";

export type RecordingQuality = "standard" | "high" | "ultra";

export interface AppSettings {
	recordingDirectory: string;
	projectDirectory: string;
	cacheDirectory: string;
	recordingQuality: RecordingQuality;
	defaultFrameRate: 30 | 60;
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
