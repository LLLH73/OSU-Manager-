# AGENT.md — AI 助手快速接手手册

本文件用于在**新开对话**时，让接手的 AI 在 30 秒内完整掌握本仓库的业务背景、用户本机环境、代码架构、不可破坏的 UI/UX 约束与开发工作流。

---

## 1. 新对话 30 秒冷启动清单

每次在新对话开始修改代码前，请先执行以下三步：
1. 通读本文件 `AGENT.md`。
2. 阅读 `docs/DEVLOG.md` 最顶部（最新 1–2 次会话记录），了解最近改了什么、当前遗留与注意事项。
3. 运行 `git status` 和 `git log -n 10 --oneline` 确认当前分支、工作区与近期提交。

---

## 2. 用户画像与本机默认环境（不可破坏）

| 项目 | 约定值 / 路径 | 说明 |
| :--- | :--- | :--- |
| **主玩模式** | `osu!mania 4K` | 默认搜索锁定 `mode='3'`, `keys='4'` |
| **osu!stable 路径** | `D:\OSU` | osu!stable 客户端目录（默认解压进 `Songs\`） |
| **osu!lazer 数据路径** | `D:\OSU\OSUlazer\osu-lazer` | osu!lazer 客户端数据目录 |
| **osu!lazer 可执行文件** | `C:\Users\LLLH\AppData\Local\osulazer\current\osu!.exe` | `server/config.ts` 中 `detectLazerExePath()` 自动探测 |
| **Lazer 待导入目录** | `D:\OSU\Downloads\lazer-import` | Lazer 未运行时暂存 `.osz`，支持一键批量导入 |
| **本地代理** | `127.0.0.1:6174` (`proxyMode: "auto"`) | 国内镜像直连优先，海外源优先探测 `6174` 代理 |
| **账号要求** | **完全免登录** | 必须保证不填任何 osu! 账号 / Cookie 即可搜索、试听、下载 |
| **界面审美与习惯** | Impeccable 克制极简 | 中文界面，默认瓷器白 (`light`) + Lazer 视图 + 75% 全窗封面背景动态取色 + 8 套主题 + 默认 120% 字号 (`85%–125%`) |

> **关键警告**：
> - `data/` 目录（含用户的 `config.json`、`lazer-scan-cache.json`、封面/试听缓存、`data/logs/server.log`）已被 `.gitignore` 忽略，**绝不要提交到 Git**，测试时也**绝不要覆盖或清空用户的 Stable/Lazer 真实路径或 6174 代理配置**。
> - Electron 数据目录规则（`electron/main.ts`）：打包态（`app.isPackaged`）若未设置 `OSU_DL_DATA_DIR`，默认读写 `%APPDATA%\osu-4k-dual-downloader\data`；开发态默认读写工作区 `./data`。用打包程序做本地联调时可显式传入 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data`。

---

## 3. 代码架构与文件地图

### 3.1 桌面壳层 (`electron/`)
- `electron/main.ts`：单实例锁、Windows `AppUserModelId` (`com.osumapdownloader.mania4k`) 与 `resolveAppIconPath()`（`build/icon.ico` / `build/icon.png`）、无边框主窗口 (`frame: false, titleBarStyle: 'hidden'`, `backgroundThrottling: false`)、macOS 风格磨砂游戏内浮窗（`backgroundMaterial: 'acrylic'`, `/?mode=overlay`, 置顶 `screen-saver`）、全局快捷键 (`Alt+Shift+O`) 与系统托盘（含音乐播控与 `window:hideToTray` 后台挂机）、自动拉起内嵌后端 `dist-server/index.js`（默认端口 `3721`）、注册窗口/浮窗/目录文件选择/外部链接 IPC。
- `electron/preload.cjs` & `src/electron.d.ts`：通过 `contextBridge` 暴露 `window.electronAPI`（含主窗控制、文件弹窗及 `toggleOverlay` / `setOverlayOpacity` / `setOverlayCompact` / `setOverlayHotkey` / `openPreviewInMain` 等浮窗 IPC）。

