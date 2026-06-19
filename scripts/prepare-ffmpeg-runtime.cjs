const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.join(__dirname, "..");
const RUNTIME_ROOT = path.join(PROJECT_ROOT, "electron", "ffmpeg-runtime");
const ELECTRON_BUILDER_ARCH = {
	0: "ia32",
	1: "x64",
	2: "armv7l",
	3: "arm64",
	4: "universal",
};

function normalizeArch(arch = process.arch) {
	if (typeof arch === "number") {
		return ELECTRON_BUILDER_ARCH[arch] ?? process.arch;
	}
	return String(arch);
}

function ffmpegBinaryName(platform = process.platform) {
	return platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function platformDir(platform = process.platform, arch = process.arch) {
	return `${platform}-${normalizeArch(arch)}`;
}

function resolveInstallerBinary(platform = process.platform, arch = process.arch) {
	const normalizedArch = normalizeArch(arch);
	const binaryName = ffmpegBinaryName(platform);
	const packageName = `@ffmpeg-installer/${platformDir(platform, normalizedArch)}`;

	try {
		const packageJsonPath = require.resolve(`${packageName}/package.json`, {
			paths: [PROJECT_ROOT],
		});
		const packageDir = path.dirname(packageJsonPath);
		const binaryPath = path.join(packageDir, binaryName);
		if (fs.existsSync(binaryPath)) {
			return binaryPath;
		}
	} catch {
		// Fall back to the umbrella package below. This keeps local macOS builds working
		// even if npm flattens optional dependencies differently.
	}

	if (platform === process.platform && normalizedArch === process.arch) {
		try {
			const installer = require("@ffmpeg-installer/ffmpeg");
			if (installer?.path && fs.existsSync(installer.path)) {
				return installer.path;
			}
		} catch {
			// Handled by the final error.
		}
	}

	throw new Error(
		`Could not find ${packageName}/${binaryName}. Run npm install on the target build machine before packaging.`,
	);
}

function prepareFfmpegRuntime(platform = process.platform, arch = process.arch) {
	const normalizedArch = normalizeArch(arch);
	const sourcePath = resolveInstallerBinary(platform, normalizedArch);
	const targetDir = path.join(RUNTIME_ROOT, platformDir(platform, normalizedArch));
	const targetPath = path.join(targetDir, ffmpegBinaryName(platform));

	fs.rmSync(targetDir, { recursive: true, force: true });
	fs.mkdirSync(targetDir, { recursive: true });
	fs.copyFileSync(sourcePath, targetPath);

	if (platform !== "win32") {
		fs.chmodSync(targetPath, 0o755);
	}

	console.log(`[FFmpeg] Prepared runtime binary: ${targetPath}`);
	return targetPath;
}

module.exports = {
	prepareFfmpegRuntime,
	resolveInstallerBinary,
};
