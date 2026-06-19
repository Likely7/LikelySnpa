import type {
	AnnotationRegion,
	CropRegion,
	SpeedRegion,
	TrimRegion,
	WebcamLayoutPreset,
	WebcamSizePreset,
	ZoomRegion,
} from "@/components/video-editor/types";
import type { CursorRecordingData } from "@/native/contracts";
import { getPlatform } from "@/utils/platformUtils";
import { buildExportTimeline } from "./exportTimeline";
import { FrameRenderer } from "./frameRenderer";
import { StreamingVideoDecoder } from "./streamingDecoder";
import { TimestampedVideoFrameQueue } from "./timestampedVideoFrameQueue";
import type { ExportConfig, ExportProgress, ExportResult } from "./types";

export interface FfmpegVideoExporterConfig extends ExportConfig {
	videoUrl: string;
	inputAudioPath?: string;
	outputPath: string;
	webcamVideoUrl?: string;
	webcamStartOffsetMs?: number;
	wallpaper: string;
	zoomRegions: ZoomRegion[];
	trimRegions?: TrimRegion[];
	speedRegions?: SpeedRegion[];
	showShadow: boolean;
	shadowIntensity: number;
	showBlur: boolean;
	motionBlurAmount?: number;
	borderRadius?: number;
	padding?: number;
	cropRegion: CropRegion;
	webcamLayoutPreset?: WebcamLayoutPreset;
	webcamMaskShape?: import("@/components/video-editor/types").WebcamMaskShape;
	webcamMirrored?: boolean;
	webcamReactiveZoom?: boolean;
	webcamSizePreset?: WebcamSizePreset;
	webcamPosition?: { cx: number; cy: number } | null;
	cursorRecordingData?: CursorRecordingData | null;
	cursorScale?: number;
	cursorSmoothing?: number;
	cursorMotionBlur?: number;
	cursorClickBounce?: number;
	cursorClipToBounds?: boolean;
	cursorTheme?: string;
	annotationRegions?: AnnotationRegion[];
	previewWidth?: number;
	previewHeight?: number;
	cursorTelemetry?: import("@/components/video-editor/types").CursorTelemetryPoint[];
	cursorClickTimestamps?: number[];
	onProgress?: (progress: ExportProgress) => void;
}

export class FfmpegVideoExporter {
	private config: FfmpegVideoExporterConfig;
	private streamingDecoder: StreamingVideoDecoder | null = null;
	private webcamDecoder: StreamingVideoDecoder | null = null;
	private renderer: FrameRenderer | null = null;
	private cancelled = false;
	private sessionId: string | null = null;
	private cancelPromise: Promise<void> | null = null;

	constructor(config: FfmpegVideoExporterConfig) {
		this.config = config;
	}

