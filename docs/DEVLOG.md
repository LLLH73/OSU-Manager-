# 项目开发日志 (DEVLOG)

本日志按会话时间**倒序**记录（最新会话在最上方），方便新开对话的 AI 助手快速回溯上下文、技术决策、已踩坑点与提交历史。

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
