# 项目开发日志 (DEVLOG)

本日志按会话时间**倒序**记录（最新会话在最上方），方便新开对话的 AI 助手快速回溯上下文、技术决策、已踩坑点与提交历史。

---

## Session 16 — 音乐台左侧栏自动收起与封面顶栏徽标防溢出优化 (`v1.8.0`)

- **日期**：2026-11-25
- **对话 ID**：`09e49c4e-3701-4043-82c7-d9fba139a0f4`
- **版本**：`v1.8.0`
- **关联提交**：`f97e0fa`
- **本次需求**：
  1. 保持主界面左侧栏默认展开、音乐台内置歌单左侧栏默认关闭，但进入音乐台后主界面左侧栏应主动收起；
  2. 修复音乐台画幅/唱盘框体右上方同时显示 `STABLE`、`LAZER`、`KIAI` 时 `KIAI` 徽标超出框体的问题。
- **关键改动**：
  1. **进入音乐台自动收起主左侧栏**（`src/App.tsx`）：在 `switchWorkspaceMode` 的 `nextMode === 'music'` 分支内调用 `setSidebarCollapsed(true)`（覆写此前 Session 15 中不再收起主左侧栏的设定），确保从左侧栏三段切换、`OSU 音乐台` 按钮、Book 模式或迷你条返回音乐台时主导航栏均主动让出横向空间，同时仍保留标题栏按钮手动重展开能力与音乐台自身歌单栏默认收起态。
  2. **修复 `STABLE` / `LAZER` / `KIAI` 徽标溢出**（`src/components/music/ConstructivistCoverStage.tsx`）：为外层卡片容器补充 `min-w-0` 并微调内边距至 `p-3 sm:p-3.5`（保留无 `overflow-hidden` 以免裁切「加入歌单」弹出菜单）；将 Swiss Header Strip 改为 `min-w-0 flex-wrap`，左侧 `SET #...` 支持截断，右侧徽标容器设为 `ml-auto flex max-w-full shrink-0 flex-wrap justify-end gap-1` 并调整 `STABLE`/`LAZER`/`KIAI` 字号、字距与 `whitespace-nowrap`。
- **验证结果**：
  - `npm run typecheck` 与 `npm run electron:pack`（`v1.8.0`）全部退出码 `0` 通过，生成更新版 `release\win-unpacked\osu-4k-downloader.exe`（`249,978,368` 字节）。
  - **真实浏览器界面实测**（`http://127.0.0.1:3728`，隔离目录 `%TEMP%\osu-dl-verify-v180`，0 控制台/页面报错）：
    - `1440×900` 初始主界面左侧栏默认展开（`width: 248px`），切入音乐台后主动收起为 `0px`（标题栏提示切换为 `展开左侧栏`），音乐台内置「曲库与歌单」侧栏默认收起（DOM 数量 `0`）；手动点「展开左侧栏」可恢复 `248px`，再次切入音乐台后重新自动收起至 `0px`。
    - 选用双端已装曲目 `Dan ~ REFORM ~ JackMap Pack`（`SET #2316976`，`inStable=true, inLazer=true`），分别在 `1440×900`（`xl`，卡片宽 `327px`）与 `1120×760`（`lg`，卡片宽 `277–287px`）下验证 `画幅` 与 `唱盘` 两种模式：DOM `getBoundingClientRect()` 测得 `STABLE`、`LAZER`、`KIAI` 全部满足 `left >= card.left` 且 `right <= card.right`（`0px` 溢出）。
  - **打包产物冒烟与清理**：启动 `release\win-unpacked\osu-4k-downloader.exe`（`OSU_DL_DATA_DIR=%TEMP%\osu-dl-verify-exe-v180`, `PORT=3729`）实测 `GET /api/health` 返回 `{"ok":true,...}`，随后终止全部测试进程并删除临时目录，确认 `3721`/`3728`/`3729` 端口监听数均为 `0`，用户 `data/config.json` 完整无损。

---

## Session 15 — 品牌更名 `OSU!Manager!` 与构成主义/瑞士风格 OSU! 本地背景音乐播放器 (`v1.8.0`)

- **日期**：2026-11-24
- **对话 ID**：`56adc306-8af7-44e5-bd61-cdcc0f025dea`
- **版本**：`v1.7.0` → `v1.8.0`
- **需求来源**：
  1. 将左上角品牌标题改为 `OSU!Manager!`；
  2. 新增可从 Book 模式与左侧栏进入的 OSU! 音乐播放器，支持后台纯播放本地已有歌曲，具备音乐播放/暂停、倍速调整、音量调节、歌单创建、封面展示、节奏跟随与音乐可视化等能力，整体美术采用简约构成主义 / 瑞士国际主义风格。
- **实现要点**：
  1. **品牌统一更名与 Electron 后台播控**（`src/components/TitleBar.tsx`, `index.html`, `electron/main.ts`, `electron/preload.cjs`, `src/electron.d.ts`）：
     - 左上角标题、网页 `<title>`、主窗标题与托盘菜单/提示统一更名为 `OSU!Manager!`（保持 `package.json` `productName: "osu-4k-downloader"` 不变以兼容快捷脚本与历史数据目录）；
     - 主窗配置 `backgroundThrottling: false`，新增 `window:hideToTray` IPC 与系统托盘「播放 / 暂停音乐」「上一曲」「下一曲」联动。
  2. **本地 `.osu` 节奏解析与歌单持久化后端**（`server/localLibrary.ts`, `server/playlists.ts`, `server/index.ts`, `server/types.ts`, `src/types.ts`, `src/api.ts`）：
     - 在 `localLibrary.ts` 补充收集 Lazer `.osu` 路径并新增 `getBookRhythm()` 与 `GET /api/books/:bookKey/rhythm`（解析非继承红线 TimingPoints、Kiai 高潮区间与 72 段物件密度分布，缺失 `.osu` 时自动合成为合成节拍）；
     - 新增 `server/playlists.ts` 与 `GET/POST/PUT/DELETE /api/playlists` 原子持久化自定义歌单至 `data/playlists.json`（支持置顶、重命名、曲目去重排序）。
  3. **根级持久化后台音频引擎与构成主义 / 瑞士风格音乐台**（`src/components/music/rhythmEngine.ts`, `src/components/music/MusicPlayerContext.tsx`, `src/components/music/MusicVisualizerCanvas.tsx`, `src/components/music/ConstructivistCoverStage.tsx`, `src/components/music/MusicMiniDock.tsx`, `src/components/music/MusicPlayerMode.tsx`, `src/index.css`）：
     - `MusicPlayerProvider` 拆分 `MusicControlContext` 与 `MusicTimeContext`，挂载持久化 `<audio>` 与单实例 Web Audio `AnalyserNode`、支持 `0.50×–2.00×` 倍速及「原调锁高 / NC 变调」、滚轮音量/静音、列表/单曲/随机循环、红心收藏、定时关闭（分钟/播完本曲）、Windows MediaSession 媒体键及与搜图试听/谱面预览/Book 试听互斥防串音；
     - `ConstructivistCoverStage` 提供 `画幅 (PROUN)` 与 `唱盘 (DISC)` 双封面展示及 60fps DOM-ref 实时节拍矩阵（`[01]..[04]`）、倍速等效 BPM 与 Kiai 指示；`MusicVisualizerCanvas` 提供 `频谱` / `构成` / `示波` 三模式高分屏画布（`ResizeObserver` 自动重绘待机网格，后台 `document.hidden` 自动挂起零 GPU 占用）；
     - 切回搜图或 Book 模式后，通过 `MusicMiniDock` 悬浮迷你条继续后台纯播放（Book 模式下自动抬高至 `bottom-[82px]` 避让底栏刻度）。
  4. **左侧栏与 Book 模式双入口**（`src/components/SideRail.tsx`, `src/components/book/BookArchiveMode.tsx`, `src/components/book/BookSpreadOverlay.tsx`, `src/App.tsx`）：
     - `SideRail` 顶部工作区切为 `搜图 | Book | 音乐` 三段，本地曲库下方改为并排 `Book 档案库 | OSU 音乐台`；`BookArchiveMode` 顶栏新增 `音乐台` 按钮，悬浮预览卡及双页展开详情新增 `在音乐台中播放`。
- **验证结果**：
  - `npm run typecheck` 与 `npm run electron:pack`（`v1.8.0`）全部退出码 `0` 通过，更新生成 `release\win-unpacked\osu-4k-downloader.exe`。
  - 隔离数据目录（port `3728`）实测 `/api/books`（`757` 首本地曲目，其中 `664` 首含本地音频）、`/api/books/:bookKey/rhythm`（`200`，含红线与 72 段密度）、`/api/books/:bookKey/audio`（`206`）与 `/api/playlists` CRUD（`201`/`200`）全部通过。
  - 实时浏览器多分辨率（`1440×900` / `1280×720` / `1040×680`）与 `瓷器白` / `曜石黑` 主题验收：确认 `OSU!Manager!` 标识、播放/暂停、倍速 `1.25×` 与 `NC变调`、音量/静音、歌单创建增删、`画幅`/`唱盘`切换、`频谱`/`构成`/`示波`待机与动态绘制、节奏跟随矩阵、搜图与 Book 模式后台持续播放（`MusicMiniDock` 无遮挡）均正常，0 控制台/页面/HTTP 4xx+ 错误。
  - 打包产物 `release\win-unpacked\osu-4k-downloader.exe` 在隔离目录与临时端口 `3729` 冒烟验证 `GET /api/health` 返回 `{"ok":true,...}`，随后结束全部测试进程并清理临时目录，`3721`/`3728`/`3729` 端口监听数归 `0`，用户 `data/config.json` 完整保留。

