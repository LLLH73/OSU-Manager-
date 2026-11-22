# 项目开发日志 (DEVLOG)

本日志按会话时间**倒序**记录（最新会话在最上方），方便新开对话的 AI 助手快速回溯上下文、技术决策、已踩坑点与提交历史。

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
