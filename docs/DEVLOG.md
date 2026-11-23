# 项目开发日志 (DEVLOG)

本日志按会话时间**倒序**记录（最新会话在最上方），方便新开对话的 AI 助手快速回溯上下文、技术决策、已踩坑点与提交历史。

---

## Session 6 — Impeccable 风格重构、全窗动态封面背景配色、8 主题与 Lazer 离线字体体系 (`v1.4.0`)

- **日期**：2026-11-23
- **对话 ID**：`47592ae1-76a6-4271-857c-db1635c92580`
- **版本**：`v1.3.1` → `v1.4.0`
- **关联提交**：
  - 核心功能：`8dee501` (`feat(ui,theme): add collapsible impeccable sidebar/filter, dynamic cover backdrop & accent, 8 themes, and lazer fonts (v1.4.0)`)

### 本次目标
1. 基于先前的多套设计原型评估（原型保留于本地忽略目录 `ui-prototypes/`），采纳 `pbakaus/impeccable` 克制美学风格重构左侧边栏（并支持收起/展开）与底部试听浮窗。
2. 将默认呈现模式切换为 `lazer`，在 Lazer 选中歌曲后以高透明度封面铺满整个桌面窗口背景，并根据背景主色调自动计算主题强调色。
3. 在设置中补齐自定义背景图、背景图透明度、随选中歌曲切换背景开关、主题颜色随背景主色调开关，以及更多主题与自定义强调色。
4. 顶部搜索筛选栏支持收起与展开；左上角更名为 `OSU!Downloader!` 并重绘黑白粗线条简约图标；全部中英文及数字切换为 osu!lazer 风格离线字体。

### 关键实现
1. **Lazer 风格离线字体与品牌标识重塑**（`package.json`, `src/main.tsx`, `src/index.css`, `src/components/TitleBar.tsx`, `index.html`, `electron/main.ts`）：
   - 在 `devDependencies` 安装 `@fontsource/quicksand`、`@fontsource/outfit`、`@fontsource/exo-2`、`@fontsource/noto-sans-sc`（由 Vite 按子集打包进 `dist/assets/`），配置 `--font-display` / `--font-sans` / `--font-stat` / `--font-mono`。
   - `TitleBar.tsx` 将 `LaneEmblem` 替换为 `strokeWidth="2.3"` 的单色高对比圆环下载极简图标，主窗与托盘更名为 `OSU!Downloader!`。
2. **`pbakaus/impeccable` 左侧栏、底部试听浮窗与双面板收起**（`src/components/SideRail.tsx`, `src/components/AudioPlayerBar.tsx`, `src/components/FilterPanel.tsx`, `src/App.tsx`）：
   - `SideRail.tsx` 去掉嵌套卡片边框与霓虹阴影，采用机械感三段式目标胶囊、下划线式变体切换、`5px` 强调色圆点预设列表与单线曲库摘要，并支持标题栏及侧栏顶部折叠（`osu4k-sidebar-collapsed`）。
   - `AudioPlayerBar.tsx` 改为悬浮胶囊条（`sm:rounded-full`、圆形封面、`2px` `.impeccable-range` 滑轨），随左侧栏折叠态动态调整左侧偏移。
   - `FilterPanel.tsx` 新增「收起 / 展开筛选」（`osu4k-filter-collapsed`），折叠后保留单行搜索框与当前筛选摘要胶囊。
3. **全窗封面背景、主色调提取与 8 主题/自定义配置系统**（`server/types.ts`, `server/config.ts`, `server/index.ts`, `src/types.ts`, `src/api.ts`, `src/constants.ts`, `src/utils/themeColor.ts`, `src/components/SettingsModal.tsx`, `src/components/LazerSongSelect.tsx`, `src/components/OverlayApp.tsx`）：
   - `server/config.ts` 将默认 `viewMode` 改为 `'lazer'`，扩展 `ThemeId` 至 8 套主题（`dark`/`stone`/`midnight`/`forest` 与 `light`/`paper`/`latte`/`sakura`），新增 `customBgImage`、`customBgOpacity`（默认 `0.22`，范围 `0.04–0.75`）、`dynamicBgFromSong`（默认 `true`）、`dynamicThemeFromBg`（默认 `true`）和 `accentColor`。
   - `server/index.ts` 将 JSON 请求体上限升至 `20mb`，新增 `GET /api/media/custom-bg`、`POST /api/config/background`（支持本地路径复制、DataURL 上传与 HTTP 链接）和 `DELETE /api/config/background`。
   - `src/utils/themeColor.ts` 实现 `extractDominantColor()`（48×27 Canvas 24-bin 色相直方图提取与缓存）和 `deriveAccentVariables()` / `applyAccentVariables()`，随封面或壁纸动态刷新 `--t-osu` / `--t-lazer` / `--pp-*` / `--t-glow-*` 并保证暗/浅色主题可读对比度；`LazerSongSelect.tsx` 通过 `onActiveBeatmapsetChange` 向上同步当前选中曲目并在 `hasGlobalBg` 时隐藏内层重复模糊封面。