### 追加优化（11 项音源修复、布局收起、唱盘几何与构成主义专注画报重绘）
- **核心改动**：
  1. **修复 Lazer 本地长音频截断为 9s / 0s 问题**（`server/realmReader.ts`, `server/localLibrary.ts`, `src/components/music/MusicPlayerContext.tsx`）：拆分 `getUInt` / `getSInt`，修复 `ClusterNodeInner` 键偏移、稀疏键、`ArrayStringLong` 偏移、`BPlusTree`（`>256` 文件）及 `ObjLink` 有符号溢出导致 `>=32,768` 键（`最終鬼畜妹`、`End Time`、`NANO DEATH!!!!!` 等 93 套曲目）丢失或错配本地音轨的 bug；补充 Lazer `.osu` `AudioFilename` 与主音轨扫描回退及 `<audio onDurationChange>` VBR 修正，全部 687 套 Lazer 曲库本地音源 100% 命中。
  2. **主界左侧栏默认展开 + 音乐台内置左侧栏默认收起**（`src/App.tsx`, `src/components/music/MusicPlayerMode.tsx`）：修复主界面左侧导航栏始终默认展开（切换音乐台不再强制收起主导航栏），仅将音乐台内部的「曲库与歌单」侧栏设为默认收起并支持顶栏/栏内一键切换。
  3. **几何化 `osu!` 圆形徽标替代红色方块与 Spin 图标**（`src/components/music/OsuMusicMark.tsx`, `SideRail.tsx`, `BookArchiveMode.tsx`, `BookSpreadOverlay.tsx`, `MusicMiniDock.tsx`, `MusicPlayerMode.tsx`, `ConstructivistCoverStage.tsx`）：设计瑞士/构成主义精度圆形 `osu!` 矢量徽标并取代音乐台顶栏红块及各入口旋转碟片图标。
  4. **对齐底部密度波纹与播放进度条**（`src/components/music/MusicPlayerMode.tsx`, `src/index.css`）：将 72 段物件密度条与 `<input class="swiss-range">` 统一包裹进同一 `flex-1 flex-col` 轨道容器并清除默认滑块外边距，实现零像素错位并对齐 RATE/Volume 滑轨可见性。
  5. **无框唱盘、精准落针唱臂与切回画幅角度清零**（`src/components/music/ConstructivistCoverStage.tsx`）：为画幅与唱盘节点赋独立 `key` 并在切换及换曲时清零 `discSpinRef.transform`；移除唱盘模式外部方框，按几何坐标标定唱臂枢轴 `(204, 20)` 与 108px 长度，暂停时停靠右侧支座（`2°`），播放时精确扫过黑胶音轨沟槽（`21°→33°`）。
  6. **移除「构成」可视化并升级横贯全宽的「频谱 / 示波」横轴**（`src/components/music/MusicVisualizerCanvas.tsx`, `MusicPlayerMode.tsx`）：精简为 `FFT // 频谱`（随宽度动态扩展至 60–168 频柱与频率刻度）与 `SCOPE // 示波`（上升沿过零锁定、280–960 点平滑波形），常规模式下横跨封面与歌单列表下方全宽。
  7. **专注画报直出原图封面 + 快速取色谐振 + 可开关音频律动粒子**（`src/components/music/constructivistRedraw.ts`, `ConstructivistPosterBg.tsx`, `MusicParticleCanvas.tsx`, `MusicPlayerMode.tsx`）：应用户偏好移除画面滤镜转换器，在「专注画报」直接高清展示原始封面与微压边角，保留 48×48 快速 CIE Lab 谐振取色以统一深墨信息卡与宽轴可视化配色（支持左上信息卡一键 `收起 / 展开`）；同步新增可开关的 `MusicParticleCanvas` 音频/节拍响应几何粒子层，在常规模式与专注画报中均可自由启闭。

---

## Session 14 — 左侧栏 Book 模式入口与 RhineLabUI 风格 3D 本地曲库档案库 (`v1.7.0`)

- **日期**：2026-11-24
- **对话 ID**：`fa7e8a34-bada-4c8a-9083-8a97a5691139`
- **版本**：`v1.7.0`（增量功能）
- **需求来源**：在左侧栏添加 Book 模式入口并新增 Book 模式：将本地已安装的每首 Song 包装为 3D 书脊长方体陈列在档案库中，书脊截取封面局部并叠加轻微模糊；参考 `LBEILC/RhineLabUI` 美术与动效，悬停时平滑半抽出且周围书籍按距离递减联动微抽；点击选中后完全抽出并翻开内页（难度、历史成绩、游玩次数、PP 等），取消选中后播放放回动画。
- **实现要点**：
  1. **零原生依赖双端本地曲库聚合与 Realm 读取**（`server/realmReader.ts`、`server/localLibrary.ts`、`server/types.ts`、`server/index.ts`）：
     - 自研只读 Realm v24 (`T-DB`) 二进制解析器 `readLazerRealmData`（带文件锁临时拷贝回退），读取 `client.realm` 中的谱面集、难度、元信息、文件映射、规则集、用户与成绩记录；解析 `osu!.db`（兼容 `>=20250107` 浮点数星数词典）、未入库 `Songs/` 目录与 `scores.db`。
     - 延迟按需解析 `.osu` `[Events]` 背景图（`/api/books` 冷构建 `435ms` 聚合 `757` 本 Book 与 `7,094` 条游玩记录）；提供魔数 MIME 嗅探封面输出与建筑线框 SVG 回退、音频 `206 Range` 流式播放、去重成绩与 Mania PP / MA 比计算。
  2. **RhineLabUI 视觉动效与 Three.js 3D 书架舞台**（`src/components/book/rhineMotion.ts`、`src/components/book/BookTextureManager.ts`、`src/components/book/BookArchiveScene.ts`）：
     - 实现临界阻尼弹簧与相邻书脊高斯递减悬停抽出波（`computeHoverWaveLift`）；Canvas 贴图截取封面片段施加 `6-7px` 模糊并叠加磨砂釉面、`NO.XXX` 索引与琥珀色标尺线，支持 LRU 缓存、并发限流与瓷器白/曜石黑动态切换。
     - 通过 `RoomEnvironment`/`PMREMGenerator` 灯光、斜向长焦相机、拖拽/滚轮/射线拾取、视口虚拟化以及 `HeroBookRig` 翻页状态机（抽出 → 翻开 → 闭合 → 放回）呈现完整 3D 体验，并兼容无 WebGL 回退模式。
  3. **档案库界面、打开双页 Spread 与左侧栏入口**（`src/components/book/BookArchiveMode.tsx`、`src/components/book/BookSpreadOverlay.tsx`、`src/components/SideRail.tsx`、`src/App.tsx`、`src/index.css`）：
     - 在 `SideRail` 顶部新增「工作区模式（搜图下载 | Book 模式）」与「进入 Book 档案库」入口并收紧间距以确保 `1280×720` 零裁剪展示；切换至 Book 模式后暂停搜图试听条并锁定 `<main>` 全画布渲染，内置 2.5D 回退架位与磨砂 `ACCESS BOOK` 卡片。
     - 在 `.rhine-book-root` 内渲染双页展开内页（左页：封面、游玩次数、最高 PP / 评级与本地音频播放/加载入游戏/打开目录；右页：`01 难度一览`、`02 历史成绩`含 `SelectField` 筛选与 MA 比、`03 曲目详档`含评级分布与标签）。
- **验证结果**：
  - `npm run typecheck` 通过（exit code 0）；`npm run electron:pack` 重新打包 `release\win-unpacked\osu-4k-downloader.exe` 通过（exit code 0）。
  - 对本地实库 HTTP API 验证 `/api/books` 返回 `757` 本 Book（`391` Stable / `597` Lazer / `231` 双端 / `610` 已游玩、`7,094` 条游玩记录、最高 `320.1pp`），封面/SVG 回退与音频 `206 Range` 均返回 `200`/`206`。
  - 真实浏览器在 `1440×900` 与 `1280×720` 分辨率、瓷器白（浅色）与曜石黑（深色）主题下完成 Book 模式进入、悬停联动波、点击抽出翻开、三标签切换、关书放回及搜图下载 `Lazer` 视图回归检查：0 控制台/页面报错，0 `/api/books/*` 404。

