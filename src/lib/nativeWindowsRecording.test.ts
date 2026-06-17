import { describe, expect, it } from "vitest";
import {
	parseNativeWindowsHelperEvents,
	readNativeWindowsRecordingStoppedInfo,
	readNativeWindowsWebcamFormatFromOutput,
} from "./nativeWindowsRecording";

describe("nativeWindowsRecording helper output parsing", () => {
	it("reads webcam format JSON events", () => {
		const output = [
			"warmup line",
			'{"event":"webcam-format","schemaVersion":2,"width":1280,"height":720,"fps":30,"deviceName":"Camera"}',
		].join("\n");

		expect(readNativeWindowsWebcamFormatFromOutput(output)).toEqual({
			width: 1280,
			height: 720,
			fps: 30,
			deviceName: "Camera",
		});
	});

	it("reads stopped screen, webcam, and timeline offset JSON events", () => {
		const output = [
			'{"event":"ready","schemaVersion":2}',
			'{"event":"recording-stopped","schemaVersion":2,"screenPath":"C:\\\\Users\\\\me\\\\screen.mp4","webcamPath":"C:\\\\Users\\\\me\\\\webcam.mp4","webcamStartOffsetMs":533.4}',
			"Recording stopped. Output path: C:\\Users\\me\\screen.mp4",
		].join("\r\n");

		expect(readNativeWindowsRecordingStoppedInfo(output)).toEqual({
			screenPath: "C:\\Users\\me\\screen.mp4",
			webcamPath: "C:\\Users\\me\\webcam.mp4",
			webcamStartOffsetMs: 533.4,
		});
	});

	it("ignores non-JSON helper output while preserving JSON events", () => {
		const output = [
			"Recording started",
			'{"event":"recording-started","schemaVersion":2}',
			"Recording stopped. Output path: C:\\Users\\me\\screen.mp4",
		].join("\n");

		expect(parseNativeWindowsHelperEvents(output)).toEqual([
			{ event: "recording-started", schemaVersion: 2 },
		]);
	});
});
