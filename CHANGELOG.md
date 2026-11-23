# Changelog

All notable changes to **OSU!Downloader! (`osu-4k-dual-downloader`)** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.5.0] - 2026-11-23

### Added
- **极速跨页批量下载模式 + IPv6 双栈/分流网络引擎**（`server/fastBatch.ts`, `server/network.ts`, `server/installer.ts`, `server/index.ts`, `server/types.ts`, `src/types.ts`, `src/api.ts`, `src/components/FastBatchModal.tsx`, `src/components/SideRail.tsx`, `src/components/SettingsModal.tsx`, `src/App.tsx`）：
  - 新增纯文本极简「快速批量下载」工作台：支持按当前筛选条件自定义目标下载数量（`1–500` 首，含 `10`/`25`/`50`/`100`/`200` 快捷档），自动跨页搜索补齐目标数量并跳过本地已装曲目，仅展示编号、歌名、艺术家、难度胶囊与实时速率/协议标签，不加载封面、音频与详情页以消除界面开销；
  - 后端新增高并发多镜像负载均衡调度（`concurrency: 1–12`，按单源在途数 / 历史带宽 EWMA / 429 冷却期智能分流）、`DNS` 5 分钟内存缓存、`undici` 连接池复用（16 连接/源）、ZIP 尾目录异步极速校验 (`verifyOszFileFast`，跳过整包同步解压)、Stable 直投 `.osz` 及 Lazer 合并批量 IPC 导入（每 15 首触发一次）；
  - 全站与设置弹窗/批量工作台新增 **IPv6 网络栈策略**（`auto` 自动双栈 Happy Eyeballs、`ipv6_first` IPv6 优先、`ipv6_only` 仅 IPv6、`ipv4_first`、`ipv4_only`）与批量直连优先/仅直连分流选项，实时显示本机 IPv6 就绪状态与 IPv6/IPv4/代理命中计数。

### Changed
- **全局默认字号缩放调整为 `120%`，并完善谱面预览弹窗 120%–125% 布局适配**（`server/config.ts`, `src/constants.ts`, `index.html`, `src/index.css`, `src/App.tsx`, `src/components/SettingsModal.tsx`, `src/components/OverlayApp.tsx`, `src/components/ManiaPreviewModal.tsx`, `src/components/FilterPanel.tsx`）：
  - 默认 `fontScale` 从 `1.0` 提升为 `1.2`（`120%`），全新启动与「恢复默认」即采用更易读的大号字体；
  - 扩充 `ManiaPreviewModal` 左侧控制栏响应式宽度（`clamp(268px,16.75rem,320px)`）并新增 `.segmented-compact` / `.segmented-auto`，彻底消除 `120%` 字号下「播放倍速」「谱面方向」「LN 长条速选」分段按钮文字拥挤与裁切问题。

### Fixed
- **Lazer 初次展开默认难度平滑左移**（`src/index.css`）：通过 `--diff-x` 变量将 `@keyframes lazer-diff-in` 终点与 `.lazer-diff-row[data-active="true"]` 对齐（`-8px`），消除点击歌曲展开难度时首个默认选中难度先归零再瞬间跳至 `-8px` 的闪烁感。
- **优化列表视图点开详情弹窗的滚动流畅度**（`src/index.css`, `src/components/BeatmapListRow.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapDetailModal.tsx`, `src/App.tsx`）：为列表/卡片启用 `content-visibility: auto` 与 `memo` 记忆化、移除列表缩略图 `backdrop-blur-md`/`will-change-transform` 与 `data-has-bg="true"` 下弹窗内部冗余毛玻璃叠加，并为 `.modal-surface` 与详情页滚动容器添加独立的 GPU 合成层 (`isolation: isolate; contain: layout style paint; overscroll-contain`)，大幅降低百行列表背景叠加详情弹窗时的滚动合成掉帧。
- **统一 `LN%` 与 `Rice` / `Hybrid` 谱面倾向标签语义并优化详情表列宽**（`src/constants.ts`, `src/components/LazerSongSelect.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`, `src/components/BeatmapDetailModal.tsx`）：扩展 `getLnCategory()` 返回 `LnCategoryInfo`（`label: "LN XX%"`、`styleTag: "单键 Rice" | "综合 Hybrid" | "长条 LN"`、`fullLabel: "Rice · LN XX%" | "Hybrid · LN XX%" | "LN XX%"` 及双占比 `tooltip`），消除此前 Lazer 左侧属性条显示 `LN% 13%` 而难度胶囊显示 `Rice 13%` 的语义矛盾，并放宽详情弹窗至 `max-w-[960px]` 且收紧表格水平内边距，确保 `Hybrid · LN XX%` 完整无裁切展示。