### 3.2 后端服务 (`server/`, Node + Express v5 + TypeScript ESM)
| 文件 | 职责 |
| :--- | :--- |
| `server/index.ts` | Express 路由入口、SSE `/api/events`、托管生产构建 `dist/`、`startServer()` |
| `server/config.ts` | 读写 `config.json`，规范化 `proxyPort` / `concurrency` / `viewMode` / `onboardingCompleted`，初始化 `data/` 及 `data/logs/` |
| `server/envDetect.ts` | 跨机器本机环境与端口探测器：扫描多盘符 Stable 目录、解析 Lazer `storage.ini`、识别 `osu!.exe`、并发 TCP 探测代理端口与 IPv6 就绪状态 |
| `server/types.ts` | 后端核心类型（`AppConfig`, `DetectedEnvironment`, `SongViewMode`, `ThemeId`, `SearchFilters`, `NormalizedBeatmapset`, `DownloadTask` 等） |
| `server/logger.ts` | 零依赖结构化运行日志，输出至控制台与 `data/logs/server.log`（>2 MB 自动轮转至 `.1`），提供 `readRecentLogs()` |
| `server/sources.ts` | 7 个下载镜像定义：`sayobot-auto`, `sayobot-txy`, `nekoha`, `osudirect`, `beatconnect`, `nerinyan`, `official` |
| `server/network.ts` | `undici` 多 IP 协议族直连（DNS 缓存 + IPv6 优先/双栈 Happy Eyeballs）/代理路由、`6174` 端口 TCP 探测、并发镜像测速 `benchmarkMirrors()` |
| `server/search.ts` | `osu.direct` 主搜索 + Sayobot 故障转移、官网 URL/ID 直达、LN% 估算、PP 情景反推星数与精确过滤、本地状态注入 |
| `server/pp.ts` | 后端 PP 计算引擎（与前端一致的 Mania/通用公式）与 `deriveStarBoundsFromPpFilter()` 星数区间反推 |
| `server/downloader.ts` | 并发下载队列、Magic Bytes (`PK\x03\x04`) 流首检测、自动切源重试、SSE 实时推送 |
| `server/fastBatch.ts` | 快速跨页批量下载引擎：多镜像并发负载均衡、自动跨页扫描补齐目标数、跳过已装、IPv6/直连分流、Lazer 15 首合并 IPC 导入与节流 SSE 推送 |
| `server/filterArchives.ts` | Filter 存档持久化管理：原子读写 `data/filter-archives.json`（上限 100 条、置顶排序、筛选条件与可选浏览位置上下文校验） |
| `server/playlists.ts` | 音乐台歌单持久化管理：原子读写 `data/playlists.json`（上限 100 份歌单、置顶排序、曲目顺序与去重校验） |
| `server/installer.ts` | `.osz` ZIP 校验 (`adm-zip` 与 `verifyOszFileFast` 尾目录异步速检)、Stable 解压/直投 `.osz`（`fastInstallToStable`）/运行期临时 IPC、Lazer 极速暂存/批量导入/运行加载、`launchGameClient()` 客户端拉起 |
| `server/library.ts` | Stable `Songs` 扫描、Lazer `client.realm`/`online.db`/`files` 哈希扫描缓存、进程检测（含 `stableExeExists` / `lazerExeExists`）、双端差异比对 |
| `server/realmReader.ts` | 零原生依赖只读 Realm v24 (`T-DB`) 二进制解析器（带文件锁临时拷贝回退），读取 Lazer `client.realm` 谱面、难度、元数据、文件映射与游玩成绩 |
| `server/localLibrary.ts` | 双端本地曲库与成绩聚合器（融合 `osu!.db` / `Songs/` / `scores.db` 与 `client.realm` / `files/`），提供成绩去重、Mania PP 估算、延迟 `.osu` 背景提取与 SVG 回退、`.osu` 红线/Kiai/密度节奏解析及音频流输出 |
| `server/media.ts` | 封面图与 MP3 音频试听代理 + 本地磁盘 LRU 裁剪缓存 |
| `server/preview.ts` | Mania `.osu` 解析（红线 BPM + 绿线 SV + Barline + NPS 密度）、本地/ZIP/`cache/osz` 音源查找、`206 Range` 音频流与背景图输出 |
| `server/skins.ts` | 扫描 `D:\OSU\Skins` 与 `osu!.<user>.cfg` 激活皮肤、解析 `[Mania]` `skin.ini`、内置 3 套皮肤、PerCy 超长 LN PNG 无损前 2048 行扫描线裁切 (`cropPngTopRows`) |

