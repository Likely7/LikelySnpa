import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import ScreenCaptureKit

struct Rectangle: Decodable {
	let x: Double
	let y: Double
	let width: Double
	let height: Double
}

struct RecordingRequest: Decodable {
	struct Source: Decodable {
		let type: String
		let sourceId: String
		let displayId: UInt32?
		let windowId: UInt32?
		let bounds: Rectangle?
	}

	struct Video: Decodable {
		let fps: Int
		let width: Int
		let height: Int
		let bitrate: Int?
		let bitrateMultiplier: Double?
		let hideSystemCursor: Bool
	}

	struct Audio: Decodable {
		struct SystemAudio: Decodable {
			let enabled: Bool
		}

		struct Microphone: Decodable {
			let enabled: Bool
			let deviceId: String?
			let deviceName: String?
			let gain: Double
		}

		let system: SystemAudio
		let microphone: Microphone
	}

	struct Webcam: Decodable {
		let enabled: Bool
		let deviceId: String?
		let deviceName: String?
		let width: Int
		let height: Int
		let fps: Int
	}

	struct Cursor: Decodable {
		let mode: String
	}

	struct Outputs: Decodable {
		let screenPath: String
		let webcamPath: String?
		let manifestPath: String?
	}

	let schemaVersion: Int?
	let recordingId: Int?
	let source: Source
	let video: Video
	let audio: Audio
	let webcam: Webcam
	let cursor: Cursor
	let outputs: Outputs
}

enum HelperError: Error, CustomStringConvertible {
	case invalidArguments
	case unsupportedMacOS
	case unsupportedFeature(String)
	case sourceNotFound(String)
	case invalidSourceType(String)
	case permissionDenied(String)
	case writerSetupFailed(String)

	var description: String {
		switch self {
		case .invalidArguments:
			return "Expected one JSON recording request argument."
		case .unsupportedMacOS:
			return "ScreenCaptureKit recording requires macOS 13 or newer."
		case .unsupportedFeature(let message):
			return message
		case .sourceNotFound(let message):
			return message
		case .invalidSourceType(let sourceType):
			return "Unsupported source type: \(sourceType)."
		case .permissionDenied(let message):
			return message
		case .writerSetupFailed(let message):
			return message
		}
	}
}

func emit(_ fields: [String: Any]) {
	if let data = try? JSONSerialization.data(withJSONObject: fields, options: []),
		let line = String(data: data, encoding: .utf8)
	{
		print(line)
		fflush(stdout)
	}
}

func emitError(code: String, message: String) {
	emit([
		"event": "error",
		"code": code,
		"message": message,
	])
}

