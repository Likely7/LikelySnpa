import type { AudioSample } from "mediabunny";
import { describe, expect, it } from "vitest";
import { accumulateSamplePeaks } from "./useAudioPeaks";

function createPlanarSample(channels: Float32Array[]): AudioSample {
	const numberOfFrames = channels[0]?.length ?? 0;
	return {
		numberOfFrames,
		numberOfChannels: channels.length,
		sampleRate: numberOfFrames,
		timestamp: 0,
		allocationSize: () => numberOfFrames * Float32Array.BYTES_PER_ELEMENT,
		copyTo: (destination: Float32Array, options: { planeIndex?: number }) => {
			destination.set(channels[options.planeIndex ?? 0] ?? new Float32Array(numberOfFrames));
		},
	} as AudioSample;
}

describe("accumulateSamplePeaks", () => {
	it("uses per-channel peaks instead of cancelling opposite-polarity channels", () => {
		const peaks = new Float32Array(2);
		const sample = createPlanarSample([new Float32Array([0.8]), new Float32Array([-0.8])]);

		accumulateSamplePeaks(sample, peaks, 1, 1);

		expect(peaks[0]).toBeCloseTo(-0.8);
		expect(peaks[1]).toBeCloseTo(0.8);
	});
});