### 验证记录
- **类型检查与打包**：`npm run typecheck` 与 `npm run electron:pack`（`v1.4.0`）均退出码 `0` 通过，重新输出 `release\win-unpacked\osu-4k-downloader.exe`（`249,978,368` 字节）。
- **浏览器实机视觉与交互验收**（`1440×900` 主界面 + `460×700` 浮窗，控制台错误 `0`，HTTP `>=400` 失败 `0`）：
  - 确认左上角展示 `OSU!Downloader!` 与单色粗线条圆环图标，字体链加载 `Quicksand` / `Exo 2` / `Noto Sans SC`；
  - 默认以 `Lazer` 视图打开，`<html data-has-bg="true">` 生效；从首曲切换至第 2 曲后全窗背景 `<img>` 由 `/api/media/cover/2591669` 切换为 `/api/media/cover/2581294`，`--t-osu` 自动由 `#ae8037` 更新为 `#ae8237`；
  - 验证桌面左侧栏收起（宽度 `0`）与展开（恢复 `232px`）、顶部筛选栏收起/展开、底部 Impeccable 胶囊试听条打开与关闭、设置弹窗 8 主题 / 10 强调色预设 / 取色器 / 自定义壁纸与透明度实时预览及「取消」不覆盖用户配置，以及 `/?mode=overlay` 浮窗正常加载；
  - 实测期间完整保留用户 `data/config.json`（`theme: "latte"`, `viewMode: "lazer"`, `D:\OSU`, `6174` 代理）。
- **打包产物冒烟与现场清理**：以 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data` 启动 `release\win-unpacked\osu-4k-downloader.exe` 验证 `GET /api/health` 返回 `200` (`{"ok":true}`)；退出后确认 `3721` 端口 `Listen` 监听数为 `0`。

---

## Session 5 — 浮窗 Acrylic 真模糊、极简扁平按钮与 Mania 16:9 皮肤/长条/光效精准还原 (`v1.3.1`)

- **日期**：2026-11-23
- **对话 ID**：`2ed8f60e-361b-469c-8008-4e0784a0cd84`
- **版本**：`v1.3.0` → `v1.3.1`

### 本次问题与根因
1. **浮窗仅透明不模糊**：`electron/main.ts` 同时启用 `frame: false` 与 `win.setOpacity()`，在 Windows 11 下触发 `WS_EX_LAYERED` 导致 DWM `backgroundMaterial: 'acrylic'` 失效。
2. **按钮立体渐变感偏重**：`src/index.css` 的 `.btn-primary` / `.btn-lazer` / `.btn-stable` / `.btn-both` 与卡片试听按钮存在线性渐变、顶部白色高光与彩色外阴影，需统一改为现代极简扁平化纯色风格。
3. **部分无本地完整音频谱面预览锁死 10 秒**：`server/preview.ts` 在缺少本地完整音频时回落到官网 10s 试听片段，导致 `<audio>` `duration ≈ 10s` 强制拉回软件时钟。
4. **音符越过判定线仍残留**：需要让普通单键与长条按时间判定立即从舞台消失，不再绘制越线残留。
5. **球皮与雪皮（`[雪] Project CANTARELLA`）长条几何异常**：球皮未把长条身体精确截停在球头/尾圆心赤道处导致下部露出多余尾巴；CANTARELLA 省略 `NoteBodyStyle` 与 `NoteImage#T`，导致平铺与缺少头图镜像尾部失败。
6. **画布比例、480p/768p 虚拟坐标、1.50x `stage-bottom` 比例与暂停冻结的 60 FPS 动图**：预览舞台需固定 **16:9**，按 `480p` 轨道逻辑 + `768p`/`1536p (@2x)` 纹理坐标系排版；经过 1.25x/1.40x/1.50x/1.60x 四档对比实测选定 `1.50x` 作为 `stage-bottom` 放大倍率（不拉伸最上层绘制，`36f-2` 210 帧 `2000×960 @2x` 人物占舞台高 ~94% 且双侧完整不裁边）；`stage-bottom` 强制以 `60 FPS` 播放并在暂停时使用独立 1x 播放时钟立即定格。
7. **真实打击光效缺失**：需移除本地皮肤假渐变并按 skin.ini 与教程实现 `mania-stage-light`（`ColourLight#` 乘法着色）、`lightingN`（点击/松手触发）与 `lightingL`（长按期间循环）加法混合帧动画。

