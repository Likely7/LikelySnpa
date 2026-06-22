import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MACOS_PERMISSION_RESET_MARKER = "macos-permission-reset.json";
export const MACOS_PERMISSION_RESET_SCHEMA_VERSION = 1;

export const MACOS_TCC_SERVICES_TO_RESET = [
	"ScreenCapture",
	"Microphone",
	"Camera",
	"Accessibility",
] as const;

export const MACOS_TCC_BUNDLE_IDS_TO_RESET = [
	"com.likelysnap.app",
	"com.likelysnap.app.helper",
	"com.likelysnap.app.helper.Renderer",
	"com.likelysnap.app.helper.GPU",
	"com.likelysnap.app.helper.Plugin",
	"com.siddharthvaddem.openscreen",
	"com.siddharthvaddem.openscreen.helper",
	"com.siddharthvaddem.openscreen.helper.Renderer",
] as const;

export type TccResetService = (typeof MACOS_TCC_SERVICES_TO_RESET)[number];
export type TccResetBundleId = (typeof MACOS_TCC_BUNDLE_IDS_TO_RESET)[number];

type PermissionResetMarker = {
	schemaVersion: number;
	resetVersions: Record<
		string,
		{
			resetAt: string;
			services: readonly string[];
			bundleIds: readonly string[];
			errors?: readonly string[];
		}
	>;
};

type RunTccReset = (service: TccResetService, bundleId: TccResetBundleId) => Promise<void>;

export type MacosFirstLaunchPermissionResetOptions = {
	platform: NodeJS.Platform;
	isPackaged: boolean;
	appVersion: string;
	appBuildId?: string | null;
	userDataDir: string;
	runTccReset?: RunTccReset;
	now?: () => Date;
	logger?: Pick<Console, "info" | "warn">;
};

export type MacosFirstLaunchPermissionResetResult = {
	ran: boolean;
	reason: "not-macos" | "not-packaged" | "already-reset" | "reset";
	errors: string[];
	markerPath: string;
};

export async function runMacosFirstLaunchPermissionReset({
	platform,
	isPackaged,
	appVersion,
	appBuildId,
	userDataDir,
	runTccReset = defaultRunTccReset,
	now = () => new Date(),
	logger = console,
}: MacosFirstLaunchPermissionResetOptions): Promise<MacosFirstLaunchPermissionResetResult> {
	const markerPath = getMacosPermissionResetMarkerPath(userDataDir);

	if (platform !== "darwin") {
		return { ran: false, reason: "not-macos", errors: [], markerPath };
	}

	if (!isPackaged) {
		return { ran: false, reason: "not-packaged", errors: [], markerPath };
	}

	const marker = await readPermissionResetMarker(markerPath);
	const versionKey = normalizeVersionKey(appVersion, appBuildId);
	if (marker.resetVersions[versionKey]) {
		return { ran: false, reason: "already-reset", errors: [], markerPath };
	}

	logger.info(
		`[macos-permissions] Resetting LikelySnap TCC grants for packaged first launch of ${versionKey}.`,
	);

	const errors: string[] = [];
	for (const service of MACOS_TCC_SERVICES_TO_RESET) {
		for (const bundleId of MACOS_TCC_BUNDLE_IDS_TO_RESET) {
			try {
				await runTccReset(service, bundleId);
			} catch (error) {
				const message = `${service}/${bundleId}: ${error instanceof Error ? error.message : String(error)}`;
				errors.push(message);
				logger.warn(`[macos-permissions] tccutil reset failed: ${message}`);
			}
		}
	}

	marker.resetVersions[versionKey] = {
		resetAt: now().toISOString(),
		services: MACOS_TCC_SERVICES_TO_RESET,
		bundleIds: MACOS_TCC_BUNDLE_IDS_TO_RESET,
		...(errors.length > 0 ? { errors } : {}),
	};

	await writePermissionResetMarker(markerPath, marker);
	return { ran: true, reason: "reset", errors, markerPath };
}

export function getMacosPermissionResetMarkerPath(userDataDir: string): string {
	return path.join(userDataDir, MACOS_PERMISSION_RESET_MARKER);
}

function normalizeVersionKey(appVersion: string, appBuildId?: string | null): string {
	const normalized = appVersion.trim();
	const version = normalized.length > 0 ? normalized : "unknown";
	const buildId = appBuildId?.trim();
	return buildId ? `${version}+${buildId}` : version;
}

async function defaultRunTccReset(service: TccResetService, bundleId: TccResetBundleId) {
	await execFileAsync("tccutil", ["reset", service, bundleId], {
		timeout: 10_000,
	});
}

async function readPermissionResetMarker(markerPath: string): Promise<PermissionResetMarker> {
	try {
		const raw = await fs.readFile(markerPath, "utf8");
		const parsed = JSON.parse(raw) as Partial<PermissionResetMarker>;
		if (
			parsed &&
			parsed.schemaVersion === MACOS_PERMISSION_RESET_SCHEMA_VERSION &&
			parsed.resetVersions &&
			typeof parsed.resetVersions === "object"
		) {
			return {
				schemaVersion: MACOS_PERMISSION_RESET_SCHEMA_VERSION,
				resetVersions: parsed.resetVersions,
			};
		}
	} catch {
		// Missing or malformed marker: treat as first launch for this release.
	}

	return {
		schemaVersion: MACOS_PERMISSION_RESET_SCHEMA_VERSION,
		resetVersions: {},
	};
}

async function writePermissionResetMarker(
	markerPath: string,
	marker: PermissionResetMarker,
): Promise<void> {
	await fs.mkdir(path.dirname(markerPath), { recursive: true });
	await fs.writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}