## [1.4.1] - 2026-11-23

### Added
- **全局界面字体大小自定义缩放**（`server/types.ts`, `server/config.ts`, `src/types.ts`, `src/constants.ts`, `src/App.tsx`, `src/components/SettingsModal.tsx`, `src/components/OverlayApp.tsx`, `index.html`）：
  - 在设置弹窗「界面主题、字体与桌面背景」新增 **界面字体大小** 设置项，支持 4 档快捷预设（`紧凑 90%`、`标准 100%`、`偏大 110%`、`大号 120%`）与 `85%–125%` 连续滑块实时预览，取消不覆盖原配置，保存后持久化至 `config.json` 与 `localStorage`。
  - 通过 `--ui-font-scale` 驱动根字号并在 Tailwind v4 `@theme inline` 中固定 `--spacing: 4px`，使全站 `rem` 文字及控件字号同步放大/缩小而保持布局间距紧凑不臃肿。
- **「回到顶部」与 Lazer「回到选中歌曲」快捷定位导航**（`src/App.tsx`, `src/components/LazerSongSelect.tsx`）：
  - 卡片与列表视图向下滚动后在右下角显示悬浮「回到顶部」按钮（自动避让底部试听条）。
  - Lazer 选歌轮盘内当当前选中歌曲滑出视口时自动提示「回到选中 ↑/↓」按钮，滚动过首屏后同步显示「回到顶部」按钮，并复用 GPU 居中滚动定位。
- **超长歌名/难度名跑马灯组件 `<MarqueeText>`**（`src/components/MarqueeText.tsx`, `src/index.css`, `src/components/LazerSongSelect.tsx`, `src/components/AudioPlayerBar.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`）：
  - 基于全局共享单例 `ResizeObserver` 仅对实际溢出的单行文本启用往返平滑滚动与右缘渐隐，完整呈现 Lazer 选歌卡片/展板/底部试听条与卡片/列表视图（悬停触发）的超长标题。

### Changed
- **默认主题调整为「瓷器白 (`light`)」，背景图默认不透明度调整为 `75%`**（`server/config.ts`, `index.html`, `electron/main.ts`, `src/App.tsx`, `src/components/TitleBar.tsx`, `src/components/SettingsModal.tsx`, `src/components/OverlayApp.tsx`, `src/index.css`）：
  - 全新配置下默认启用瓷器白浅色主题，Electron 主窗初始底色同步匹配主题配色，消除启动瞬间的深色闪屏；
  - 默认桌面/封面背景不透明度由 `22%` 提升至 `75%`（滑块上限同步开放至 `4%–100%`），并微调瓷器白次级文本与 `data-has-bg="true"` 玻璃层遮罩对比度以兼顾背景氛围与文字清晰度。
- **全面强化中文字号与字重表现**（`src/main.tsx`, `src/index.css`, `src/components/SideRail.tsx`, `src/components/SettingsModal.tsx`, `src/components/BeatmapDetailModal.tsx`, `src/components/PpCalculatorPanel.tsx` 等全部组件）：
  - 引入 `@fontsource/noto-sans-sc/600.css` 并设定正文默认 `500` 字重，将全站像素字号统一升级为可缩放的 `rem` 层级，显著加粗并放大左侧栏、设置弹窗、详情页难度表及 PP 计算器中的中文标签、标题与说明文字。