#### 主要 HTTP / SSE 接口
- 健康与日志：`GET /api/health`、`GET /api/logs?lines=120`
- 配置与网络：`GET /api/config`、`PUT /api/config`、`GET/POST /api/config/detect-env`、`POST /api/config/background`、`DELETE /api/config/background`、`GET /api/network/status`、`POST /api/network/benchmark`
- Filter 存档：`GET /api/filter-archives`、`POST /api/filter-archives`、`PUT /api/filter-archives/:id`、`DELETE /api/filter-archives/:id`
- 本地 Book 档案库与音乐台接口：`GET /api/books`、`GET /api/books/:bookKey`、`GET /api/books/:bookKey/cover`、`GET /api/books/:bookKey/audio`、`GET /api/books/:bookKey/rhythm`、`GET/POST/PUT/DELETE /api/playlists`
- 搜索与媒体：`GET /api/search`（含 `minPp`/`maxPp`/`ppAccuracy`/`ppRate`/`ppMisses`/`ppMaRatio`/`ppClassic`/`ppEz`/`ppNf`/`ppIncludeUnranked`）、`GET /api/beatmapset/:id`、`GET /api/media/cover/:id`、`GET /api/media/preview/:id`、`GET /api/media/custom-bg`
- 预览与皮肤：`GET /api/preview/beatmapset/:setId`、`GET /api/preview/beatmapset/:setId/chart/:index`、`GET /api/preview/beatmapset/:setId/audio/:index`、`GET /api/preview/beatmapset/:setId/bg/:index`、`GET /api/skins`、`GET /api/skins/:skinId/mania`、`GET /api/skins/:skinId/asset`
- 本地曲库、Lazer 与游戏加载/启动：`GET /api/library/status`、`POST /api/library/rescan`、`GET /api/library/diff`、`POST /api/library/sync-to-lazer`、`POST /api/library/open-folder`（支持 `subFolder`）、`GET /api/lazer/pending`、`POST /api/lazer/import-pending`、`DELETE /api/lazer/pending`、`POST /api/game/load`、`POST /api/game/launch`
- 下载、快速批量与实时推送：`GET /api/downloads`、`POST /api/downloads`、`POST /api/downloads/batch`、`POST /api/downloads/:id/cancel`、`POST /api/downloads/:id/retry`、`DELETE /api/downloads/completed`、`GET/POST /api/fast-batch/(status|start|pause|resume|stop|clear)`、SSE `GET /api/events`（事件：`downloads`, `network`, `library`, `fast-batch`）

