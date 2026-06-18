import type { RecordingResolutionMode } from "./appSettings";

export type NativeWindowsSourceType = "display" | "window";

export type NativeWindowsRecordingRequest = {
	recordingId?: number;
	source: {
		type: NativeWindowsSourceType;
		sourceId: string;
		displayId?: number;
		windowHandle?: string;
	};
	video: {
		fps: number;
		width: number;
		height: number;
		resolutionMode?: RecordingResolutionMode;
		bitrate?: number;
	};
	audio: {
		system: {
			enabled: boolean;
		};
		microphone: {
			enabled: boolean;
			deviceId?: string;
			deviceName?: string;
			gain: number;
		};
	};
	webcam: {
		enabled: boolean;
		deviceId?: string;
		deviceName?: string;
		directShowClsid?: string;
		width: number;
		height: number;
		fps: number;
	};
	cursor: {
		mode: import("./recordingSession").CursorCaptureMode;
	};
};

export type NativeWindowsRecordingStartResult = {
	success: boolean;
	recordingId?: number;
	path?: string;
	helperPath?: string;
	error?: string;
};

export type NativeWindowsHelperEvent = {
	event?: string;
	[key: string]: unknown;
};

export type NativeWindowsWebcamFormat = {
	width?: number;
	height?: number;
	fps?: number;
	deviceName?: string;
};

export type NativeWindowsRecordingStoppedInfo = {
	screenPath?: string;
	webcamPath?: string;
	webcamStartOffsetMs?: number;
};

export function parseWindowHandleFromSourceId(sourceId?: string | null) {
	if (!sourceId?.startsWith("window:")) {
		return null;
	}

	const handlePart = sourceId.split(":")[1];
	if (!handlePart || !/^\d+$/.test(handlePart)) {
		return null;
	}

	return handlePart;
}

function normalizeNonNegativeNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

export function parseNativeWindowsHelperEvents(output: string): NativeWindowsHelperEvent[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				const parsed = JSON.parse(line);
				return parsed && typeof parsed === "object" ? (parsed as NativeWindowsHelperEvent) : null;
			} catch {
				return null;
			}
		})
		.filter((event): event is NativeWindowsHelperEvent => Boolean(event));
}

export function getLastNativeWindowsHelperEvent(output: string, eventName: string) {
	return parseNativeWindowsHelperEvents(output)
		.filter((event) => event.event === eventName)
		.at(-1);
}

export function readNativeWindowsWebcamFormatFromOutput(
	output: string,
): NativeWindowsWebcamFormat | null {
	const event = getLastNativeWindowsHelperEvent(output, "webcam-format");
	if (!event) {
		return null;
	}

	return {
		width: normalizeNonNegativeNumber(event.width),
		height: normalizeNonNegativeNumber(event.height),
		fps: normalizeNonNegativeNumber(event.fps),
		deviceName: typeof event.deviceName === "string" ? event.deviceName : undefined,
	};
}

export function readNativeWindowsRecordingStoppedInfo(
	output: string,
): NativeWindowsRecordingStoppedInfo | null {
	const event = getLastNativeWindowsHelperEvent(output, "recording-stopped");
	if (!event) {
		return null;
	}

	const screenPath = typeof event.screenPath === "string" ? event.screenPath : undefined;
	const webcamPath = typeof event.webcamPath === "string" ? event.webcamPath : undefined;
	const webcamStartOffsetMs = normalizeNonNegativeNumber(event.webcamStartOffsetMs);
	return {
		...(screenPath ? { screenPath } : {}),
		...(webcamPath ? { webcamPath } : {}),
		...(webcamStartOffsetMs !== undefined ? { webcamStartOffsetMs } : {}),
	};
}