### 关键改动
1. **Windows 11 DWM Acrylic 真毛玻璃与动态底色透明度**（`electron/main.ts`, `electron/preload.cjs`, `src/electron.d.ts`, `src/components/OverlayApp.tsx`, `src/index.css`）：
   - 浮窗改用 `titleBarStyle: 'hidden'` + `titleBarOverlay: false` + `autoHideMenuBar: true`（移除 `frame: false` 与全部 `win.setOpacity()` 调用），保留 `backgroundMaterial: 'acrylic'` 与 `roundedCorners: true`，并新增 `overlay:setNativeTheme` IPC 同步 `nativeTheme.themeSource`。
   - `OverlayApp.tsx` 透明度滑块通过 CSS 变量 `--mac-tint-alpha`（范围 `0.16–0.84`）实时调节三主题 `.mac-glass-shell` 半透明蒙版深度，Electron 端铺满全窗无外边距冲突。
2. **极简扁平化按钮统一改造**（`src/index.css`, `src/components/FilterPanel.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`, `src/components/LazerSongSelect.tsx`, `src/components/OverlayApp.tsx`, `src/components/ManiaPreviewModal.tsx`）：
   - 将 `.btn*` 改为纯色扁平填充（`var(--t-osu)` / `var(--t-lazer)` / `var(--t-stable)` / 纯混合色）、悬停仅轻微压暗纯色与边框变化，全部移除顶部 `inset` 高光、线性渐变与外扩霓虹阴影，并同步清理各组件试听/弹窗按钮上的渐变与重阴影。
3. **无完整音频静音时间轴模式**（`server/preview.ts`, `server/types.ts`, `src/types.ts`, `src/components/ManiaPreviewModal.tsx`）：
   - 新增 `ParsedManiaChart.hasFullAudio` 并在 `servePreviewAudio()` 移除 10s 官网片段回落；无完整音频时返回 `audioUrl: null` 且 `/audio/:index` 返回 `404`，前端自动以静音软件时钟完整播放全曲并在顶栏显示 `静音时间轴 · 16:9` 徽章。
4. **皮肤解析器与 16:9 Mania 引擎精准还原**（`server/skins.ts`, `src/utils/maniaEngine.ts`, `src/components/ManiaPreviewModal.tsx`）：
   - `server/skins.ts` 新增 `[General] AnimationFramerate`（缺省默认调整为 `60`，内置皮肤亦默认 `60 FPS`）、`[Mania] LightFramePerSecond`、`LightingNWidth`/`LightingLWidth`、`_blank` 置空、最多 600 帧的 `stageBottom`/`stageLight`/`lightingN`/`lightingL`/`noteBodies` 帧序列扫描，以及省略 `NoteBodyStyle` 时对非 PerCy 皮肤默认 `0 (Stretch)`、保留缺失 `NoteImage#T` 为 `null` 交由前端执行头图垂直翻转。
   - `src/utils/maniaEngine.ts` 新增 `SkinAnimator`（针对 >32 帧大图如 `36f-2` 210 帧采用 240 帧 `ImageBitmap` 完整 LRU 流式缓存、`maxConcurrent = 8`、`960px` 宽下采样与 36 帧前瞻解码队列，`dispose()` 释放显存）；采用严格 16:9 画布（`ResizeObserver` 等比锁定）、`480p` 列宽与 `768p`/`1536p` 纹理缩放；单键过判定线与长条过尾瞬间消失；LN 身体截停在头尾中心赤道并支持 `flippedHead` 尾部回退（CANTARELLA）与 `<=2px` 隐藏尾（36f-2 PerCy）；真实 `stageLight` / `lightingN` / `lightingL` 渲染；`stageBottom` 以 `1.50x` 倍率按 `BottomCentre` 不拉伸绘制在最上层并强制 `60 FPS`（覆盖 `skin.ini` 30 FPS）。
   - `ManiaPreviewModal.tsx` 新增仅在播放态以 `1x` 速率递增的独立动画时钟 `animElapsedMsRef`，暂停即瞬间定格当前帧且不受谱面倍速或进度拖拽影响。