- **消除左侧栏重复收起按钮**（`src/components/SideRail.tsx`, `src/App.tsx`）：移除左侧栏右上角冗余的折叠按钮，统一保留左上角标题栏中的收起/展开控制。
- **移除「刷PP」与「日常练习」预设及附加词条**（`src/constants.ts`, `src/components/SideRail.tsx`, `src/components/BeatmapDetailModal.tsx`, `src/components/SettingsModal.tsx`, `src/components/LibrarySyncModal.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`, `src/components/LazerSongSelect.tsx`）：简化双客户端标签为纯粹的 `Lazer` / `Stable` / `双端同步`。
- **Lazer 主界面锁定外层视口滚动、消除难度展开区横向滚动条并优化多窗口适配**（`src/App.tsx`, `src/components/FilterPanel.tsx`, `src/components/LazerSongSelect.tsx`, `src/components/AudioPlayerBar.tsx`, `src/index.css`）：
  - 在 `Lazer` 模式下将 `<main>` 与选歌舞台锁定为视口高度自适应弹性布局（`overflow-hidden`），切换回 Lazer 时自动重置外层 `scrollTop = 0`，保证主界面整体不再上下滑动，仅右侧选歌卡片轮盘与左侧展示区按需内部滚动。
  - Lazer 选中卡片展开的难度列表容器增加 `overflow-x-hidden` 与左内边距留白（`pl-2.5`），并将 `.lazer-diff-enter` 填充模式改为 `backwards`，彻底消除悬浮/激活左移时触发的底部水平滚动条。
  - Lazer 模式下展开「高级筛选」改为悬浮毛玻璃浮层展示；响应 `1040×680` 至 `1920×1080`+ 多窗口尺寸自适应调整封面高度、左侧栏宽度（`--sidebar-w`）、弧形轮盘振幅及窄屏难度行信息密度。

## [1.4.0] - 2026-11-23

### Added
- **全窗口动态封面背景与主色调自动配色**（`src/App.tsx`, `src/utils/themeColor.ts`, `src/components/LazerSongSelect.tsx`, `src/index.css`）：
  - 默认呈现模式调整为 **`lazer`**，并在 Lazer 模式切换曲目时将整个桌面窗口背景双缓冲交叉淡入为高透明度当前曲目封面（`html[data-has-bg="true"]` 下各玻璃层自动呈现克制半透效果）。
  - 新增 `src/utils/themeColor.ts`（`extractDominantColor` 24 区间色相直方图提取 + `deriveAccentVariables` / `applyAccentVariables`），自动提取当前背景图鲜明主色调并联动 `--t-osu`、`--t-lazer`、`--pp-*` 与环境微光变量。
- **自定义桌面背景图、8 套主题与强调色配置**（`server/types.ts`, `server/config.ts`, `server/index.ts`, `src/api.ts`, `src/constants.ts`, `src/components/SettingsModal.tsx`, `src/components/TitleBar.tsx`, `src/components/OverlayApp.tsx`）：
  - 主题从 3 套扩展至 **8 套**（暗色 4 套：`dark` / `stone` / `midnight` / `forest`；浅色 4 套：`light` / `paper` / `latte` / `sakura`），标题栏升级为分组弹出主题选择器。
  - 设置弹窗新增「界面主题、动态配色与桌面背景」面板：支持 **10 组预设强调色 + 自由拾色器**、本地图片上传 / 网络链接背景图（`GET /api/media/custom-bg`、`POST /api/config/background`、`DELETE /api/config/background`）、**背景图不透明度滑块 (`4%–75%`)**，以及「Lazer 模式随选中歌曲更换桌面背景」「主题强调色随背景图主色调自动改变」两项独立开关（支持实时预览与取消还原）。
- **顶部筛选搜索栏与左侧栏可收起 / 展开**（`src/components/FilterPanel.tsx`, `src/components/SideRail.tsx`, `src/components/TitleBar.tsx`, `src/App.tsx`）：
  - 桌面左侧栏可在标题栏与侧栏顶部一键收起/展开，折叠后主工作区自动扩宽并持久化至 `localStorage`（`osu4k-sidebar-collapsed`）。
  - 上方 `FilterPanel` 支持收起为紧凑单行搜索条 + 筛选摘要胶囊（`osu4k-filter-collapsed`）。

