import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	MACOS_TCC_BUNDLE_IDS_TO_RESET,
	MACOS_TCC_SERVICES_TO_RESET,
	runMacosFirstLaunchPermissionReset,
	type TccResetBundleId,
	type TccResetService,
} from "./macosPermissionReset";

const tempDirs: string[] = [];

async function makeTempDir() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "likelysnap-permission-reset-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("runMacosFirstLaunchPermissionReset", () => {
	it("does not run outside packaged macOS", async () => {
		const calls: Array<[TccResetService, TccResetBundleId]> = [];
		const userDataDir = await makeTempDir();

		const nonMac = await runMacosFirstLaunchPermissionReset({
			platform: "win32",
			isPackaged: true,
			appVersion: "1.1.0",
			userDataDir,
			runTccReset: async (service, bundleId) => {
				calls.push([service, bundleId]);
			},
		});

		const devMac = await runMacosFirstLaunchPermissionReset({
			platform: "darwin",
			isPackaged: false,
			appVersion: "1.1.0",
			userDataDir,
			runTccReset: async (service, bundleId) => {
				calls.push([service, bundleId]);
			},
		});

		expect(nonMac.reason).toBe("not-macos");
		expect(devMac.reason).toBe("not-packaged");
		expect(calls).toHaveLength(0);
	});

	it("runs once for the packaged macOS app build", async () => {
		const calls: Array<[TccResetService, TccResetBundleId]> = [];
		const userDataDir = await makeTempDir();

		const first = await runMacosFirstLaunchPermissionReset({
			platform: "darwin",
			isPackaged: true,
			appVersion: "1.1.0",
			appBuildId: "cdhash-aaa",
			userDataDir,
			now: () => new Date("2026-06-22T10:00:00.000Z"),
			runTccReset: async (service, bundleId) => {
				calls.push([service, bundleId]);
			},
		});

		const second = await runMacosFirstLaunchPermissionReset({
			platform: "darwin",
			isPackaged: true,
			appVersion: "1.1.0",
			appBuildId: "cdhash-aaa",
			userDataDir,
			runTccReset: async (service, bundleId) => {
				calls.push([service, bundleId]);
			},
		});

		expect(first.reason).toBe("reset");
		expect(first.ran).toBe(true);
		expect(second.reason).toBe("already-reset");
		expect(second.ran).toBe(false);
		expect(calls).toHaveLength(
			MACOS_TCC_SERVICES_TO_RESET.length * MACOS_TCC_BUNDLE_IDS_TO_RESET.length,
		);

		const marker = JSON.parse(await fs.readFile(first.markerPath, "utf8"));
		expect(marker.resetVersions["1.1.0+cdhash-aaa"]).toMatchObject({
			resetAt: "2026-06-22T10:00:00.000Z",
			services: MACOS_TCC_SERVICES_TO_RESET,
			bundleIds: MACOS_TCC_BUNDLE_IDS_TO_RESET,
		});
	});

	it("runs again for a later packaged app version", async () => {
		const calls: Array<[TccResetService, TccResetBundleId]> = [];
		const userDataDir = await makeTempDir();

		for (const version of ["1.1.0", "1.1.1"]) {
			await runMacosFirstLaunchPermissionReset({
				platform: "darwin",
				isPackaged: true,
				appVersion: version,
				userDataDir,
				runTccReset: async (service, bundleId) => {
					calls.push([service, bundleId]);
				},
			});
		}

		expect(calls).toHaveLength(
			MACOS_TCC_SERVICES_TO_RESET.length * MACOS_TCC_BUNDLE_IDS_TO_RESET.length * 2,
		);
	});

	it("runs again when the packaged build changes under the same app version", async () => {
		const calls: Array<[TccResetService, TccResetBundleId]> = [];
		const userDataDir = await makeTempDir();

		for (const buildId of ["cdhash-aaa", "cdhash-bbb"]) {
			await runMacosFirstLaunchPermissionReset({
				platform: "darwin",
				isPackaged: true,
				appVersion: "1.1.0",
				appBuildId: buildId,
				userDataDir,
				runTccReset: async (service, bundleId) => {
					calls.push([service, bundleId]);
				},
			});
		}

		expect(calls).toHaveLength(
			MACOS_TCC_SERVICES_TO_RESET.length * MACOS_TCC_BUNDLE_IDS_TO_RESET.length * 2,
		);
	});
});
