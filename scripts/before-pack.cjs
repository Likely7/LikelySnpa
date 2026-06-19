// electron-builder beforePack hook: ensure the auto-caption assets (Whisper model + ORT wasm) exist
// before packaging, so the `caption-assets` extraResources entry has something to copy. Runs on
// every package invocation (local `npm run build:*` and CI's bare `electron-builder`). The fetch
// script is idempotent, so it's a no-op once the assets are present.

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { prepareFfmpegRuntime } = require("./prepare-ffmpeg-runtime.cjs");

exports.default = async function beforePack(context) {
	execFileSync("node", [path.join(__dirname, "fetch-caption-model.mjs")], {
		stdio: "inherit",
		cwd: path.join(__dirname, ".."),
	});

	prepareFfmpegRuntime(context?.electronPlatformName ?? process.platform, context?.arch ?? process.arch);
};