### Changed
- **`pbakaus/impeccable` 风格左侧栏与底部试听浮窗重构**（`src/components/SideRail.tsx`, `src/components/AudioPlayerBar.tsx`, `src/index.css`）：
  - 左侧栏改为克制编辑风排版（机械感三段式目标胶囊、下划线式格式切换、`5px` 圆点预设索引与单线表格曲库摘要，去掉套娃卡片边框）。
  - 底部 `AudioPlayerBar` 改造成自适应居中圆角胶囊浮窗（圆形专辑缩略图、圆形播放键、`2px` 极细 `.impeccable-range` 滑轨与极简胶囊下载按钮）。
- **品牌更名与黑白粗线简约图标**（`src/components/TitleBar.tsx`, `index.html`, `electron/main.ts`）：主标题与托盘更名为 **`OSU!Downloader!`**，重绘纯单色高对比粗线条圆环下载图标（`LaneEmblem`）。
- **osu!lazer 风格全套离线字体**（`src/main.tsx`, `src/index.css`, `package.json`）：改为打包内嵌 `Quicksand`、`Outfit`、`Exo 2`（几何科技数字）与 `Noto Sans SC`（简体中文配套）+ `JetBrains Mono`。

## [1.3.1] - 2026-11-23

### Changed
- **极简扁平化按钮设计**（`src/index.css`, `FilterPanel.tsx`, `BeatmapCard.tsx`, `BeatmapListRow.tsx`, `LazerSongSelect.tsx`, `OverlayApp.tsx`, `ManiaPreviewModal.tsx`）：移除主按钮与卡片试听按钮的渐变底色、顶部高光内阴影及彩色光晕阴影，改为纯色扁平填充与干净的悬停状态过渡。
- **Mania 预览舞台严格 16:9 比例与真实材质动效**（`ManiaPreviewModal.tsx`, `maniaEngine.ts`, `server/skins.ts`）：
  - 预览主画布采用 `ResizeObserver` 锁定严格 `16:9` 比例，对齐 `osu!mania` 480p 轨道坐标系与 768p/`@2x` 1536p 纹理缩放规则。
  - `mania-stage-bottom` 以选定的 `1.50x` 倍率按 `BottomCentre` 不拉伸绘制在最上层，强制以 `60 FPS` 播放，并使用独立 `1x` 播放态时钟（暂停时立即定格）；内置 `SkinAnimator` 支持 240 帧 `ImageBitmap` 完整 LRU 流式缓存（`36f-2` 210 帧全程丝滑不卡顿），其余光效/长条动画尊重皮肤配置（缺省默认 `60 FPS`）。
  - 移除本地皮肤假 CSS/Canvas 渐变光效，接入真实 `mania-stage-light`（`ColourLight#` 乘法着色）、`lightingN`（点击/松手加法帧）与 `lightingL`（长按循环加法帧）渲染。

### Fixed
- **Windows 11 浮窗 Acrylic 真模糊生效**（`electron/main.ts`, `electron/preload.cjs`, `OverlayApp.tsx`, `src/index.css`）：移除破坏 DWM Acrylic 合成的 `frame: false` 与 `win.setOpacity()` 调用，改用 `titleBarStyle: 'hidden'` + `titleBarOverlay: false` + `backgroundMaterial: 'acrylic'` 与原生主题同步，并通过 `--mac-tint-alpha` CSS 变量实时控制毛玻璃底色浓度。
- **无完整本地音频谱面预览卡死 10 秒**：不再回落到官网 10 秒试听 MP3；无完整音频时以静音软件时钟完整推进全曲并显示「静音时间轴 · 16:9」提示。
- **音符过线残留与球皮/CANTARELLA 长条错位**：单键过判定线及长条过尾部时间立即从舞台消失；长条身体精确起止于头尾中心赤道以消除球皮底部多余凸出；对省略 `NoteBodyStyle` 的皮肤默认使用 Stretch (`0`) 并在缺省 `NoteImage#T` 时自动翻转头部作为长条尾部（修复 `[雪] Project CANTARELLA` 等胶囊长条显示）。

## [1.3.0] - 2026-11-23

