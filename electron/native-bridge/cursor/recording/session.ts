import type { CursorRecordingData } from "../../../../src/native/contracts";

export type CursorRecordingUpdate = (data: CursorRecordingData) => void;

export interface CursorRecordingSession {
	start(): Promise<void>;
	stop(): Promise<CursorRecordingData>;
}
