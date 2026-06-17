import type {
	CursorCapabilities,
	CursorPreviewData,
	CursorProviderKind,
	CursorRecordingData,
	CursorTelemetryPoint,
} from "../../../src/native/contracts";

export interface CursorTelemetryLoadResult {
	success: boolean;
	samples: CursorTelemetryPoint[];
	message?: string;
	error?: string;
}

export interface CursorNativeAdapter {
	readonly kind: CursorProviderKind;
	getCapabilities(): Promise<CursorCapabilities>;
	getRecordingData(videoPath?: string | null): Promise<CursorRecordingData>;
	getPreviewData(videoPath?: string | null, sampleIntervalMs?: number): Promise<CursorPreviewData>;
	getTelemetry(videoPath?: string | null): Promise<CursorTelemetryLoadResult>;
}
