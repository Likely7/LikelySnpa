export const RECORDING_PACKAGE_EXTENSION = ".likelysnap";

function padNumber(value: number, width: number): string {
	return String(Math.trunc(Math.abs(value))).padStart(width, "0");
}

export function formatRecordingTimestamp(recordingId: number): string {
	const date = new Date(Number.isFinite(recordingId) ? recordingId : Date.now());
	return [
		date.getFullYear(),
		padNumber(date.getMonth() + 1, 2),
		padNumber(date.getDate(), 2),
		padNumber(date.getHours(), 2),
		padNumber(date.getMinutes(), 2),
		padNumber(date.getSeconds(), 2),
		padNumber(date.getMilliseconds(), 3),
	].join("-");
}

export function getRecordingPackageName(recordingId: number): string {
	return `recording-${formatRecordingTimestamp(recordingId)}${RECORDING_PACKAGE_EXTENSION}`;
}

export function getRecordingPackageChildPath(recordingId: number, childName: string): string {
	return `${getRecordingPackageName(recordingId)}/${childName}`;
}
