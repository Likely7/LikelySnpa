# LikelySnap

基于 OpenScreen 1.5.0 版本改造而来。

LikelySnap 是一个面向长录制场景重新改造的桌面录屏与视频编辑工具。它保留了 OpenScreen 原有的录屏、编辑、缩放、摄像头叠加、鼠标效果、字幕与导出等基础能力，并重点重构了长录制、原生录制、项目包、摄像头 sidecar、鼠标轨迹、设置中心和编辑器加载性能。

## 为什么改造

OpenScreen 原项目更适合短录制和轻量编辑。在真实使用中，如果录制时间变长，尤其是同时开启屏幕、麦克风、系统音、摄像头、鼠标轨迹和自动缩放时，原有实现会暴露出几个明显问题：

- 录制数据和 sidecar 文件容易在停止录制或打开编辑器时进入大块内存处理流程。
- 长视频的摄像头文件可能非常大，编辑器打开时容易卡死或直接无法操作。
- 项目文件、主视频、摄像头、鼠标轨迹和 manifest 的组织方式不够适合移动、恢复和长期保存。
- 自动 zoom 和鼠标跟随逻辑容易造成画面抖动，缺少逐段控制能力。
- Windows 摄像头 sidecar 与屏幕时间线之间缺少持久化 offset，后续预览和导出存在同步风险。
- 设置项不够集中，录制目录、缓存目录、项目目录、质量和默认输入开关需要更明确地落地为真实配置。

LikelySnap 的目标不是简单改名，而是把这套工具往“更适合长录制、更容易恢复、更可验证”的方向推进。

## 主要改造

### 原生录制链路

macOS 录制主链路已经迁移到 ScreenCaptureKit 原生 helper。Windows x64 录制链路使用 Windows Graphics Capture helper。

新的原生录制链路会持续写入磁盘，而不是等录制结束后再把大文件整体堆进内存处理。主视频、摄像头 sidecar、鼠标轨迹和 manifest 都会在录制期间逐步写入或更新。

### `.likelysnap` 录制包

新的录制结果会保存为一个 `.likelysnap` 包目录。典型结构如下：

```text
recording-xxxx.likelysnap/
  screen.mp4
  webcam.mp4
  cursor.json
  manifest.json
```

这样做的目的，是让一次录制所需的媒体文件和元数据保持在同一个用户可见的项目包里。包内 manifest 使用相对路径，因此移动整个 `.likelysnap` 包后仍然可以重新打开。

如果 `manifest.json` 丢失，应用也会尝试根据包内文件恢复一个可打开的项目状态。

### 摄像头 sidecar

macOS 和 Windows 原生录制会优先生成 `webcam.mp4` sidecar。相比浏览器 MediaRecorder 产生的大体积 WebM，原生 MP4 sidecar 更适合长录制。

编辑器打开项目时，不会再把巨大的摄像头 sidecar 整体读入内存。对于过大或不健康的旧 sidecar，编辑器可以跳过摄像头文件，优先保证主屏幕视频可以打开和编辑。

### Windows 摄像头同步

Windows WGC helper 现在会记录摄像头 sidecar 第一帧相对屏幕时间线的偏移，并写入 `manifest.json`：

```json
{
  "media": {
    "webcamStartOffsetMs": 123
  }
}
```

编辑器预览、MP4 导出和 GIF 导出都会读取这个 offset，避免 Windows 摄像头画面与主屏幕视频时间线错位。

### 鼠标轨迹与 zoom

LikelySnap 将自动 zoom 的“片段选择”和“是否跟随鼠标”拆开处理：

- 普通停留和讲解默认生成稳定的固定位置 zoom。
- 按住鼠标按钮讲解时，可以自动生成更适合跟随鼠标的 zoom。
- 每一个 zoom 片段都可以单独设置是否跟随鼠标。
- UI 文案改为“跟随鼠标”，避免使用不直观的“对焦模式”。