@available(macOS 13.0, *)
final class ScreenCaptureRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
	private struct CaptureTarget {
		let filter: SCContentFilter
		let width: Int
		let height: Int
		let bounds: CGRect
	}

	private let request: RecordingRequest
	private let sampleQueue = DispatchQueue(label: "app.openscreen.sck-helper.samples")
	private let stateQueue = DispatchQueue(label: "app.openscreen.sck-helper.state")
	private var stream: SCStream?
	private var writer: AVAssetWriter?
	private var videoInput: AVAssetWriterInput?
	private var systemAudioInput: AVAssetWriterInput?
	private var microphoneAudioInput: AVAssetWriterInput?
	private var didStartWriting = false
	private var didEmitRecordingStarted = false
	private var isStopping = false
	private var isPaused = false
	private var pauseStartedAt: CMTime?
	private var totalPausedDuration = CMTime.zero
	private var nativeMicrophoneEnabled = false
	private var outputWidth = 1920
	private var outputHeight = 1080
	private var targetCaptureBounds = CGRect(x: 0, y: 0, width: 1920, height: 1080)
	private let microphoneOutputTypeRawValue = 2
	private let hostClock = CMClockGetHostTimeClock()
	private var videoSamplesAppended = 0
	private var videoSamplesDroppedInputNotReady = 0
	private var videoAppendFailures = 0
	private var systemAudioSamplesAppended = 0
	private var systemAudioSamplesDroppedBeforeWriterStart = 0
	private var systemAudioSamplesDroppedInputNotReady = 0
	private var systemAudioAppendFailures = 0
	private var microphoneAudioSamplesAppended = 0
	private var microphoneAudioSamplesDroppedBeforeWriterStart = 0
	private var microphoneAudioSamplesDroppedInputNotReady = 0
	private var microphoneAudioAppendFailures = 0
	private var webcamRecorder: NativeWebcamRecorder?
	private var selectedVideoBitrate = 0

	init(request: RecordingRequest) {
		self.request = request
	}

	func start() async throws {
		try ensureRequestedPermissions()

		let content = try await SCShareableContent.excludingDesktopWindows(
			false,
			onScreenWindowsOnly: true
		)
		let target = try makeCaptureTarget(from: content)
		outputWidth = target.width
		outputHeight = target.height
		targetCaptureBounds = target.bounds
		let configuration = makeStreamConfiguration()
		let stream = SCStream(filter: target.filter, configuration: configuration, delegate: self)

		try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
		if request.audio.system.enabled {
			try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleQueue)
		}
		if nativeMicrophoneEnabled {
			guard let microphoneOutputType = SCStreamOutputType(rawValue: microphoneOutputTypeRawValue) else {
				throw HelperError.unsupportedFeature(
					"Native microphone capture requires a macOS version with ScreenCaptureKit microphone output."
				)
			}
			try stream.addStreamOutput(self, type: microphoneOutputType, sampleHandlerQueue: sampleQueue)
		}
		try setupWriter()
		try setupWebcamRecorder()

		self.stream = stream
		emit(["event": "ready", "schemaVersion": 1])
		try await stream.startCapture()
	}

	func stop() async {
		let shouldStop = stateQueue.sync {
			if isStopping {
				return false
			}
			isStopping = true
			return true
		}
		if !shouldStop {
			return
		}

		do {
			try await stream?.stopCapture()
		} catch {
			emit([
				"event": "warning",
				"code": "stop-capture-failed",
				"message": "\(error)",
			])
		}

		await finishWriter()
		await webcamRecorder?.stop()
	}

	func pause() {
		let didPause = stateQueue.sync {
			if isStopping || isPaused {
				return false
			}

			isPaused = true
			pauseStartedAt = CMClockGetTime(hostClock)
			return true
		}

		if didPause {
			emit([
				"event": "recording-paused",
				"timestampMs": Int(Date().timeIntervalSince1970 * 1000),
			])
		}
	}

	func resume() {
		let didResume = stateQueue.sync {
			if isStopping || !isPaused {
				return false
			}

			if let pauseStartedAt {
				let now = CMClockGetTime(hostClock)
				totalPausedDuration = CMTimeAdd(
					totalPausedDuration,
					CMTimeSubtract(now, pauseStartedAt)
				)
			}
			isPaused = false
			pauseStartedAt = nil
			return true
		}

		if didResume {
			emit([
				"event": "recording-resumed",
				"timestampMs": Int(Date().timeIntervalSince1970 * 1000),
			])
		}
	}

	func stream(_ stream: SCStream, didStopWithError error: Error) {
		emitError(code: "capture-stopped-with-error", message: "\(error)")
		Task {
			await stop()
		}
	}

	func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
		guard CMSampleBufferDataIsReady(sampleBuffer) else {
			return
		}
		let pauseState = currentPauseState()
		if pauseState.paused {
			return
		}
		guard let sampleBuffer = retimedSampleBuffer(sampleBuffer, subtracting: pauseState.offset) else {
			return
		}

		if type == .audio {
			appendAudioSampleBuffer(sampleBuffer, to: systemAudioInput, label: "system")
			return
		}

		if type.rawValue == microphoneOutputTypeRawValue {
			appendAudioSampleBuffer(sampleBuffer, to: microphoneAudioInput, label: "microphone")
			return
		}

		guard type == .screen else {
			return
		}
		guard isCompleteFrame(sampleBuffer) else {
			return
		}
		guard let videoInput, let writer else {
			return
		}
		let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
		if !didStartWriting {
			writer.startWriting()
			writer.startSession(atSourceTime: presentationTime)
			didStartWriting = true
			webcamRecorder?.start()
		}

		if videoInput.isReadyForMoreMediaData {
			if videoInput.append(sampleBuffer) {
				videoSamplesAppended += 1
				if !didEmitRecordingStarted {
					didEmitRecordingStarted = true
					emit([
						"event": "recording-started",
						"timestampMs": Int(Date().timeIntervalSince1970 * 1000),
						"width": outputWidth,
						"height": outputHeight,
						"fps": request.video.fps,
						"bitrate": selectedVideoBitrate,
						"captureBounds": [
							"x": targetCaptureBounds.origin.x,
							"y": targetCaptureBounds.origin.y,
							"width": targetCaptureBounds.width,
							"height": targetCaptureBounds.height,
						],
					])
				}
			} else {
				videoAppendFailures += 1
			}
		} else {
			videoSamplesDroppedInputNotReady += 1
		}
	}

	private func ensureRequestedPermissions() throws {
		if !CGPreflightScreenCaptureAccess() {
			let granted = CGRequestScreenCaptureAccess()
			if !granted {
				throw HelperError.permissionDenied("Screen recording permission is required for ScreenCaptureKit capture.")
			}
		}

		if request.audio.microphone.enabled {
			switch AVCaptureDevice.authorizationStatus(for: .audio) {
			case .authorized:
				break
			case .notDetermined:
				let semaphore = DispatchSemaphore(value: 0)
				AVCaptureDevice.requestAccess(for: .audio) { _ in
					semaphore.signal()
				}
				let waitResult = semaphore.wait(timeout: .now() + 30)
				if waitResult == .timedOut || AVCaptureDevice.authorizationStatus(for: .audio) != .authorized {
					throw HelperError.permissionDenied("Microphone permission is required for native microphone capture.")
				}
			default:
				throw HelperError.permissionDenied("Microphone permission is required for native microphone capture.")
			}
		}

		if request.webcam.enabled {
			switch AVCaptureDevice.authorizationStatus(for: .video) {
			case .authorized:
				break
			case .notDetermined:
				let semaphore = DispatchSemaphore(value: 0)
				AVCaptureDevice.requestAccess(for: .video) { _ in
					semaphore.signal()
				}
				let waitResult = semaphore.wait(timeout: .now() + 30)
				if waitResult == .timedOut || AVCaptureDevice.authorizationStatus(for: .video) != .authorized {
					throw HelperError.permissionDenied("Camera permission is required for native webcam capture.")
				}
			default:
				throw HelperError.permissionDenied("Camera permission is required for native webcam capture.")
			}
		}
	}

	private func makeCaptureTarget(from content: SCShareableContent) throws -> CaptureTarget {
		switch request.source.type {
		case "display":
			guard let displayId = request.source.displayId else {
				throw HelperError.sourceNotFound("Display capture requires source.displayId.")
			}
			guard let display = content.displays.first(where: { $0.displayID == displayId }) else {
				throw HelperError.sourceNotFound("No ScreenCaptureKit display found for id \(displayId).")
			}
			let pixelSize = Self.pixelSize(for: display.displayID)
			return CaptureTarget(
				filter: SCContentFilter(display: display, excludingWindows: []),
				width: evenCaptureDimension(pixelSize.width, fallback: request.video.width),
				height: evenCaptureDimension(pixelSize.height, fallback: request.video.height),
				bounds: display.frame
			)
		case "window":
			guard let windowId = request.source.windowId else {
				throw HelperError.sourceNotFound("Window capture requires source.windowId.")
			}
			guard let window = content.windows.first(where: { $0.windowID == windowId }) else {
				throw HelperError.sourceNotFound("No ScreenCaptureKit window found for id \(windowId).")
			}
			let candidateDisplay = content.displays.first {
				$0.frame.intersects(window.frame) || $0.frame.contains(CGPoint(x: window.frame.midX, y: window.frame.midY))
			}
			let scaleFactor = Self.scaleFactor(for: candidateDisplay?.displayID ?? CGMainDisplayID())
			let width = Int(window.frame.width) * scaleFactor
			let height = Int(window.frame.height) * scaleFactor
			return CaptureTarget(
				filter: SCContentFilter(desktopIndependentWindow: window),
				width: evenCaptureDimension(width, fallback: request.video.width),
				height: evenCaptureDimension(height, fallback: request.video.height),
				bounds: window.frame
			)
		default:
			throw HelperError.invalidSourceType(request.source.type)
		}
	}

	private func makeStreamConfiguration() -> SCStreamConfiguration {
		let configuration = SCStreamConfiguration()
		configuration.width = outputWidth
		configuration.height = outputHeight
		configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(1, request.video.fps)))
		configuration.queueDepth = 6
		configuration.showsCursor = !request.video.hideSystemCursor
		configuration.pixelFormat = kCVPixelFormatType_32BGRA
		configuration.sampleRate = 48_000
		configuration.channelCount = 2
		configuration.excludesCurrentProcessAudio = true
		configuration.capturesAudio = request.audio.system.enabled

		if request.audio.microphone.enabled {
			guard supportsNativeMicrophoneCapture(streamConfig: configuration) else {
				nativeMicrophoneEnabled = false
				emit([
					"event": "warning",
					"code": "microphone-unavailable",
					"message": "Native microphone capture requires ScreenCaptureKit microphone support on this macOS version.",
				])
				return configuration
			}
			nativeMicrophoneEnabled = true
			configuration.capturesAudio = true
			configuration.setValue(true, forKey: "captureMicrophone")
			if let deviceId = resolveMicrophoneCaptureDeviceID() {
				configuration.setValue(deviceId, forKey: "microphoneCaptureDeviceID")
			}
		} else {
			nativeMicrophoneEnabled = false
		}

		return configuration
	}

	private func setupWriter() throws {
		let outputUrl = URL(fileURLWithPath: request.outputs.screenPath)
		try? FileManager.default.removeItem(at: outputUrl)
		try FileManager.default.createDirectory(
			at: outputUrl.deletingLastPathComponent(),
			withIntermediateDirectories: true
		)

		let writer = try AVAssetWriter(outputURL: outputUrl, fileType: .mp4)
		let bitrate = request.video.bitrate ?? defaultBitrate(
			width: outputWidth,
			height: outputHeight,
			fps: request.video.fps,
			qualityMultiplier: request.video.bitrateMultiplier ?? 1
		)
		selectedVideoBitrate = bitrate
		let settings: [String: Any] = [
			AVVideoCodecKey: AVVideoCodecType.h264,
			AVVideoWidthKey: outputWidth,
			AVVideoHeightKey: outputHeight,
			AVVideoColorPropertiesKey: [
				AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
				AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
				AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
			],
			AVVideoCompressionPropertiesKey: [
				AVVideoAverageBitRateKey: bitrate,
				AVVideoExpectedSourceFrameRateKey: request.video.fps,
				AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
			],
		]
		let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
		input.expectsMediaDataInRealTime = true

		guard writer.canAdd(input) else {
			throw HelperError.writerSetupFailed("Unable to add H.264 video input to AVAssetWriter.")
		}

		writer.add(input)
		self.writer = writer
		self.videoInput = input

		if request.audio.system.enabled {
			systemAudioInput = try addAudioInput(to: writer, bitRate: 192_000)
		}
		if nativeMicrophoneEnabled {
			microphoneAudioInput = try addAudioInput(to: writer, bitRate: 128_000)
		}
	}

	private func setupWebcamRecorder() throws {
		guard request.webcam.enabled else {
			return
		}
		guard let webcamPath = request.outputs.webcamPath, !webcamPath.isEmpty else {
			emit([
				"event": "warning",
				"code": "webcam-output-missing",
				"message": "Native webcam capture requested without outputs.webcamPath.",
			])
			return
		}

		let recorder = try NativeWebcamRecorder(request: request.webcam, outputPath: webcamPath)
		webcamRecorder = recorder
		try recorder.prepare()
		emit([
			"event": "webcam-format",
			"schemaVersion": 1,
			"width": recorder.outputWidth,
			"height": recorder.outputHeight,
			"fps": recorder.outputFps,
			"deviceName": recorder.deviceName,
			"path": webcamPath,
		])
	}

	private func finishWriter() async {
		guard let writer else {
			return
		}

		videoInput?.markAsFinished()
		systemAudioInput?.markAsFinished()
		microphoneAudioInput?.markAsFinished()

		await withCheckedContinuation { continuation in
			writer.finishWriting {
				continuation.resume()
			}
		}

		if writer.status == .completed {
			emitRecordingDiagnostics(for: request.outputs.screenPath)
			emit([
				"event": "recording-stopped",
				"screenPath": request.outputs.screenPath,
				"width": outputWidth,
				"height": outputHeight,
				"fps": request.video.fps,
				"bitrate": selectedVideoBitrate,
			])
		} else {
			emitError(
				code: "writer-failed",
				message: writer.error.map { "\($0)" } ?? "AVAssetWriter failed with status \(writer.status.rawValue)."
			)
		}
	}

	private func addAudioInput(to writer: AVAssetWriter, bitRate: Int) throws -> AVAssetWriterInput {
		let settings: [String: Any] = [
			AVFormatIDKey: kAudioFormatMPEG4AAC,
			AVSampleRateKey: 48_000,
			AVNumberOfChannelsKey: 2,
			AVEncoderBitRateKey: bitRate,
		]
		let input = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
		input.expectsMediaDataInRealTime = true

		guard writer.canAdd(input) else {
			throw HelperError.writerSetupFailed("Unable to add AAC audio input to AVAssetWriter.")
		}

		writer.add(input)
		return input
	}

	private func appendAudioSampleBuffer(
		_ sampleBuffer: CMSampleBuffer,
		to input: AVAssetWriterInput?,
		label: String
	) {
		let sampleCount = max(1, CMSampleBufferGetNumSamples(sampleBuffer))
		guard didStartWriting else {
			recordAudioSamples(label: label, droppedBeforeWriterStart: sampleCount)
			return
		}
		guard let input, input.isReadyForMoreMediaData else {
			recordAudioSamples(label: label, droppedInputNotReady: sampleCount)
			return
		}

		if input.append(sampleBuffer) {
			recordAudioSamples(label: label, appended: sampleCount)
		} else {
			recordAudioSamples(label: label, appendFailures: sampleCount)
		}
	}

	private func recordAudioSamples(
		label: String,
		appended: Int = 0,
		droppedBeforeWriterStart: Int = 0,
		droppedInputNotReady: Int = 0,
		appendFailures: Int = 0
	) {
		if label == "microphone" {
			microphoneAudioSamplesAppended += appended
			microphoneAudioSamplesDroppedBeforeWriterStart += droppedBeforeWriterStart
			microphoneAudioSamplesDroppedInputNotReady += droppedInputNotReady
			microphoneAudioAppendFailures += appendFailures
			return
		}

		systemAudioSamplesAppended += appended
		systemAudioSamplesDroppedBeforeWriterStart += droppedBeforeWriterStart
		systemAudioSamplesDroppedInputNotReady += droppedInputNotReady
		systemAudioAppendFailures += appendFailures
	}

	private func emitRecordingDiagnostics(for path: String) {
		var diagnostics = collectRecordingDiagnostics(for: path)
		diagnostics["event"] = "recording-diagnostics"
		diagnostics["screenPath"] = path
		diagnostics["requestedAudio"] = [
			"system": request.audio.system.enabled,
			"microphone": request.audio.microphone.enabled,
		]
		diagnostics["nativeMicrophoneEnabled"] = nativeMicrophoneEnabled
		diagnostics["recordingStarted"] = [
			"width": outputWidth,
			"height": outputHeight,
			"fps": request.video.fps,
			"bitrate": selectedVideoBitrate,
			"requestedWidth": request.video.width,
			"requestedHeight": request.video.height,
			"requestedFps": request.video.fps,
			"requestedBitrate": request.video.bitrate as Any,
			"bitrateMultiplier": request.video.bitrateMultiplier ?? 1,
			"colorPrimaries": "ITU_R_709_2",
			"transferFunction": "ITU_R_709_2",
			"yCbCrMatrix": "ITU_R_709_2",
		]
		diagnostics["writerSamples"] = [
			"video": [
				"appended": videoSamplesAppended,
				"droppedInputNotReady": videoSamplesDroppedInputNotReady,
				"appendFailures": videoAppendFailures,
			],
			"systemAudio": [
				"appended": systemAudioSamplesAppended,
				"droppedBeforeWriterStart": systemAudioSamplesDroppedBeforeWriterStart,
				"droppedInputNotReady": systemAudioSamplesDroppedInputNotReady,
				"appendFailures": systemAudioAppendFailures,
			],
			"microphoneAudio": [
				"appended": microphoneAudioSamplesAppended,
				"droppedBeforeWriterStart": microphoneAudioSamplesDroppedBeforeWriterStart,
				"droppedInputNotReady": microphoneAudioSamplesDroppedInputNotReady,
				"appendFailures": microphoneAudioAppendFailures,
			],
		]
		emit(diagnostics)
	}

	private func collectRecordingDiagnostics(for path: String) -> [String: Any] {
		let asset = AVURLAsset(url: URL(fileURLWithPath: path))
		let videoTracks = asset.tracks(withMediaType: .video)
		let audioTracks = asset.tracks(withMediaType: .audio)
		let videoDiagnostics = videoTracks.enumerated().map { index, track in
			scanTrack(track, index: index, mediaType: "video", asset: asset)
		}
		let audioDiagnostics = audioTracks.enumerated().map { index, track in
			scanTrack(track, index: index, mediaType: "audio", asset: asset)
		}
		let firstVideoStartMs = videoDiagnostics.compactMap { $0["firstSampleMs"] as? Double }.first
		let audioOffsets = audioDiagnostics.compactMap { diagnostic -> [String: Any]? in
			guard let firstVideoStartMs,
				let firstAudioStartMs = diagnostic["firstSampleMs"] as? Double,
				let trackIndex = diagnostic["index"] as? Int
			else {
				return nil
			}
			return [
				"trackIndex": trackIndex,
				"startOffsetMs": firstAudioStartMs - firstVideoStartMs,
			]
		}

		return [
			"tracks": [
				"video": videoDiagnostics,
				"audio": audioDiagnostics,
			],
			"audioStartOffsetsMs": audioOffsets,
		]
	}

	private func scanTrack(
		_ track: AVAssetTrack,
		index: Int,
		mediaType: String,
		asset: AVAsset
	) -> [String: Any] {
		var diagnostic: [String: Any] = [
			"index": index,
			"mediaType": mediaType,
		]
		if let durationMs = milliseconds(track.timeRange.duration) {
			diagnostic["durationMs"] = durationMs
		}

		do {
			let reader = try AVAssetReader(asset: asset)
			let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
			output.alwaysCopiesSampleData = false
			guard reader.canAdd(output) else {
				diagnostic["scanError"] = "Unable to add reader output"
				return diagnostic
			}
			reader.add(output)
			guard reader.startReading() else {
				diagnostic["scanError"] = reader.error.map { "\($0)" } ?? "Reader failed to start"
				return diagnostic
			}

			var firstSample: CMTime?
			var lastSampleEnd: CMTime?
			var sampleBuffers = 0
			while let sampleBuffer = output.copyNextSampleBuffer() {
				sampleBuffers += 1
				let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
				let duration = CMSampleBufferGetDuration(sampleBuffer)
				if firstSample == nil, pts.isValid {
					firstSample = pts
				}
				if pts.isValid {
					lastSampleEnd = duration.isValid ? CMTimeAdd(pts, duration) : pts
				}
			}
			reader.cancelReading()

			diagnostic["sampleBuffers"] = sampleBuffers
			if let firstSampleMs = milliseconds(firstSample) {
				diagnostic["firstSampleMs"] = firstSampleMs
			}
			if let lastSampleEndMs = milliseconds(lastSampleEnd) {
				diagnostic["lastSampleEndMs"] = lastSampleEndMs
			}
		} catch {
			diagnostic["scanError"] = "\(error)"
		}

		return diagnostic
	}

	private func milliseconds(_ time: CMTime?) -> Double? {
		guard let time, time.isValid, !time.isIndefinite else {
			return nil
		}
		let seconds = CMTimeGetSeconds(time)
		guard seconds.isFinite else {
			return nil
		}
		return seconds * 1000
	}

	private func currentPauseState() -> (paused: Bool, offset: CMTime) {
		stateQueue.sync {
			(isPaused, totalPausedDuration)
		}
	}

	private func retimedSampleBuffer(_ sampleBuffer: CMSampleBuffer, subtracting offset: CMTime) -> CMSampleBuffer? {
		if !offset.isValid || offset == .zero {
			return sampleBuffer
		}

		let sampleCount = CMSampleBufferGetNumSamples(sampleBuffer)
		if sampleCount <= 0 {
			return sampleBuffer
		}

		var timing = Array(repeating: CMSampleTimingInfo(), count: sampleCount)
		let timingStatus = CMSampleBufferGetSampleTimingInfoArray(
			sampleBuffer,
			entryCount: sampleCount,
			arrayToFill: &timing,
			entriesNeededOut: nil
		)
		if timingStatus != noErr {
			emit([
				"event": "warning",
				"code": "sample-retime-failed",
				"message": "Unable to read sample timing info: \(timingStatus).",
			])
			return sampleBuffer
		}

		for index in timing.indices {
			if timing[index].presentationTimeStamp.isValid {
				timing[index].presentationTimeStamp = CMTimeSubtract(
					timing[index].presentationTimeStamp,
					offset
				)
			}
			if timing[index].decodeTimeStamp.isValid {
				timing[index].decodeTimeStamp = CMTimeSubtract(timing[index].decodeTimeStamp, offset)
			}
		}

		var retimedBuffer: CMSampleBuffer?
		let copyStatus = CMSampleBufferCreateCopyWithNewTiming(
			allocator: kCFAllocatorDefault,
			sampleBuffer: sampleBuffer,
			sampleTimingEntryCount: sampleCount,
			sampleTimingArray: &timing,
			sampleBufferOut: &retimedBuffer
		)
		if copyStatus != noErr {
			emit([
				"event": "warning",
				"code": "sample-retime-failed",
				"message": "Unable to copy sample timing info: \(copyStatus).",
			])
			return sampleBuffer
		}

		return retimedBuffer
	}

	private func isCompleteFrame(_ sampleBuffer: CMSampleBuffer) -> Bool {
		guard let attachments = CMSampleBufferGetSampleAttachmentsArray(
			sampleBuffer,
			createIfNecessary: false
		) as? [[SCStreamFrameInfo: Any]],
			let attachment = attachments.first,
			let statusRawValue = attachment[SCStreamFrameInfo.status] as? Int,
			let status = SCFrameStatus(rawValue: statusRawValue)
		else {
			return true
		}

		return status == .complete
	}

	private func evenCaptureDimension(_ value: Int, fallback: Int) -> Int {
		let candidate = value > 0 ? value : max(2, fallback)
		return max(2, candidate - (candidate % 2))
	}

	private func defaultBitrate(width: Int, height: Int, fps: Int, qualityMultiplier: Double) -> Int {
		let pixels = width * height
		let base: Int
		if pixels >= 3840 * 2160 {
			base = 45_000_000
		} else if pixels >= 2560 * 1440 {
			base = 28_000_000
		} else {
			base = 18_000_000
		}
		let frameRateMultiplier = fps >= 60 ? 1.7 : 1
		let multiplier = max(0.1, qualityMultiplier) * frameRateMultiplier
		return Int(Double(base) * multiplier)
	}

	private static func scaleFactor(for displayId: CGDirectDisplayID) -> Int {
		guard let mode = CGDisplayCopyDisplayMode(displayId) else {
			return 1
		}

		return max(1, mode.pixelWidth / max(1, mode.width))
	}

	private static func pixelSize(for displayId: CGDirectDisplayID) -> (width: Int, height: Int) {
		guard let mode = CGDisplayCopyDisplayMode(displayId) else {
			return (
				width: Int(CGDisplayPixelsWide(displayId)),
				height: Int(CGDisplayPixelsHigh(displayId))
			)
		}

		return (
			width: max(mode.pixelWidth, Int(CGDisplayPixelsWide(displayId))),
			height: max(mode.pixelHeight, Int(CGDisplayPixelsHigh(displayId)))
		)
	}

	private func supportsNativeMicrophoneCapture(streamConfig: SCStreamConfiguration) -> Bool {
		streamConfig.responds(to: Selector(("setCaptureMicrophone:"))) &&
			streamConfig.responds(to: Selector(("setMicrophoneCaptureDeviceID:"))) &&
			SCStreamOutputType(rawValue: microphoneOutputTypeRawValue) != nil
	}

	private func resolveMicrophoneCaptureDeviceID() -> String? {
		let devices = AVCaptureDevice.devices(for: .audio)

		if let deviceName = request.audio.microphone.deviceName?.trimmingCharacters(in: .whitespacesAndNewlines),
			!deviceName.isEmpty,
			let device = devices.first(where: { $0.localizedName == deviceName })
		{
			return device.uniqueID
		}

		if let deviceId = request.audio.microphone.deviceId?.trimmingCharacters(in: .whitespacesAndNewlines),
			!deviceId.isEmpty,
			devices.contains(where: { $0.uniqueID == deviceId })
		{
			return deviceId
		}

		return nil
	}
}

