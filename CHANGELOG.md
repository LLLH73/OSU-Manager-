# Changelog

All notable changes to **osu! 4K 谱面工坊 (`osu-4k-dual-downloader`)** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