### 3.3 前端界面 (`src/`, React 19 + Vite 6 + Tailwind CSS v4)
| 文件 | 职责 |
| :--- | :--- |
| `src/main.tsx` | 引入离线 `@fontsource` Lazer 风格四字体（`Quicksand`, `Outfit`, `Exo 2`, `Noto Sans SC` 400/500/600/700 + `JetBrains Mono`），按 `?mode=overlay` 路由挂载 `OverlayApp` 或 `App` |
| `src/index.css` | 8 套主题 CSS Token（默认 `:root[data-theme="light"]` 瓷器白）、Tailwind `@theme inline` 固定 `--spacing: 4px` 与 `--ui-font-scale`（默认 `1.2`）、`.song-list-row` / `.modal-surface` GPU 合成隔离规则、Lazer 字体工具类、`.segmented-compact`/`.segmented-auto`、卡片金框、Lazer 轮盘动效样式 |
| `src/App.tsx` | 主工作区状态中心（配置、SSE 订阅、全窗双缓冲封面背景与主色调取色、侧栏/筛选折叠与进入音乐台自动收起主左侧栏、主题/视图模式持久化、滚底自动加载、批量选择与快速批量弹窗调度、`useCallback` 稳定列表回调） |
| `src/constants.ts` | 8 套主题元信息 (`THEME_OPTIONS`)、10 组强调色预设、`DEFAULT_FONT_SCALE = 1.2`、视图选项、工作流预设、官网光谱星数色阶 `getStarColor()` / `getStarSpectrum()`、统一 LN% 语义函数 `getLnCategory()` |
| `src/utils/themeColor.ts` | Canvas 24-bin 色相主色调提取器 (`extractDominantColor`) 与动态强调色 CSS 变量推导/应用 (`deriveAccentVariables`, `applyAccentVariables`, `clearAccentVariables`) |
| `src/utils/pp.ts` | Ranked PP 准度制计算引擎（含 35 组 `NM / DT / HT / 变速` 情景预设与主/副展示文案、`localStorage` 自定义情景持久化、`calculateBeatmapPp`, `getQuickPpSummary`, `getBeatmapsetPpBadge`, `extractPpScenarioFromFilters`, `formatPpScenarioShort`, `isRankedForPp`） |
| `src/utils/filterArchive.ts` | Filter 存档筛选净化、自动命名、语义摘要标签提取与创建时间格式化工具 |
| `src/utils/maniaEngine.ts` | osu!mania Canvas2D 轨道渲染器（480p 坐标、BPM+SV 时间轴、PerCy `NoteBodyStyle` 0/1/2）与右侧滚动缩略图绘制引擎 |
| `src/api.ts` | 前端 REST 封装（含 Book 档案库、自定义壁纸、IPv6 网络状态、快速批量下载与游戏客户端启动接口） |
| `src/types.ts` | 与后端对齐的前端 TypeScript 类型 |
| `src/components/TitleBar.tsx` | 无边框顶部栏（左侧栏与右侧存档栏折叠按钮、单色粗线 `OM` 图标 `LaneEmblem` + `OSU!Manager!`、浮窗开关、8 主题分组弹窗、代理 6174、镜像延迟、窗口控制） |
| `src/components/SideRail.tsx` | `pbakaus/impeccable` 风格可折叠左侧栏（三段工作区模式切换 `搜图 \| Book \| 音乐`、并排 `Book 档案库 \| OSU 音乐台` 入口、目标三段胶囊、下划线变体、5px 圆点预设、单线双端曲库摘要、并排「启动 Stable / Lazer」按钮、快速批量/队列/设置入口） |
| `src/components/music/OsuMusicMark.tsx` | 几何化高精度圆形 `osu!` 矢量徽标组件（随播放态/激活态触发信号色点亮） |
| `src/components/music/rhythmEngine.ts` | 音乐台节拍计算与 Web Audio 频带能量提取纯函数（`computeBeatState` 精确跟随红线/倍速/Kiai、`extractAudioBands` 分频段能量与瞬态检测） |
| `src/components/music/MusicPlayerContext.tsx` | 根级持久化音乐播放器上下文（拆分 `MusicControlContext` / `MusicTimeContext`、Web Audio `AnalyserNode`、倍速/原调锁高/NC 变调、歌单与红心、定时关闭、MediaSession 与托盘播控） |
| `src/components/music/MusicVisualizerCanvas.tsx` | 构成主义/瑞士风格高分屏可视化画布（`FFT // 频谱` 与 `SCOPE // 示波` 双模式，随 `theme` 切换重绘并支持后台零耗挂起） |
| `src/components/music/ConstructivistCoverStage.tsx` | 构成主义画幅 (`PROUN`) 与 Braun 瑞士唱盘 (`DISC`) 双封面舞台（含自适应换行防溢出的 `STABLE`/`LAZER`/`KIAI` 顶栏、60fps DOM-ref 实时节拍矩阵、有效倍速 BPM 与歌单快捷操作） |
| `src/components/music/constructivistRedraw.ts` | 专注画报模式快速 CIE Lab 封面谐振取色与构图配色族推导器 |
| `src/components/music/ConstructivistPosterBg.tsx` | 专注画报 (`ZEN`) 全屏高清原图背景层（底色/边角压暗/角标随全局明暗主题自适应切换）与谐振配色桥接组件 |
| `src/components/music/MusicParticleCanvas.tsx` | 跟随低频能量、节拍脉冲与主题配色的构成主义几何律动粒子画布（常规模式/专注画报均支持独立开关） |
| `src/components/music/MusicMiniDock.tsx` | 非音乐台视图下的后台纯播放瑞士极简悬浮迷你控制条（兼容搜图与 Book 底部避让） |
| `src/components/music/MusicPlayerMode.tsx` | 构成主义/瑞士风格 `OSU! AUDIO // 音乐台` 完整工作区（默认收起的歌单目录、封面与全宽可视化、可检索/排序曲库与队列、随 8 套主题联动的专注画报及 `.osu` 密度直方图底栏） |
| `src/components/book/RhineLoadingVeil.tsx` | RhineLabUI 风格同心扫描环加载校准遮罩 (`RhineLoadingVeil`，支持进入/主题校准/刷新) 与顶部筛选切换扫光提示 (`RhineFilterTransitionHud`) |
| `src/components/book/bookFilters.ts` | 本地 Book 多维筛选与排序纯函数引擎（来源/模式/键数/状态/评级/星数/PP/BPM/时长/LN%/谱师及 8 维度双向排序） |
| `src/components/book/BookFilterPanel.tsx` | 仿下载页 RhineLabUI 悬浮高级筛选矩阵（复用 `StarRangeSlider`、`PpRangeSlider`、`SelectField` 与 `QUICK_PRACTICE_TAGS`） |
| `src/components/book/BookMosaicView.tsx` | WebGL1 + Canvas2D 无字无缝平铺毛玻璃封面视图（方案 A 柔和光学窗、邻界混色整页模糊、悬停扩窗与毛玻璃虹膜叠化翻页，含 `ResizeObserver` 同步重绘） |
| `src/components/book/rhineMotion.ts` | RhineLabUI 临界阻尼弹簧、插值波形与相邻书脊高斯递减悬停联动数学原语 (`computeHoverWaveLift`) |
| `src/components/book/BookTextureManager.ts` | Canvas 动态贴图引擎（大号加粗描边书脊字样、纯哑光无封面顶面、双阶段重度缩采样高斯模糊、分帧绘制预算队列 `processPaintQueue`、LRU 保护与分批异步主题重绘 `setDarkModeAsync`） |
| `src/components/book/BookArchiveScene.ts` | Three.js 3D 循环档案架控制器（纯垂直悬停抽出、前后循环换行、Slot 池化与 `uSlotFade` 着色器远景淡入淡出、中键视角平移与复位、`HeroBookRig` 抽出渐清/翻开/放回与筛选阶梯波动） |
| `src/components/book/BookSpreadOverlay.tsx` | 打开 Book 后的 `React.memo` 双页展开内页浮层（带封面澄清动效、左页元数据/音频试听/操作，右页 `01 难度一览` / `02 历史成绩` / `03 曲目详档`） |
| `src/components/book/BookArchiveMode.tsx` | Book 模式主视图容器（`3D 书脊 \| 平铺毛玻璃` 切换、高级筛选浮层与双向排序、远景雾模糊遮罩、可收起/展开 `ACCESS BOOK` 浮卡、8 刻度导航与加载遮罩调度） |
| `src/components/FilterArchiveRail.tsx` | 默认收起的 Filter 存档右侧栏（保存当前搜索状态与可选浏览位置、实时锚点预览、置顶/内联重命名/覆盖更新/两步安全删除/搜索过滤） |
| `src/components/PpScenarioLibrary.tsx` | 左右主从分栏（Master-Detail）PP 情景库共享组件（左侧主模式轨道区分 `NM/DT/HT/Rate/自定义`，右侧展示对应副词条网格与自定义组合） |
| `src/components/StarRangeSlider.tsx` | Lazer 选歌风格加粗官方光谱星数上下界双滑块组件（`12px` 滑轨、`24×14px` 扁平长圆角纯色矩形手柄、`0.0★–15.0★ / ∞` 防抽搐定位与点按编辑） |
| `src/components/PpRangeSlider.tsx` | 同步风格 PP 范围双滑块组件（`12px` 滑轨、`24×14px` 扁平长圆角纯色矩形手柄、`0–2000pp / ∞`、防抽搐定位、点按直输与情景按钮槽位） |
| `src/components/FilterPanel.tsx` | 可收起/展开的搜索框、高频词条、基础筛选、星数双滑块 + PP 范围双滑块与多标签情景库浮层（含 `NM/DT/HT/变速/自定义` 预设与持久化保存）及高级数值/LN% 筛选（Lazer 模式下均采用悬浮层以免挤压选歌区） |
| `src/components/BeatmapCard.tsx` | `grid` 卡片网格单卡（`memo` + `.song-grid-card` `content-visibility: auto`，含 Ranked `~XXXpp` 与已装 Mania 预览入口） |
| `src/components/BeatmapListRow.tsx` | `list` 紧凑列表单行（`memo` + `.song-list-row` `content-visibility: auto` 无冗余模糊层，含 Ranked `~XXXpp` 与已装 Mania 预览入口） |
| `src/components/LazerSongSelect.tsx` | `lazer` osu!lazer 弧形选歌轮盘 + 左侧楔形展示（支持 `hasGlobalBg` 全窗背景穿透、头部纯倾向标签 `单键 Rice`/`综合 Hybrid`/`长条 LN`）+ 右侧平滑左移交错难度列表（`LN XX%`）+ 「回到选中 ↑/↓」「回到顶部」悬浮导航 + 滚底自动加载 + 键盘导航 |
| `src/components/ManiaPreviewModal.tsx` | Mania 谱面实时预览弹窗（自适应 120%–125% 字号布局、皮肤切换、流速/倍速/方向、Canvas2D 轨道、右侧可滑缩放缩略图、NPS 可拖进度条） |
| `src/components/MarqueeText.tsx` | 基于全局共享单例 `ResizeObserver` 的单行溢出往返平滑跑马灯组件（右缘渐隐，支持 `always` / `group-hover` 与减少动态偏好） |
| `src/components/OverlayApp.tsx` | macOS 毛玻璃游戏内浮窗（红黄绿灯折叠、Spotlight 搜索、实时下载/加载、透明度调节） |
| `src/components/PpCalculatorPanel.tsx` | 交互式 PP 情景估算计算器（准度/倍速/自定义黄彩比滑块+输入窗/Miss/Mod/未上架模拟） |
| `src/components/AudioPlayerBar.tsx` | `pbakaus/impeccable` 风格底部浮动胶囊音频试听栏（圆形封面、`2px` 细滑轨与自适应左侧栏折叠居中偏移） |
| `src/components/BeatmapDetailModal.tsx` | 谱面完整详情（`max-w-[960px]`、`overscroll-contain` + GPU 合成滚层）、全难度表（含 `大致 PP` 列、`Rice · LN XX%`/`Hybrid · LN XX%` 完整展示与单难度预览入口）、内嵌 PP 计算器、标签搜索、单独指定源下载 |
| `src/components/DownloadDrawer.tsx` | 下载任务队列（含完成态预览/再加载按钮）与 Lazer 待导入队列批量导入抽屉 |
| `src/components/FastBatchModal.tsx` | 极简纯文本「快速批量下载」工作台（目标数量 1–500、IPv6/直连分流、多镜像高并发与实时传输遥测） |
| `src/components/LibrarySyncModal.tsx` | 双端曲库比对与 Stable→Lazer 零流量同步弹窗 |
| `src/components/SettingsModal.tsx` | 客户端路径浏览、代理/IPv6 网络协议与镜像测速、8 主题/10 预设+自由取色强调色、界面字体大小缩放 (`85%–125%`，默认 `120%`)、自定义背景图与透明度 (`4%–100%`，默认 `75%`)、动态开关、浮窗热键、可选官方 Cookie 与「关于与帮助」（`v1.10.0` 版本号、GitHub 开源地址、重新观看新手引导）弹窗 |
| `src/components/OnboardingModal.tsx` | 首次安装 6 步交互式环境配置与新手引导向导（调用 `/api/config/detect-env` 探测多盘符客户端路径与本机代理端口，支持代理模式/端口预设、下载策略、实时主题/字号预览、配置摘要保存及防输入框箭头误触） |
| `src/components/SelectField.tsx` | 统一下拉封装（支持 `<optgroup>` 嵌套匹配，解决 Chromium 原生箭头重叠问题） |

