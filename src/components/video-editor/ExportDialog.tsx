import { Download, Film, Loader2, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type ExportProgress,
	type ExportQuality,
	type ExportSettings,
	MP4_EXPORT_BITRATE_LIMITS,
	type Mp4ExportConfig,
	type Mp4ExportMode,
	type Mp4ExportSettings,
	normalizeCustomMp4ExportSettings,
} from "@/lib/exporter";

const MP4_PRESET_ORDER: ExportQuality[] = ["medium", "good", "source"];

function bitrateToMbps(bitrate: number) {
	return Math.round((bitrate / 1_000_000) * 10) / 10;
}

function numberDraft(value: number) {
	return String(Math.round(value));
}

interface ExportDialogProps {
	isOpen: boolean;
	onClose: () => void;
	initialSettings: ExportSettings | null;
	mp4Presets?: Record<ExportQuality, Mp4ExportSettings>;
	sourceLabel?: string;
	onStartExport: (settings: ExportSettings) => void;
	progress: ExportProgress | null;
	isExporting: boolean;
	isCancelling?: boolean;
	error: string | null;
	onCancel?: () => void;
	exportFormat?: "mp4" | "gif";
	exportedFilePath?: string;
	onShowInFolder?: () => void;
}

export function ExportDialog({
	isOpen,
	onClose,
	initialSettings,
	mp4Presets,
	sourceLabel,
	onStartExport,
	progress,
	isExporting,
	isCancelling = false,
	error,
	onCancel,
	exportFormat = "mp4",
	exportedFilePath,
	onShowInFolder,
}: ExportDialogProps) {
	const t = useScopedT("dialogs");
	const [showSuccess, setShowSuccess] = useState(false);
	const [mp4Mode, setMp4Mode] = useState<Mp4ExportMode>("good");
	const [customWidth, setCustomWidth] = useState("");
	const [customHeight, setCustomHeight] = useState("");
	const [customBitrateMbps, setCustomBitrateMbps] = useState("");

	const defaultMp4Settings = useMemo(() => {
		const mode =
			initialSettings?.mp4Config?.mode && initialSettings.mp4Config.mode !== "custom"
				? initialSettings.mp4Config.mode
				: initialSettings?.quality || "good";
		return mp4Presets?.[mode];
	}, [initialSettings, mp4Presets]);

	useEffect(() => {
		if (isExporting) {
			setShowSuccess(false);
		}
	}, [isExporting]);

	// Reset when the dialog opens fresh (not mid-export).
	useEffect(() => {
		if (isOpen && !isExporting && !progress) {
			setShowSuccess(false);
		}
	}, [isOpen, isExporting, progress]);

	useEffect(() => {
		if (!isOpen || isExporting) return;
		const initialMp4 = initialSettings?.mp4Config;
		const initialMode = initialMp4?.mode || initialSettings?.quality || "good";
		const preset = initialMode === "custom" ? defaultMp4Settings : mp4Presets?.[initialMode];
		const customBase = initialMp4 || preset || defaultMp4Settings;
		setMp4Mode(initialMode);
		setCustomWidth(customBase ? numberDraft(customBase.width) : "");
		setCustomHeight(customBase ? numberDraft(customBase.height) : "");
		setCustomBitrateMbps(customBase ? String(bitrateToMbps(customBase.bitrate)) : "");
	}, [defaultMp4Settings, initialSettings, isExporting, isOpen, mp4Presets]);

	useEffect(() => {
		if (!isExporting && progress && progress.percentage >= 100 && !error) {
			setShowSuccess(true);
			const timer = setTimeout(() => {
				setShowSuccess(false);
				onClose();
			}, 2000);
			return () => clearTimeout(timer);
		}
	}, [isExporting, progress, error, onClose]);

	if (!isOpen) return null;

	const formatLabel = exportFormat === "gif" ? "GIF" : "Video";
	const isSettingsMode = !isExporting && !progress && !showSuccess;
	const selectedPreset = mp4Mode !== "custom" ? mp4Presets?.[mp4Mode] : undefined;
	const normalizedCustomMp4 = normalizeCustomMp4ExportSettings({
		width: Number(customWidth) || defaultMp4Settings?.width || 1920,
		height: Number(customHeight) || defaultMp4Settings?.height || 1080,
		bitrate:
			(Number(customBitrateMbps) || bitrateToMbps(defaultMp4Settings?.bitrate || 8_000_000)) *
			1_000_000,
	});
	const selectedMp4Settings = selectedPreset || normalizedCustomMp4;
	const isCustomMp4 = exportFormat === "mp4" && mp4Mode === "custom";

	// Compiling phase: frames are done but the export is still finishing.
	const isCompiling =
		isExporting && progress && progress.percentage >= 100 && exportFormat === "gif";
	const isFinalizing = progress?.phase === "finalizing";
	const renderProgress = progress?.renderProgress;

	const getStatusMessage = () => {
		if (error) return t("export.tryAgain");
		if (isCompiling || isFinalizing) {
			if (exportFormat === "mp4") {
				return t("export.finalizingVideo");
			}
			if (renderProgress !== undefined && renderProgress > 0) {
				return t("export.compilingGifProgress", { progress: String(renderProgress) });
			}
			return t("export.compilingGifWait");
		}
		return t("export.takeMoment");
	};

	const getTitle = () => {
		if (error) return t("export.failed");
		if (isSettingsMode) return t("export.format");
		if (isFinalizing && exportFormat === "mp4") return t("export.finalizingVideoTitle");
		if (isCompiling || isFinalizing) return t("export.compilingGif");
		return t("export.exportingFormat", { format: formatLabel });
	};

	const getMp4ModeLabel = (mode: Mp4ExportMode) => {
		if (mode === "medium") return t("export.standardPreset");
		if (mode === "good") return t("export.highPreset");
		if (mode === "source") return t("export.ultraPreset");
		return t("export.customPreset");
	};

	const handleStartExport = () => {
		if (!initialSettings) return;
		if (initialSettings.format === "gif") {
			onStartExport(initialSettings);
			return;
		}

		const mp4Config: Mp4ExportConfig =
			mp4Mode === "custom"
				? {
						mode: "custom",
						...selectedMp4Settings,
					}
				: {
						mode: mp4Mode,
						...(mp4Presets?.[mp4Mode] || selectedMp4Settings),
					};
		onStartExport({
			...initialSettings,
			quality: mp4Mode === "custom" ? initialSettings.quality : mp4Mode,
			mp4Config,
		});
	};

	return (
		<>
			<div
				className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 animate-in fade-in duration-200"
				onClick={isExporting ? undefined : onClose}
			/>
			<div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] bg-[#09090b] rounded-2xl shadow-2xl border border-white/10 p-8 w-[90vw] max-w-lg animate-in zoom-in-95 duration-200">
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-4">
						{showSuccess ? (
							<>
								<div className="w-12 h-12 rounded-full bg-[#C24B72]/20 flex items-center justify-center ring-1 ring-[#C24B72]/50">
									<Download className="w-6 h-6 text-[#C24B72]" />
								</div>
								<div className="flex flex-col gap-2">
									<span className="text-xl font-bold text-slate-200 block">
										{t("export.complete")}
									</span>
									<span className="text-sm text-slate-400">
										{t("export.yourFormatReady", { format: formatLabel.toLowerCase() })}
									</span>
									{exportedFilePath && (
										<Button
											variant="secondary"
											onClick={onShowInFolder}
											className="mt-2 w-fit px-3 py-1 text-sm rounded-md bg-white/10 hover:bg-white/20 text-slate-200"
										>
											{t("export.showInFolder")}
										</Button>
									)}
									{exportedFilePath && (
										<span className="text-xs text-slate-500 break-all max-w-xs mt-1">
											{exportedFilePath.split("/").pop()}
										</span>
									)}
								</div>
							</>
						) : (
							<>
								{isExporting ? (
									<div className="w-12 h-12 rounded-full bg-[#C24B72]/10 flex items-center justify-center">
										<Loader2 className="w-6 h-6 text-[#C24B72] animate-spin" />
									</div>
								) : isSettingsMode ? (
									<div className="w-12 h-12 rounded-full bg-[#C24B72]/10 flex items-center justify-center border border-[#C24B72]/25">
										<SlidersHorizontal className="w-6 h-6 text-[#C24B72]" />
									</div>
								) : (
									<div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
										<Download className="w-6 h-6 text-slate-200" />
									</div>
								)}
								<div>
									<span className="text-xl font-bold text-slate-200 block">{getTitle()}</span>
									<span className="text-sm text-slate-400">
										{isSettingsMode ? t("export.configureDescription") : getStatusMessage()}
									</span>
								</div>
							</>
						)}
					</div>
					{!isExporting && (
						<Button
							variant="ghost"
							size="icon"
							onClick={onClose}
							className="hover:bg-white/10 text-slate-400 hover:text-white rounded-full"
						>
							<X className="w-5 h-5" />
						</Button>
					)}
				</div>

				{isSettingsMode && initialSettings && (
					<div className="space-y-5">
						{initialSettings.format === "mp4" && (
							<>
								<div className="grid grid-cols-4 gap-2">
									{MP4_PRESET_ORDER.map((preset) => {
										const settings = mp4Presets?.[preset];
										const active = mp4Mode === preset;
										return (
											<button
												key={preset}
												type="button"
												onClick={() => setMp4Mode(preset)}
												className={`min-h-[74px] rounded-xl border px-3 py-2 text-left transition-all ${
													active
														? "border-[#C24B72]/70 bg-[#C24B72]/15 text-white"
														: "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"
												}`}
											>
												<span className="block text-sm font-semibold">
													{getMp4ModeLabel(preset)}
												</span>
												<span className="mt-1 block text-[11px] leading-snug">
													{settings
														? `${settings.width}x${settings.height}`
														: t("export.recommended")}
												</span>
												<span className="block text-[11px] leading-snug">
													{settings ? `${bitrateToMbps(settings.bitrate)} Mbps` : ""}
												</span>
											</button>
										);
									})}
									<button
										type="button"
										onClick={() => setMp4Mode("custom")}
										className={`min-h-[74px] rounded-xl border px-3 py-2 text-left transition-all ${
											mp4Mode === "custom"
												? "border-[#C24B72]/70 bg-[#C24B72]/15 text-white"
												: "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"
										}`}
									>
										<span className="block text-sm font-semibold">{getMp4ModeLabel("custom")}</span>
										<span className="mt-1 block text-[11px] leading-snug">
											{t("export.resolution")}
										</span>
										<span className="block text-[11px] leading-snug">{t("export.bitrate")}</span>
									</button>
								</div>

								<div
									className={`rounded-xl border p-4 transition-all ${
										isCustomMp4
											? "border-[#C24B72]/35 bg-[#C24B72]/10"
											: "border-white/10 bg-white/[0.03] opacity-60"
									}`}
								>
									<div className="mb-3 flex items-center justify-between">
										<div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
											<Film className="h-4 w-4 text-[#C24B72]" />
											{t("export.customMp4")}
										</div>
										<div className="text-xs text-slate-500">{sourceLabel}</div>
									</div>
									<div className="grid grid-cols-3 gap-3">
										<label className="space-y-1.5">
											<span className="text-[11px] font-medium text-slate-400">
												{t("export.width")}
											</span>
											<Input
												type="number"
												inputMode="numeric"
												min={320}
												max={7680}
												step={2}
												disabled={!isCustomMp4}
												value={customWidth}
												onChange={(event) => setCustomWidth(event.target.value)}
												className="h-10 border-white/10 bg-black/30 text-slate-100 focus-visible:ring-[#C24B72]/50"
											/>
										</label>
										<label className="space-y-1.5">
											<span className="text-[11px] font-medium text-slate-400">
												{t("export.height")}
											</span>
											<Input
												type="number"
												inputMode="numeric"
												min={180}
												max={4320}
												step={2}
												disabled={!isCustomMp4}
												value={customHeight}
												onChange={(event) => setCustomHeight(event.target.value)}
												className="h-10 border-white/10 bg-black/30 text-slate-100 focus-visible:ring-[#C24B72]/50"
											/>
										</label>
										<label className="space-y-1.5">
											<span className="text-[11px] font-medium text-slate-400">Mbps</span>
											<Input
												type="number"
												inputMode="decimal"
												min={MP4_EXPORT_BITRATE_LIMITS.minMbps}
												max={MP4_EXPORT_BITRATE_LIMITS.maxMbps}
												step={0.5}
												disabled={!isCustomMp4}
												value={customBitrateMbps}
												onChange={(event) => setCustomBitrateMbps(event.target.value)}
												className="h-10 border-white/10 bg-black/30 text-slate-100 focus-visible:ring-[#C24B72]/50"
											/>
										</label>
									</div>
									<div className="mt-3 text-xs text-slate-500">
										{t("export.exportingDetails", {
											width: selectedMp4Settings.width,
											height: selectedMp4Settings.height,
											bitrate: bitrateToMbps(selectedMp4Settings.bitrate),
											maxBitrate: MP4_EXPORT_BITRATE_LIMITS.maxMbps,
										})}
									</div>
								</div>
							</>
						)}

						{initialSettings.format === "gif" && initialSettings.gifConfig && (
							<div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
								<div className="text-sm font-semibold text-slate-200">{t("export.gifExport")}</div>
								<div className="mt-3 grid grid-cols-3 gap-3 text-sm">
									<div className="rounded-lg bg-black/25 p-3">
										<div className="text-[10px] uppercase text-slate-500">{t("export.size")}</div>
										<div className="mt-1 text-slate-200">
											{initialSettings.gifConfig.width}x{initialSettings.gifConfig.height}
										</div>
									</div>
									<div className="rounded-lg bg-black/25 p-3">
										<div className="text-[10px] uppercase text-slate-500">{t("export.fps")}</div>
										<div className="mt-1 text-slate-200">{initialSettings.gifConfig.frameRate}</div>
									</div>
									<div className="rounded-lg bg-black/25 p-3">
										<div className="text-[10px] uppercase text-slate-500">{t("export.loop")}</div>
										<div className="mt-1 text-slate-200">
											{initialSettings.gifConfig.loop ? t("export.on") : t("export.off")}
										</div>
									</div>
								</div>
							</div>
						)}

						<div className="flex gap-3 pt-1">
							<Button
								type="button"
								variant="secondary"
								onClick={onClose}
								className="flex-1 rounded-xl border border-white/10 bg-white/5 py-6 text-slate-200 hover:bg-white/10"
							>
								{t("export.cancel")}
							</Button>
							<Button
								type="button"
								onClick={handleStartExport}
								className="flex-1 rounded-xl bg-[#C24B72] py-6 text-white hover:bg-[#D65D82]"
							>
								<Download className="mr-2 h-4 w-4" />
								{t("export.startExport")}
							</Button>
						</div>
					</div>
				)}

				{error && (
					<div className="mb-6 animate-in slide-in-from-top-2">
						<div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
							<div className="p-1 bg-red-500/20 rounded-full">
								<X className="w-3 h-3 text-red-400" />
							</div>
							<p className="whitespace-pre-wrap break-words text-sm text-red-400 leading-relaxed">
								{error}
							</p>
						</div>
					</div>
				)}

				{isExporting && progress && (
					<div className="space-y-6">
						<div className="space-y-2">
							<div className="flex justify-between text-xs font-medium text-slate-400 uppercase tracking-wider">
								<span>
									{isCompiling || isFinalizing
										? t("export.compiling")
										: t("export.renderingFrames")}
								</span>
								<span className="font-mono text-slate-200">
									{isCompiling || isFinalizing ? (
										renderProgress !== undefined && renderProgress > 0 ? (
											`${renderProgress}%`
										) : (
											<span className="flex items-center gap-2">
												<Loader2 className="w-3 h-3 animate-spin" />
												{t("export.processing")}
											</span>
										)
									) : (
										`${progress.percentage.toFixed(0)}%`
									)}
								</span>
							</div>
							<div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
								{isCompiling || isFinalizing ? (
									// Real progress if we have it, otherwise an indeterminate bar.
									renderProgress !== undefined && renderProgress > 0 ? (
										<div
											className="h-full bg-[#C24B72] shadow-[0_0_10px_rgba(52,178,123,0.3)] transition-all duration-300 ease-out"
											style={{ width: `${renderProgress}%` }}
										/>
									) : (
										<div className="h-full w-full relative overflow-hidden">
											<div
												className="absolute h-full w-1/3 bg-[#C24B72] shadow-[0_0_10px_rgba(52,178,123,0.3)]"
												style={{
													animation: "indeterminate 1.5s ease-in-out infinite",
												}}
											/>
											<style>{`
                        @keyframes indeterminate {
                          0% { transform: translateX(-100%); }
                          100% { transform: translateX(400%); }
                        }
                      `}</style>
										</div>
									)
								) : (
									<div
										className="h-full bg-[#C24B72] shadow-[0_0_10px_rgba(52,178,123,0.3)] transition-all duration-300 ease-out"
										style={{ width: `${Math.min(progress.percentage, 100)}%` }}
									/>
								)}
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="bg-white/5 rounded-xl p-3 border border-white/5">
								<div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
									{isCompiling || isFinalizing ? t("export.status") : t("export.format")}
								</div>
								<div className="text-slate-200 font-medium text-sm">
									{isFinalizing && exportFormat === "mp4"
										? t("export.finalizing")
										: isCompiling || isFinalizing
											? t("export.compilingStatus")
											: formatLabel}
								</div>
							</div>
							<div className="bg-white/5 rounded-xl p-3 border border-white/5">
								<div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
									{t("export.frames")}
								</div>
								<div className="text-slate-200 font-medium text-sm">
									{progress.currentFrame} / {progress.totalFrames}
								</div>
							</div>
						</div>

						{onCancel && (
							<div className="pt-2">
								<Button
									onClick={onCancel}
									disabled={isCancelling}
									variant="destructive"
									className="w-full py-6 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all rounded-xl"
								>
									{t("export.cancelExport")}
								</Button>
							</div>
						)}
					</div>
				)}

				{showSuccess && (
					<div className="text-center py-4 animate-in zoom-in-95">
						<p className="text-lg text-slate-200 font-medium">
							{t("export.savedSuccessfully", { format: formatLabel })}
						</p>
					</div>
				)}
			</div>
		</>
	);
}