### 验证记录
- **构建与打包**：`npm run typecheck` 与 `npm run electron:pack` 均退出码 `0` 通过，重新生成 `release\win-unpacked\osu-4k-downloader.exe`。
- **后端实机断言**：
  - `36f-2` 解析返回 `animationFramerate: 30`、`stageBottom.frames.length === 210`、`noteBodyStyle: 1`、`noteTails[0].height === 1`；builtin 默认返回 `60 FPS`；
  - `-  ! [雪] Project CANTARELLA` 解析返回 `noteBodyStyle: 0`、`noteTails[0] === null`；
  - `O2Jam UUltimate` 解析返回 `lightingN.frames.length === 12`、`lightingL.frames.length === 8`、`stageLight.width === 128`、`lightFramePerSecond: 24`；
  - 无本地完整音频 Lazer 谱面 `#688459` (`Debug Dance`, `lazer_files`) 返回 `hasFullAudio: false, audioUrl: null`（`/audio/0` 返回 `404`）；Stable 本地谱面 `#1003217` 返回 `hasFullAudio: true`。
- **浏览器真机验证**（`1440×900` 主界面/预览 + `460×700` 浮窗，控制台错误 `0`，网络 >=400 错误 `0`）：
  - 确认搜索与下载按钮均为纯色扁平风格；
  - `#688459` `[4K] VERMILION` 预览呈现严格 `16:9` 画布（实测 `944×530`，比值 `1.781`）、`静音时间轴 · 16:9` 徽章，从 `0:24.9` 播放 2.5 秒顺利推进至 `0:27.8`（突破 10s 限制）；
  - 逐一截图核验：`36f-2` 在 `1.50x` 倍率下左右兔耳少女完整无裁切、60 FPS 动画播放中像素持续更新（500ms `canvasDiff=2631`）、暂停前（700ms 间隔 `canvasDiff=0`）与暂停后（600ms 间隔 `canvasDiff=0`）均完全定格；`CANTARELLA` 长条头尾胶囊衔接平整；`O2Jam UUltimate` 在击打长条/单键时呈现真实 `mania-stage-light` 列光效与 `lightingL`/`lightingN` 加法光束；
  - 浮窗 `?mode=overlay` 调节透明度滑块至 `71%` 后 `--mac-tint-alpha` 动态由 `0.749` 更新至 `0.402`。
