# Changelog

All notable changes to **OSU!Manager! (`osu-4k-dual-downloader`)** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.10.0] - 2026-11-25

### Added
- **适配不同电脑环境的 6 步交互式新手配置向导与本机环境自动探测**（`server/envDetect.ts`, `server/index.ts`, `server/types.ts`, `src/types.ts`, `src/api.ts`, `src/components/OnboardingModal.tsx`, `src/components/SettingsModal.tsx`, `src/App.tsx`）：
  - **后端多盘符与在线端口自动探测**：新增 `server/envDetect.ts` 与 `GET/POST /api/config/detect-env` 接口，自动扫描常见盘符下 `osu!stable` 根目录、解析 `%APPDATA%\osu\storage.ini` 与常见路径以定位 `osu!lazer` 数据目录及 `osu!.exe`、推导可用暂存目录与推荐默认目标，并并发 TCP 探测本机常见代理端口（`6174`、`7890` Clash、`7897` Clash Verge、`10808/10809` v2rayN、`2080` Sing-box、`20171` v2rayA、`1080/1081`、`12334` Hiddify、`8888`）及 IPv6 就绪状态。
  - **6 步可交互向导配置流程**：将首次引导升级为「`01 欢迎` → `02 客户端路径` → `03 网络与端口` → `04 外观与浮窗` → `05 核心功能` → `06 档案与完成`」6 步向导，支持一键填入探测路径、目录/文件浏览、点击候选路径、端口一键探测与快填、IPv6/下载目标/包体格式/线程/首选镜像配置、主题与字号实时预览、浮窗热键与自动导入开关，以及最终配置摘要确认与立即写入生效；在输入框聚焦时自动屏蔽左右箭头翻步，并在跳过或 `Esc` 时安全回滚未保存的预览状态。

### Changed
- **可执行文件更名为 `osu-manager`、启用 `asar` 打包并完善 Windows 全格式发行包与 GitHub Release 工作流**（`package.json`, `electron/main.ts`, `scripts/apply-exe-icon.mjs`, `scripts/publish-github-release.mjs`, `server/network.ts`, `start-desktop.bat`, `start.bat`, `src/components/OnboardingModal.tsx`, `src/components/SettingsModal.tsx`, `README.md`, `AGENT.md`）：
  - 将 `build.productName` 与 `build.win.executableName` 设为 `osu-manager`（输出 `release/win-unpacked/osu-manager.exe`，同步保留 `name: "osu-4k-dual-downloader"` 以兼容既有 `%APPDATA%\osu-4k-dual-downloader\data` 用户配置目录）；
  - 启用 `asar: true` + `asarUnpack: ["build/**"]` 并在 `electron/main.ts` 的 `resolveAppIconPath()` 中优先读取磁盘解包目录 `app.asar.unpacked/build/icon.ico`，将包内散落文件数从 `7,215` 项收敛至 `79` 项，显著加速压缩与便携版启动自解压；
  - 将 `scripts/apply-exe-icon.mjs` 接入 `electron-builder` 的 `afterPack` 钩子，并新增 `npm run electron:dist` 一次性输出 `dir`、`osu-manager-1.10.0-win-x64.zip`、`osu-manager-1.10.0-portable.exe` 与 `osu-manager-1.10.0-setup.exe`，配合零依赖 `scripts/publish-github-release.mjs` 与 `SHA256SUMS.txt` 自动上传 GitHub Releases；
  - 同步更新中英文 `README.md`、新手引导首屏及设置页关于副标题为面向全键位 `osu!mania` 双端玩家（默认 4K，支持 4K/7K/全键数切换筛选），并在 `README.md` 快速开始与顶部导航新增 GitHub Releases 一键下载入口。

## [1.9.0] - 2026-11-25