### 追加优化（9 项视觉、动效与性能优化）
- **新增 / 改造组件**：`src/components/book/RhineLoadingVeil.tsx`、`BookTextureManager.ts`、`BookArchiveScene.ts`、`BookSpreadOverlay.tsx`、`BookArchiveMode.tsx`、`src/index.css`。
- **核心改动**：
  1. **书脊排版强化**：侧脊贴图升至 `144×640`，编号（`22px` Bold）与曲名（`30px` ExtraBold + 描边轮廓光晕）显著放大加粗；顶部横脊 `512×72` 同样放大加粗，并**移除顶部封面图**改用纯粹 RhineLab 哑光瓷白/深灰盒体与琥珀索引镶边。
  2. **重度缩采样高斯模糊与点选渐清**：书脊侧面与正封面改用双阶段缩采样高斯模糊（`blurCanvasA/B` 离线重度虚化，主线程单帧 `<0.2ms`）；`HeroBookRig` 叠加模糊+高清双层封面平面，抽出过程中逐步提升清晰度并联动内页 `.rhine-spread-cover-img` 完成 `18px -> 0px` 澄清动画。
  3. **远景雾化模糊与淡入淡出**：所有书架 Slot 材质注入共享 `#include <fog_fragment>` `uSlotFade` 着色器淡入/淡出（边缘平滑溶入雾色），配合顶部 `.rhine-distance-mist` 渐隐模糊遮罩。
  4. **前后档案循环与持久化**：支持 `physRow` 无边界循环浏览（`NO.001` 向前直接衔接末尾 `NO.757`，`rebaseCoordinatesIfNeeded` 自动平移坐标防精度衰减）；`SlotMeshEntry` 实行对象池化复用（取消滚动期 WebGL 材质销毁重建）、图片 `img.decode()` + 分帧绘制预算队列（`processPaintQueue` 限制每帧 ≤2 本 / 3.5ms），彻底消除滚动/切换/关闭放回卡顿。
  5. **RhineLabUI 加载界、视角中键控制、可收起浮卡与筛选过渡**：新增 `RhineLoadingVeil` 覆盖进入 Book 模式、主题校准（异步分批重绘书脊）与手动刷新扫描；支持鼠标中键平移/倾角调节观察视角（双击中键或点击底栏「重置视角」复位）；右中 `ACCESS BOOK` 预览卡新增「收起 / 展开预览」侧边页签并持久化至 `localStorage`；切换 Stable/Lazer/排序等筛选时播放 `RhineFilterTransitionHud` 扫描条与阶梯落雾升起转场。
- **二次验证结果**：
  - `npm run typecheck` 通过（exit code 0）；`npm run electron:pack` 重新打包 `release\win-unpacked\osu-4k-downloader.exe` 通过（exit code 0）。
  - 真实浏览器（`1440×900` 与 `1280×720`）实测通过：进入加载页（`82% SYNC`）、无封面顶面+大号粗体书脊、悬停波与模糊封面、向上按键从 `NO.001` 循环至 `NO.756`、`Stable (391)`/`Lazer (597)`/`全部 (757)` 筛选、鼠标中键移动视角与「重置视角」、右中预览卡收起为侧边页签/展开、打开 `01/03` 双页内页与 `ESC` 放回、`曜石黑` 主题切换校准加载界及搜图 `Lazer` 视图回归均正常；全程 0 控制台/页面报错，0 `/api/books/*` HTTP 错误。

### 三次迭代（纯垂直悬停、仿下载页高级筛选 & 无字平铺毛玻璃视图）
- **新增 / 修改文件**：`src/components/book/bookFilters.ts`、`src/components/book/BookFilterPanel.tsx`、`src/components/book/BookMosaicView.tsx`、`src/components/book/BookArchiveScene.ts`、`src/components/book/BookArchiveMode.tsx`。
- **核心改动**：
  1. **修复悬停倾斜突兀感**：移除 `BookArchiveScene.ts` 悬停波浪的 `slot.mesh.rotation.x` 倾角计算（改为固定 `0`），使悬停与邻书肩部起伏严格沿竖直 `+Y` 方向平滑上下抽出。
  2. **仿下载页高级筛选矩阵**：新增 `bookFilters.ts` 与可折叠悬浮面板 `BookFilterPanel.tsx`，复用下载页 `StarRangeSlider`、`PpRangeSlider`、`SelectField` 与高频词条标签，覆盖本地来源/游玩状态、游戏模式、键数（4K–10K/其他）、谱面状态、最高评级、星数与 PP 范围（含「仅 Ranked PP」）、BPM、时长、LN%（Rice/Hybrid/LN 速选）、谱师过滤及 8 维度升/降序排序。
  3. **实验原型确认 + 平铺毛玻璃视图正式接入**：先生成交互样品 `frosted-mosaic-prototype.html` 确认用户选定的 **方案 A · 柔和光学窗** 与 **毛玻璃虹膜叠化 (`frost-iris`)** 翻页动效，再构建正式组件 `BookMosaicView.tsx`（默认仍保持 `3D 书脊`，顶部新增 `3D 书脊 | 平铺毛玻璃` 切换）。每页封面零文字、无缝平铺拼接、相邻边界混色并整页双层高斯模糊，中心矩形保留高清锐利显示（悬停微扩 `+0.12`），支持 `3×2`/`4×2`/`4×3`/`5×3` 网格与虹膜闭环翻页，点击封面直接打开双页 `BookSpreadOverlay`。
  4. **视觉与缩放细节修复**：为 `BookMosaicView` 补充 `ResizeObserver` 同步重绘以消除 `1440×900 -> 1280×720` 切换瞬间的白板闪屏，并将顶栏「高级筛选」激活态改用 `rhine-solid-btn` 以保证瓷器白/曜石黑高对比度。
- **验证结果**：
  - `npm run typecheck` 通过（exit code 0）；`npm run electron:pack` 重新打包 `release\win-unpacked\osu-4k-downloader.exe` 通过（exit code 0）。
  - 真实浏览器（`1440×900` 与 `1280×720`）复测通过：`3D 书脊` 悬停垂直抽出端正、`3–5★` 筛选精准收敛至 `699 / 757` 本（激活按钮文字清晰）、`平铺毛玻璃` 瓷器白/曜石黑与虹膜翻页（`01 -> 02 / 64 页`）、点击打开详情页及 `平铺 <-> 3D` 往返无卡死、搜图下载视图正常，且 `1280×720` 视口缩放瞬间画布完整无白屏；0 控制台报错、0 页面异常、0 `/api/books*` 错误。

---

## Session 13 — PP 情景主/副词条分栏层级升级与 Filter 存档右侧栏（含浏览位置与上下文恢复）(`v1.7.0`)

- **日期**：2026-11-24
- **对话 ID**：`f07d7fe0-7f66-4f92-8df8-5c59ea9782f4`
- **版本**：`v1.6.3` → `v1.7.0`

### 本次需求
1. **PP 情景主/副词条清晰区分**：在 PP 情景设置中将 `NM / DT / HT / 变速 / 自定义` 主词条与其对应的副词条组合明显区隔，不再仅靠上下按钮堆叠。
2. **Filter 存档功能与默认收起右侧栏**：新建默认收起的右侧栏以保存并管理搜索状态（筛选选项、搜索框内容、存档名称、创建时间、可选「当前页面浏览位置与前后上下文」），支持下一次加载时自动定位到保存的谱面与上下文。

### 关键实现
1. **PP 情景主从分栏共享组件**（`src/utils/pp.ts`, `src/components/PpScenarioLibrary.tsx`, `src/components/FilterPanel.tsx`, `src/components/PpCalculatorPanel.tsx`）：
   - 扩展 `PP_SCENARIO_CATEGORY_META`（`code`, `subtitle`, `tone` 色系标识）与 `PpScenarioPreset`（`primaryText` 与 `secondaryText`），剥离副词条重复的 `NM`/`DT`/`HT` 前缀；
   - 新建 `PpScenarioLibrary` 采用左右主从分栏（Master-Detail Split）：左侧为垂直主模式轨道（3px 模式色条、加粗模式名、副标题与当前生效模式指示圆点），右侧为独立抬升表面的副词条详情面板（顶部主模式彩色徽章 + 数量、双列/三列分栏瓦片及自定义存档卡片）；同步接入 `FilterPanel` 浮层与 `PpCalculatorPanel` 计算器。
2. **Filter 存档后端持久化与 REST API**（`server/types.ts`, `src/types.ts`, `server/filterArchives.ts`, `server/index.ts`, `src/api.ts`）：
   - 新增 `FilterArchive` 与 `FilterArchiveBrowsePosition`（含 `anchorBeatmapsetId`, `anchorBeatmapId`, `anchorIndex`, `batchUpstreamOffset`, `contextBeatmapsetIds`, `contextSnapshot` 等）；
   - 新建 `server/filterArchives.ts` 原子读写 `data/filter-archives.json`（上限 100 条、置顶优先排序、遵循 `OSU_DL_DATA_DIR` 隔离）；在 `server/index.ts` 与 `src/api.ts` 注册并封装 `GET/POST/PUT/DELETE /api/filter-archives`。