- **Electron 打包产物冒烟与现场清理**：以 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data` 启动 `osu-4k-downloader.exe` 验证 `/api/health` 返回 `200`，关闭后确认 `3721` 端口无 `Listen` 监听，`data/config.json` 与用户偏好完整保留。

---

## Session 4 — Mania 谱面预览器、PerCy 皮肤无损裁切与 macOS 磨砂游戏内浮窗 (`v1.3.0`)

- **日期**：2026-11-23
- **对话 ID**：`2ed8f60e-361b-469c-8008-4e0784a0cd84`
- **版本**：`v1.2.0` → `v1.3.0`

### 本次目标
1. 新增本地下载后可立即演示的 **osu!mania 谱面预览器**：支持拖动进度条、暂停/继续、流速控制、谱面下落/上升、本地/内置皮肤选择、右侧可上下滑动缩略图。
2. 新增 **macOS 风格毛玻璃浮窗模式**：支持在游戏运行时呼出、搜索下载并直接自动在运行中的 Stable / Lazer 客户端中导入加载。

### 关键实现与技术方案
1. **Mania `.osu` 解析与皮肤引擎**（`server/preview.ts`, `server/skins.ts`, `src/utils/maniaEngine.ts`, `src/components/ManiaPreviewModal.tsx`）：
   - 对齐 osu!stable 480p 坐标与流速公式 `scrollTimeMs = (13720 / speed) * (hitPosition / 480)`，并精确还原 **Red Line BPM + Green Line SV 乘积**（保证 Dan 练习包等变速整合图流速一致）、`NoteBodyStyle` (`0` Stretch / `1` CascadeFromTop / `2` CascadeFromBottom)、`KeysUnderNotes`、`UpsideDown` 与 `WidthForNoteHeightScale`。
   - **PerCy 超长 LN 纹理无损裁切**：针对本机激活皮肤 `36f-2` 等采用的 `150×38039` 索引色（`colorType=3` + `tRNS`）PerCy LN 贴图，在 `server/skins.ts` 实现零依赖 `cropPngTopRows(buf, 2048)`，按行切片解压后的前 2048 行扫描线并保留 `PLTE`/`tRNS`、重算 `IHDR` 与 `CRC32`（配合 LRU 缓存），完美保留 PerCy 尾端透明裁切间隔且避免浏览器 GPU 超限纹理黑块。
   - **音频 Range 断点续播 & 本地缓存**：`server/preview.ts` 支持 Stable `Songs` 目录、`.osz` 压缩包（含 `data/cache/osz` 自动预览缓存）及 Lazer `files/` 哈希库，为磁盘文件与 ZIP 内音频均实现完整 `HTTP 206 Partial Content` 分片响应。
   - **右侧上下滑动缩略图**：采用虚拟总高度滚动容器 + Sticky DPR `<canvas>` 视口裁剪绘制，支持 `1x/2x/4x` 缩放、自动跟随/手动脱离与「回到当前」、点击/拖拽任意位置跳转进度；底部进度条集成 120 柱 NPS 密度直方图。
2. **macOS 毛玻璃浮窗与双端实时加载**（`electron/main.ts`, `electron/preload.cjs`, `src/components/OverlayApp.tsx`, `src/index.css`, `server/installer.ts`, `server/downloader.ts`）：
   - 在 Electron 45 中创建独立置顶浮窗（`frame: false`, `titleBarStyle: 'hidden'`, `backgroundColor: '#00000000'`, `backgroundMaterial: 'acrylic'`, `roundedCorners: true`, `setAlwaysOnTop(true, 'screen-saver')`），配合全局热键（默认 `Alt+Shift+O`，可在设置中切换）与系统托盘菜单随时唤出。
   - `OverlayApp.tsx` 采用适配三主题的 macOS Vibrancy 磨砂样式（`.mac-glass-shell` + 红黄绿红绿灯控制：隐藏 / 折叠 64px 极简搜索条 / 展开主窗口）、透明度实时调节、置顶切换、实时游戏进程状态指示、Spotlight 搜索下载与再次导入。
   - `server/installer.ts` 扩展 `installToStable()` 与 `loadBeatmapIntoRunningGame()`：检测到 `osu!stable` 运行且开启选项时，将 `.osz` 复制到临时隔离文件后直接拉起 `osu!.exe [stagingPath]` 触发热导入加载（不破坏预览缓存原文件）；`osu!lazer` 保持单实例 IPC 导入。
3. **分组下拉框修复**（`src/components/SelectField.tsx`）：
   - 修复 `<optgroup>` 嵌套时首组未命中即提前返回 `firstLabel` 导致后续分组选项标签不刷新的 Bug，并在 `ManiaPreviewModal` 加上 `select-none` 防止拖拽进度条/缩略图误选文字。

### 验证记录
- `npm run typecheck` 与 `npm run electron:pack`（`v1.3.0`）均退出码 `0` 通过，更新 `release\win-unpacked\osu-4k-downloader.exe`。
- **后端 API 实机验收**：`/api/skins` 返回 32 套皮肤（29 本地 + 3 内置，`activeStableSkin: '36f-2'`, `stableManiaSpeed: 31`）；`/api/skins/36f-2/asset?file=Mania%2FN%2FL.png` 返回合法 `150×2048` 索引色 PNG（`tRNS` 完整）；`/api/preview/beatmapset/1079991/chart/0` 正确解析 1355 notes；`/audio/0` 返回 `206 Partial Content`。
- **浏览器实机验收**（主界面 `1440×900` + 浮窗 `/?mode=overlay` `460×700`）：控制台错误 `0`、HTTP >=400 错误 `0`；完整实测 `ManiaPreviewModal` 皮肤切换（`36f-2` / 内置圆珠 / `otya`）标签与渲染同步、播放/暂停、流速滑块、进度条拖拽、右侧缩略图滚轮与「回到当前」及点击跳转、三主题切换，以及浮窗红黄绿灯折叠/展开、透明度滑块与搜索。
- **Electron 实机冒烟**：以 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data` 启动打包产物 `osu-4k-downloader.exe`，`/api/health` 返回 `200`，关闭后确认 `3721` 端口已完全释放且 `data/config.json` 用户路径/代理配置完整保留。

---

## Session 3 — 全视图滚底自动加载、Lazer 动效丝滑优化与 Ranked PP 情景计算器 (`v1.2.0`)

- **日期**：2026-11-22
- **对话 ID**：`48daf769-ce1d-4a38-983b-ef1945e9fd0c`（第二轮迭代）
- **版本**：`v1.1.0` → `v1.2.0`
- **关联提交**：
  - 核心功能：`3b0a44b` (`feat(ui): add infinite auto-load, silky lazer carousel optimization, and ranked PP calculator (v1.2.0)`)
  - 文档更新：本次提交（紧随 `3b0a44b` 之后）

### 本次目标
1. 无论当前使用哪种呈现形式（`卡片` / `列表` / `Lazer`），翻到列表底部自动加载更多谱面。
2. 解决 Lazer 模式下点击/切换卡片时的卡顿，使动效更丝滑。
3. 为 Ranked（及 Approved）谱面对应星数难度展示大致 PP，并提供可模拟不同情景的 PP 计算器。

