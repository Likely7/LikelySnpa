import { describe, expect, it } from "vitest";
import { ffmpegInputProbeHasVideoTrack } from "./videoProbe";

describe("ffmpegInputProbeHasVideoTrack", () => {
	it("detects video streams from ffmpeg input stderr output", () => {
		const output = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'webcam.mov':
  Duration: 00:11:04.05, start: 0.000000, bitrate: 2014 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1280x720, 2011 kb/s, 30 fps, 30 tbr, 600 tbn (default)
`;

		expect(ffmpegInputProbeHasVideoTrack(output)).toBe(true);
	});

	it("rejects audio-only probe output", () => {
		const output = `
Input #0, wav, from 'audio.wav':
  Duration: 00:00:03.00, bitrate: 768 kb/s
  Stream #0:0: Audio: pcm_s16le, 48000 Hz, mono, s16, 768 kb/s
`;

		expect(ffmpegInputProbeHasVideoTrack(output)).toBe(false);
	});
});
