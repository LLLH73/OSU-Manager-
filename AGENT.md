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
| **osu!stable 路径** | `D:\OSU` | 用于**日常练习**（默认解压进 `Songs\`） |
| **osu!lazer 数据路径** | `D:\OSU\OSUlazer\osu-lazer` | 用于**刷 PP** |
| **osu!lazer 可执行文件** | `C:\Users\LLLH\AppData\Local\osulazer\current\osu!.exe` | `server/config.ts` 中 `detectLazerExePath()` 自动探测 |
| **Lazer 待导入目录** | `D:\OSU\Downloads\lazer-import` | Lazer 未运行时暂存 `.osz`，支持一键批量导入 |
| **本地代理** | `127.0.0.1:6174` (`proxyMode: "auto"`) | 国内镜像直连优先，海外源优先探测 `6174` 代理 |
| **账号要求** | **完全免登录** | 必须保证不填任何 osu! 账号 / Cookie 即可搜索、试听、下载 |
| **界面审美与习惯** | 简约美观 | 中文界面，支持「曜石黑 / 瓷器白 / 浅咖啡」三主题切换 |

> **关键警告**：
> - `data/` 目录（含用户的 `config.json`、`lazer-scan-cache.json`、封面/试听缓存、`data/logs/server.log`）已被 `.gitignore` 忽略，**绝不要提交到 Git**，测试时也**绝不要覆盖或清空用户的 Stable/Lazer 真实路径或 6174 代理配置**。
> - Electron 数据目录规则（`electron/main.ts`）：打包态（`app.isPackaged`）若未设置 `OSU_DL_DATA_DIR`，默认读写 `%APPDATA%\osu-4k-downloader\data`；开发态默认读写工作区 `./data`。用打包程序做本地联调时可显式传入 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data`。

---

## 3. 代码架构与文件地图

### 3.1 桌面壳层 (`electron/`)
- `electron/main.ts`：单实例锁、无边框窗口 (`frame: false, titleBarStyle: 'hidden'`)、自动拉起内嵌后端 `dist-server/index.js`（默认端口 `3721`，冲突回退随机端口）、注册窗口控制/目录文件选择/外部链接 IPC。
- `electron/preload.cjs` & `src/electron.d.ts`：通过 `contextBridge` 暴露 `window.electronAPI`（`minimize`, `toggleMaximize`, `close`, `isMaximized`, `setBackgroundColor`, `onMaximizedChange`, `selectDirectory`, `selectFile`, `openExternal`, `getAppVersion`）。

### 3.2 后端服务 (`server/`, Node + Express v5 + TypeScript ESM)
| 文件 | 职责 |
| :--- | :--- |
| `server/index.ts` | Express 路由入口、SSE `/api/events`、托管生产构建 `dist/`、`startServer()` |
| `server/config.ts` | 读写 `config.json`，规范化 `proxyPort` / `concurrency` / `viewMode`，初始化 `data/` 及 `data/logs/` |
| `server/types.ts` | 后端核心类型（`AppConfig`, `SongViewMode`, `ThemeId`, `SearchFilters`, `NormalizedBeatmapset`, `DownloadTask` 等） |
| `server/logger.ts` | 零依赖结构化运行日志，输出至控制台与 `data/logs/server.log`（>2 MB 自动轮转至 `.1`），提供 `readRecentLogs()` |
| `server/sources.ts` | 7 个下载镜像定义：`sayobot-auto`, `sayobot-txy`, `nekoha`, `osudirect`, `beatconnect`, `nerinyan`, `official` |
| `server/network.ts` | `undici` 直连/代理路由、`6174` 端口 TCP 探测、并发镜像测速 `benchmarkMirrors()` |
| `server/search.ts` | `osu.direct` 主搜索 + Sayobot 故障转移、官网 URL/ID 直达、LN% 估算与过滤、本地状态注入 |
| `server/downloader.ts` | 并发下载队列、Magic Bytes (`PK\x03\x04`) 流首检测、自动切源重试、SSE 实时推送 |
| `server/installer.ts` | `.osz` ZIP 校验 (`adm-zip`)、Stable 解压/`.osz` 安装、Lazer 运行检测/IPC 导入/待导入管理、Stable→Lazer 零流量打包 |
| `server/library.ts` | Stable `Songs` 扫描、Lazer `client.realm`/`online.db`/`files` 哈希扫描缓存、进程检测、双端差异比对 |
| `server/media.ts` | 封面图与 MP3 音频试听代理 + 本地磁盘 LRU 裁剪缓存 |

#### 主要 HTTP / SSE 接口
- 健康与日志：`GET /api/health`、`GET /api/logs?lines=120`
- 配置与网络：`GET /api/config`、`PUT /api/config`、`GET /api/network/status`、`POST /api/network/benchmark`
- 搜索与媒体：`GET /api/search`、`GET /api/beatmapset/:id`、`GET /api/media/cover/:id`、`GET /api/media/preview/:id`
- 本地曲库与 Lazer：`GET /api/library/status`、`POST /api/library/rescan`、`GET /api/library/diff`、`POST /api/library/sync-to-lazer`、`POST /api/library/open-folder`、`GET /api/lazer/pending`、`POST /api/lazer/import-pending`、`DELETE /api/lazer/pending`
- 下载与实时推送：`GET /api/downloads`、`POST /api/downloads`、`POST /api/downloads/batch`、`POST /api/downloads/:id/cancel`、`POST /api/downloads/:id/retry`、`DELETE /api/downloads/completed`、SSE `GET /api/events`（事件：`downloads`, `network`, `library`）