### 关键实现与性能优化分析
1. **全视图滚底自动加载更多**（`src/App.tsx`, `src/components/LazerSongSelect.tsx`）：
   - 在 `卡片`/`列表` 模式中以 `<main>` 作为 `IntersectionObserver` 的 `root`（`rootMargin: '300px 0px'`），在 `Lazer` 模式中以右侧轮盘滚动容器 `carouselRef` 作为 `root`（`rootMargin: '260px 0px'`），并在键盘 `ArrowDown`/`KeyS` 翻到距末尾 3 项内时主动预取。
   - 新增 `loadingMoreRef` 并发锁、`searchEpochRef` 竞态丢弃令牌与 `!searchError` 熔断保护，防止重复请求与错误死循环；底部保留加载状态提示、失败手动重试及「已加载全部」提示。
2. **Lazer 动效卡顿根因与丝滑优化**（`src/index.css`, `src/components/LazerSongSelect.tsx`）：
   - **根因**：此前切换卡片时触发全量槽位重渲染、每张卡片叠加 `backdrop-blur` 合成开销、背景大图 `blur-2xl` 反复重建 DOM，且隐藏的 CSS Grid 手风琴在每次重排时参与布局与弧线测量，加之 `.lazer-slot` 同时混用 rAF 弧线位移与 CSS `transition`。
   - **修复**：
     - 解耦 `.lazer-slot`（纯 rAF 弧线 `--arc-x` / `--arc-opacity`，`contain: layout style`，无 transition）与 `.lazer-slot-inner`（负责 `-20px` 选中弹出 / `-8px` 悬停滑移）；
     - 批量先读（`offsetTop`/`offsetHeight`）后写、仅更新视口上下 `260px` 缓冲内且数值有变化的槽位；
     - 改为仅对当前激活项挂载交错入场（`.lazer-diff-enter`）的难度扇出列表，配合 `React.memo` 封装 `LazerCarouselSlot` 与 `useMemo` 预排序 `sortedDiffsMap`，切换曲目仅重绘新旧两张卡；
     - 改用双缓冲 `<img>`（`blur-lg` + `loadedBgUrlsRef` 缓存秒切）并移除轮盘卡片内嵌套 `backdrop-blur`。
3. **Ranked 谱面大致 PP 展示与情景计算器**（`src/utils/pp.ts`, `src/components/PpCalculatorPanel.tsx`, `src/components/BeatmapDetailModal.tsx`, `BeatmapCard.tsx`, `BeatmapListRow.tsx`, `LazerSongSelect.tsx`）：
   - 基于 `ppy/osu` 官方 `osu!mania` 准度制公式实现 `calculateBeatmapPp()`（包含 `8.0 * max(SR-0.15, 0.05)^2.2 * max(0, 5*acc-4) * (1 + 0.1*min(1, hits/1500)) * 0.8 * modMultiplier`，以及对 `全部模式` 下非 Mania 谱面的参考估算）。
   - 所有视图的 `ranked`/`approved` 谱面展示可点击的 `~XXXpp`（`.chip-pp`）徽章（未上架图保持不展示官方 PP，避免误导）；Lazer 左侧面板内置 `HT / NM / DT` 快速切换 `PP 速览`；详情弹窗难度表增加 `大致 PP (98%/SS)` 列，下方内嵌支持准度滑块/预设、失误数、倍速（HT~DT 0.5x–2.0x 等效 SR/BPM 估算）、`Classic/EZ/NF` Mod、Mania `320:300 (MA 比)` 与「模拟上架计算」开关的完整交互式 `PpCalculatorPanel`。

### 验证记录
- `npm run typecheck` 与 `npm run electron:pack` 均退出码 `0` 通过，更新 `release\win-unpacked\osu-4k-downloader.exe`。
- 在 `1440×900` 实机浏览器验收（控制台错误 `0`、未捕获异常 `0`）：
  - **自动加载**：`卡片` 滚底自动从 `24` 增至 `72`；切至 `列表` 滚底自动增至 `96`；切至 `Lazer` 轮盘滚底自动增至 `120`。
  - **Lazer DOM 与动效**：快速切换 5 张卡片，DOM 内始终仅 `1` 个激活槽位渲染 `.lazer-diff-row`（非激活槽位为 `0`），滚动时 `--arc-x` 实时平滑变化。
  - **PP 计算与三主题**：Ranked 谱面在三视图均正确显示 `.chip-pp` 而 Qualified/Loved 卡片不显示；在 `#2214615 Kiss Me Again (Nightcore Mix)` 实测 Lazer `HT/NM/DT` 速览与计算器弹窗切换难度、95%/SS、Miss、DT 1.5x、`Classic`/`EZ`/`NF` 与 `3:1` MA 比实时联动正常，三主题（曜石黑/瓷器白/浅咖啡）对比度清晰无遮挡。
  - **详情表星数折行修复**：针对 `BeatmapDetailModal` 新增 `大致 PP` 列后 `星数` 胶囊内 `★` 与数字折行的问题，为星数单元格及胶囊（含 `BeatmapCard` / `BeatmapListRow` / `LazerSongSelect`）统一加上 `whitespace-nowrap shrink-0 leading-none` 并将难度名列限宽为 `max-w-[190px]`；实机复检 `#2585097 (Rift (Cut Ver.))` 6 难度与 `#2214615` 4 难度均单行整齐显示（`22px` 高度，无横向滚动条），控制台错误 `0`。

