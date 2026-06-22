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

const entries = readZipCentralDirectoryEntries(zipPath);

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

const forbiddenPatterns = [
	{
		label: "duplicate @ffmpeg-installer binaries inside app.asar.unpacked",
		pattern:
			/(^|\/)resources\/app\.asar\.unpacked\/node_modules\/@ffmpeg-installer\/.*\/ffmpeg(?:\.exe)?$/i,
	},
	{
		label: "non-Windows onnxruntime-node binaries",
		pattern:
			/(^|\/)resources\/app\.asar\.unpacked\/node_modules\/onnxruntime-node\/bin\/napi-v3\/(?:darwin|linux)\//i,
	},
	{
		label: "non-x64 Windows onnxruntime-node binaries",
		pattern:
			/(^|\/)resources\/app\.asar\.unpacked\/node_modules\/onnxruntime-node\/bin\/napi-v3\/win32\/(?!x64\/).+/i,
	},
];

const forbidden = [];
for (const entry of entries) {
	for (const rule of forbiddenPatterns) {
		if (rule.pattern.test(entry)) {
			forbidden.push({ entry, label: rule.label });
			break;
		}
	}
}

if (forbidden.length > 0) {
	console.error("[Windows portable] Forbidden packaged runtime files found:");
	for (const item of forbidden.slice(0, 30)) {
		console.error(`  - ${item.entry} (${item.label})`);
	}
	if (forbidden.length > 30) {
		console.error(`  ...and ${forbidden.length - 30} more`);
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

function readZipCentralDirectoryEntries(filePath) {
	const fd = fs.openSync(filePath, "r");
	try {
		const stat = fs.fstatSync(fd);
		const maxCommentBytes = 0xffff;
		const eocdMinBytes = 22;
		const searchBytes = Math.min(stat.size, maxCommentBytes + eocdMinBytes);
		const searchBuffer = Buffer.alloc(searchBytes);
		fs.readSync(fd, searchBuffer, 0, searchBytes, stat.size - searchBytes);

		const eocdOffsetInBuffer = findEndOfCentralDirectory(searchBuffer);
		if (eocdOffsetInBuffer < 0) {
			throw new Error("End of central directory record was not found.");
		}

		const eocd = searchBuffer.subarray(eocdOffsetInBuffer);
		const totalEntries = eocd.readUInt16LE(10);
		const centralDirectorySize = eocd.readUInt32LE(12);
		const centralDirectoryOffset = eocd.readUInt32LE(16);

		if (centralDirectoryOffset + centralDirectorySize > stat.size) {
			throw new Error("Central directory points outside the zip file.");
		}

		const directoryBuffer = Buffer.alloc(centralDirectorySize);
		fs.readSync(fd, directoryBuffer, 0, centralDirectorySize, centralDirectoryOffset);

		const entries = new Set();
		let offset = 0;
		for (let index = 0; index < totalEntries; index += 1) {
			if (offset + 46 > directoryBuffer.length) {
				throw new Error("Central directory ended before all entries were read.");
			}
			if (directoryBuffer.readUInt32LE(offset) !== 0x02014b50) {
				throw new Error(`Invalid central directory header at byte ${offset}.`);
			}

			const nameLength = directoryBuffer.readUInt16LE(offset + 28);
			const extraLength = directoryBuffer.readUInt16LE(offset + 30);
			const commentLength = directoryBuffer.readUInt16LE(offset + 32);
			const nameStart = offset + 46;
			const nameEnd = nameStart + nameLength;
			if (nameEnd > directoryBuffer.length) {
				throw new Error("Central directory entry name exceeds zip bounds.");
			}

			const name = directoryBuffer
				.subarray(nameStart, nameEnd)
				.toString("utf8")
				.replaceAll("\\", "/")
				.replace(/^\.\//, "");
			if (name) {
				entries.add(name);
			}
			offset = nameEnd + extraLength + commentLength;
		}

		return entries;
	} catch (error) {
		console.error(`[Windows portable] Failed to inspect zip: ${error.message}`);
		process.exit(1);
	} finally {
		fs.closeSync(fd);
	}
}

function findEndOfCentralDirectory(buffer) {
	for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
		if (buffer.readUInt32LE(offset) === 0x06054b50) {
			return offset;
		}
	}
	return -1;
}
