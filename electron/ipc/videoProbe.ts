export function ffmpegInputProbeHasVideoTrack(output: string): boolean {
	return /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]+\))?: Video:/i.test(output);
}