---

## Session 2 — 多形态 Song 选歌界面（含 Lazer 轮盘动效）、运行日志与交接体系

- **日期**：2026-11-22
- **对话 ID**：`48daf769-ce1d-4a38-983b-ef1945e9fd0c`
- **版本**：`v1.0.0` → `v1.1.0`
- **关联提交**：
  - 基线快照：`65f7129` (`feat: initial osu!mania 4K dual-client Electron downloader (v1.0.0)`)
  - 核心功能：`341a4ad` (`feat(ui,server): add grid/list/lazer song views with curved carousel and runtime logging`)
  - 文档与日志：本次提交（紧随 `341a4ad` 之后）

### 本次目标
1. 实现 Song 选项卡多种呈现形式，新增仿 **osu!lazer** 选歌界面布局、弧形轮盘与动态效果。
2. 补齐项目运行日志、Git 仓库初始化与提交规范、面向新 AI 的 `AGENT.md` 与面向用户的 `README.md` / `CHANGELOG.md` / `docs/DEVLOG.md`。

### 关键实现
- **后端配置与结构化日志**：
  - 在 `server/types.ts` 与 `src/types.ts` 新增 `SongViewMode = 'grid' | 'list' | 'lazer'` 及 `AppConfig.viewMode`；在 `server/config.ts` 新增 `LOGS_DIR` (`data/logs`) 与 `normalizeViewMode()` 校验。
  - 新建 `server/logger.ts`：向控制台和 `data/logs/server.log` 写入带 ISO 时间戳与作用域的日志，文件达到 2 MB 自动轮转至 `server.log.1`。
  - 在 `server/index.ts`、`server/network.ts`、`server/downloader.ts` 接入关键生命周期日志，新增 `GET /api/logs?lines=120` 接口。
- **三视图呈现与 Lazer 选歌动效**：
  - `src/constants.ts` 新增 `VIEW_MODE_OPTIONS`（`卡片` / `列表` / `Lazer`）。
  - `src/components/BeatmapListRow.tsx` 实现紧凑列表视图，保留已装四边金色框体、多难度胶囊、统计数字与下载操作。
  - `src/components/LazerSongSelect.tsx` + `src/index.css` 实现 osu!lazer 选歌界面：
    - 右侧弧形轮盘通过 `requestAnimationFrame` 直接向 `[data-lazer-slot]` 写入 `--arc-x` 与 `--arc-opacity`（滚动过程零 React 重渲染），`--active-shift: -20px` 仅在 X 轴平滑合成，彻底规避亚像素悬停闪烁。
    - `clip-path` 仅作用于内部封面层 `.lazer-cover-slant`（包裹于 `.cover-frame` + `-inset-[1px]`），完整保留外层 `.card-installed` 四边金色框体。
    - 手风琴难度面板使用 CSS Grid `grid-template-rows: 0fr -> 1fr` 平滑展开/收起；左侧楔形展示区支持 4 项动画属性条（`SR` / `OD` / `HP` / `LN%`）、物件明细、`自动试听` 开关及键盘快捷键（`↑↓/WS`、`←→`、`Space`、`Enter`，弹窗及输入框聚焦时自动屏蔽）。
  - `src/App.tsx` 接入三视图切换条、按视图定制加载骨架屏与 `localStorage('osu4k-view-mode')` + 后端配置双向同步。