### Added
- **极简粗体「`OM`」品牌应用与可执行文件图标**（`build/icon.svg`, `build/icon.png`, `build/icon.ico`, `scripts/apply-exe-icon.mjs`, `electron/main.ts`, `index.html`, `src/components/TitleBar.tsx`, `package.json`）：
  - 全新设计白描黑底圆角方形粗线条 `OM` 几何图标（8× 超采样生成 `512×512` PNG 与 `16–256px` 多分辨率 `.ico`），并更新顶部标题栏单色 `LaneEmblem` 与网页 `<link rel="icon">`。
  - 新增 `scripts/apply-exe-icon.mjs` 并在 `npm run electron:pack` 中自动调用本地 `rcedit.exe` 向 `release/win-unpacked/osu-4k-downloader.exe` 写入 `.ico` 图标与 `OSU!Manager!` `1.9.0` 版本信息；`electron/main.ts` 同步配置 Windows `AppUserModelId` 与 `.ico` 窗口/托盘图标加载路径，确保任务栏、托盘与可执行文件图标一致显示。
- **首次安装 5 步交互式新手引导**（`src/components/OnboardingModal.tsx`, `src/App.tsx`, `server/config.ts`, `server/types.ts`, `src/types.ts`）：
  - 在配置模型中新增 `onboardingCompleted` 字段（配合 `localStorage` 双重持久化）；初次安装打开应用时自动弹出 5 步新手引导弹窗（欢迎与免登录定位、Lazer 选歌与 PP 筛选、双端同步与 Mania 预览、Book 档案库与音乐台、游戏内浮窗与首次路径检查），支持步骤条直跳与 `←` / `→` / `Esc` 键盘操作，之后可在设置中随时重看。
- **设置页版本号展示、GitHub 开源地址与新手引导重看入口**（`vite.config.ts`, `src/constants.ts`, `src/electron.d.ts`, `src/components/SettingsModal.tsx`）：
  - 通过 Vite 构建注入 `package.json` 的 `__APP_VERSION__` (`v1.9.0`)；在设置弹窗顶部、新增的「5. 关于与帮助」分区与底部页脚清晰展示当前版本号、`https://github.com/LLLH73/OSU-Manager-` 可点击外链与一键复制按钮，以及「重新观看新手引导」入口。
- **中英文双语 GitHub README**（`README.md`）：完善包含项目定位、全功能介绍、安装运行与构建命令、数据目录说明及目录结构的简体中文 + English 双语开源仓库主页文档。

### Fixed
- **修复音乐台「专注画报 (`ZEN`)」模式不跟随全局主题、始终呈暗色样式的问题**（`src/components/music/MusicPlayerMode.tsx`, `src/components/music/ConstructivistPosterBg.tsx`, `src/components/music/MusicVisualizerCanvas.tsx`, `src/components/music/MusicParticleCanvas.tsx`）：
  - 移除 `data-player-dark={zenMode || isDark}` 与 `zenRootStyle` / `ZenPosterInfoCard` / `ConstructivistPosterBg` 中写死的暗黑背景与半透明黑底板，改由当前主题的 `--t-canvas`、`--t-surface-*`、`--t-ink*` 与封面谐振主色联动驱动；并让可视化与粒子画布响应 `theme` 变化实时重绘，使「专注画报」在全部 4 套浅色主题与 4 套暗色主题间无缝同步切换。

## [1.8.0] - 2026-11-24

