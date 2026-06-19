import type { ExportQuality } from "./types";

export interface Mp4ExportSettings {
	width: number;
	height: number;
	bitrate: number;
}

export const MP4_EXPORT_BITRATE_LIMITS = {
	minMbps: 1,
	maxMbps: 60,
} as const;

export const MP4_EXPORT_DIMENSION_LIMITS = {
	minWidth: 320,
	minHeight: 180,
	maxWidth: 7680,
	maxHeight: 4320,
} as const;

interface SourceCropRegion {
	width: number;
	height: number;
}

const MEDIUM_SHORT_SIDE = 720;
const HIGH_SHORT_SIDE = 1080;

function even(value: number) {
	return Math.floor(value / 2) * 2;
}

function atLeastEven(value: number) {
	return Math.max(2, even(value));
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function calculateEffectiveSourceDimensions(
	sourceWidth: number,
	sourceHeight: number,
	cropRegion?: SourceCropRegion,
) {
	const cropWidth = cropRegion?.width ?? 1;
	const cropHeight = cropRegion?.height ?? 1;

	return {
		width: atLeastEven(Math.round(sourceWidth * cropWidth)),
		height: atLeastEven(Math.round(sourceHeight * cropHeight)),
	};
}

function calculateDimensionsForShortSide(targetShortSide: number, aspectRatioValue: number) {
	if (aspectRatioValue >= 1) {
		const height = even(targetShortSide);
		return {
			width: even(height * aspectRatioValue),
			height,
		};
	}

	const width = even(targetShortSide);
	return {
		width,
		height: even(width / aspectRatioValue),
	};
}

function calculateSourceDimensions(
	sourceWidth: number,
	sourceHeight: number,
	aspectRatioValue: number,
) {
	const sourceLongDim = Math.max(sourceWidth, sourceHeight);

	if (aspectRatioValue === 1) {
		const baseDimension = even(Math.min(sourceWidth, sourceHeight));
		return {
			width: baseDimension,
			height: baseDimension,
		};
	}

	if (aspectRatioValue > 1) {
		const baseWidth = even(sourceLongDim);
		for (let width = baseWidth; width >= 100; width -= 2) {
			const height = Math.round(width / aspectRatioValue);
			if (height % 2 === 0 && Math.abs(width / height - aspectRatioValue) < 0.0001) {
				return { width, height };
			}
		}
		return {
			width: baseWidth,
			height: even(baseWidth / aspectRatioValue),
		};
	}

	const baseHeight = even(sourceLongDim);
	for (let height = baseHeight; height >= 100; height -= 2) {
		const width = Math.round(height * aspectRatioValue);
		if (width % 2 === 0 && Math.abs(width / height - aspectRatioValue) < 0.0001) {
			return { width, height };
		}
	}
	return {
		width: even(baseHeight * aspectRatioValue),
		height: baseHeight,
	};
}

function calculateBitrate(quality: ExportQuality) {
	if (quality === "source") {
		return 15_000_000;
	}

	if (quality === "good") {
		return 8_000_000;
	}

	return 5_000_000;
}

export function normalizeCustomMp4ExportSettings({
	width,
	height,
	bitrate,
}: Mp4ExportSettings): Mp4ExportSettings {
	return {
		width: atLeastEven(
			clamp(
				Math.round(width),
				MP4_EXPORT_DIMENSION_LIMITS.minWidth,
				MP4_EXPORT_DIMENSION_LIMITS.maxWidth,
			),
		),
		height: atLeastEven(
			clamp(
				Math.round(height),
				MP4_EXPORT_DIMENSION_LIMITS.minHeight,
				MP4_EXPORT_DIMENSION_LIMITS.maxHeight,
			),
		),
		bitrate: Math.round(
			clamp(
				bitrate,
				MP4_EXPORT_BITRATE_LIMITS.minMbps * 1_000_000,
				MP4_EXPORT_BITRATE_LIMITS.maxMbps * 1_000_000,
			),
		),
	};
}

export function calculateMp4ExportSettings({
	quality,
	sourceWidth,
	sourceHeight,
	aspectRatioValue,
}: {
	quality: ExportQuality;
	sourceWidth: number;
	sourceHeight: number;
	aspectRatioValue: number;
}): Mp4ExportSettings {
	if (quality === "medium") {
		const dimensions = calculateDimensionsForShortSide(MEDIUM_SHORT_SIDE, aspectRatioValue);
		return {
			...dimensions,
			bitrate: calculateBitrate(quality),
		};
	}

	if (quality === "good") {
		const dimensions = calculateDimensionsForShortSide(HIGH_SHORT_SIDE, aspectRatioValue);
		return {
			...dimensions,
			bitrate: calculateBitrate(quality),
		};
	}

	const sourceDimensions = calculateSourceDimensions(sourceWidth, sourceHeight, aspectRatioValue);
	return {
		...sourceDimensions,
		bitrate: calculateBitrate(quality),
	};
}
