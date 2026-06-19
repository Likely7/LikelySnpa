const fs = require("node:fs");
const path = require("node:path");

function usage() {
	console.error("Usage:");
	console.error("  node scripts/verify-ffmpeg-runtime.cjs <platform> <arch>");
	console.error("  node scripts/verify-ffmpeg-runtime.cjs <resources-dir> <platform> <arch>");
	console.error(
		"Example: node scripts/verify-ffmpeg-runtime.cjs release/1.1.0/win-unpacked/resources win32 x64",
	);
	process.exit(2);
}

const args = process.argv.slice(2);
if (args.length !== 2 && args.length !== 3) {
	usage();
}

const packageJson = require("../package.json");
const [resourcesDirArg, platform, arch] =
	args.length === 2 ? [inferResourcesDir(args[0], args[1]), args[0], args[1]] : args;
const binaryName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const resourcesDir = path.resolve(resourcesDirArg);
const binaryPath = path.join(resourcesDir, "electron", "ffmpeg", `${platform}-${arch}`, binaryName);

if (!fs.existsSync(binaryPath)) {
	console.error(`[FFmpeg] Missing packaged runtime binary: ${binaryPath}`);
	process.exit(1);
}

const stat = fs.statSync(binaryPath);
if (!stat.isFile() || stat.size <= 0) {
	console.error(`[FFmpeg] Packaged runtime binary is invalid: ${binaryPath}`);
	process.exit(1);
}

console.log(`[FFmpeg] Packaged runtime binary OK: ${binaryPath} (${stat.size} bytes)`);

function inferResourcesDir(platform, arch) {
	const version = packageJson.version;
	if (platform === "win32") {
		return path.join("release", version, "win-unpacked", "resources");
	}
	if (platform === "darwin") {
		return path.join(
			"release",
			version,
			`mac-${arch}`,
			"LikelySnap.app",
			"Contents",
			"Resources",
		);
	}
	throw new Error(`Cannot infer packaged resources directory for ${platform}-${arch}`);
}