### Added
- **构成主义 / 瑞士风格 OSU! 背景音乐播放器 (`OSU! AUDIO // 音乐台`)**（`server/playlists.ts`, `server/localLibrary.ts`, `server/index.ts`, `electron/main.ts`, `src/components/music/*`, `src/components/SideRail.tsx`, `src/components/book/*`, `src/App.tsx`, `src/index.css`）：
  - **多入口与后台纯播放架构**：新增 `MusicPlayerProvider`（`MusicControlContext` + `MusicTimeContext` 分离降低重渲染）作为根级持久化音频与 Web Audio `AnalyserNode` 引擎；支持从 **左侧栏**（三段工作区模式 `搜图 | Book | 音乐` 与 `OSU 音乐台` 按钮）及 **Book 模式**（顶栏 `音乐台` 按钮与预览浮卡/展开双页内 `在音乐台中播放`）进入，切离后通过 `MusicMiniDock` 悬浮迷你条继续后台纯播放（与搜图试听/谱面预览/Book 试听互斥防串音）；Electron 主窗启用 `backgroundThrottling: false`，支持「后台挂机」隐藏至系统托盘（含托盘播控菜单）及 Windows MediaSession 媒体键联动。
  - **本地 `.osu` 节奏解析与实时可视化**：新增 `GET /api/books/:bookKey/rhythm`（解析本地 `.osu` 非继承红线 TimingPoints、Kiai 高潮区间与 72 段物件密度分布）及前端 `rhythmEngine.ts`，驱动 `ConstructivistCoverStage`（「构成画幅」与无框「瑞士唱盘」双封面展示、动态节拍矩阵 `[01]..[04]`、有效倍速 BPM、Kiai 高潮徽章、高精度落针唱臂与角度复位保护）及横贯底部的宽轴 `MusicVisualizerCanvas`（`FFT // 频谱` 与 `SCOPE // 示波` 双模式高分屏画布）。
  - **专注画报 (`ZEN`) 原图直出与可开关音频律动粒子**（`src/components/music/constructivistRedraw.ts`, `ConstructivistPosterBg.tsx`, `MusicParticleCanvas.tsx`, `MusicPlayerMode.tsx`）：在「专注画报」下直接全屏高清展示原始曲目封面并保留 CieLab 快速取色，使前景可收起信息卡与宽轴可视化依据封面色系自适应谐振配色；同步在顶栏新增「`粒子`」开关（支持常规模式与专注画报双重叠加跟随低频与节拍脉动的几何微粒效果，`localStorage` 记忆状态）。
  - **全套播放控制、歌单持久化与清晰侧栏层级**（`src/App.tsx`, `MusicPlayerMode.tsx`）：主界面左侧导航栏启动默认展开，切入音乐台时主动收起主界面左侧栏（仍可随时通过标题栏开关手动展开），音乐台内置左侧「曲库与歌单」栏默认收起并支持一键折叠；居中齐边双层密度/进度条、几何化 `osu!` 圆形徽标（`OsuMusicMark`）、播放/暂停、上/下一首、列表/单曲/随机循环、`0.50×–2.00×` 连续倍速及「原调锁高 / Nightcore 磁带变调」、滚轮音量与静音、定时关闭；新增 `server/playlists.ts` 与 `GET/POST/PUT/DELETE /api/playlists`（持久化至 `data/playlists.json`）。

### Fixed
- **修复 Lazer 曲库高索引曲目仅有 9 秒在线试听或 0 秒无法播放完整本地音源的问题**（`server/realmReader.ts`, `server/localLibrary.ts`, `src/components/music/MusicPlayerContext.tsx`）：修复 Realm 二进制解析中簇索引偏移、字符串偏移、`BPlusTree` 长文件列表及 `ObjLink` 误按有符号 16 位读取导致 `>=32,768` 键值（如 `最終鬼畜妹`、`End Time`、`NANO DEATH!!!!!` 等 93 套 Lazer 曲目）溢出回绕成负数并丢失音频哈希的缺陷，并补充 `.osu` `AudioFilename` 与主音轨启发式回退以及 `<audio onDurationChange>` VBR 时长刷新。
- **修复音乐台封面/唱盘框体右上角 `STABLE` / `LAZER` / `KIAI` 徽标溢出问题**（`src/components/music/ConstructivistCoverStage.tsx`）：调整画幅/唱盘卡片容器内边距与 `min-w-0` 约束，使顶栏信息条支持自适应换行（`flex-wrap`）、长 `SET #...` 编号安全截断，并收紧徽标字距与内边距，确保双端曲目同时展示 `STABLE`、`LAZER`、`KIAI` 时在所有桌面宽度下均不超出框体边界。
- **修复在搜图选歌主界面切换后台音乐播放状态触发谱面列表重新搜索加载的问题**（`src/App.tsx`）：在 `AppWorkspace` 中改用解构后的 `useMusicPlayer()` 稳定回调引用（`pause` / `playTrack`）与 `isPlayingRef`，消除 `openManiaPreview` 因依赖整包 `musicPlayer` 上下文对象而在播放/暂停切换时重建、进而触发初始化 `useEffect` 重连 SSE 与重复执行默认搜索的问题。

### Changed
- **品牌更名为 `OSU!Manager!`**（`src/components/TitleBar.tsx`, `index.html`, `electron/main.ts`）：将主界面左上角标题、网页标题、Electron 窗口标题与托盘菜单/提示更名为 **`OSU!Manager!`**（保持既有安装包产物名与用户数据目录兼容不变）。

