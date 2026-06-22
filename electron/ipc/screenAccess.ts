export type ScreenAccessStatus = "granted" | "denied" | "not-determined" | "restricted" | "unknown";

export type ScreenCaptureProbeResult = {
	granted: boolean;
	status: string;
	error?: string;
};

export type ScreenAccessResult = {
	success: boolean;
	granted: boolean;
	status: string;
	error?: string;
};

export function resolveScreenAccessResult(
	probe: ScreenCaptureProbeResult,
	mediaStatus: ScreenAccessStatus,
): ScreenAccessResult {
	if (probe.granted) {
		return { success: true, granted: true, status: probe.status };
	}

	if (mediaStatus === "granted") {
		return {
			success: true,
			granted: false,
			status: "restart-required",
			...(probe.error ? { error: probe.error } : {}),
		};
	}

	return {
		success: true,
		granted: false,
		status: mediaStatus,
		...(probe.error ? { error: probe.error } : {}),
	};
}
