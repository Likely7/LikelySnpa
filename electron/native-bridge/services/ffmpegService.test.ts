import { describe, expect, it } from "vitest";
import { FfmpegService } from "./ffmpegService";

type FfmpegServiceTestAccess = {
	buildAudioFilterComplex(
		timeline: Array<{ startSec: number; endSec: number; speed: number }>,
		sourceDurationSec: number,
		audioStreamCount: number,
	): string | null;
	parseAudioStreamCount(ffmpegInputInfo: string): number;
};

function getTestAccess(): FfmpegServiceTestAccess {
	return new FfmpegService() as unknown as FfmpegServiceTestAccess;
}

describe("FfmpegService audio filters", () => {
	it("counts FFmpeg audio streams with language and stream id decorations", () => {
		const count = getTestAccess().parseAudioStreamCount(`
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'screen.mp4':
  Stream #0:0[0x1](und): Video: h264
  Stream #0:1[0x2](und): Audio: aac, 48000 Hz, stereo
  Stream #0:2[0x3](und): Audio: aac, 48000 Hz, stereo
`);

		expect(count).toBe(2);
	});

	it("keeps a simple single-track full-duration export on direct audio mapping", () => {
		const filter = getTestAccess().buildAudioFilterComplex(
			[{ startSec: 0, endSec: 10, speed: 1 }],
			10,
			1,
		);

		expect(filter).toBeNull();
	});

	it("mixes multiple source audio tracks into one export track", () => {
		const filter = getTestAccess().buildAudioFilterComplex(
			[{ startSec: 0, endSec: 10, speed: 1 }],
			10,
			2,
		);

		expect(filter).toBe(
			[
				"[1:a:0]atrim=start=0.000000:end=10.000000,asetpts=PTS-STARTPTS[a0_0]",
				"[1:a:1]atrim=start=0.000000:end=10.000000,asetpts=PTS-STARTPTS[a0_1]",
				"[a0_0][a0_1]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]",
			].join(";"),
		);
	});

	it("applies trim and speed edits before mixing multiple source audio tracks", () => {
		const filter = getTestAccess().buildAudioFilterComplex(
			[
				{ startSec: 1, endSec: 4, speed: 2 },
				{ startSec: 8, endSec: 12, speed: 1 },
			],
			12,
			2,
		);

		expect(filter).toBe(
			[
				"[1:a:0]atrim=start=1.000000:end=4.000000,asetpts=PTS-STARTPTS,atempo=2.000000[a0_0]",
				"[1:a:1]atrim=start=1.000000:end=4.000000,asetpts=PTS-STARTPTS,atempo=2.000000[a0_1]",
				"[a0_0][a0_1]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[a0]",
				"[1:a:0]atrim=start=8.000000:end=12.000000,asetpts=PTS-STARTPTS[a1_0]",
				"[1:a:1]atrim=start=8.000000:end=12.000000,asetpts=PTS-STARTPTS[a1_1]",
				"[a1_0][a1_1]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[a1]",
				"[a0][a1]concat=n=2:v=0:a=1[aout]",
			].join(";"),
		);
	});
});