## [1.7.0] - 2026-11-24

### Added
- **Book 模式入口与 RhineLabUI 风格 3D 本地曲库档案库**（`server/realmReader.ts`, `server/localLibrary.ts`, `server/index.ts`, `server/types.ts`, `src/api.ts`, `src/types.ts`, `src/components/SideRail.tsx`, `src/App.tsx`, `src/index.css`, `src/components/book/*`）：
  - **双端本地曲库深度聚合与零依赖 Realm 读取**：新增只读 Realm v24 二进制解析器 `realmReader.ts` 与本地曲库聚合器 `localLibrary.ts`，统一融合 `osu!stable`（`osu!.db`、`Songs/`、`scores.db`）与 `osu!lazer`（`client.realm`、`files/`），支持谱面与成绩跨端去重、Mania PP 估算、MA 比统计及延迟 `.osu` 背景解析（无背景时输出 RhineLab 建筑线框 SVG 回退）与 `206 Range` 本地音频直出；开放 `GET /api/books`、`GET /api/books/:bookKey`、`GET /api/books/:bookKey/cover`、`GET /api/books/:bookKey/audio` 接口。
  - **Three.js 3D 书脊档案架与平铺毛玻璃视图 (`BookMosaicView`)**：每首本地歌曲默认以大号加粗描边书脊字样、纯哑光无封面顶面及双阶段重度高斯模糊侧脊/正面封面陈列于 3D 多通道档案架（修复悬停抽出倾斜改为严格垂直升降），支持前后档案无缝循环、Slot 对象池与分帧绘制消除卡顿、远景平滑雾化、`uSlotFade` 淡入淡出、鼠标中键移动视角、点击渐清及平滑放回动画；同步在顶部新增 `平铺毛玻璃` 视图入口，以无字无缝平铺封面配合邻界混色、**方案 A 柔和光学窗**（边缘毛玻璃柔融 + 中心清晰）与**毛玻璃虹膜叠化 (`frost-iris`)** 翻页动效呈现，点击任意封面均可打开详情内页。
  - **加载校准遮罩、仿下载页高级筛选与双页展开内页**：在 `SideRail` 新增「工作区模式（搜图下载 | Book 模式）」与「进入 Book 档案库」入口；新增 `RhineLoadingVeil`（进入/主题校准/刷新）与筛选切换 `RhineFilterTransitionHud`；新增可折叠 `BookFilterPanel` 高级筛选矩阵（复用 `StarRangeSlider`/`PpRangeSlider`/`SelectField` 与高频词条，支持来源/模式/键数/状态/评级/星数/PP/BPM/时长/LN%/谱师与 8 维双向排序）；支持右中 `ACCESS BOOK` 浮卡收起/展开记忆；双页 Spread 展示 `01 难度一览`、`02 历史成绩` 与 `03 曲目详档`。
- **Filter 存档功能与默认收起右侧栏（含浏览位置与上下文保存/恢复）**（`server/filterArchives.ts`, `server/index.ts`, `src/utils/filterArchive.ts`, `src/components/FilterArchiveRail.tsx`, `src/components/TitleBar.tsx`, `src/components/FilterPanel.tsx`, `src/App.tsx`）：
  - 在标题栏新增对称「存档」开关（默认收起）并在筛选栏新增快捷 `存档` 按钮，支持 `2xl:`（`>=1536px`）内联停靠与 `<=xl` 右侧覆盖抽屉两种响应式形态。
  - 支持将当前搜索状态（全部筛选选项、搜索框内容、存档名称、创建时间与可选「当前页面浏览位置与前后上下文」）持久化保存至 `data/filter-archives.json`，提供关键词过滤、置顶、内联重命名、覆盖更新与两步安全删除。
  - 恢复含浏览位置的存档时，支持自动翻页或深层偏移窗口直跳并附带「向上加载更早谱面 / 回到第 1 页」上下文条，在 `Lazer`、`列表` 与 `卡片` 视图下自动定位高亮目标曲目；若原曲变动则自动降级定位至相邻上下文并提供「查看原谱面」详情入口。