3. **默认收起右侧栏、浏览位置捕获与上下文恢复**（`src/utils/filterArchive.ts`, `src/components/FilterArchiveRail.tsx`, `src/components/TitleBar.tsx`, `src/components/LazerSongSelect.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`, `src/components/AudioPlayerBar.tsx`, `src/App.tsx`, `src/index.css`）：
   - `TitleBar` 新增对称「存档」开关（默认收起态 `osu4k-archive-rail-collapsed = true`），`FilterPanel` 展开/收起态均新增快捷 `存档` 按钮并自动聚焦命名输入框；
   - `FilterArchiveRail` 展示筛选摘要、搜索框关键词、创建时间、可选「保存当前浏览位置与上下文」（附实时锚点预览），支持置顶、内联重命名、覆盖更新、两步安全删除与关键词过滤；
   - `App.tsx` 恢复带位置存档时：浅层自动翻页定位、深层（`batchUpstreamOffset > 48`）按 `max(0, batchUpstreamOffset - 24)` 回退窗口拉取上下文并在顶部提供「向上加载更早谱面 / 回到第 1 页」条；`LazerSongSelect` 静默定位目标曲目与难度，`grid`/`list` 视图平滑居中滚动并施加 `.card-locate-pulse` 高亮；若原曲变动则自动降级定位至相邻上下文并提供「查看原谱面」详情入口；
   - 响应式与层级优化：右侧栏在 `2xl:`（`>= 1536px`）内联停靠、`<= xl` 采用根节点 `z-50` 右侧覆盖抽屉（同时将左侧窄屏抽屉移至根节点 `z-50` 彻底解决被 `TitleBar` 遮挡问题），`<main>` 补充 `min-w-0` 防止横向撑开溢出。

### 验证记录
- **类型检查与打包**：`npm run typecheck` 与 `npm run electron:pack`（`v1.7.0`）均以退出码 `0` 通过，生成更新版 `release\win-unpacked\osu-4k-downloader.exe`。
- **REST API CRUD 持久化验证**（`http://127.0.0.1:3728`，隔离目录 `%TEMP%\osu-dl-verify-v170`）：实测 `GET / POST(201) / PUT / DELETE /api/filter-archives` 与磁盘 `filter-archives.json` 读写全部通过。
- **多分辨率实时浏览器验收**（`http://127.0.0.1:3728`，`0` 控制台与未捕获页面错误）：
  - **`1440×900`（`light` & `dark` 主题）**：确认右侧栏默认收起（`aria-pressed="false"`）；`FilterPanel` 浮层与 `PpCalculatorPanel` 均以左侧 `tablist` 主轨道 + 右侧副词条网格呈现并完成自定义保存/删除；实测创建纯筛选存档与 Lazer 第 2 页 `#28` (`Fly to night, tonight`) 定位存档，置顶/改名并刷新页面后持久保留；重置搜索后点「恢复并定位」准确恢复搜索词 `camellia`、48 首结果、`Fly to night, tonight` 选中态及相邻曲目；列表视图测试 `Mei (Camellia's "Yomigae" Remix)` (`#16`) 定位滚动居中并命中 `.card-locate-pulse`。
  - **`1040×680` & `1280×720`**：确认根节点 `z-50` 右侧覆盖抽屉起始于 `y=0` 位于 `TitleBar` 之上（关闭按钮可直接命中，点击左侧遮罩、`Escape` 与关闭按钮均顺利收起），`<main>` 零横向溢出（`1040`/`1280`）且 Lazer 视图零外层滚动，PP 浮层在 `720px` 高下保持在视口内并可内滚至底部按钮。
  - **`1600×900`（`2xl` 双侧栏同时停靠）**：左侧栏 `280px` + `<main>` `1000px` + 右侧栏 `320px` 零溢出、零裁切且 PP 浮层正常弹出。
- **清理确认**：测试服务已关闭，临时目录 `%TEMP%\osu-dl-verify-v170` 已清理，`3721`/`3728` 端口监听数均为 `0`，真实 `data/config.json`（`D:\OSU` / `6174`）完整未动。

---

## Session 12 — DT/HT/变速 PP 筛选与计算器多维情景预设库及自定义情景持久化 (`v1.6.3`)

- **日期**：2026-11-24
- **对话 ID**：`0f9e8be2-483f-48f5-a728-b5ae61581742`
- **版本**：`v1.6.2` → `v1.6.3`
- **关联提交**：`009ed77`

### 本次需求
- 在 PP 筛选中扩充 `DT`、`HT` 与不同倍速模式下的对应准度（Acc）、黄彩比、Miss 数等给定组合，并强化自定义情景参数调整与本地持久化保存体验。

### 关键实现
1. **35 组分类情景预设库与 `localStorage` 持久化引擎**（`src/utils/pp.ts`）：
   - 导出 `PP_SCENARIO_PRESETS`（覆盖 `nm` 常速 9 组、`dt` 1.5x 9 组、`ht` 0.75x 9 组、`rate` 0.85x–1.4x 8 组）与精确比对函数 `matchesScenarioPatch()`（修复此前仅校验 `misses === 0` 的局限）。
   - 新增 `loadSavedPpScenarios()` / `saveCustomPpScenario()` / `deleteSavedPpScenario()`（`osu4k-saved-pp-scenarios`，上限 24 条、参数去重并通过自定义事件跨组件同步），并扩展 `getQuickPpSummary()` 支持基于筛选情景估算 `95%/98%/99%`。
2. **后端失误情景星数反推补全**（`server/pp.ts`）：
   - 更新 `deriveStarBoundsFromPpFilter()` 中的 `maxStars` 分支：当 `misses > 0` 时按 `Math.max(0, rawAcc - misses / 50)` 保守推算 `accFactorMin`，在 `accFactorMin > 0.05` 时正常给出上游最高星数约束，兼顾 DT/HT 含失误筛选效率与零漏召回。
3. **筛选浮层、计算器与 Lazer 速览同步升级**（`src/components/FilterPanel.tsx`, `src/components/PpCalculatorPanel.tsx`, `src/components/LazerSongSelect.tsx`）：
   - `FilterPanel` 情景浮层升级为自适应上下定位与 `maxHeight` 约束（`w-[min(94vw,520px)]`），新增 `NM 常速 / DT 1.5x / HT 0.75x / 变速 Rate / 自定义` 五标签切换，并完善倍速输入+滑块+快捷档、准度快捷档、黄彩比实时折算与快捷档、Miss 快捷档、`+ 存为自定义` 名称保存栏与右侧按钮窄屏防溢出省略。
   - `PpCalculatorPanel` 接入同一套五标签情景预设与自定义保存能力；`LazerSongSelect` 左侧 PP 速览同步响应筛选倍速与黄彩比/Miss/Mod。

### 验证记录
- **类型检查与打包**：`npm run typecheck` 与 `npm run electron:pack`（`v1.6.3`）退出码 `0` 通过，更新生成 `release\win-unpacked\osu-4k-downloader.exe`。
- **DT / HT 含失误搜索接口验证**（`http://127.0.0.1:3728`）：
  - `DT 96.5%·2:1·3M` (`300–450pp`)：反推星数 `[4.8, 7.75]`，HTTP `200` 返回 `12` 套 / `14` 个匹配 Ranked 难度，越界 `0`；
  - `HT 97.5%·3:1·2M` (`180–300pp`)：反推星数 `[6.06, 9.16]`，HTTP `200` 返回 `12` 套 / `14` 个匹配 Ranked 难度，越界 `0`。
- **多分辨率实时浏览器验收**（`http://127.0.0.1:3728`，`1440×900` / `1280×720` / `1040×680`，`0` 控制台错误）：
  - **五标签情景浮层与筛选联动**：验证 `NM 常速 / DT 1.5x / HT 0.75x / 变速 Rate / 自定义` 切换与 `DT 96.5%·2:1·3M` 选中筛选（`350–500pp`），左侧 Lazer `PP 速览` 同步切换为 `DT` 档；
  - **颗粒度自定义、持久化与计算器同步**：实测点按 `HT 0.75x` + `97%` + `3:1` + `2M` 生成 `HT 97%·3:1·2M` 并保存为 `我的HT练习`，整页重载后验证保留并成功同步至 `BeatmapDetailModal` → `PpCalculatorPanel` 的 `自定义 (1)` 栏；完成删除与「重置情景」还原。
  - **窄窗口防溢出与视口约束**：长标签 `DT 96.5%·2:1·3M·CL·EZ` 在 `1280×720` 下保持 `PP` 轨宽 `103.52px` 且右侧按钮限宽 `152px` 优雅省略；浮层在 `1280×720`（`bottom=714 <= 720`）下向下裁剪可内滚，在 `1040×680`（`y=44, h=357.47`）下自动向上翻转弹出，全程 `<main>` 零外层滚动。