### 3.3 前端界面 (`src/`, React 19 + Vite 6 + Tailwind CSS v4)
| 文件 | 职责 |
| :--- | :--- |
| `src/main.tsx` | 引入离线 `@fontsource` 四字体并挂载 `App` |
| `src/index.css` | 三套主题 CSS Token (`--t-*` 与 `--lazer-*`)、四字体工具类、卡片金框、Lazer 轮盘动效样式 |
| `src/App.tsx` | 主工作区状态中心（配置、SSE 订阅、主题/视图模式持久化、搜索、批量选择、试听、弹窗协调） |
| `src/constants.ts` | 主题元信息 (`THEME_OPTIONS`)、视图选项 (`VIEW_MODE_OPTIONS`)、工作流预设 (`WORKFLOW_PRESETS`)、官网光谱星数色阶 `getStarColor()` / `getStarSpectrum()` |
| `src/api.ts` | 前端 REST 封装 |
| `src/types.ts` | 与后端对齐的前端 TypeScript 类型 |
| `src/components/TitleBar.tsx` | 无边框顶部栏（主题切换器、代理 6174 状态、最快镜像延迟、窗口控制） |
| `src/components/SideRail.tsx` | 左侧边栏（目标 `lazer/stable/both`、包体格式、Mania 4K 预设、双端曲库统计、队列与设置入口） |
| `src/components/FilterPanel.tsx` | 搜索框、高频词条、基础筛选、折叠高级数值/LN% 筛选 |
| `src/components/BeatmapCard.tsx` | `grid` 卡片网格单卡 |
| `src/components/BeatmapListRow.tsx` | `list` 紧凑列表单行 |
| `src/components/LazerSongSelect.tsx` | `lazer` osu!lazer 弧形选歌轮盘 + 左侧楔形展示 + 手风琴难度列表 + 键盘导航 |
| `src/components/AudioPlayerBar.tsx` | 底部浮动音频试听栏（带 4K 均衡器动效 `.eq`） |
| `src/components/BeatmapDetailModal.tsx` | 谱面完整详情、全难度表、标签搜索、单独指定源下载 |
| `src/components/DownloadDrawer.tsx` | 下载任务队列与 Lazer 待导入队列批量导入抽屉 |
| `src/components/LibrarySyncModal.tsx` | 双端曲库比对与 Stable→Lazer 零流量同步弹窗 |
| `src/components/SettingsModal.tsx` | 客户端路径浏览、代理与镜像测速、主题/偏好、可选官方 Cookie 设置弹窗 |
| `src/components/SelectField.tsx` | 统一下拉封装（解决 Chromium 原生箭头重叠问题） |

---

## 4. 不可破坏的设计规范与历史避坑清单

1. **三套主题 Token 驱动**：所有界面（含 `LazerSongSelect` 轮盘与遮罩）必须使用 `src/index.css` 中定义的 `--t-*` 与 `--lazer-*` 变量，适配 `dark`（曜石黑）、`light`（瓷器白）、`latte`（浅咖啡）三套主题，避免仅面向暗色写死颜色。
2. **四字体离线层级**：不要改用在线 Google Fonts CDN；保留 `main.tsx` 中 `@fontsource` 的离线导入和 `.font-display` / `.font-stat` / `.font-mono` 分工。
3. **已装谱面四边金色框体**：任意 Song 视图中，凡 `beatmapset.localStatus.inStable || beatmapset.localStatus.inLazer` 均需渲染 `.card-installed`（双端均已装追加 `.card-installed-both`）与 `.chip-gold`。**特别注意**：在 `LazerSongSelect` 中，`clip-path` 只能加在内部封面层 `.lazer-cover-slant`，不能直接裁切带边框的外层 `.lazer-set-card`，否则会削掉金色外框。
4. **防悬停闪烁线（历史已修 Bug）**：
   - 严禁对包含放大缩放封面图的卡片整体施加垂直 `translateY` 悬停动画（会导致浏览器在卡片中间闪现亚像素接缝线）。
   - 封面容器统一使用 `.cover-frame`（`transform: translateZ(0); isolation: isolate; backface-visibility: hidden`），封面图与 `.cover-vignette` 均使用 `-inset-[1px]` / `calc(100% + 2px)` 溢边。
   - `LazerSongSelect` 轮盘槽位仅做水平 `translate3d(calc(var(--arc-x) + var(--active-shift) + var(--hover-shift)), 0, 0)` 与 `opacity` 过渡。
5. **下拉框防双箭头**：所有 `<select>` 控件统一使用 `src/components/SelectField.tsx`，不要裸写受原生箭头干扰的下拉框。
6. **Lazer 快捷键隔离**：`LazerSongSelect` 的全局 `keydown` 监听必须继续屏蔽 `INPUT` / `TEXTAREA` / `SELECT` / `isContentEditable` 聚焦态，以及任意 `[role="dialog"]` 弹窗打开状态。
7. **打包交付与清理检查**：
   - `start-desktop.bat` 与 `start.bat` 会优先启动 `release\win-unpacked\osu-4k-downloader.exe`，**代码修改后务必执行 `npm run typecheck` 和 `npm run electron:pack` 更新打包目录**。
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