### Changed
- **PP 情景预设库升级为左右主从分栏层级**（`src/utils/pp.ts`, `src/components/PpScenarioLibrary.tsx`, `src/components/FilterPanel.tsx`, `src/components/PpCalculatorPanel.tsx`）：
  - 将 `NM 常速`、`DT 1.5x`、`HT 0.75x`、`变速 Rate` 与 `自定义` 5 个主词条独立为左侧垂直主模式轨道（带模式色条、副注与当前生效指示点），右侧独立面板展示去冗余前缀、突出准度/倍速与黄彩比/Miss 的副词条网格，清晰区隔主词条与副词条关系。

### Fixed
- **修复窄屏抽屉堆叠层级与双侧栏横向收缩**（`src/App.tsx`）：将左右窄屏抽屉移至根节点 `z-50` 层级以免顶部标题栏遮挡抽屉关闭按钮，并为 `<main>` 添加 `min-w-0` 防止双侧栏展开时横向溢出。

## [1.6.3] - 2026-11-24

### Added
- **扩展 PP 筛选与计算器的 DT / HT / 变速多维情景预设库与自定义持久化**（`src/utils/pp.ts`, `src/components/FilterPanel.tsx`, `src/components/PpCalculatorPanel.tsx`）：
  - 在 `src/utils/pp.ts` 内置 35 组覆盖 **`NM 常速`**、**`DT 1.5x`**、**`HT 0.75x`** 与 **`变速 Rate` (`0.85x–1.4x`)** 的典型 Mania 表现组合（含对应准度 `94%–100% SS`、黄彩比 `1.5:1–8:1` 与 `0–8 Miss`），支持 `localStorage` 自定义命名持久化（上限 24 条、自动去重与跨面板实时同步）。
  - 升级 `FilterPanel` PP 情景浮层：新增五标签情景库、视口自适应上下弹出与最大高度约束、常用区间补充至 `1000+`；在自定义区新增倍速输入窗+滑块+快捷档、准度快捷档、黄彩比实时彩占/折算准度读数+快捷档、Miss 快捷档及「`+ 存为自定义`」持久化保存栏；右侧触发按钮支持溢出省略，收起态徽章同步显示完整情景标签。
  - 在 `PpCalculatorPanel` 同步加入同类多标签快捷情景栏与自定义情景保存能力，并联动 `LazerSongSelect` 左侧 PP 速览（自动跟随筛选倍速切换 HT/NM/DT 并套用黄彩比/Miss/Mod）。

### Changed
- **完善 `Miss > 0` 情景下的后端星数上界反推**（`server/pp.ts`）：在 `deriveStarBoundsFromPpFilter()` 中对失误大于 0 的 DT/HT/NM 组合补充保守准度折损下界估算，在上游搜索阶段即可合理收窄最高星数并保证零漏召回。

## [1.6.2] - 2026-11-24

### Changed
- **星数与 PP 滑块升级为更扁长的 `24×14px` 纯色矩形手柄，并提升有限上限至 `15.0★` / `2000pp`**（`src/components/StarRangeSlider.tsx`, `src/components/PpRangeSlider.tsx`, `src/components/FilterPanel.tsx`）：
  - 将左右滑动手柄由 `10×20px` 竖向短块升级为更扁更长的 `24×14px` 扁平圆角纯色矩形，改用内缩定位以在左右端精准贴齐 `12px` 滑轨且不遮挡数值胶囊；
  - 将星数滑块与手动输入上限由 `10.0★+` 提升至 `15.0★`（尾段留出 `∞` 档位），将 PP 滑块与手动输入上限提升至 `2000pp`（尾段留出 `∞` 档位），微调第 3 行栅格比例保证窄窗口不挤压轨道。