	async export(): Promise<
		ExportResult & { outputPath?: string; encoder?: string; hardwareAcceleration?: string | null }
	> {
		let webcamFrameQueue: TimestampedVideoFrameQueue | null = null;
		let stopWebcamDecode = false;
		let webcamDecodeError: Error | null = null;
		let webcamDecodePromise: Promise<void> | null = null;
		const warnings: string[] = [];
		const onWarning = (message: string) => warnings.push(message);

		this.cancelled = false;

		try {
			const platform = await getPlatform();
			const streamingDecoder = new StreamingVideoDecoder();
			this.streamingDecoder = streamingDecoder;
			const videoInfo = await streamingDecoder.loadMetadata(this.config.videoUrl);

			let webcamInfo: Awaited<ReturnType<StreamingVideoDecoder["loadMetadata"]>> | null = null;
			if (this.config.webcamVideoUrl) {
				this.webcamDecoder = new StreamingVideoDecoder();
				webcamInfo = await this.webcamDecoder.loadMetadata(this.config.webcamVideoUrl);
			}

			const renderer = new FrameRenderer({
				width: this.config.width,
				height: this.config.height,
				wallpaper: this.config.wallpaper,
				zoomRegions: this.config.zoomRegions,
				showShadow: this.config.showShadow,
				shadowIntensity: this.config.shadowIntensity,
				showBlur: this.config.showBlur,
				motionBlurAmount: this.config.motionBlurAmount,
				borderRadius: this.config.borderRadius,
				padding: this.config.padding,
				cropRegion: this.config.cropRegion,
				cursorRecordingData: this.config.cursorRecordingData,
				cursorScale: this.config.cursorScale,
				cursorSmoothing: this.config.cursorSmoothing,
				cursorMotionBlur: this.config.cursorMotionBlur,
				cursorClickBounce: this.config.cursorClickBounce,
				cursorClipToBounds: this.config.cursorClipToBounds,
				cursorTheme: this.config.cursorTheme,
				videoWidth: videoInfo.width,
				videoHeight: videoInfo.height,
				webcamSize: webcamInfo ? { width: webcamInfo.width, height: webcamInfo.height } : null,
				webcamLayoutPreset: this.config.webcamLayoutPreset,
				webcamMaskShape: this.config.webcamMaskShape,
				webcamMirrored: this.config.webcamMirrored,
				webcamReactiveZoom: this.config.webcamReactiveZoom,
				webcamSizePreset: this.config.webcamSizePreset,
				webcamPosition: this.config.webcamPosition,
				annotationRegions: this.config.annotationRegions,
				speedRegions: this.config.speedRegions,
				previewWidth: this.config.previewWidth,
				previewHeight: this.config.previewHeight,
				cursorTelemetry: this.config.cursorTelemetry,
				cursorClickTimestamps: this.config.cursorClickTimestamps,
				platform,
			});
			this.renderer = renderer;
			await renderer.initialize();

			const audioTimeline = buildExportTimeline(
				videoInfo.duration,
				this.config.trimRegions,
				this.config.speedRegions,
			);
			const startResult = await window.electronAPI.startFfmpegFrameExport({
				outputPath: this.config.outputPath,
				inputAudioPath: videoInfo.hasAudio
					? (this.config.inputAudioPath ?? this.config.videoUrl)
					: undefined,
				hasAudio: videoInfo.hasAudio,
				width: this.config.width,
				height: this.config.height,
				frameRate: this.config.frameRate,
				bitrate: this.config.bitrate,
				videoCodec: "h264",
				audioCodec: "aac",
				hardwarePreference: "prefer-hardware",
				audioTimeline,
				sourceDurationSec: videoInfo.duration,
			});
			if (!startResult.success || !startResult.sessionId) {
				return {
					success: false,
					error: startResult.error || startResult.message || "Failed to start FFmpeg export",
				};
			}
			this.sessionId = startResult.sessionId;

			const { totalFrames } = streamingDecoder.getExportMetrics(
				this.config.frameRate,
				this.config.trimRegions,
				this.config.speedRegions,
			);

			webcamFrameQueue = this.config.webcamVideoUrl ? new TimestampedVideoFrameQueue() : null;
			const webcamStartOffsetMs = Math.max(0, this.config.webcamStartOffsetMs ?? 0);
			webcamDecodePromise =
				this.webcamDecoder && webcamFrameQueue
					? (() => {
							const queue = webcamFrameQueue;
							return this.webcamDecoder!.decodeAll(
								this.config.frameRate,
								this.config.trimRegions,
								this.config.speedRegions,
								async (webcamFrame, _exportTimestampUs, webcamSourceTimestampMs) => {
									while (queue.length >= 12 && !this.cancelled && !stopWebcamDecode) {
										await new Promise((resolve) => setTimeout(resolve, 2));
									}
									if (this.cancelled || stopWebcamDecode) {
										webcamFrame.close();
										return;
									}
									queue.enqueue(webcamFrame, webcamSourceTimestampMs);
								},
								onWarning,
							)
								.catch((error) => {
									webcamDecodeError = error instanceof Error ? error : new Error(String(error));
									throw webcamDecodeError;
								})
								.finally(() => {
									if (webcamDecodeError) {
										queue.fail(webcamDecodeError);
									} else {
										queue.close();
									}
								});
						})()
					: null;

			let frameIndex = 0;
			await streamingDecoder.decodeAll(
				this.config.frameRate,
				this.config.trimRegions,
				this.config.speedRegions,
				async (videoFrame, _exportTimestampUs, sourceTimestampMs) => {
					let webcamFrame: VideoFrame | null = null;
					try {
						if (this.cancelled) return;
						webcamFrame = webcamFrameQueue
							? await webcamFrameQueue.frameAt(sourceTimestampMs - webcamStartOffsetMs)
							: null;
						if (this.cancelled) return;

						await renderer.renderFrame(videoFrame, sourceTimestampMs * 1000, webcamFrame);
						const canvas = renderer.getCanvas();
						const ctx = canvas.getContext("2d", { willReadFrequently: true });
						if (!ctx) {
							throw new Error("Failed to read rendered export frame");
						}
						const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
						const writeResult = await window.electronAPI.writeFfmpegFrameExportChunk(
							this.sessionId!,
							imageData.data.buffer.slice(
								imageData.data.byteOffset,
								imageData.data.byteOffset + imageData.data.byteLength,
							),
						);
						if (!writeResult.success) {
							const log = writeResult.log?.filter(Boolean).join("\n").trim();
							throw new Error(
								[writeResult.error || "Failed to write FFmpeg frame", log]
									.filter(Boolean)
									.join("\n"),
							);
						}

						frameIndex++;
						this.reportProgress({
							currentFrame: frameIndex,
							totalFrames,
							percentage: totalFrames > 0 ? (frameIndex / totalFrames) * 100 : 0,
							estimatedTimeRemaining: 0,
						});
					} finally {
						videoFrame.close();
						webcamFrame?.close();
					}
				},
				onWarning,
			);

			if (this.cancelled) {
				await this.cancelActiveSession();
				return { success: false, error: "Export cancelled" };
			}

			stopWebcamDecode = true;
			webcamFrameQueue?.destroy();
			this.webcamDecoder?.cancel();
			await webcamDecodePromise;

			this.reportProgress({
				currentFrame: totalFrames,
				totalFrames,
				percentage: 100,
				estimatedTimeRemaining: 0,
				phase: "finalizing",
			});

			const finishResult = await window.electronAPI.finishFfmpegFrameExport(this.sessionId);
			this.sessionId = null;
			if (!finishResult.success) {
				return {
					success: false,
					error: finishResult.error || finishResult.message || "FFmpeg export failed",
					warnings: finishResult.log,
				};
			}

			return {
				success: true,
				outputPath: finishResult.outputPath,
				encoder: finishResult.encoder,
				hardwareAcceleration: finishResult.hardwareAcceleration,
				warnings: warnings.length > 0 ? warnings : undefined,
			};
		} catch (error) {
			await this.cancelActiveSession();
			if (this.cancelled) {
				return { success: false, error: "Export cancelled" };
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				warnings: warnings.length > 0 ? warnings : undefined,
			};
		} finally {
			stopWebcamDecode = true;
			webcamFrameQueue?.destroy();
			this.webcamDecoder?.cancel();
			if (webcamDecodePromise) {
				await webcamDecodePromise.catch(() => undefined);
			}
			this.cleanup();
		}
	}

	cancel(): Promise<void> {
		this.cancelled = true;
		this.streamingDecoder?.cancel();
		this.webcamDecoder?.cancel();
		this.cancelPromise ??= this.cancelActiveSession();
		return this.cancelPromise;
	}

	private async cancelActiveSession() {
		if (!this.sessionId) return;
		const sessionId = this.sessionId;
		this.sessionId = null;
		await window.electronAPI.cancelFfmpegFrameExport(sessionId).catch(() => undefined);
	}

	private reportProgress(progress: ExportProgress): void {
		this.config.onProgress?.(progress);
	}

	private cleanup() {
		this.streamingDecoder?.destroy();
		this.webcamDecoder?.destroy();
		this.renderer?.destroy();
		this.streamingDecoder = null;
		this.webcamDecoder = null;
		this.renderer = null;
	}
}
