import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const promoDir = path.join(root, "promo", "github-10s");
const html = path.join(promoDir, "index.html");
const keyframesDir = path.join(promoDir, "keyframes");
const framesDir = path.join(promoDir, ".frames");
const mp4 = path.join(promoDir, "LikelySnap-github-promo.mp4");
const silentMp4 = path.join(promoDir, ".LikelySnap-github-promo-silent.mp4");
const gif = path.join(promoDir, "LikelySnap-github-promo.gif");
const poster = path.join(promoDir, "poster.png");
const skillAssets = path.join(root, "..", ".agents", "skills", "huashu-design", "assets");

const width = 1920;
const height = 1080;
const fps = 30;
const duration = 10;
const totalFrames = fps * duration;
const url = `file://${html}`;

fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(keyframesDir, { recursive: true });

const waitRaf = (page, count = 2) =>
	page.evaluate(
		(n) =>
			new Promise((resolve) => {
				let i = 0;
				const step = () => {
					i += 1;
					if (i >= n) resolve();
					else requestAnimationFrame(step);
				};
				requestAnimationFrame(step);
			}),
		count,
	);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
	viewport: { width, height },
	deviceScaleFactor: 1,
});
await context.addInitScript(() => {
	window.__recording = true;
	window.__seekRender = true;
});
const page = await context.newPage();
await page.goto(url, { waitUntil: "load", timeout: 60_000 });
await page.waitForFunction(() => window.__ready === true && typeof window.__seek === "function", {
	timeout: 10_000,
});

const capture = async (time, outPath) => {
	await page.evaluate((t) => window.__seek(t), time);
	await waitRaf(page, 2);
	await page.screenshot({
		path: outPath,
		clip: { x: 0, y: 0, width, height },
	});
};

for (const time of [0.4, 1.4, 2.6, 3.8, 5.8, 7.8, 9.5]) {
	await capture(time, path.join(keyframesDir, `t-${String(time).replace(".", "_")}.png`));
}
await capture(9.5, poster);

for (let frame = 0; frame < totalFrames; frame += 1) {
	const time = frame / fps;
	await capture(time, path.join(framesDir, `frame-${String(frame).padStart(6, "0")}.png`));
	if (frame % 30 === 0) {
		console.log(`Captured ${frame}/${totalFrames}`);
	}
}

await browser.close();

execFileSync(
	"ffmpeg",
	[
		"-y",
		"-framerate",
		String(fps),
		"-i",
		path.join(framesDir, "frame-%06d.png"),
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-crf",
		"18",
		"-preset",
		"medium",
		"-r",
		String(fps),
		"-movflags",
		"+faststart",
		silentMp4,
	],
	{ stdio: "inherit" },
);

const audioAssets = {
	bgm: path.join(skillAssets, "bgm-tech.mp3"),
	logo: path.join(skillAssets, "sfx", "impact", "logo-reveal-v2.mp3"),
	tick: path.join(skillAssets, "sfx", "progress", "loading-tick.mp3"),
	snap: path.join(skillAssets, "sfx", "container", "card-snap.mp3"),
	focus: path.join(skillAssets, "sfx", "ui", "focus.mp3"),
};

if (Object.values(audioAssets).every((file) => fs.existsSync(file))) {
	const sfx = path.join(framesDir, "sfx-track.mp3");
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-i",
			audioAssets.logo,
			"-i",
			audioAssets.tick,
			"-i",
			audioAssets.snap,
			"-i",
			audioAssets.focus,
			"-i",
			audioAssets.logo,
			"-filter_complex",
			[
				"[0:a]adelay=120|120,volume=0.48[a0]",
				"[1:a]adelay=1500|1500,volume=0.55[a1]",
				"[1:a]adelay=1880|1880,volume=0.45[a2]",
				"[1:a]adelay=2260|2260,volume=0.45[a3]",
				"[2:a]adelay=3300|3300,volume=0.38[a4]",
				"[3:a]adelay=5600|5600,volume=0.48[a5]",
				"[2:a]adelay=7600|7600,volume=0.36[a6]",
				"[4:a]adelay=9020|9020,volume=0.42[a7]",
				"[a0][a1][a2][a3][a4][a5][a6][a7]amix=inputs=8:duration=longest:normalize=0[mixed]",
			].join(";"),
			"-map",
			"[mixed]",
			"-t",
			String(duration),
			sfx,
		],
		{ stdio: "inherit" },
	);
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-i",
			silentMp4,
			"-i",
			sfx,
			"-i",
			audioAssets.bgm,
			"-filter_complex",
			`[2:a]atrim=0:${duration},afade=in:st=0:d=0.25,afade=out:st=8.6:d=1.4,lowpass=f=4000,volume=0.23[bgm];[1:a]highpass=f=800,volume=0.86[sfx];[bgm][sfx]amix=inputs=2:duration=first:normalize=0[a]`,
			"-map",
			"0:v",
			"-map",
			"[a]",
			"-c:v",
			"copy",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-movflags",
			"+faststart",
			"-shortest",
			mp4,
		],
		{ stdio: "inherit" },
	);
	fs.rmSync(silentMp4, { force: true });
} else {
	fs.renameSync(silentMp4, mp4);
	console.warn("Audio assets were not found; exported a silent MP4.");
}

const palette = path.join(framesDir, "palette.png");
execFileSync(
	"ffmpeg",
	[
		"-y",
		"-i",
		mp4,
		"-vf",
		"fps=15,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff",
		palette,
	],
	{ stdio: "inherit" },
);
execFileSync(
	"ffmpeg",
	[
		"-y",
		"-i",
		mp4,
		"-i",
		palette,
		"-filter_complex",
		"fps=15,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
		gif,
	],
	{ stdio: "inherit" },
);

fs.rmSync(framesDir, { recursive: true, force: true });

const size = (file) => `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB`;
console.log(`MP4: ${mp4} (${size(mp4)})`);
console.log(`GIF: ${gif} (${size(gif)})`);
console.log(`Poster: ${poster}`);