### Added
- **osu!mania 谱面实时预览器**（`ManiaPreviewModal.tsx`, `maniaEngine.ts`, `server/preview.ts`, `server/skins.ts`）：
  - 完成下载后（或针对任意本地 Stable / Lazer 已装 Mania 谱面）即可打开演示预览窗口，支持 **可拖动 NPS 密度进度条**、**暂停/继续/±5s/重头**、**播放倍速 (`0.5x`–`1.5x`)**、**流速控制 (`1–40`，还原 osu!stable `13720/speed * hitPos/480` 与 BPM+SV 绿线联动)**、**下落/上升方向切换** 与 **右侧可上下滑动/缩放/跟随的缩略图**。
  - 支持扫描并切换本机 `D:\OSU\Skins` 全量本地皮肤（自动识别游戏当前激活皮肤 `osu!.<user>.cfg`）与 3 套内置极简演示皮肤（条形/圆珠/箭头）；内建零依赖 **PerCy 超长 LN 贴图无损裁切引擎**（`cropPngTopRows`），完美还原 `36f-2` 等 38,000px+ 长条纹理。
- **macOS 毛玻璃浮窗模式与游戏内实时加载**（`OverlayApp.tsx`, `electron/main.ts`, `server/installer.ts`）：
  - 新增始终置顶的 **Windows 11 Acrylic + macOS Vibrancy 磨砂浮窗**（支持红黄绿红绿灯折叠为 64px 极简搜索条/隐藏/展开主窗、透明度滑块、系统托盘与可配全局热键 `Alt+Shift+O`）。
  - 支持在 `osu!lazer` 与 `osu!stable` 运行时下载后自动触发客户端导入加载，并提供 `POST /api/game/load` 支持对已安装谱面一键「再次导入」在游戏内加载。

### Fixed
- 修复 `SelectField.tsx` 在使用 `<optgroup>` 分组选项时首组未命中即提前返回导致显示标签不随选择更新的问题，并为预览弹窗添加拖拽防误选保护。

## [1.2.0] - 2026-11-22

### Added
- **全视图滚底自动加载更多**：在 `卡片 (grid)`、`列表 (list)` 与 `Lazer (lazer)` 三种呈现形式下均接入基于对应滚动容器的 `IntersectionObserver` 自动加载（含并发锁、搜索纪元竞态过滤、错误熔断重试与 Lazer 键盘翻页预取）。
- **Ranked 谱面大致 PP 展示与多情景计算器**：
  - 新增 [src/utils/pp.ts](src/utils/pp.ts)：实现 `ppy/osu` Mania 准度制 PP 引擎（含物件长度加成、Miss 扣减、`EZ`/`NF`/`Classic` Mod 倍率、Mania `320:300 (MA 比)` 折算及 `HT`/`DT` 自定义倍速等效星数与 BPM 估算）。
  - 新增 [src/components/PpCalculatorPanel.tsx](src/components/PpCalculatorPanel.tsx)：内嵌于 [BeatmapDetailModal.tsx](src/components/BeatmapDetailModal.tsx)，提供实时 PP 与 4 档（95%/98%/99%/100% SS）情景对比矩阵、准度/倍速滑块、Mod 与 MA 比切换，以及未上架谱面「模拟上架计算」模式。
  - 在 `卡片`、`列表`、`Lazer` 轮盘与展开难度行对 `ranked`/`approved` 谱面展示可点击的 `~XXXpp`（`.chip-pp`）徽章；在 `Lazer` 左侧楔形面板内置 `HT / NM / DT` 快速切换 `PP 速览` 条；详情弹窗难度表新增 `大致 PP (98%/SS)` 列。

### Changed
- **Lazer 选歌界面动效性能优化**：
  - 解耦 `.lazer-slot`（纯 rAF 弧线位移 + `contain: layout style`）与 `.lazer-slot-inner`（点击/悬停水平滑移），消除滚动与切换动画冲突。
  - 改用批量先读后写、视口裁剪与增量写入的 `updateArcPositions()`；使用 `React.memo` 封装 `LazerCarouselSlot` 并仅对当前激活项挂载交错入场（`.lazer-diff-enter`）的难度列表；采用双缓冲背景交叉淡入（`blur-lg`）并移除轮盘卡片内 `backdrop-blur` 堆栈开销。