- **清理确认**：测试服务已停止，临时数据目录已清除，`3721`/`3728` 端口监听数均为 `0`，用户真实 `data/config.json` 完整未动。

---

## Session 11 — 更扁长滑块手柄、彻底修复右滑块无穷边界抽搐、提升上限至 `15.0★` / `2000pp` (`v1.6.2`)

- **日期**：2026-11-24
- **对话 ID**：`0f9e8be2-483f-48f5-a728-b5ae61581742`
- **版本**：`v1.6.1` → `v1.6.2`
- **关联提交**：`23f96e0`

### 本次需求
1. **滑动点横向更长更扁**：将星数与 PP 双滑块的左右滑动手柄调整得横向更长、纵向更扁一些。
2. **修复右侧滑动点边界抽搐**：解决向右拖动右侧上界滑块时在「不限 (`∞`)」与「接近上界数值」之间反复跳动抽搐的 Bug。
3. **提高有限星数与 PP 上限**：将滑块及上界设置的最大有限值提升至 `15★` 与 `2000pp`（继续保留最右端 `∞` 无限上界）。

### 关键实现与根因修复
1. **右滑块抽搐根因定位与三层根治**（`src/components/StarRangeSlider.tsx`, `src/components/PpRangeSlider.tsx`）：
   - **根因**：此前仅在 `hasFilter` 为真时挂载右侧 `24px` 清除按钮，且上下界胶囊在 `'∞'` 与 `'15.0★'`/`'2000pp'` 间宽度会发生变化；当从 `∞` 向左刚拖进有限值时，清除按钮出现导致 `flex-1` 滑轨右缘向左缩进约 `30–40px`，使原本在滑轨内的鼠标指针瞬间落到新 `rect.right` 右侧，下一次 `pointermove` 立刻把上界弹回 `∞`、卸载清除按钮、滑轨再右扩，形成死循环震荡。
   - **修复**：
     1. 常驻保留清除按钮槽位（未筛选时 `disabled + invisible`，零位移跳变）；
     2. 上下界显示胶囊与点击输入框统一固定宽度（星数 `w-[3.65rem]`、PP `w-[4.15rem]`，`whitespace-nowrap`）；
     3. 拖拽开始 (`pointerdown`) 冻结 `dragRectRef` 并计算命中手柄偏移 `grabOffsetRef`，确保点按宽手柄不瞬间跳值且拖拽中坐标参考系纹丝不动。
2. **更扁长 `24×14px` 滑块手柄与内缩贴边定位**（`src/components/StarRangeSlider.tsx`, `src/components/PpRangeSlider.tsx`）：
   - 将左右双柄改为 `w-[24px] h-[14px] rounded-[4px]` 纯色扁平长条（居中包覆 `12px` 滑轨），采用 `calc(pct% - pct * 24px)` 内缩偏移对齐两端边界、以滑轨内部可用行程 `width - 24` 映射光标坐标，避免宽手柄伸出滑轨遮挡两侧数值胶囊。
3. **提高最大有限上限至 `15.0★` 与 `2000pp`**（`src/components/StarRangeSlider.tsx`, `src/components/PpRangeSlider.tsx`, `src/components/FilterPanel.tsx`）：
   - 星数滑块扩展至 `0.0★–15.0★`（32 段光谱，滑轨右端保留 `[15.2..15.4]` 为 `∞` 区间，`[14.95..15.2)` 稳定吸附 `15.0★`，手动输入上限 `15`）；
   - PP 滑块扩展至 `0–2000pp`（滑轨右端保留 `[2025..2050]` 为 `∞` 区间，`2000pp` 可在滑轨与输入框稳定选定）；
   - 同步支持键盘方向键/`PageUp`/`PageDown` 在 `15.0★ ↔ ∞` 与 `2000pp ↔ ∞` 间平滑切换，并微调 `FilterPanel` 第 3 行 `xl` 栅格比例至 `minmax(0,1fr) / minmax(0,1.22fr)`。

### 验证记录
- **类型检查与打包**：`npm run typecheck` 与 `npm run electron:pack`（`v1.6.2`）退出码 `0` 通过，生成更新版 `release\win-unpacked\osu-4k-downloader.exe`。
- **多分辨率实时浏览器验收**（`http://127.0.0.1:3728`，隔离临时数据目录，`1440×900` / `1280×720` / `1040×680`，`0` 控制台错误）：
  - **滑块几何与防重叠**：4 个滑块手柄实测均为 `24×14px`、`rounded-[4px]` 纯色矩形，内外轨距两侧数值胶囊间距分别为 `+8.0px`（星数）与 `+6.0px`（PP），零重叠；
  - **右滑块无穷边界零抽搐实测**：沿星数与 PP 滑轨右端以 `2–4px` 小步进往返拖拽 `∞ ↔ 15.0★ ↔ 13.4★` 与 `∞ ↔ 2000pp ↔ 1780pp`，全程滑轨 `width` / `right` 位移增量均为 `0px`、数值单调切换零跳回，且均可在滑轨末端拖拽或点击输入稳定选中 `15.0★`（`99` 钳位至 `15.0★`）与 `2000pp`（`5000` 钳位至 `2000pp`）；
  - **响应式布局**：`1280×720` 下星数/PP 轨宽分别为 `168.95px` / `151.81px`，`15.0★`、`2000pp`、`NM 98%` 无裁切；`1040×680` 下第 3 行干净换行且 `<main>` 零外层滚动。
- **清理确认**：测试服务已停止，临时数据目录已移除，`3721`/`3728` 端口监听数均为 `0`，用户真实 `data/config.json` 完整未动。

---

## Session 10 — 加粗星数滑轨、扁平圆角纯色矩形滑块与同步风格 PP 范围滑块 (`v1.6.1`)

- **日期**：2026-11-24
- **对话 ID**：`0f9e8be2-483f-48f5-a728-b5ae61581742`
- **版本**：`v1.6.0` → `v1.6.1`
- **关联提交**：`7e2feb7`

### 本次需求
1. **星数滑动条加粗并升级滑块形态**：将 `StarRangeSlider` 的左右两个滑动点改为两个扁平的圆角纯色矩形，并将滑动条轨道适度加粗。
2. **PP 范围筛选改用对应双滑块**：将 `FilterPanel` 中的「大致 PP」范围筛选同样调整为相同风格的上下界双滑块组件。

### 关键实现
1. **加粗光谱轨道 + 扁平圆角纯色矩形滑块**（`src/components/StarRangeSlider.tsx`）：
   - 将光谱滑轨由 `h-[8px]` 加粗为 `h-[12px] rounded-[6px]`，保持背景 `opacity-25`、选中区间 `clip-path` 全彩呈现。
   - 将两个 `[role="slider"]` 滑块由圆形白边带阴影手柄改为 `10×20px` 扁平圆角纯色矩形（`h-[20px] w-[10px] rounded-[4px] bg-osu`，零边框、零投影），并支持悬停/拖拽轻微纵向缩放反馈。
2. **同步风格 PP 范围双滑块 `PpRangeSlider`**（`src/components/PpRangeSlider.tsx`, `src/components/FilterPanel.tsx`）：
   - 新增 `PpRangeSlider`（`0–1000pp`，步进 `10pp`）：采用一致的 `h-[12px] rounded-[6px]` 轨道与两个 `10×20px` `rounded-[4px] bg-lazer` 扁平纯色矩形滑块，左右胶囊支持点击输入精确数值（上限开放至 `5000pp`），松手即触发搜索并保留「清除 PP 范围」与右侧「情景」浮层按钮。
   - 调整 `FilterPanel` 第三行栅格比例（`xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]`）并清理未使用的输入逻辑与图标引入。

### 验证记录
- **类型检查与打包**：`npm run typecheck` 与 `npm run electron:pack`（`v1.6.1`）退出码 `0` 通过，重新生成 `release\win-unpacked\osu-4k-downloader.exe`。
- **多分辨率实时浏览器验收**（`http://127.0.0.1:3728`，`1440×900` / `1280×720` / `1040×680`，`0` 控制台错误）：
  - `1440×900`：确认 `StarRangeSlider` 与 `PpRangeSlider` 内轨高度均为 `12px`，全部 4 个滑块手柄边界框均为 `10×20px`、`rounded-[4px]` 扁平纯色矩形；测试调整 PP 滑块至 `300pp–450pp` 正常返回 `24` 套对应 Ranked 谱面且清除重置恢复完整结果。
  - `1280×720` & `1040×680`（携带 `NM 98%·3:1` 情景标签）：`1280×720` 下 `StarRangeSlider` 轨宽 `248.13px`、`PpRangeSlider` 轨宽 `199.17px`、`NM 98%·3:1` 宽度 `122.66px` 无裁切；`1040×680` 下自动折行展开（轨宽 `510.00px` / `399.31px`），Lazer 视图 `<main>` `mainDidScroll=false` 且 `.cover-frame` 高度分别为 `115.19px` / `108.80px`。