这个设计可以减少自动跟随带来的画面抖动，同时保留需要时精确跟随鼠标的能力。

### 长视频波形

音频波形默认显示，但生成方式已经改为更适合长视频的懒加载和缓存方案。

本地媒体会通过有限范围读取、增量解析和峰值缓存生成波形。第一次打开长视频时需要生成缓存，后续再次打开会复用缓存，减少重复等待。

### 设置中心

应用现在提供独立的设置窗口，可以从启动界面和编辑器进入。设置项包括：

- 录制视频存放位置
- 项目文件存放位置
- 缓存存放位置
- 当前缓存大小
- 清理缓存
- 录制质量
- 帧率
- 默认是否开启麦克风
- 默认是否开启系统音
- 默认是否开启摄像头
- 默认是否使用 editable cursor

这些设置会持久化，并影响后续录制和编辑行为。

## 当前能力

LikelySnap 当前支持：

- 屏幕录制和窗口录制
- 麦克风录制
- 系统音录制
- 摄像头录制
- 可编辑鼠标轨迹
- 自动 zoom 建议
- 单个 zoom 片段的跟随鼠标开关
- `.likelysnap` 包打开、移动后打开、缺失 manifest 恢复
- 长视频波形懒加载与缓存
- 视频剪辑、裁剪、变速、背景、注释、模糊、字幕等编辑能力
- MP4 和 GIF 导出
- macOS 原生录制
- Windows x64 原生录制

## 长录制说明

LikelySnap 已经针对长录制做了磁盘写入、包结构、sidecar、波形和编辑器加载方面的优化。

如果录制时间较长，例如 30 分钟、1 小时或更久，打开编辑器时仍然可能需要等待一段时间。根据文件大小和机器性能，首次加载可能需要约 30 秒到 1 分钟。

这段等待通常用于读取媒体信息、准备预览、解析项目包、同步摄像头 offset，以及生成或读取音频波形缓存。

重点是：长录制不再应该像原 OpenScreen 那样因为把大文件放进内存处理而直接崩溃。加载可能需要时间，但目标是保持可恢复、可打开、可继续编辑。

## macOS

macOS 使用 ScreenCaptureKit 原生 helper。

默认录制目录：

```text
~/Movies/LikelySnap
```

需要授予以下权限：

- 屏幕录制
- 麦克风
- 摄像头
- 辅助功能权限

## Windows

Windows 当前只支持 x64。

Windows 原生录制依赖两个 helper：

```text
electron/native/bin/win32-x64/wgc-capture.exe
electron/native/bin/win32-x64/cursor-sampler.exe
```

如果这两个文件没有构建并打入包内，Windows native 录制不可用。

构建 Windows x64 免安装包：

```bash
npm run build:win:portable
```

Windows 全链路测试：

```bash
npm run test:wgc-full:win
```

建议真实验证时开启：

- 屏幕或窗口录制
- 摄像头
- 麦克风
- 系统音
- editable cursor

录制结束后检查 `.likelysnap/manifest.json`。如果存在 `webcam.mp4`，应同时存在 `media.webcamStartOffsetMs`。

## 开发

安装依赖：

```bash
npm install
```

启动开发：

```bash
npm run dev
```

类型检查：

```bash
npx tsc --noEmit
```

关键测试：

```bash
npm test -- src/lib/nativeWindowsRecording.test.ts electron/ipc/recordingPackage.test.ts src/components/video-editor/projectPersistence.test.ts
```

macOS 构建：

```bash
npm run build:mac
```

Windows x64 免安装包：

```bash
npm run build:win:portable
```

## 当前边界

- 超长录制打开编辑器时仍然需要等待媒体准备完成。
- 多小时 MP4 导出仍需要继续做流式/临时文件级别的加固。
- Windows 包必须在 Windows x64 环境中构建和验证。
- macOS native helper 构建建议使用完整 Xcode 环境。
- LikelySnap 只使用 `.likelysnap` 项目包。

## License

MIT License. See [LICENSE](./LICENSE).

