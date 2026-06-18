import {
	FolderOpen,
	Loader2,
	Monitor,
	RefreshCw,
	Settings,
	SlidersHorizontal,
	Trash2,
	Video,
	Volume2,
	Webcam,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import type {
	AppSettings,
	RecordingFrameRatePreset,
	RecordingQuality,
	RecordingResolutionMode,
} from "@/lib/appSettings";
import { RECORDING_QUALITY_LABELS } from "@/lib/appSettings";
import { saveUserPreferences } from "@/lib/userPreferences";

interface AppSettingsDialogProps {
	open: boolean;
	onClose: () => void;
	onRecordingDirectoryChanged?: (path: string) => void;
	embedded?: boolean;
}

const qualityDescriptions: Record<RecordingQuality, string> = {
	standard: "1080p / 30 FPS / 5 Mbps",
	high: "源分辨率 / 60 FPS / 8 Mbps",
	ultra: "源分辨率 / 60 FPS / 15 Mbps",
	custom: "手动设置分辨率 / FPS / Mbps",
};

const qualityPresets: Record<RecordingQuality, Partial<AppSettings>> = {
	standard: {
		recordingQuality: "standard",
		recordingResolutionMode: "1080p",
		recordingFrameRateMode: "preset",
		defaultFrameRate: 30,
		recordingBitrateMode: "preset",
	},
	high: {
		recordingQuality: "high",
		recordingResolutionMode: "source",
		recordingFrameRateMode: "preset",
		defaultFrameRate: 60,
		recordingBitrateMode: "preset",
	},
	ultra: {
		recordingQuality: "ultra",
		recordingResolutionMode: "source",
		recordingFrameRateMode: "preset",
		defaultFrameRate: 60,
		recordingBitrateMode: "preset",
	},
	custom: {
		recordingQuality: "custom",
		recordingResolutionMode: "source",
		recordingFrameRateMode: "preset",
		defaultFrameRate: 60,
		recordingBitrateMode: "custom",
	},
};

const resolutionOptions: Array<{ value: RecordingResolutionMode; label: string; hint: string }> = [
	{ value: "source", label: "源分辨率", hint: "按屏幕/窗口原始像素" },
	{ value: "1080p", label: "1080p", hint: "1920 x 1080" },
	{ value: "1440p", label: "1440p", hint: "2560 x 1440" },
	{ value: "4k", label: "4K", hint: "3840 x 2160" },
	{ value: "custom", label: "自定义", hint: "手动输入宽高" },
];

const frameRatePresets: RecordingFrameRatePreset[] = [24, 30, 60];

function classNames(...values: Array<string | false | null | undefined>) {
	return values.filter(Boolean).join(" ");
}

function formatBytes(bytes: number | undefined) {
	if (!bytes || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function PathRow({
	label,
	path,
	onPick,
	onReveal,
}: {
	label: string;
	path: string;
	onPick: () => void;
	onReveal: () => void;
}) {
	return (
		<div className="grid gap-1.5">
			<div className="text-[11px] font-medium text-white/70">{label}</div>
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/25 px-2.5 py-2 text-[11px] text-white/65">
					<div className="truncate">{path}</div>
				</div>
				<button
					type="button"
					onClick={onReveal}
					className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.045] text-white/65 transition hover:border-[#C24B72]/40 hover:bg-[#C24B72]/10 hover:text-white"
					title="在 Finder 中显示"
				>
					<FolderOpen size={14} />
				</button>
				<button
					type="button"
					onClick={onPick}
					className="h-8 rounded-md border border-white/10 bg-white/[0.045] px-3 text-[11px] font-semibold text-white/75 transition hover:border-[#C24B72]/40 hover:bg-[#C24B72]/10 hover:text-white"
				>
					更改
				</button>
			</div>
		</div>
	);
}

function ToggleRow({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
			<span className="min-w-0">
				<span className="block text-[11px] font-medium text-white/75">{label}</span>
				<span className="block text-[10px] text-white/42">{description}</span>
			</span>
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="h-4 w-4 accent-[#C24B72]"
			/>
		</label>
	);
}

function NumberInput({
	label,
	value,
	min,
	max,
	step = 1,
	suffix,
	disabled,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	disabled?: boolean;
	onChange: (value: number) => void;
}) {
	return (
		<label className="grid gap-1">
			<span className="text-[10px] font-medium text-white/50">{label}</span>
			<span className="flex h-8 items-center rounded-md border border-white/10 bg-black/25 px-2 text-white/72 focus-within:border-[#C24B72]/45">
				<input
					type="number"
					min={min}
					max={max}
					step={step}
					value={value}
					disabled={disabled}
					onChange={(event) => {
						if (!event.currentTarget.value) return;
						const nextValue = Number(event.currentTarget.value);
						if (Number.isFinite(nextValue)) {
							onChange(Math.min(max, Math.max(min, nextValue)));
						}
					}}
					className="min-w-0 flex-1 bg-transparent text-[11px] outline-none disabled:opacity-45"
				/>
				{suffix ? <span className="text-[10px] text-white/35">{suffix}</span> : null}
			</span>
		</label>
	);
}

export function AppSettingsDialog({
	open,
	onClose,
	onRecordingDirectoryChanged,
	embedded = false,
}: AppSettingsDialogProps) {
	const [settings, setSettings] = useState<AppSettings | null>(null);
	const [cacheSizeBytes, setCacheSizeBytes] = useState<number>(0);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!open) return;
		setLoading(true);
		setError(null);
		try {
			const [settingsResult, cacheResult] = await Promise.all([
				window.electronAPI.getAppSettings(),
				window.electronAPI.getCacheInfo(),
			]);
			if (!settingsResult.success || !settingsResult.settings) {
				throw new Error(settingsResult.error || "Failed to load settings");
			}
			setSettings(settingsResult.settings);
			if (cacheResult.success) {
				setCacheSizeBytes(cacheResult.sizeBytes ?? 0);
			}
		} catch (nextError) {
			setError(nextError instanceof Error ? nextError.message : String(nextError));
		} finally {
			setLoading(false);
		}
	}, [open]);

	useEffect(() => {
		void load();
	}, [load]);

	const savePartial = useCallback(
		async (partial: Partial<AppSettings>) => {
			if (!settings) return;
			const optimistic = { ...settings, ...partial };
			setSettings(optimistic);
			setSaving(true);
			setError(null);
			try {
				const result = await window.electronAPI.saveAppSettings(partial);
				if (!result.success || !result.settings) {
					throw new Error(result.error || "Failed to save settings");
				}
				setSettings(result.settings);
				if (partial.recordingDirectory) {
					onRecordingDirectoryChanged?.(result.settings.recordingDirectory);
				}
				if (partial.projectDirectory) {
					saveUserPreferences({ projectFolder: result.settings.projectDirectory });
				}
			} catch (nextError) {
				setSettings(settings);
				setError(nextError instanceof Error ? nextError.message : String(nextError));
			} finally {
				setSaving(false);
			}
		},
		[settings, onRecordingDirectoryChanged],
	);

	const pickDirectory = useCallback(
		async (kind: "recording" | "project" | "cache") => {
			setSaving(true);
			setError(null);
			try {
				const result = await window.electronAPI.pickAppSettingsDirectory(kind);
				if (result.canceled) return;
				if (!result.success || !result.settings) {
					throw new Error(result.error || "Failed to choose folder");
				}
				setSettings(result.settings);
				if (kind === "recording") {
					onRecordingDirectoryChanged?.(result.settings.recordingDirectory);
				}
				if (kind === "project") {
					saveUserPreferences({ projectFolder: result.settings.projectDirectory });
				}
				if (kind === "cache") {
					const cache = await window.electronAPI.getCacheInfo();
					if (cache.success) setCacheSizeBytes(cache.sizeBytes ?? 0);
				}
			} catch (nextError) {
				setError(nextError instanceof Error ? nextError.message : String(nextError));
			} finally {
				setSaving(false);
			}
		},
		[onRecordingDirectoryChanged],
	);

	const clearCache = useCallback(async () => {
		setSaving(true);
		setError(null);
		try {
			const result = await window.electronAPI.clearCache();
			if (!result.success) {
				throw new Error(result.error || "Failed to clear cache");
			}
			setCacheSizeBytes(result.sizeBytes ?? 0);
		} catch (nextError) {
			setError(nextError instanceof Error ? nextError.message : String(nextError));
		} finally {
			setSaving(false);
		}
	}, []);

	const disabled = loading || saving || !settings;
	const cacheLabel = useMemo(() => formatBytes(cacheSizeBytes), [cacheSizeBytes]);

	if (!open) return null;

	const panel = (
		<div
			className={
				embedded
					? "flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#08090c]"
					: "flex max-h-[calc(100vh-32px)] w-[min(720px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#08090c]/95 shadow-2xl shadow-black/55"
			}
		>
			<div
				className="flex items-center justify-between border-b border-white/10 px-4 py-3"
				style={{ WebkitAppRegion: "drag" } as CSSProperties}
			>
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C24B72]/35 bg-[#C24B72]/12 text-[#F2A8C2]">
						<Settings size={16} />
					</div>
					<div>
						<div className="text-sm font-semibold text-white/88">设置</div>
						<div className="text-[10px] text-white/42">录制、存储和缓存</div>
					</div>
				</div>
				<button
					type="button"
					onClick={() => {
						onClose();
					}}
					className="rounded-md px-2 py-1 text-xs text-white/55 transition hover:bg-white/10 hover:text-white"
					style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
				>
					关闭
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				{loading ? (
					<div className="flex h-52 items-center justify-center text-white/50">
						<Loader2 size={18} className="mr-2 animate-spin" />
						加载设置
					</div>
				) : settings ? (
					<div className="grid gap-4">
						<section className="grid gap-3">
							<div className="flex items-center gap-2 text-xs font-semibold text-white/82">
								<FolderOpen size={14} className="text-[#F2A8C2]" />
								存储位置
							</div>
							<PathRow
								label="录制视频存放位置"
								path={settings.recordingDirectory}
								onPick={() => void pickDirectory("recording")}
								onReveal={() => void window.electronAPI.revealInFolder(settings.recordingDirectory)}
							/>
							<PathRow
								label="项目文件默认位置"
								path={settings.projectDirectory}
								onPick={() => void pickDirectory("project")}
								onReveal={() => void window.electronAPI.revealInFolder(settings.projectDirectory)}
							/>
							<PathRow
								label="缓存存放位置"
								path={settings.cacheDirectory}
								onPick={() => void pickDirectory("cache")}
								onReveal={() => void window.electronAPI.revealInFolder(settings.cacheDirectory)}
							/>
						</section>

						<section className="grid gap-3">
							<div className="flex items-center gap-2 text-xs font-semibold text-white/82">
								<Video size={14} className="text-[#F2A8C2]" />
								录制默认值
							</div>
							<div className="grid grid-cols-4 gap-2">
								{(["standard", "high", "ultra", "custom"] as RecordingQuality[]).map((quality) => (
									<button
										key={quality}
										type="button"
										disabled={disabled}
										onClick={() => void savePartial(qualityPresets[quality])}
										className={`rounded-lg border px-3 py-2 text-left transition ${
											settings.recordingQuality === quality
												? "border-[#C24B72]/55 bg-[#C24B72]/16 text-white"
												: "border-white/10 bg-white/[0.035] text-white/65 hover:border-[#C24B72]/35 hover:bg-white/[0.06]"
										}`}
									>
										<div className="text-[11px] font-semibold">
											{RECORDING_QUALITY_LABELS[quality]}
										</div>
										<div className="mt-1 text-[9px] leading-snug text-white/42">
											{qualityDescriptions[quality]}
										</div>
									</button>
								))}
							</div>

							{(() => {
								const customMode = settings.recordingQuality === "custom";
								const advancedDisabled = disabled || !customMode;
								return (
									<>
										<div
											className={classNames(
												"grid gap-2 rounded-md border p-3 transition",
												customMode
													? "border-white/10 bg-white/[0.025]"
													: "border-white/[0.06] bg-white/[0.015] opacity-45",
											)}
										>
											<div className="flex items-center justify-between gap-3">
												<div className="flex items-center gap-2 text-[11px] font-semibold text-white/72">
													<Monitor size={13} className="text-[#F2A8C2]" />
													分辨率
												</div>
												{customMode ? null : (
													<div className="text-[9px] text-white/35">选择「自定义」后可修改</div>
												)}
											</div>
											<div className="grid grid-cols-5 gap-1.5">
												{resolutionOptions.map((option) => (
													<button
														key={option.value}
														type="button"
														disabled={advancedDisabled}
														onClick={() =>
															void savePartial({ recordingResolutionMode: option.value })
														}
														title={option.hint}
														className={`h-[46px] rounded-md border px-2 text-left transition disabled:pointer-events-none ${
															settings.recordingResolutionMode === option.value
																? "border-[#C24B72]/55 bg-[#C24B72]/16 text-white"
																: "border-white/10 bg-black/20 text-white/60 hover:border-[#C24B72]/35"
														}`}
													>
														<div className="text-[10px] font-semibold">{option.label}</div>
														<div className="truncate text-[8px] text-white/35">{option.hint}</div>
													</button>
												))}
											</div>
											{customMode && settings.recordingResolutionMode === "custom" ? (
												<div className="grid grid-cols-2 gap-2">
													<NumberInput
														label="宽度"
														value={settings.recordingCustomWidth}
														min={320}
														max={7680}
														disabled={advancedDisabled}
														onChange={(value) => void savePartial({ recordingCustomWidth: value })}
													/>
													<NumberInput
														label="高度"
														value={settings.recordingCustomHeight}
														min={240}
														max={4320}
														disabled={advancedDisabled}
														onChange={(value) => void savePartial({ recordingCustomHeight: value })}
													/>
												</div>
											) : null}
											<div className="text-[9px] leading-snug text-white/35">
												macOS 原生录制支持源分辨率和目标分辨率；Windows 原生录制当前保持 WGC
												源尺寸，码率和帧率会按这里执行。
											</div>
										</div>

										<div
											className={classNames(
												"grid gap-2 rounded-md border p-3 transition",
												customMode
													? "border-white/10 bg-white/[0.025]"
													: "border-white/[0.06] bg-white/[0.015] opacity-45",
											)}
										>
											<div className="flex items-center justify-between gap-3">
												<div className="flex items-center gap-2 text-[11px] font-semibold text-white/72">
													<SlidersHorizontal size={13} className="text-[#F2A8C2]" />
													帧率与码率
												</div>
												{customMode ? null : (
													<div className="text-[9px] text-white/35">当前使用所选预设</div>
												)}
											</div>
											<div className="flex flex-wrap gap-2">
												{frameRatePresets.map((fps) => (
													<button
														key={fps}
														type="button"
														disabled={advancedDisabled}
														onClick={() =>
															void savePartial({
																recordingFrameRateMode: "preset",
																defaultFrameRate: fps,
															})
														}
														className={`h-8 rounded-md border px-3 text-[11px] font-semibold transition disabled:pointer-events-none ${
															settings.recordingFrameRateMode === "preset" &&
															settings.defaultFrameRate === fps
																? "border-[#C24B72]/55 bg-[#C24B72]/16 text-white"
																: "border-white/10 bg-black/20 text-white/65 hover:border-[#C24B72]/35"
														}`}
													>
														{fps} FPS
													</button>
												))}
												<button
													type="button"
													disabled={advancedDisabled}
													onClick={() => void savePartial({ recordingFrameRateMode: "custom" })}
													className={`h-8 rounded-md border px-3 text-[11px] font-semibold transition disabled:pointer-events-none ${
														settings.recordingFrameRateMode === "custom"
															? "border-[#C24B72]/55 bg-[#C24B72]/16 text-white"
															: "border-white/10 bg-black/20 text-white/65 hover:border-[#C24B72]/35"
													}`}
												>
													自定义
												</button>
											</div>
											{customMode && settings.recordingFrameRateMode === "custom" ? (
												<NumberInput
													label="自定义帧率"
													value={settings.recordingCustomFrameRate}
													min={1}
													max={120}
													suffix="FPS"
													disabled={advancedDisabled}
													onChange={(value) =>
														void savePartial({ recordingCustomFrameRate: value })
													}
												/>
											) : null}
											<div className="grid gap-2">
												<div className="flex items-center justify-between gap-2">
													<div className="text-[10px] font-medium text-white/50">码率</div>
													<div className="text-[10px] text-white/38">最高 60 Mbps</div>
												</div>
												<div className="grid grid-cols-[1fr_96px] items-end gap-3">
													<label className="grid gap-1">
														<span className="text-[10px] font-medium text-white/50">
															自定义码率
														</span>
														<input
															type="range"
															min={1}
															max={60}
															step={0.5}
															value={settings.recordingCustomBitrateMbps}
															disabled={advancedDisabled}
															onChange={(event) =>
																void savePartial({
																	recordingCustomBitrateMbps: Number(event.currentTarget.value),
																})
															}
															className="h-8 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-[#C24B72] disabled:cursor-default [&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-[#C24B72] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#F2A8C2] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/10 [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F2A8C2]"
														/>
													</label>
													<NumberInput
														label="Mbps"
														value={settings.recordingCustomBitrateMbps}
														min={1}
														max={60}
														step={0.5}
														disabled={advancedDisabled}
														onChange={(value) =>
															void savePartial({ recordingCustomBitrateMbps: value })
														}
													/>
												</div>
											</div>
										</div>
									</>
								);
							})()}
							<ToggleRow
								label="默认启用 editable cursor"
								description="新录制默认生成可编辑鼠标轨迹"
								checked={settings.defaultEditableCursor}
								onChange={(checked) => void savePartial({ defaultEditableCursor: checked })}
							/>
							<ToggleRow
								label="默认启用麦克风"
								description="启动后 HUD 默认打开麦克风"
								checked={settings.defaultMicrophoneEnabled}
								onChange={(checked) => void savePartial({ defaultMicrophoneEnabled: checked })}
							/>
							<ToggleRow
								label="默认启用系统音"
								description="启动后 HUD 默认录制系统声音"
								checked={settings.defaultSystemAudioEnabled}
								onChange={(checked) => void savePartial({ defaultSystemAudioEnabled: checked })}
							/>
							<ToggleRow
								label="默认启用摄像头"
								description="启动后 HUD 默认打开摄像头录制"
								checked={settings.defaultWebcamEnabled}
								onChange={(checked) => void savePartial({ defaultWebcamEnabled: checked })}
							/>
						</section>

						<section className="grid gap-3">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-2 text-xs font-semibold text-white/82">
									<RefreshCw size={14} className="text-[#F2A8C2]" />
									缓存
								</div>
								<div className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] text-white/60">
									{cacheLabel}
								</div>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
								<div>
									<div className="text-[11px] font-medium text-white/75">清理缓存</div>
									<div className="text-[10px] text-white/42">
										删除波形、预览音频和临时缓存，不影响录制包和项目文件
									</div>
								</div>
								<button
									type="button"
									disabled={disabled}
									onClick={() => void clearCache()}
									className="flex h-8 items-center gap-1.5 rounded-md border border-red-400/25 bg-red-500/10 px-3 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/18 disabled:opacity-50"
								>
									<Trash2 size={13} />
									清理
								</button>
							</div>
						</section>

						<section className="grid gap-2">
							<div className="flex items-center gap-2 text-xs font-semibold text-white/82">
								<Volume2 size={14} className="text-[#F2A8C2]" />
								编辑器
							</div>
							<div className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] leading-relaxed text-white/48">
								音频波形现在默认开启，并使用分段读取与磁盘缓存；长视频首次生成后会复用缓存。
							</div>
							<div className="flex items-center gap-2 text-[10px] text-white/35">
								<Webcam size={12} />
								更多导出和代理媒体设置会放在这里继续扩展。
							</div>
						</section>
					</div>
				) : null}

				{error ? (
					<div className="mt-4 rounded-md border border-red-400/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-100">
						{error}
					</div>
				) : null}
			</div>
		</div>
	);

	if (embedded) {
		return panel;
	}

	return (
		<div
			className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			{panel}
		</div>
	);
}
