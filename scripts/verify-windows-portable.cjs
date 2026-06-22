const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function usage() {
	console.error("Usage:");
	console.error("  node scripts/verify-windows-portable.cjs <portable-zip>");
	console.error("  node scripts/verify-windows-portable.cjs");
	process.exit(2);
}

const packageJson = require("../package.json");

if (process.argv.length > 3) {
	usage();
}

const zipPath = path.resolve(process.argv[2] ?? inferPortableZipPath());

if (!fs.existsSync(zipPath)) {
	console.error(`[Windows portable] Missing zip: ${zipPath}`);
	process.exit(1);
}

const listResult = spawnSync("unzip", ["-Z1", zipPath], {
	encoding: "utf8",
	maxBuffer: 64 * 1024 * 1024,
});

if (listResult.status !== 0) {
	console.error(listResult.stderr || listResult.stdout || "Failed to inspect portable zip.");
	process.exit(listResult.status || 1);
}

const entries = new Set(
	listResult.stdout
		.split(/\r?\n/)
		.map((entry) => entry.trim().replaceAll("\\", "/"))
		.filter(Boolean),
);

const requiredEntries = [
	"LikelySnap.exe",
	"resources/electron/native/bin/win32-x64/wgc-capture.exe",
	"resources/electron/native/bin/win32-x64/cursor-sampler.exe",
	"resources/electron/ffmpeg/win32-x64/ffmpeg.exe",
];

const missing = requiredEntries.filter((entry) => !entries.has(entry));
if (missing.length > 0) {
	console.error("[Windows portable] Missing required runtime files:");
	for (const entry of missing) {
		console.error(`  - ${entry}`);
	}
	process.exit(1);
}

console.log(`[Windows portable] OK: ${zipPath}`);
for (const entry of requiredEntries) {
	console.log(`  - ${entry}`);
}

function inferPortableZipPath() {
	const releaseDir = path.join("release", packageJson.version);
	if (!fs.existsSync(releaseDir)) {
		return path.join(releaseDir, `LikelySnap-Win-x64-${packageJson.version}.zip`);
	}

	const candidates = fs
		.readdirSync(releaseDir)
		.filter((entry) => entry.toLowerCase().endsWith(".zip"))
		.filter((entry) => /likelysnap/i.test(entry))
		.filter((entry) => /(win|windows|x64)/i.test(entry));

	if (candidates.length === 1) {
		return path.join(releaseDir, candidates[0]);
	}

	const fallbackCandidates = fs
		.readdirSync(releaseDir)
		.filter((entry) => entry.toLowerCase().endsWith(".zip"));
	if (fallbackCandidates.length === 1) {
		return path.join(releaseDir, fallbackCandidates[0]);
	}

	return path.join(releaseDir, `LikelySnap-Win-x64-${packageJson.version}.zip`);
}