---

## 4. 不可破坏的设计规范与历史避坑清单

1. **8 套主题与动态背景/强调色驱动**：所有界面（含 `LazerSongSelect` 轮盘与遮罩）必须使用 `src/index.css` 中定义的 `--t-*` 与 `--lazer-*` 变量，适配暗色 4 套（`dark`, `stone`, `midnight`, `forest`）与浅色 4 套（`light`, `paper`, `latte`, `sakura`），避免硬编码颜色；开启全窗封面/壁纸背景时（`html[data-has-bg="true"]`）由 `src/index.css` 统一控制面板玻璃透明度和动态 `--t-osu`/`--t-lazer`/`--pp-*` 对比度。
2. **Lazer 风格四字体离线层级与 `rem` 缩放约定**：不要改用在线 Google Fonts CDN；保留 `main.tsx` 中 `@fontsource`（`Quicksand`, `Outfit`, `Exo 2`, `Noto Sans SC` 400–700, `JetBrains Mono`）的离线导入和 `.font-display` / `.font-stat` / `.font-mono` 分工；界面字号统一使用 `rem` 以响应 `--ui-font-scale`（`--spacing: 4px` 保持布局间距固定）。
3. **Lazer 主界面防外层滚动约定**：`viewMode === 'lazer'` 时 `<main>` 必须维持视口锁定的 `overflow-hidden` 弹性列布局（切回 Lazer 归零 `scrollTop`），仅由 `LazerSongSelect` 右侧轮盘与左侧展板各自内部滚动；高级筛选在 Lazer 模式下采用悬浮弹出。
4. **已装谱面四边金色框体**：任意 Song 视图中，凡 `beatmapset.localStatus.inStable || beatmapset.localStatus.inLazer` 均需渲染 `.card-installed`（双端均已装追加 `.card-installed-both`）与 `.chip-gold`。**特别注意**：在 `LazerSongSelect` 中，`clip-path` 只能加在内部封面层 `.lazer-cover-slant`，不能直接裁切带边框的外层 `.lazer-set-card`，否则会削掉金色外框。
5. **防悬停闪烁线与 Lazer 轮盘性能规范（历史已修 Bug）**：
   - 严禁对包含放大缩放封面图的卡片整体施加垂直 `translateY` 悬停动画（会导致浏览器在卡片中间闪现亚像素接缝线）。
   - 封面容器统一使用 `.cover-frame`（`transform: translateZ(0); isolation: isolate; backface-visibility: hidden`），封面图与 `.cover-vignette` 均使用 `-inset-[1px]` / `calc(100% + 2px)` 溢边。
   - **Lazer 轮盘动效隔离与列表弹窗防掉帧**：禁止在 `.lazer-slot` 上添加 `transition`（它专供 rAF 实时写入 `--arc-x` / `--arc-opacity` 并保持 `contain: layout style`）；`.lazer-diff-enter` 通过 `--diff-x` 将终点精准对齐 `-8px` 以平滑左移；轮盘卡片及 `.song-list-row` / `.song-grid-card` / 实底 `.modal-surface` 内部禁止叠加 `backdrop-blur-*`，并为 `.song-list-row` 启用 `content-visibility: auto` 与 `memo`，避免列表模式下打开详情弹窗滚动时合成掉帧。