### Fixed
- **彻底修复拖动右侧上界滑块在「无穷 (`∞`) ↔ 有限数值」边界反复抽搐跳动的问题**（`src/components/StarRangeSlider.tsx`, `src/components/PpRangeSlider.tsx`）：
  - 将清除复位图标改为固定占位槽（无条件占位 + 禁用/隐形态切换）、为上下界数值胶囊与编辑框设定等宽 `rem` 尺寸，消除切换 `∞` 与有限值时右侧胶囊/按钮显隐导致 `flex-1` 滑轨宽度跳变引发的坐标反馈震荡；
  - 同步在拖拽期间冻结滑轨边界矩形并记录手柄抓点偏移量 (`grabOffset`)，命中手柄点击不瞬间跳值，靠近滑轨末段设置清晰的非震荡回滞区 (`15.0★` vs `≥15.2` → `∞`、`2000pp` vs `≥2025` → `∞`)。

## [1.6.1] - 2026-11-24

### Changed
- **加粗星数双滑块滑轨与扁平圆角纯色矩形手柄**（`src/components/StarRangeSlider.tsx`）：将星数光谱滑轨由 `8px` 加粗至 `12px`，左右双滑块升级为 `10×20px` 扁平圆角纯色矩形（`rounded-[4px] bg-osu`，去除了白边与投影）。
- **新增同步风格 PP 范围双滑块 `PpRangeSlider`**（`src/components/PpRangeSlider.tsx`, `src/components/FilterPanel.tsx`）：将主筛选栏中的 PP 上下限输入替换为与星数滑块同风格的 `0–1000pp` 双滑块（`12px` 滑轨 + `10×20px` `bg-lazer` 扁平圆角纯色矩形手柄 + 点击胶囊直输上限至 `5000pp` + 一键复位 + 情景按钮集成）。

## [1.6.0] - 2026-11-24

### Added
- **PP 计算自定义黄彩比滑块与数值输入窗**（`src/utils/pp.ts`, `src/components/PpCalculatorPanel.tsx`）：
  - 新增「自定义黄彩比 (彩300 : 黄300)」控制卡片，提供连续滑动条（`0–20`，步进 `0.1`）与同步数值输入框（`0–999`，带 `: 1` 后缀及一键「直算」清除），实时显示双视角比值（`彩:黄` / `黄:彩`）、彩 300 占比与折算准度，并修复 `maRatio = 0` 的全黄边界计算。
- **Lazer 风格星数上下界双滑块 `StarRangeSlider`**（`src/components/StarRangeSlider.tsx`, `src/components/FilterPanel.tsx`）：
  - 在搜索筛选面板常驻 Lazer 选歌风格官方光谱双滑块（`0.0★–10.0★+ / ∞`），支持指针捕获双柄自由拖动设定下界/上界、键盘微调、点击星数胶囊精准编辑与一键复位，并移除「高级筛选」中冗余的纯数字星数输入框。
- **给定 / 自定义情景下的大致 PP 范围筛选**（`server/pp.ts`, `server/search.ts`, `server/index.ts`, `server/types.ts`, `src/types.ts`, `src/components/FilterPanel.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`, `src/components/LazerSongSelect.tsx`, `src/components/BeatmapDetailModal.tsx`, `src/components/FastBatchModal.tsx`, `src/App.tsx`）：
  - 在筛选主栏右侧新增「大致 PP」上下限输入与悬浮「情景」配置浮层（含常用 PP 区间、8 组给定情景预设、自定义准度/倍速/黄彩比/Miss/Mod 与「含未上架谱面」模拟选项）；
  - 后端新增 `server/pp.ts` 分析反推公式 `deriveStarBoundsFromPpFilter()`，自动将情景 PP 区间换算为上游 `osu.direct` / `Sayobot` 星数与状态过滤范围后再按单难度精确匹配，并使列表 `.chip-pp`、Lazer 难度行及详情计算器实时响应当前筛选情景。
- **左侧栏一键启动 osu!stable / osu!lazer**（`server/config.ts`, `server/library.ts`, `server/installer.ts`, `server/index.ts`, `src/api.ts`, `src/components/SideRail.tsx`, `src/App.tsx`）：
  - 新增 `POST /api/game/launch` 接口与 `SideRail`「启动 Stable」「启动 Lazer」按钮：启动前自动检测已运行进程并优先切至前台以防 `osu!stable` 弹出双开警告，未运行时脱离启动并在缺失路径时引导至设置面板；同步优化 `SideRail` 与 `FilterPanel` 垂直间距，确保 `1280×720` 与 `1040×680` 下无滚动遮挡与按钮文字裁切。

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
