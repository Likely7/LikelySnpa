import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.resolve(process.argv[2] ?? path.join(repoRoot, "icons/source/logo.png"));
const pngDir = path.join(repoRoot, "icons/icons/png");
const macIconPath = path.join(repoRoot, "icons/icons/mac/icon.icns");
const winIconPath = path.join(repoRoot, "icons/icons/win/icon.ico");
const publicIconPaths = [path.join(repoRoot, "public/likelysnap.png")];

const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const iconsetSizes = [
	{ file: "icon_16x16.png", size: 16 },
	{ file: "icon_16x16@2x.png", size: 32 },
	{ file: "icon_32x32.png", size: 32 },
	{ file: "icon_32x32@2x.png", size: 64 },
	{ file: "icon_128x128.png", size: 128 },
	{ file: "icon_128x128@2x.png", size: 256 },
	{ file: "icon_256x256.png", size: 256 },
	{ file: "icon_256x256@2x.png", size: 512 },
	{ file: "icon_512x512.png", size: 512 },
	{ file: "icon_512x512@2x.png", size: 1024 },
];

function svgRoundRectMask(size, radius) {
	return Buffer.from(
		`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
	);
}

async function renderRoundedPng(size) {
	const radius = Math.round(size * 0.22);
	const resized = await sharp(sourcePath)
		.resize(size, size, { fit: "cover", position: "center", kernel: sharp.kernel.lanczos3 })
		.ensureAlpha()
		.png()
		.toBuffer();

	return sharp(resized)
		.composite([{ input: svgRoundRectMask(size, radius), blend: "dest-in" }])
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
}

function writeUInt16LE(value) {
	const buffer = Buffer.alloc(2);
	buffer.writeUInt16LE(value, 0);
	return buffer;
}

function writeUInt32LE(value) {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32LE(value, 0);
	return buffer;
}

function encodeIcoDirectoryEntry(size, bytes, offset) {
	return Buffer.concat([
		Buffer.from([size >= 256 ? 0 : size, size >= 256 ? 0 : size, 0, 0]),
		writeUInt16LE(1),
		writeUInt16LE(32),
		writeUInt32LE(bytes.length),
		writeUInt32LE(offset),
	]);
}

async function writeIco(outputPath) {
	const images = await Promise.all(
		icoSizes.map(async (size) => ({
			size,
			bytes: await renderRoundedPng(size),
		})),
	);
	const header = Buffer.concat([writeUInt16LE(0), writeUInt16LE(1), writeUInt16LE(images.length)]);
	let offset = header.length + images.length * 16;
	const entries = [];

	for (const image of images) {
		entries.push(encodeIcoDirectoryEntry(image.size, image.bytes, offset));
		offset += image.bytes.length;
	}

	await writeFile(
		outputPath,
		Buffer.concat([header, ...entries, ...images.map((image) => image.bytes)]),
	);
}

async function assertSourceIsSquare() {
	const sourceStat = await stat(sourcePath).catch(() => null);
	if (!sourceStat?.isFile()) {
		throw new Error(`Logo source does not exist: ${sourcePath}`);
	}

	const metadata = await sharp(sourcePath).metadata();
	if (!metadata.width || !metadata.height) {
		throw new Error(`Could not read image dimensions: ${sourcePath}`);
	}
	if (metadata.width !== metadata.height) {
		throw new Error(`Logo source must be square; got ${metadata.width}x${metadata.height}`);
	}
}

async function main() {
	await assertSourceIsSquare();
	await mkdir(pngDir, { recursive: true });
	await mkdir(path.dirname(macIconPath), { recursive: true });
	await mkdir(path.dirname(winIconPath), { recursive: true });

	for (const size of pngSizes) {
		await writeFile(path.join(pngDir, `${size}x${size}.png`), await renderRoundedPng(size));
	}

	const publicPng = await renderRoundedPng(1024);
	for (const publicPath of publicIconPaths) {
		await writeFile(publicPath, publicPng);
	}

	await writeIco(winIconPath);

	const iconsetDir = path.join(repoRoot, "icons/icons/mac/icon.iconset");
	await rm(iconsetDir, { recursive: true, force: true });
	await mkdir(iconsetDir, { recursive: true });
	for (const icon of iconsetSizes) {
		await writeFile(path.join(iconsetDir, icon.file), await renderRoundedPng(icon.size));
	}

	await execFileAsync("iconutil", ["-c", "icns", iconsetDir, "-o", macIconPath]);
	await rm(iconsetDir, { recursive: true, force: true });

	const generated = [
		...pngSizes.map((size) => path.relative(repoRoot, path.join(pngDir, `${size}x${size}.png`))),
		...publicIconPaths.map((publicPath) => path.relative(repoRoot, publicPath)),
		path.relative(repoRoot, macIconPath),
		path.relative(repoRoot, winIconPath),
	];

	console.log(
		`Generated ${generated.length} icon assets from ${path.relative(repoRoot, sourcePath)}:`,
	);
	for (const file of generated.sort()) {
		console.log(`- ${file}`);
	}

	const leftovers = await readdir(path.join(repoRoot, "icons/icons/mac"));
	if (leftovers.includes("icon.iconset")) {
		throw new Error("Temporary icon.iconset was not removed.");
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
