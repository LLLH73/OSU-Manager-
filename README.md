# osu! 4K 谱面工坊 (`osu-4k-dual-downloader`)

面向同时游玩 **osu!stable（日常练习）** 与 **osu!lazer（刷 PP）** 的 **osu!mania 4K** 玩家的跨端桌面谱面下载器与双端曲库同步工具（v1.2.0）。无需登录 osu! 账号，即可完成多镜像搜索、音频试听、封面缓存、免登录高速下载与双客户端一键安装。

---

## 核心特性

1. **三种 Song 选项卡呈现形式与自动无限加载**
   - **卡片视图 (`grid`)**：多列大封面卡片，展示官方光谱色阶星数胶囊、LN% 长条占比徽章、Ranked 大致 PP 徽章（`~XXXpp`）、收藏/游玩数与快捷安装按钮（`L` / `S` / `双`）。
   - **列表视图 (`list`)**：高密度紧凑条目，横向展示缩略图、全量难度胶囊、Ranked PP 徽章、BPM/时长/统计与直接下载操作，适合快速扫图。
   - **Lazer 选歌界面 (`lazer`)**：仿 osu!lazer 选歌界面双栏布局与 GPU 合成动效：
     - **右侧弧形轮盘**：采用独立弧线层 + 视口裁剪 rAF 引擎实时计算二次曲线弧形偏移与淡出透明度，斜切封面右翼，选中项平滑左移突出。
     - **丝滑交错难度展开**：当前选中谱面集按需交错展开全部难度条目（含单难度 `~XXXpp`），点击或键位切换实时联动左侧展示区。
     - **左侧楔形展示**：大封面、状态与双端已装徽章、4 项动画属性条（`SR` / `OD` / `HP` / `LN%`）、`HT / NM / DT` 快速 PP 速览、物件构成明细、`自动试听` 开关与快速下载操作。
     - **键盘快捷键导航**：`↑` / `↓`（或 `W` / `S`）切歌、`←` / `→` 切换难度、`Space` 试听/暂停、`Enter` 打开完整详情弹窗。
   - **全视图滚底自动加载更多**：无论处于 `卡片`、`列表` 还是 `Lazer` 模式，滚动到底部附近自动拉取下一页谱面（Lazer 键盘翻页到底部同样自动预取）。

2. **Ranked 谱面大致 PP 展示与多情景计算器**
   - 所有列表视图与详情弹窗难度表对 `ranked`/`approved` 谱面展示基于 `ppy/osu` Mania 准度制公式的大致 PP。
   - 点击任意 `~XXXpp` 徽章或「PP 计算器」即可打开完整情景模拟器，自由调整 **准度（80%–100%）**、**失误数（Miss）**、**倍速（HT 0.75x ~ DT 1.5x / 0.5x–2.0x）**、**Lazer / Classic / EZ / NF** 以及 **320:300 (MA 比)**；未上架练习图也支持开启「模拟上架计算」。

3. **简约美学、三主题与已装谱面标识**
   - **三套主题实时切换**：`曜石黑 (dark)`、`瓷器白 (light)`、`浅咖啡 (latte)`，状态持久化至 `localStorage` 与后端 `config.json`。
   - **四字体离线层级**：打包内嵌 `@fontsource` WOFF2 字体，无需外网即可清晰区分标题（`Plus Jakarta Sans`）、正文（`Inter`）、数字/星数（`Space Grotesk` 等宽数字）与路径/技术指标（`JetBrains Mono`）。
   - **已装谱面四边金色框体**：在 `卡片`、`列表` 与 `Lazer` 视图中，本地已安装谱面均自动以四边金色框体 + 高对比 `Lazer 已装` / `Stable 已装` 金色胶囊标出。