- **打包冒烟与现场清理**：以 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data` 在临时端口 `3729` 启动 `release\win-unpacked\osu-4k-downloader.exe` 验证 `/api/health` 返回 `{"ok":true,...}` 并关闭；`3721`/`3728`/`3729` 端口监听数归 `0`，用户 `data/config.json` 完整保留。

---

## Session 9 — PP 自定义黄彩比、Lazer 星数双滑块、情景化大致 PP 筛选与侧栏双端启动器 (`v1.6.0`)

- **日期**：2026-11-24
- **对话 ID**：`0f9e8be2-483f-48f5-a728-b5ae61581742`
- **版本**：`v1.5.0` → `v1.6.0`
- **关联提交**：`6f06345`

### 本次需求
1. **PP 计算自定义黄彩比**：在 PP 计算器中支持自定义黄彩比，通过滚动条与数值输入窗口同步调节。
2. **Lazer 风格星数上下界双滑块**：将筛选面板中的星数筛选升级为类似 `osu!lazer` 选歌页面上方的光谱双滑块，支持拖动下界与上界滑块设定范围。
3. **给定 / 自定义情景下的大致 PP 范围筛选**：支持按默认或自定义情景（准度 / 倍速 / 黄彩比 / Miss / Mod / 模拟上架）的大致 PP 范围进行谱面筛选。
4. **左侧栏「启动 Stable」与「启动 Lazer」按钮**：在左侧栏添加并实现一键启动 `osu!stable` 与 `osu!lazer` 客户端功能。

### 关键实现
1. **PP 计算自定义黄彩比滑块与数值输入窗**（`src/utils/pp.ts`, `src/components/PpCalculatorPanel.tsx`）：
   - 修复 `calculateBeatmapPp` 对 `maRatio === 0`（全黄 300）的边界判断（改为 `maRatio >= 0`），并新增 `extractPpScenarioFromFilters`、`isDefaultPpScenario`、`formatPpScenarioShort` 与支持自定义情景的 `getBeatmapsetPpBadge`。
   - 在 `PpCalculatorPanel` 新增独立「自定义黄彩比 (彩300 : 黄300)」控制卡片：连续滑块（`0–20`，步进 `0.1`）、同步数值输入窗（`0–999`，带 `: 1` 后缀与清空回「直算」按钮）、双视角实时换算提示（`彩:黄 X:1 · 黄:彩 1:X · 彩占 XX% · 折算准度`）以及快捷档位（`直算` / `1:1` / `2:1` / `3:1` / `5:1` / `8:1` / `全彩`），同时支持从当前筛选条件同步 `initialScenario`。
2. **Lazer 光谱星数双滑块 `StarRangeSlider`**（`src/components/StarRangeSlider.tsx`, `src/components/FilterPanel.tsx`）：
   - 复刻 `osu!lazer` 选歌顶部光谱条（`0.0★–10.0★+ / ∞`），使用 `getStarSpectrum` 生成固定光谱并用 `clip-path` 突出选中区间，支持指针捕获双柄拖拽（消除重叠死区）、键盘微调、点击左右星数胶囊精准输入与一键复位，拖拽松手即自动触发检索；同步移除「高级筛选」内原有的纯数字星数输入框。
3. **情景化大致 PP 范围筛选（前端浮层 + 后端反推过滤）**（`server/types.ts`, `src/types.ts`, `server/pp.ts`, `server/search.ts`, `server/index.ts`, `src/components/FilterPanel.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`, `src/components/LazerSongSelect.tsx`, `src/components/BeatmapDetailModal.tsx`, `src/components/FastBatchModal.tsx`, `src/App.tsx`）：
   - 在 `SearchFilters` 扩展 `minPp`、`maxPp`、`ppAccuracy`、`ppRate`、`ppMisses`、`ppMaRatio`、`ppClassic`、`ppEz`、`ppNf`、`ppIncludeUnranked`。
   - 新增 `server/pp.ts` 镜像计算逻辑与 `deriveStarBoundsFromPpFilter()`：根据设定情景与 PP 上下界反推出匹配星数范围并集约默认上架状态，在上游 `osu.direct` / `Sayobot` 查询前精准收窄星数与状态区间，再按单难度 `Math.round(pp)` 执行后置精确过滤与高亮标注；不可达条件（如 Mania 准度 `< 80%`）直接短路返回空结果。
   - 在 `FilterPanel` 主栏右侧增加紧凑「大致 PP」范围输入与悬浮「情景」配置浮层（含常用 PP 区间、8 组给定情景预设、自定义准度/倍速/黄彩比/Miss/Mod 与「含未上架谱面」开关），保证在 Lazer 视图下展开浮层不挤压选歌区域；列表卡片 `.chip-pp`、Lazer 难度行及详情计算器自动联动当前筛选情景（卡片徽章继续严守仅 `ranked`/`approved` 显示）。
4. **左侧栏「启动 Stable」「启动 Lazer」与后端进程拉起**（`server/config.ts`, `server/library.ts`, `server/installer.ts`, `server/index.ts`, `src/api.ts`, `src/components/SideRail.tsx`, `src/App.tsx`）：
   - 导出 `detectLazerExePath()` 并在 `LocalLibraryStatus` 增补 `stableExeExists`；新增 `launchGameClient('stable' | 'lazer', cfg)` 与 `POST /api/game/launch` 接口：启动前先调用 `detectRunningClients(true)`，若客户端已在运行则尝试切回前台（避免 `osu!stable` 弹出双开警告），未运行时以客户端目录为 `cwd` 分离启动进程并附带 `error` 事件保护与 `cmd start` 兜底，随后在 `1.5s` / `4s` 自动刷新 SSE 曲库运行状态。
   - 在 `SideRail`「本地曲库」区块下方增设并排极简「启动 Stable」「启动 Lazer」按钮，并收紧侧栏与筛选栏垂直间距以确保 `1280×720` 与 `1040×680` 下无需滚动即可完整点击。

### 验证记录
- **类型检查与打包**：`npm run typecheck` 与 `npm run electron:pack`（`v1.6.0`）全部退出码 `0` 通过，重新生成 `release\win-unpacked\osu-4k-downloader.exe`。
- **隔离后端接口与 PP 筛选验证**（端口 `3728`，隔离临时数据目录）：
  - 验证 `/api/library/status` 包含 `stableExeExists`；`POST /api/game/launch` 非法参数返回 `400`、缺失路径返回 `ok: false` 提示、虚拟 `osu!.exe` 存根正常拉起返回 `ok: true`；
  - 验证不可达 PP 条件（`minPp=300&ppAccuracy=70`）直接短路返回 `0` 条结果；
  - 验证 `GET /api/search?mode=3&keys=4&minPp=300&maxPp=420&ppAccuracy=98&ppRate=1.2&ppMaRatio=3&limit=12` 返回 `12` 套 Ranked 谱面、校验 `14` 个匹配难度 `allMatchValid: true`。
- **多分辨率实时浏览器验收**（`http://127.0.0.1:3728`，`1440×900` / `1280×720` / `1040×680`，`0` 控制台错误）：
  - `1440×900`：验证 `StarRangeSlider`（`3.5★–5.5★` 过滤与重置）、`大致 PP`（`300–450pp` + `黄彩比 3:1`）精准筛选、`BeatmapDetailModal` → `PpCalculatorPanel` 自定义黄彩比输入 `2.5`（`177pp → 160pp`，`折算准度 96.25%`）与滑块双向联动（`2.6:1`）、以及点击「启动 Stable」正确触发 `/api/game/launch` 并弹出设置引导提示。
  - `1280×720` & `1040×680`（针对首轮测试发现的按钮截断与侧栏底部遮挡收紧布局后复测）：`SideRail` 未滚动时「启动 Stable」「启动 Lazer」底边 `511.67px` 均清晰位于底栏上方（`1280×720` 留白 `65.14px`、`1040×680` 留白 `25.14px`）；情景按钮 `NM 98%·3:1` 宽度 `122.66px` 无裁切；Lazer `<main>` `mainDidScroll=false` 且 `.cover-frame` 高度分别为 `115.19px` / `108.80px`。