6. **自动加载与 PP 口径约定**：
   - 滚底自动加载时，`grid`/`list` 的 `IntersectionObserver` 必须以 `<main>`（`mainScrollRef`）为 `root`，`lazer` 必须以轮盘容器 `carouselRef` 为 `root`，并保留 `loadingMoreRef`、`searchEpochRef` 与 `!searchError` 保护。
   - 官方大致 PP 徽章（`.chip-pp`）仅在 `status === 'ranked' || status === 'approved'` 时渲染在列表卡片中；未上架图仅可在计算器弹窗内手动切换「模拟上架计算」。
7. **下拉框防双箭头**：所有 `<select>` 控件统一使用 `src/components/SelectField.tsx`，不要裸写受原生箭头干扰的下拉框。
8. **Lazer 快捷键隔离**：`LazerSongSelect` 的全局 `keydown` 监听必须继续屏蔽 `INPUT` / `TEXTAREA` / `SELECT` / `isContentEditable` 聚焦态，以及任意 `[role="dialog"]` 弹窗打开状态。
9. **PerCy 长条皮肤 & Windows 11 Acrylic 浮窗防坑**：
   - 本地 PerCy 皮肤（如 `36f-2`）的长条身体图高度常达 `38039px`，切勿直接传入浏览器 `<canvas>`，必须保留 `server/skins.ts` 的 `cropPngTopRows(buf, 2048)` 无损扫描线裁切；且向运行中 `osu!stable` 传参时务必使用 `TMP_DIR` 临时副本（Stable 会吞并/移动传入的 `.osz`）。
   - Electron 浮窗使用 `transparent: false` + `backgroundColor: '#00000000'` + `backgroundMaterial: 'acrylic'`，且 `electron/main.ts` 中的 `window:setBackgroundColor` 必须继续忽略 `overlayWindow`，避免实底色覆盖 Windows 11 亚克力毛玻璃。
