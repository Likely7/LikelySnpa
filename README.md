# LikelySnap

基于 OpenScreen 1.5.0 版本改造而来。

对，就是那个看起来已经能录屏、能剪辑、能导出，但你一旦开始认真录长视频，它就开始在内存里原地做法的项目。LikelySnap 不是换个 logo、改个颜色、在 README 里摆个 pose 就宣布登基。我们是真的把它从“短视频玩具”往“能给人干活的录制工具”方向拽了一把。

原来的问题很典型。

短录制的时候，它像个乖孩子。录几分钟，剪一剪，导一导，表面上岁月静好。可你一旦录十几分钟、半小时、甚至更久，它就开始暴露出一种非常原始的生存策略：把太多东西堆进内存里，像一个把全家行李塞进裤兜的二货旅行者。屏幕、摄像头、波形、项目数据、各种 sidecar，能进内存的都想进内存。然后系统任务管理器看着它，沉默。用户看着它，也沉默。

这不是“偶发卡顿”。

这是架构在挠屁股。

LikelySnap 这轮改造的核心，就是把这只挠屁股的猴子从树上拎下来，告诉它：录像这种事，不要靠玄学，不要靠侥幸，不要靠“反正用户应该不会录很久吧”。用户真的会录很久。用户会录 17 分钟，会录半小时，会录 5 小时。用户会开麦克风、开系统音、开摄像头、开 editable cursor，还会一边移动鼠标一边触发 zoom。用户不是测试用例，用户是墨菲定律本律，穿着拖鞋来敲门。

所以我们重做了最关键的录制链路。

## 我们修了什么

### 1. 录制不再靠内存硬扛

新的录制目标是：能写磁盘的东西，就别在内存里装大爷。

macOS 主链路已经走 ScreenCaptureKit 原生 helper。主视频写成 `screen.mp4`，摄像头 sidecar 写成 `webcam.mp4`，鼠标轨迹写成 `cursor.json`，项目状态写进 `manifest.json`。这些文件在录制过程中持续写入或更新，不再等停止录制时把一整坨数据从内存里掏出来，然后祈祷系统别当场翻白眼。

Windows 也接上了原生 Windows Graphics Capture 链路。Windows x64 会通过 WGC helper 写 `screen.mp4`，摄像头走独立 `webcam.mp4`，麦克风和系统音走 WASAPI，鼠标信息走独立采样。不是摆设，不是 UI 上画个按钮假装自己很努力。

一句话：录制这件事，从“端着一盆水过马路”改成了“铺管道”。

### 2. `.likelysnap` 包变成真正的录制容器

现在新录制会生成一个用户可见的 `.likelysnap` 包。

里面一般长这样：

```text
recording-xxxx.likelysnap/
  screen.mp4
  webcam.mp4
  cursor.json
  manifest.json
```

这不是为了装高级。

这是为了让录制结果像一个真正的项目，而不是一堆散落在桌面上的香蕉皮。主视频、摄像头、鼠标轨迹、manifest 都放在一起。你移动整个 `.likelysnap` 包，它依然应该知道自己是谁、从哪里来、要往哪里去。忒修斯之船看到这里都得点头：行，这船至少没把桨扔用户脸上。

### 3. 摄像头 sidecar 不再随便爆炸

原来一个长录制的摄像头文件，可能非常快乐地膨胀到几 GB，然后编辑器打开时试图整文件处理。结果就是：用户只是想剪视频，软件却像要参加举重比赛。

现在 macOS 和 Windows 的原生录制都尽量走 native `webcam.mp4` sidecar。编辑器打开项目时，不会再把巨大 webcam sidecar 当成一口能吞下的饭。太大的旧 WebM sidecar 会被跳过，主屏幕视频仍然能打开。你可以没有摄像头画面，但不能因为一个摄像头文件把整个项目拖进泥潭。

这叫优雅降级。

俗称：别因为一根筷子断了，就把整桌饭掀了。

### 4. Windows 摄像头同步补上了

Windows 这边之前有一个很隐蔽但很要命的问题：摄像头 sidecar 写出来了，但它相对屏幕时间线的起点偏移没有被持久化。也就是说，`webcam.mp4` 是有了，但它什么时候开始对齐 `screen.mp4`，软件心里没完全有谱。

现在 WGC helper 会记录摄像头 sidecar 第一帧相对屏幕时间线的位置，并写入：

```json
{
  "media": {
    "webcamStartOffsetMs": 123
  }
}
```

编辑器预览和导出都会使用这个 offset。摄像头不再像一个迟到但不打卡的同事，突然闯进时间线说“我到了，你们自己猜我几点来的”。

### 5. 鼠标、zoom、Follow Mouse 重新梳理了

自动 zoom 不是简单粗暴地“鼠标在哪我就冲哪”。那样画面会变成癫痫级监控录像，观众看完只想给屏幕做心理咨询。

现在的逻辑更像人一点：