- **打包产物冒烟与现场清理**：以 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data` 在临时端口 `3729` 启动 `release\win-unpacked\osu-4k-downloader.exe`，`GET /api/health` 返回 `{"ok":true,...}`；关闭测试进程并清理临时目录后，`3721`/`3728`/`3729` 端口监听数均为 `0`，用户 `data/config.json` 完整保留。

---

## Session 8 — Lazer 难度平滑动效、列表详情滚动提速、120% 默认字号与快速批量下载/IPv6 加速 (`v1.5.0`)

- **日期**：2026-11-23 ~ 2026-11-24
- **对话 ID**：`eac947b0-cb17-4854-a23b-07c9a2bd0fec`
- **版本**：`v1.4.1` → `v1.5.0`
- **关联提交**：`b9074eb`（含 `v1.4.1`–`v1.5.0` 全量功能与修复代码）

### 本次需求
1. **Lazer 模式初始选中难度行平滑动效**：选择歌曲卡片展开默认难度列表时，首个默认选中难度行应当平滑左移进入选中态，而不是先出现在基准位置再瞬间跳移。
2. **列表模式 + 详情弹窗滚动性能**：修复 `列表`（`list`）视图下点开 `BeatmapDetailModal` 后上下滚动明显卡顿的问题。
3. **默认字号提升至 `120%` 并适配 `ManiaPreviewModal`**：全局默认 `fontScale` 设为 `1.2`（`120%`），并修复 `120%–125%` 缩放下谱面预览弹窗左侧 `播放倍速`（`0.5x–1.5x`）与 `谱面方向`（`跟随皮肤/下落/上升`）按钮重叠或裁切问题。
4. **快速批量下载（「快速批量下载」）与 IPv6 / 导入加速**：新增不依赖封面/试听/详情页的跨页极简批量下载器，按当前搜索筛选条件持续翻页拉取并跳过本地已装曲目直到达到自定义数量（`1–500`）或无新曲目，配合 IPv6/双栈优先、多镜像负载均衡、异步 ZIP EOCD 校验与快速导入实现“高速”批量入库。

### 关键实现
1. **Lazer 难度行 `--diff-x` 平滑入场与选中偏移**（`src/index.css`）：
   - 在 `.lazer-diff-row` 引入 CSS 变量 `--diff-x`（默认 `0px`，`:hover` 为 `-4px`，`[data-active="true"]` 为 `-8px`），并让 `@keyframes lazer-diff-in` 终点直接使用 `translate3d(var(--diff-x, 0px), 0, 0)` 配合 `backwards` 填充，避免入场动画结束后瞬间左跳。
2. **列表视图与详情弹窗滚动合成层优化**（`src/index.css`, `src/components/BeatmapListRow.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapDetailModal.tsx`, `src/App.tsx`）：
   - 新增 `.song-list-row` 与 `.song-grid-card` 布局/绘制隔离规则（`contain` / `content-visibility: auto`），在自定义背景启用（`html[data-has-bg="true"]`）时移除逐行/弹窗内部多余 `backdrop-filter` 开销，并为 `.modal-surface` 设置 `isolation: isolate` 与独立合成层；对 `BeatmapListRow` / `BeatmapCard` 应用 `React.memo`，为详情滚动容器启用 `overscroll-contain` 与独立合成提示，并用 `useCallback` 稳定回调。
3. **默认 `120%` 字号与 `ManiaPreviewModal` 响应式排版适配**（`src/constants.ts`, `server/config.ts`, `index.html`, `src/App.tsx`, `src/components/OverlayApp.tsx`, `src/components/SettingsModal.tsx`, `src/components/ManiaPreviewModal.tsx`, `src/components/FilterPanel.tsx`, `src/index.css`）：
   - 前后端 `DEFAULT_FONT_SCALE`、`clampFontScale`、`getDefaultConfig().fontScale` 及兜底样式统一升级为 `1.2`（`120%`）。
   - 新增 `.segmented-compact` 与 `.segmented-auto` 分段控件样式，并放宽 `ManiaPreviewModal` 难度下拉框、左侧控制栏与右侧缩略图宽度（使用 `clamp(...)`），使 `播放倍速` 与 `谱面方向` 在 `1280×720` 与 `1040×680` 下均无重叠或溢出。
4. **IPv6/双栈网络引擎、快速安装器与快速批量下载模块**（`server/types.ts`, `src/types.ts`, `server/config.ts`, `server/network.ts`, `server/installer.ts`, `server/fastBatch.ts`, `server/index.ts`, `src/api.ts`, `src/components/FastBatchModal.tsx`, `src/components/SettingsModal.tsx`, `src/components/SideRail.tsx`, `src/App.tsx`）：
   - `server/network.ts` 新增本地全局 IPv6 探测（`detectLocalGlobalIpv6`）、5 分钟 DNS 缓存、`IpFamilyMode`（`auto` / `ipv6_first` / `ipv4_first` / `ipv6_only` / `ipv4_only`）连接池，以及 `FastBatchRouteStrategy` 路由选择，并在 `/api/network/status` 暴露 `hasGlobalIpv6` 与 `ipFamily`。
   - `server/installer.ts` 新增异步 ZIP EOCD 尾校验 `verifyOszFileFast()`、`fastInstallToStable()` 与 `fastStageToLazer()`，减少全量内存解压开销；`server/fastBatch.ts` 实现 `1–12` 并发、跨页补齐目标数 `1–500`、250ms 节流 `fast-batch` SSE 推送、暂停/恢复/停止控制及 15 文件合批 Lazer IPC 导入（`target: 'both'` 时前序安装保持 `moveSource: false`、末步移动清理）。
   - `FastBatchModal` 采用纯文本设计（零 `<img>`、零音频/详情组件），直观呈现筛选标签、数量预设（`10/25/50/100/200`）、IPv6 就绪状态、并发与策略开关以及实时队列状态。
5. **统一 `LN%` 与 `Rice` / `Hybrid` 标签语义消除歧义**（`src/constants.ts`, `src/components/LazerSongSelect.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`, `src/components/BeatmapDetailModal.tsx`）：
   - 原 `getLnCategory(lnRatio)` 将长条占比输出为 `Rice 13%` / `Hybrid 24%`，与 Lazer 属性条的 `LN% 13%` 并存时易造成数值矛盾。现扩展 `LnCategoryInfo`（`label: "LN XX%"`、`styleTag: "单键 Rice" | "综合 Hybrid" | "长条 LN"`、`fullLabel: "Rice · LN XX%" | "Hybrid · LN XX%" | "LN XX%"` 与双占比悬停 `tooltip`）。
   - Lazer 右侧难度行、卡片/列表徽章统一使用 `LN XX%`；Lazer 左侧选中难度头部使用纯粹倾向标签（`单键 Rice` / `综合 Hybrid` / `长条 LN`），与下方 `LN%` 属性条互相印证；`BeatmapDetailModal` 放宽至 `max-w-[960px]` 并收紧表格内边距，确保 `Hybrid · LN XX%` 完整无裁切展示。

### 验证记录
- `npm run typecheck && npm run electron:pack`（`tsc --noEmit` + `tsc -p tsconfig.server.json --noEmit` + `tsc -p tsconfig.electron.json --noEmit` + `vite build` + `electron-builder --win dir`）：全部通过（退出码 `0`），产物输出至 `release\win-unpacked\osu-4k-downloader.exe`。
- **独立快速批量下载 E2E 后端测试**（隔离目录 `scratch\fb-test`，端口 `3729`）：验证 `getDefaultConfig()` 默认 `fontScale=1.2` / `ipFamily=auto`；`/api/network/status` 返回 `hasGlobalIpv6=True`、`ipFamily=auto`；`POST /api/fast-batch/start`（`targetCount: 2, target: 'both', variant: 'novideo', concurrency: 2, ipFamily: 'ipv6_first', routeStrategy: 'auto', skipInstalled: true, stableDropOsz: true, lazerBatchImport: false`）执行至 `state=completed, completedCount=2, failedCount=0`，临时 `stable\Songs` 与 `lazer-import` 各落盘 `2` 个有效 `PK\x03\x04` `.osz` 文件且 `cache\osz` 无残留（随后清理临时目录）。
- **实时浏览器验证**（端口 `3728`，`1280×720` & `1040×680`）：
  - `120%` 字号适配、`ManiaPreviewModal`（`播放倍速` & `谱面方向` 无重叠无裁切）、`FastBatchModal`（`0` 张 `<img>`）、`SettingsModal`（IPv6 + `120%` 恢复默认）、`Lazer` 平滑动效与 `列表` 滚动均验收通过。
  - `getLnCategory` 语义统一复测：`src/` 中 `Rice \$\{|Hybrid \$\{` 仅出现在 `tooltip`（对应正确的 `${riceRatio}%`）；Lazer 左侧头部展示 `单键 Rice` / `综合 Hybrid` / `长条 LN`，`LN%` 属性条与右侧行 `LN XX%`（如 `LN 5%`、`LN 29%`、`LN 41%`、`LN 45%`）完全一致，`1280×720` 与 `1040×680` 下零重叠；`列表` 视图 `24` 行及详情表分别展示 `LN XX%` 与 `Rice · LN XX%` / `Hybrid · LN XX%` / `LN XX%`（`Hybrid · LN 29%` 距表格右缘留白 `25.47px`，`tableFitsContainer = true`），浏览器控制台错误 `0` 条。
- **打包产物冒烟与现场清理**：以 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data` 启动 `release\win-unpacked\osu-4k-downloader.exe` 验证 `/api/health` 返回 `ok=True`，关闭测试进程后 `3721` 与 `3728` 端口监听计数归 `0`，用户 `data/config.json` 完整保留。

---

## Session 7 — 瓷器白默认主题、75% 背景透明度、字号缩放、Lazer 交互导航与长标题跑马灯优化 (`v1.4.1`)

- **日期**：2026-11-23
- **版本**：`v1.4.0` → `v1.4.1`

### 本次需求
1. 默认主题改为**瓷器白 (`light`)**，背景默认不透明度改为 **75%**。
2. 左侧栏、设置、详细页等界面部分中文字体偏小偏细，适当放大并加粗，并在设置中增加**自定义字体大小**选项。
3. 左上角已有侧栏收起/展开按钮，移除左侧栏右上角重复的收起按钮。
4. 主界面在 Lazer 模式下仅选歌界面卡片轮盘上下滑动，主界面本身禁止上下滑动，并做好不同窗口大小的适配。
5. 去掉左侧栏、详细页、设置与同步弹窗中的「刷PP」「日常练习」词条与对应场景预设。
6. 添加「回到顶部」及 Lazer 模式下「回到当前选中歌曲」快捷定位按钮。
7. 消除 Lazer 选中展开难度区底部的横向滚动条，并为超长歌名/难度名增加平滑滚动展示（跑马灯）。

### 关键实现
1. **默认瓷器白主题、75% 背景不透明度与 Electron 启动底色同步**（`server/config.ts`, `index.html`, `electron/main.ts`, `src/App.tsx`, `src/components/TitleBar.tsx`, `src/components/OverlayApp.tsx`, `src/index.css`）：
   - 将前后端与无缓存兜底默认主题全部切换为 `'light'`（瓷器白），`electron/main.ts` 按 `config.json` 主题查表设置主窗初始 `backgroundColor`（默认 `#f3f5f9`），避免启动闪烁。
   - `server/config.ts` 中 `customBgOpacity` 默认值改为 `0.75`，上限放开至 `1.0`（`4%–100%`）；同时增强 `light` 主题 `--t-ink-2`/`--t-ink-3` 对比度及 `html[data-has-bg="true"]` 玻璃层底色浓度（`.panel` 82% / `.lazer-set-card` 84%）以保证 75% 高透明背景下的文字可读性。
2. **全站中文字体放大加粗与自定义字号缩放**（`src/main.tsx`, `src/constants.ts`, `server/types.ts`, `server/config.ts`, `src/types.ts`, `src/index.css`, `src/components/SettingsModal.tsx` 及全部 UI 组件）：
   - 新增 `@fontsource/noto-sans-sc/600.css`（SemiBold）并设置全局默认 `font-weight: 500`；将全部组件 `text-[...px]` 迁移为 `rem` 单位并放大加粗左侧栏、设置弹窗、详情页与 PP 计算器等核心中文区域。
   - 新增 `AppConfig.fontScale`（范围 `0.85–1.25`，默认 `1`），在 Tailwind v4 `@theme inline` 中固定 `--spacing: 4px` 实现“字号随 `--ui-font-scale` 缩放、间距保持紧凑”，并在设置弹窗新增实时预览的「界面字体大小」预设按钮（`90%`/`100%`/`110%`/`120%`）与连续滑块。
3. **移除左侧栏重复折叠按钮与「刷PP」/「日常练习」词条**（`src/constants.ts`, `src/components/SideRail.tsx`, `src/components/BeatmapDetailModal.tsx`, `src/components/SettingsModal.tsx`, `src/components/LibrarySyncModal.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`, `src/components/LazerSongSelect.tsx`）：
   - 移除侧栏右上角冗余的 `PanelLeftClose` 按钮，保留标题栏左上角唯一折叠入口。
   - 移除 `WORKFLOW_PRESETS` 中 `lazer-pp` 与 `stable-practice` 预设以及 `TargetMeta.sub` 副标题，将双客户端按钮与说明统一简化为纯粹的 `Lazer` / `Stable` / `双端同步`。
4. **Lazer 主界面防滚动、左侧展板窄高防塌与多分辨率窗口适配**（`src/App.tsx`, `src/components/FilterPanel.tsx`, `src/components/LazerSongSelect.tsx`, `src/components/AudioPlayerBar.tsx`）：
   - `viewMode === 'lazer'` 时 `<main>` 与选歌舞台使用视口锁定弹性列布局（`overflow-hidden`、`min-h-0 flex-1`），切回 Lazer 自动归零 `main.scrollTop`；展开「高级筛选」改为顶部悬浮毛玻璃浮层；左侧展板 `.panel` 与 `.cover-frame` 显式增加 `shrink-0` 并以 `mt-auto` 替代 `justify-between`，避免矮窗口筛选栏展开时封面高度坍塌为 `0`；Lazer 封面高度（`clamp(96px, 16vh, 156px)`）、左右分栏断点、窄屏轮盘弧度振幅与 `.lazer-diff-row` 次要信息响应不同窗口尺寸。
5. **消除 Lazer 难度区横向滚动条与 `<MarqueeText>` 超长歌名跑马灯**（`src/components/MarqueeText.tsx`, `src/index.css`, `src/components/LazerSongSelect.tsx`, `src/components/AudioPlayerBar.tsx`, `src/components/BeatmapCard.tsx`, `src/components/BeatmapListRow.tsx`）：
   - 难度展开滚动列表补充 `overflow-x-hidden` 与左内边距 `pl-2.5`，并将 `.lazer-diff-enter` 填充模式改为 `backwards`，彻底消除鼠标悬停/选中左移 `-8px` 引起的底部横向滚动条与左框裁切。
   - 新增基于模块级单例 `ResizeObserver` 的 `<MarqueeText>` 组件：仅当单行文本实际溢出容器时才激活 `marquee-ping-pong` 往返平滑滚动与 `14px` 右缘渐隐（支持 `always` 与 `group-hover` 两种模式，且遵守 `prefers-reduced-motion`），并避免使用 `flex-1` 挤跑相邻的旋转 `<Disc3>` 与 LN 徽章。
6. **「回到顶部」与 Lazer「回到选中 ↑/↓」悬浮定位**（`src/App.tsx`, `src/components/LazerSongSelect.tsx`）：
   - 卡片/列表视图监测 `main.scrollTop > 280` 在右下角弹出悬浮「回到顶部」按钮（自动上移避让底部 `AudioPlayerBar`）。
   - Lazer 轮盘在既有 `updateArcPositions` rAF 测量阶段一并计算当前选中卡片是否滑出上下视口及 `scrollTop > 180`，仅在状态翻转时更新浮钮显示（保持滚动过程零多余重渲染），点击「回到选中 ↑/↓」平滑居中滚动回当前激活歌曲。

### 验证记录
- **静态扫描、类型检查与打包**：`src/` 正则检查 `刷PP|日常练习|Stable · 日常|Lazer · 刷PP|lazer-pp|stable-practice` 返回 `0` 匹配；`npm run typecheck` 与 `npm run electron:pack` 均退出码 `0` 通过；`release\win-unpacked\osu-4k-downloader.exe` 已更新。
- **浏览器实机全面验收**（`http://127.0.0.1:3721`，控制台错误 `0`，HTTP `>=400` 错误 `0`）：
  - 确认全站可见文案、`SideRail` 4 项预设、`设置`、`双端曲库比对同步`与`完整详情`中已无任何「刷PP」「日常练习」词条；
  - 实测多套含多难度与超长歌名的谱面在 `1280×720` 与 `1040×680` 下：展开难度列表所有 `.lazer-diff-row` 均严密位于容器左右边界内（`1040×680` 下 `rowWidth = 279.67px`，`containerWidth = 293.67px`，`leftOk: true, rightOk: true`）；超长歌名/难度名自动触发 `.marquee-viewport[data-overflowing="true"].marquee-run`（`1280×720` 下 `5` 处、`1040×680` 下 `16` 处）且不挤破容器或遮挡 `<Disc3>`；
  - 实测 Lazer 选中第 0 首并下滚 `1400px` 同时显示「回到选中 ↑」与「回到顶部」，打开 `AudioPlayerBar` 后悬浮按钮底边 `y = 629.33`、试听条顶边 `y = 649.17`，留白 `19.83px` 零遮挡；点击「回到选中 ↑」平滑滚回卡片 0 并隐藏按钮；选中第 12 首回顶后显示「回到选中 ↓」，点击定位并再点击「回到顶部」精准归零（`deltaY = 0`）；切换`卡片`视图下滚 `900px` 点击「回到顶部」同样精准归零；
  - 针对初版验收发现的 `1280×720` / `1040×680` 筛选栏展开时 Lazer 左侧 `.cover-frame` 弹性坍塌至 `0px` 问题，补充 `shrink-0` 与 `mt-auto` 后复检通过：`.cover-frame` 在 `1280×720`（`115.20px`）与 `1040×680`（`108.79px`）均完整展示、`试听预览` 可直接点击且左侧栏独立内部滚动，主视口始终锁定 `1040×680` 不产生外层滚动。
- **打包产物冒烟与现场清理**：以 `OSU_DL_DATA_DIR=d:\Code\osumapdownloader\data` 启动 `release\win-unpacked\osu-4k-downloader.exe` 验证 `GET /api/health` 返回 `200 {"ok":true,...}`，关闭后确认 `3721` 端口 `Listen` 监听数为 `0`，用户 `data/config.json` 完整保留。

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