3. **双客户端识别与零流量曲库同步**
   - **osu!stable**：默认路径 `D:\OSU`，支持自动解压到 `Songs/` 或保留 `.osz`。
   - **osu!lazer**：默认数据目录 `D:\OSU\OSUlazer\osu-lazer`、可执行文件自动探测 `osu!.exe`；客户端运行中时自动触发 IPC 导入，未运行时暂存至 `D:\OSU\Downloads\lazer-import` 支持一键启动批量导入。
   - **本地查重 & 零流量同步**：扫描 Stable `Songs` 与 Lazer 本地库，支持在「双端比对 · 零流量同步」弹窗中将 Stable 已有而 Lazer 缺少的谱面直接打包 `.osz` 导入 Lazer。

4. **多镜像源与代理智能路由**
   - 内置 7 个下载源与自动故障转移：**小夜自动 (`sayobot-auto`)**、**小夜腾讯 (`sayobot-txy`)**、**Nekoha (`nekoha`)**、**osu.direct (`osudirect`)**、**BeatConnect (`beatconnect`)**、**Nerinyan (`nerinyan`)**、**官方源 (`official`，可选 Cookie)**。
   - 默认探测本地代理 `127.0.0.1:6174`（`proxyMode: "auto"`）：国内镜像直连优先、海外源代理优先，并支持一键并发测速推荐最优节点。

5. **全量官网筛选 + Mania 4K 专项**
   - 默认锁定 `osu!mania 4K`，支持模式/键数/状态/排序/曲风/语言/星数/BPM/时长/OD/HP/AR/**LN% 长条占比**、本地查重过滤、高频词条、`Lazer 刷PP` / `Stable 日常练习` / `4K 单键 Rice` / `4K 长条 LN` / `Dan 段位` 等工作流预设，支持直接粘贴谱面集 ID 或 `osu.ppy.sh` 链接。

6. **结构化运行日志**
   - 服务端日志自动写入 `data/logs/server.log`（超过 2 MB 自动轮转至 `server.log.1`），并可通过 `GET /api/logs?lines=120` 查看最近日志。

---

## 快速启动

### 1. 桌面版一键启动（推荐）
- 双击根目录 [start-desktop.bat](start-desktop.bat)，或直接运行已打包的可执行程序 `release\win-unpacked\osu-4k-downloader.exe`。
- [start.bat](start.bat) 会优先拉起 Electron 桌面客户端，若未打包则回退至本地 Node 服务 + Edge/Chrome 独立窗口模式。

### 2. 开发与打包命令
```bash
# 安装依赖
npm install

# 启动前后端并行开发模式（API :3721 + Vite :5173）
npm run dev

# 全量 TypeScript 类型检查（Web / Server / Electron）
npm run typecheck

# 编译全端产物（dist/ + dist-server/ + dist-electron/）
npm run build

# 启动本地 Electron 开发窗口
npm run electron

# 打包 Windows 免安装目录版 -> release/win-unpacked/osu-4k-downloader.exe
npm run electron:pack
```

---

## 目录结构

```text
osumapdownloader/
├── AGENT.md                  # AI 助手快速接手指南（新对话必读）
├── CHANGELOG.md              # 版本变更日志
├── README.md                 # 项目说明文档
├── docs/
│   └── DEVLOG.md             # 按会话记录的详细开发日志
├── electron/                 # Electron 主进程与 preload 桥接
├── server/                   # Express 后端（搜索、镜像路由、下载队列、曲库扫描、日志）
├── src/                      # React 19 + Tailwind CSS v4 前端与 12 个功能组件
├── build/                    # 应用图标资源
├── data/                     # 本地运行配置、缓存、日志（已被 .gitignore 忽略）
├── package.json              # 项目脚本与 Electron Builder 配置
├── start-desktop.bat         # 桌面版快捷启动脚本
└── start.bat                 # 通用启动脚本
```

---

## 相关文档

- **AI 新对话接手手册**：[AGENT.md](AGENT.md)
- **开发日志（按会话追踪）**：[docs/DEVLOG.md](docs/DEVLOG.md)
- **版本更新日志**：[CHANGELOG.md](CHANGELOG.md)