- 普通停留、普通讲解，默认生成稳定的固定位置 zoom
- 用户按住鼠标讲解某个区域时，可以生成 Follow Mouse 倾向的 zoom
- 每一个 zoom 片段都可以单独设置是否跟随鼠标
- “跟随鼠标”不再被翻译成奇怪的“对焦模式”

也就是说，自动化负责先铺路，用户保留方向盘。宇宙熵增可以继续熵增，但画面别跟着发疯。

### 6. 长视频波形改成懒加载和缓存

长视频打开时，音频波形如果一上来就全量生成，就像刚进门就让用户背圆周率十万位。理论上很努力，实际上很缺德。

现在波形走 ranged read、增量解析和缓存。默认仍然显示波形，但第一次打开长视频时，会按更克制的方式生成，后面再打开会复用缓存。它还是会干活，但不再像刚毕业的实习生一样把 CPU 当 KTV 麦克风狂吼。

### 7. 设置中心变成真的设置

现在设置不是摆拍。

你可以配置：

- 录制视频存放位置
- 项目文件存放位置
- 缓存存放位置
- 清理缓存
- 查看缓存大小
- 录制质量
- 帧率
- 默认是否开启麦克风
- 默认是否开启系统音
- 默认是否开启摄像头
- 默认是否使用 editable cursor

而且设置窗口是独立 Electron 窗口，不再塞进透明 HUD 里玩 hit-test 抽象艺术。之前那种按钮点不动、下面半截看不见的状态，属于 UI 层面的柏拉图洞穴。现在先从洞里出来。

## 现在能做到什么

LikelySnap 现在的目标不是“做一个看起来像录屏软件的软件”。

它现在能做这些：

- 录屏幕或窗口
- 录麦克风
- 录系统音
- 录摄像头
- 录可编辑鼠标轨迹
- 自动生成 zoom 片段
- 单独设置每个 zoom 是否跟随鼠标
- 打开 `.likelysnap` 包继续编辑
- 移动 `.likelysnap` 包后继续打开
- 缺少 `manifest.json` 时从包内文件恢复
- 长录制时持续写磁盘，降低内存爆炸概率
- 在编辑器中处理长视频，不再一上来整文件吞内存
- 导出 MP4 或 GIF

这不是说它已经成仙。

它只是终于不像以前那样，录个长视频就把自己当烟花放了。

## 关于长录制，先把丑话说前面

如果你录得很长，比如半小时、一小时、甚至更久，打开编辑器时可能需要等一会儿。

大概 30 秒到 1 分钟。

这不是软件死了，也不是它在厨房偷吃。它在加载视频、准备媒体、读取包信息、建立波形缓存、同步摄像头和时间线。长视频就是长视频，物理世界不会因为我们在 README 里写得很拽就突然变成量子硬盘。

重点是：它不应该再像原来的 OpenScreen 那样，把大文件塞进内存里然后直接爆炸。

以前是“等等看，也许它醒了，也许它寄了”。

现在应该是“等等，它在干活”。

这两个状态看起来都像沉默，但本质差很多。一个是西西弗斯推石头，一个是任务管理器在挠头。

## Windows 说明

Windows 目前只支持 x64。

要打 Windows 免安装包，在 Windows x64 机器上跑：

```bash
npm run build:win:portable
```

构建前必须能生成并打进去这两个 helper：

```text
electron/native/bin/win32-x64/wgc-capture.exe
electron/native/bin/win32-x64/cursor-sampler.exe
```

没有它们，包能打开也没意义。那叫 UI 标本，不叫录屏软件。

Windows 全链路测试：

```bash
npm run test:wgc-full:win
```

如果你要测真正的录制质量，请至少打开：

- 屏幕或窗口录制
- 摄像头
- 麦克风
- 系统音
- editable cursor

录完看 `.likelysnap/manifest.json`。如果有 `webcam.mp4`，应该能看到 `webcamStartOffsetMs`。这是摄像头同步的关键小铆钉，平时不起眼，掉了之后整辆车开始唱戏。

## macOS 说明

macOS 使用 ScreenCaptureKit 原生 helper。

默认录制目录：

```text
~/Movies/LikelySnap
```

需要系统权限：

- 屏幕录制
- 麦克风
- 摄像头
- 辅助功能权限

权限这东西很烦，但它不是 LikelySnap 在装清高，是 macOS 在当门神。你不给钥匙，它就坐门口喝茶。

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

这里不装神。

- 超长录制能更稳，但打开时仍然需要时间
- 多小时导出仍然需要继续做流式/临时文件级别的加固
- Windows 必须在 Windows x64 真机上构建和验证
- macOS helper 构建需要完整 Xcode 环境更稳
- 旧的 `.openscreen` 项目兼容已经移除，LikelySnap 只使用 `.likelysnap`

如果你看到它加载 1 分钟，不要立刻给它判死刑。

如果你看到它吃掉 20GB 内存，那可以。

那说明又有新的猴子从树上下来了。

## License

MIT License. See [LICENSE](./LICENSE).