@available(macOS 13.0, *)
final class NativeWebcamRecorder: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
	private let request: RecordingRequest.Webcam
	private let outputPath: String
	private let session = AVCaptureSession()
	private let queue = DispatchQueue(label: "app.openscreen.sck-helper.webcam")
	private var writer: AVAssetWriter?
	private var videoInput: AVAssetWriterInput?
	private var didStartWriting = false
	private var isStopping = false
	private var firstSampleTime: CMTime?
	private(set) var outputWidth = 1280
	private(set) var outputHeight = 720
	private(set) var outputFps = 30
	private(set) var deviceName = "Camera"

	init(request: RecordingRequest.Webcam, outputPath: String) {
		self.request = request
		self.outputPath = outputPath
	}

	func prepare() throws {
		guard let device = resolveDevice() else {
			throw HelperError.sourceNotFound("No webcam device found for native webcam capture.")
		}
		deviceName = device.localizedName

		session.beginConfiguration()
		session.sessionPreset = .hd1280x720
		let input = try AVCaptureDeviceInput(device: device)
		guard session.canAddInput(input) else {
			session.commitConfiguration()
			throw HelperError.writerSetupFailed("Unable to add webcam input.")
		}
		session.addInput(input)

		let output = AVCaptureVideoDataOutput()
		output.alwaysDiscardsLateVideoFrames = true
		output.videoSettings = [
			kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
		]
		output.setSampleBufferDelegate(self, queue: queue)
		guard session.canAddOutput(output) else {
			session.commitConfiguration()
			throw HelperError.writerSetupFailed("Unable to add webcam output.")
		}
		session.addOutput(output)
		session.commitConfiguration()

		try configureDevice(device)
		try setupWriter()
	}

	func start() {
		queue.async {
			if !self.session.isRunning {
				self.session.startRunning()
			}
		}
	}

	func stop() async {
		await withCheckedContinuation { continuation in
			queue.async {
				if self.isStopping {
					continuation.resume()
					return
				}
				self.isStopping = true
				if self.session.isRunning {
					self.session.stopRunning()
				}
				self.videoInput?.markAsFinished()
				guard let writer = self.writer, self.didStartWriting else {
					continuation.resume()
					return
				}
				writer.finishWriting {
					continuation.resume()
				}
			}
		}
	}

	func captureOutput(
		_ output: AVCaptureOutput,
		didOutput sampleBuffer: CMSampleBuffer,
		from connection: AVCaptureConnection
	) {
		guard !isStopping, CMSampleBufferDataIsReady(sampleBuffer), let writer, let videoInput else {
			return
		}

		let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
		if !didStartWriting {
			firstSampleTime = pts
			writer.startWriting()
			writer.startSession(atSourceTime: .zero)
			didStartWriting = true
		}

		guard let firstSampleTime,
			let retimed = retime(sampleBuffer, subtracting: firstSampleTime),
			videoInput.isReadyForMoreMediaData
		else {
			return
		}
		_ = videoInput.append(retimed)
	}

	private func resolveDevice() -> AVCaptureDevice? {
		let devices = AVCaptureDevice.devices(for: .video)
		if let deviceId = request.deviceId?.trimmingCharacters(in: .whitespacesAndNewlines),
			!deviceId.isEmpty,
			let match = devices.first(where: { $0.uniqueID == deviceId })
		{
			return match
		}
		if let deviceName = request.deviceName?.trimmingCharacters(in: .whitespacesAndNewlines),
			!deviceName.isEmpty,
			let match = devices.first(where: { $0.localizedName == deviceName })
		{
			return match
		}
		return AVCaptureDevice.default(for: .video) ?? devices.first
	}

	private func configureDevice(_ device: AVCaptureDevice) throws {
		let requestedFps = request.fps > 0 ? request.fps : 30
		outputFps = min(max(1, requestedFps), 30)

		let requestedWidth = request.width > 0 ? request.width : 1280
		let requestedHeight = request.height > 0 ? request.height : 720
		outputWidth = max(2, min(1280, requestedWidth))
		outputHeight = max(2, min(720, requestedHeight))
		outputWidth -= outputWidth % 2
		outputHeight -= outputHeight % 2

		try device.lockForConfiguration()
		device.activeVideoMinFrameDuration = CMTime(value: 1, timescale: CMTimeScale(outputFps))
		device.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: CMTimeScale(outputFps))
		device.unlockForConfiguration()
	}

	private func setupWriter() throws {
		let outputUrl = URL(fileURLWithPath: outputPath)
		try? FileManager.default.removeItem(at: outputUrl)
		try FileManager.default.createDirectory(
			at: outputUrl.deletingLastPathComponent(),
			withIntermediateDirectories: true
		)
		let writer = try AVAssetWriter(outputURL: outputUrl, fileType: .mp4)
		let settings: [String: Any] = [
			AVVideoCodecKey: AVVideoCodecType.h264,
			AVVideoWidthKey: outputWidth,
			AVVideoHeightKey: outputHeight,
			AVVideoCompressionPropertiesKey: [
				AVVideoAverageBitRateKey: 2_000_000,
				AVVideoExpectedSourceFrameRateKey: outputFps,
			],
		]
		let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
		input.expectsMediaDataInRealTime = true
		guard writer.canAdd(input) else {
			throw HelperError.writerSetupFailed("Unable to add webcam H.264 input.")
		}
		writer.add(input)
		self.writer = writer
		self.videoInput = input
	}

	private func retime(_ sampleBuffer: CMSampleBuffer, subtracting offset: CMTime) -> CMSampleBuffer? {
		var timing = CMSampleTimingInfo(
			duration: CMSampleBufferGetDuration(sampleBuffer),
			presentationTimeStamp: CMTimeSubtract(CMSampleBufferGetPresentationTimeStamp(sampleBuffer), offset),
			decodeTimeStamp: .invalid
		)
		var retimed: CMSampleBuffer?
		let status = CMSampleBufferCreateCopyWithNewTiming(
			allocator: kCFAllocatorDefault,
			sampleBuffer: sampleBuffer,
			sampleTimingEntryCount: 1,
			sampleTimingArray: &timing,
			sampleBufferOut: &retimed
		)
		return status == noErr ? retimed : sampleBuffer
	}
}

@main
struct OpenScreenScreenCaptureKitHelper {
	static func main() async {
		do {
			guard CommandLine.arguments.count == 2 else {
				throw HelperError.invalidArguments
			}

			guard #available(macOS 13.0, *) else {
				throw HelperError.unsupportedMacOS
			}

			let requestData = Data(CommandLine.arguments[1].utf8)
			let decoder = JSONDecoder()
			let request = try decoder.decode(RecordingRequest.self, from: requestData)
			let recorder = ScreenCaptureRecorder(request: request)
			let stopTask = Task.detached {
				while let line = readLine() {
					let command = line.trimmingCharacters(in: .whitespacesAndNewlines)
					switch command {
					case "pause":
						recorder.pause()
					case "resume":
						recorder.resume()
					case "stop":
						await recorder.stop()
						exit(0)
					default:
						break
					}
				}
			}

			try await recorder.start()
			await stopTask.value
		} catch let error as HelperError {
			emitError(code: "helper-error", message: error.description)
			exit(1)
		} catch {
			emitError(code: "helper-error", message: "\(error)")
			exit(1)
		}
	}
}