### Fixed
- 修复 [BeatmapDetailModal.tsx](src/components/BeatmapDetailModal.tsx) 新增 `大致 PP` 列后难度表星数胶囊内部 `★` 与星数数字折行的问题，并为全部视图星数胶囊补齐 `whitespace-nowrap shrink-0 leading-none` 防护。

## [1.1.0] - 2026-11-22

### Added
- **Song 选项卡三形态呈现切换**（`卡片 grid` / `列表 list` / `Lazer 选歌轮盘 lazer`），状态自动持久化至 `localStorage` 与 `config.json` (`viewMode`)：
  - 新增紧凑高密度列表组件 `src/components/BeatmapListRow.tsx`。
  - 新增 osu!lazer 风格选歌轮盘组件 `src/components/LazerSongSelect.tsx`：基于 `requestAnimationFrame` + CSS 变量 `--arc-x` 的二次曲线弧形滚动偏移、手风琴平滑展开/收起难度列表、左侧楔形大封面展示与 4 项属性动态进度条 (`SR` / `OD` / `HP` / `LN%`)、切歌自动试听开关及全键盘快捷键导航（`↑↓/WS`、`←→`、`Space`、`Enter`）。
  - 在 `src/index.css` 新增适配三套主题的 `--lazer-*` 语义色阶、GPU 合成动效类（`.animate-view-in`、`.lazer-slot`、`.lazer-diff-accordion` 等）。
- **结构化运行日志系统**：
  - 新增 `server/logger.ts`：向控制台与 `data/logs/server.log` 写入带时间戳和作用域的结构化日志，单文件超过 2 MB 自动轮转至 `server.log.1`。
  - 在 `server/index.ts`、`server/network.ts`、`server/downloader.ts` 接入启动/关闭、配置更新、代理与镜像测速、下载排队/完成/失败、搜索异常及 Lazer 批量导入日志。
  - 新增 `GET /api/logs?lines=120` 检索接口。
- **Git 版本管理与新对话交接文档**：
  - 初始化 Git 仓库（`main` 分支）并完善 `.gitignore`。
  - 新增 `README.md`、`AGENT.md`、`CHANGELOG.md` 与 `docs/DEVLOG.md`。

## [1.0.0] - 2026-11-22

### Added
- **Web MVP 核芯功能**：
  - 免登录搜索与下载：支持 `osu.direct` + 小夜镜像（Sayobot）双源搜索与自动故障转移；内置 7 个下载源（小夜自动/腾讯、Nekoha、osu.direct、BeatConnect、Nerinyan、可选官方源）。
  - 本地代理自动路由：默认探测 `127.0.0.1:6174`，支持多节点延迟测速推荐。
  - 双客户端协同（Stable `D:\OSU` + Lazer `D:\OSU\OSUlazer\osu-lazer`）：支持自动解压/保留 `.osz`、Lazer 运行中自动 IPC 导入与待导入队列批量导入、本地曲库扫描查重、Stable → Lazer 零流量同步打包。
  - Mania 4K 全量筛选、LN% 长条占比估算与 Rice/Hybrid/LN 分类、封面图缓存与底部音频试听栏。
- **Electron 桌面客户端**：
  - 新增 `electron/main.ts` 与 `electron/preload.cjs`，提供无边框自定义标题栏、原生路径选择对话框、外部官网链接唤起与 `electron-builder` 免安装打包（`release/win-unpacked/osu-4k-downloader.exe`）。
- **UI 精修与三主题体系**：
  - 新增三套简约主题实时切换（`曜石黑`、`瓷器白`、`浅咖啡`）。
  - 集成离线 `@fontsource` 四字体层级（`Plus Jakarta Sans`、`Inter`、`Space Grotesk`、`JetBrains Mono`）。
  - 为本地已安装谱面增加四边金色框体（`.card-installed` / `.card-installed-both`）与高对比金色徽章（`.chip-gold`）。

### Fixed
- 修复卡片悬停动画过程中卡片中间闪烁线条的问题：移除整体 `translateY` 位移，新增 `.cover-frame` 独立合成层与图片/遮罩 `-inset-[1px]` 溢边。
- 新增 `src/components/SelectField.tsx`，解决 Chromium 原生下拉箭头与自定义箭头重叠的双箭头显示问题。