10. **打包交付与清理检查**：
   - `start-desktop.bat` 与 `start.bat` 会优先启动 `release\win-unpacked\osu-manager.exe`，**代码修改后务必执行 `npm run typecheck` 和 `npm run electron:pack` 更新打包目录**（`electron-builder` 的 `afterPack` 钩子会自动运行 `scripts/apply-exe-icon.mjs` 调用本地 `rcedit.exe` 注入 `build/icon.ico` 与版本元数据）；构建全套 Windows Release 发行包（`dir`、`zip`、`portable`、`nsis`）请运行 `npm run electron:dist`。
   - 每次通过启动桌面端/后端做完测试后，务必关闭测试进程并确认 `3721` 端口已释放。

---

## 5. Git 提交与开发日志维护规范

1. **分支与提交格式**：主分支为 `main`，采用 Conventional Commits：
   - `feat(...)`: 新功能
   - `fix(...)`: Bug 修复
   - `refactor(...)`: 重构
   - `docs(...)`: 文档与日志更新
   - `chore(...)`: 构建/依赖/杂项
2. **每次会话收尾必做**：
   - 将本轮需求、关键变更文件、实机验证结果与提交哈希追加至 `docs/DEVLOG.md` 顶部；
   - 若有面向用户的新特性或破坏性/结构性变动，同步更新 `CHANGELOG.md`（必要时更新 `README.md` 与 `AGENT.md`）；
   - 确保 `git status` 干净（`data/`、`release/`、`dist*` 均被正确忽略）。