### 验证记录
- **静态检查与打包**：`npm run typecheck`（Web / Server / Electron 三端）与 `npm run electron:pack` 均退出码 `0` 通过，更新产物 `release\win-unpacked\osu-4k-downloader.exe`。
- **实机服务与日志验证**：以 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data` 启动 `osu-4k-downloader.exe`，`/api/health` 返回 `200`，`/api/logs?lines=20` 与磁盘 `data/logs/server.log` 均正常记录服务监听、镜像测速（`proxyOpen: true, proxyPort: 6174, recommendedMirror: sayobot-txy`）与配置更新。
- **浏览器 1440×900 全功能实机验收**：
  - 控制台错误 `0`、未捕获异常 `0`、请求失败 `0`。
  - 验证 `卡片`、`列表`、`Lazer` 切换与 `Lazer` 模式下切歌、展开手风琴、切换难度更新左侧属性数值；滚动轮盘实测 `--arc-x` 曲线顶点由上移至中间槽位（`0px`）。
  - 搜索 `nekodex`，确认双端已装谱面 `circles!` 在 `Lazer`、`列表`、`卡片` 三视图及 `曜石黑`、`瓷器白`、`浅咖啡` 三主题下均清晰渲染四边金色框体与金色已装徽章。
  - 测试后已停止后台进程，确认端口 `3721` 释放且 `data/config.json` 中 `D:\OSU`、`D:\OSU\OSUlazer\osu-lazer` 与代理 `6174` 完整保留。

### 后续可继续迭代方向
- 可考虑在界面内（如设置弹窗或标题栏状态区）增加一个轻量「查看运行日志」弹窗直接消费 `GET /api/logs`。
- 可考虑为 `LazerSongSelect` 补充按键位/星数/已装状态的前端快捷切换或随机选曲 (`F2` Random) 功能。

---

## Session 1 — 项目立项、双端下载器、Electron 桌面化与视觉精修

- **日期**：2026-11-22
- **对话 ID**：`3331d119-b73d-41ba-be8e-9953fc4580d9`
- **版本**：`v0.1.0` → `v1.0.0`
- **关联提交**：`65f7129` (`feat: initial osu!mania 4K dual-client Electron downloader (v1.0.0)`)

### 本次目标
1. 从零开发面向 `osu!stable` (`D:\OSU`) 与 `osu!lazer` (`D:\OSU\OSUlazer\osu-lazer`) 的 `osu!mania 4K` 免登录谱面下载器，接入 `6174` 代理智能调度与多国内镜像站。
2. 升级为 Electron 无边框桌面端并提升整体审美设计。
3. 修复悬停闪烁线、为已装谱面加上四边金色框体、升级离线多字体层级，并提供三套简约主题切换与单箭头下拉修复。

### 关键实现与踩坑记录
- **双端与网络核心**：
  - 搭建 Express 后端（`server/search.ts`, `server/network.ts`, `server/sources.ts`, `server/downloader.ts`, `server/installer.ts`, `server/library.ts`, `server/media.ts`），支持 Stable 自动解压、Lazer 运行期 IPC 自动导入与待导入队列管理、Stable → Lazer 零流量 `.osz` 同步。
- **Electron 桌面化**：
  - 搭建 `electron/main.ts`、`electron/preload.cjs` 与 `electron-builder` 无 asar 目录打包配置，输出 `release\win-unpacked\osu-4k-downloader.exe` 与 `start-desktop.bat`。
- **关键 UI 问题根因与修复**：
  - **悬停卡片中间闪现线条**：原因为卡片悬停 `translateY` 位移与内部图片缩放产生亚像素接缝。修复方案：移除卡片整体垂直位移，引入 `.cover-frame` GPU 独立合成层（`translateZ(0); isolation: isolate; backface-visibility: hidden`）并将封面图与 `.cover-vignette` 设 `-inset-[1px]` 溢边。
  - **下拉框双箭头重叠**：部分 Chromium 原生 `<select>` 仍显示系统箭头并与自定义箭头叠加。修复方案：抽象 `src/components/SelectField.tsx`，将原生 `<select>` 透明覆盖在自定义视觉容器之上，保留完整键盘与无障碍操作。
  - **已装谱面金框与四字体、三主题**：打包 `@fontsource` 四字体实现完全离线加载；定义 `曜石黑 (dark)`、`瓷器白 (light)`、`浅咖啡 (latte)` 三套语义变量与 `.card-installed` 四边金色外框。

---

## 新会话追加模板（供后续 AI 助手复制使用）

```markdown
## Session N — <简述本轮核心改动>

- **日期**：YYYY-MM-DD
- **对话 ID**：`<conversation-id>`
- **版本**：`vX.Y.Z`
- **关联提交**：`<hash>` (`<commit message>`)

### 本次目标
- ...

### 关键实现与踩坑记录
- ...

### 验证记录
- `npm run typecheck`：...
- `npm run electron:pack`：...
- 实机 / 浏览器验收：...
```
