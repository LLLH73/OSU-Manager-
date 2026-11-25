import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Compass,
  Disc3,
  Layers,
  PictureInPicture2,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { LaneEmblem } from './TitleBar';

interface OnboardingModalProps {
  open: boolean;
  version: string;
  onClose: () => void;
  onOpenSettings: () => void;
}

interface OnboardingHighlight {
  label: string;
  detail: string;
}

interface OnboardingStep {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  highlights: OnboardingHighlight[];
  tip: string;
}

function buildSteps(version: string): OnboardingStep[] {
  return [
    {
      id: 'welcome',
      eyebrow: `WELCOME // v${version}`,
      title: '欢迎使用 OSU!Manager!',
      description:
        '专为同时游玩 osu!stable 与 osu!lazer 的 osu!mania 4K 玩家打造的双端谱面管理、极速下载、本地档案库与音乐台工作台。',
      icon: <LaneEmblem className="h-5 w-5 text-osu" />,
      highlights: [
        {
          label: '完全免登录',
          detail: '无需填账号或 Cookie，自动路由国内/海外 7 大镜像源与本地 6174 代理。',
        },
        {
          label: 'Stable + Lazer 双端识别',
          detail: '自动扫描本地 Songs 与 Lazer Realm 数据库，双端装图与查重一目了然。',
        },
        {
          label: '8 套主题 · 离线 Lazer 字体',
          detail: '内置 4 套深色与 4 套纸感浅色主题，支持动态取色、自定义壁纸与 85%–125% 字号缩放。',
        },
      ],
      tip: '提示：右下角可随时跳过引导，后续可在「设置 → 关于与帮助」中随时重新观看。',
    },
    {
      id: 'browse',
      eyebrow: 'STEP 02 // 搜图与情景筛选',
      title: 'Lazer 弧形选歌 · PP 筛选 · 批量扫图',
      description:
        '默认采用仿 osu!lazer 选歌轮盘视图，结合全窗动态封面背景与键盘快捷键，选歌试听零割裂感；也随时可切回「卡片」或「列表」视图。',
      icon: <Compass className="h-5 w-5 text-osu" />,
      highlights: [
        {
          label: '光谱星数 & 情景化 PP 双滑块',
          detail: '支持 NM / DT 1.5x / HT 0.75x / 变速 Rate / 自定义黄彩比情景筛选并实时换算 ~XXXpp。',
        },
        {
          label: 'Filter 存档右侧栏',
          detail: '点击顶部「存档」可保存常用筛选条件与当前浏览定位，下次一键直跳回原位置。',
        },
        {
          label: '极速跨页批量下载',
          detail: '左侧栏「快速批量下载」支持 1–500 首按目标自动翻页补齐，自动跳过本地已装曲目。',
        },
      ],
      tip: '快捷键：Lazer 视图支持 ↑ / ↓ 切歌、← / → 切换难度、Space 试听、Enter 查看详情。',
    },
    {
      id: 'sync-preview',
      eyebrow: 'STEP 03 // 双端管理与实景看谱',
      title: '已装金色框体 · 零流量同步 · Mania 预览',
      description:
        '本地已安装谱面自动点亮四边金色框体；无需重复下载，即可在双客户端之间同步曲库并实时预览本地谱面落键效果。',
      icon: <Layers className="h-5 w-5 text-osu" />,
      highlights: [
        {
          label: '双端曲库比对与同步',
          detail: '一键把 osu!stable 已装曲目零流量打包导入 osu!lazer，未启动客户端时自动暂存待导入队列。',
        },
        {
          label: '侧栏一键拉起客户端',
          detail: '支持直接启动或唤起运行中的 osu!stable / osu!lazer，下载完成也可自动导入加载当前曲目。',
        },
        {
          label: 'Mania 谱面实景预览器',
          detail: '支持读取本地 D:\\OSU\\Skins 皮肤、调节流速倍速、切换上下落及拖动 NPS 密度直方图定位。',
        },
      ],
      tip: '小技巧：在详情弹窗或下载完成提示条中点击「预览谱面」即可直接打开 Mania 看谱器。',
    },
    {
      id: 'book-music',
      eyebrow: 'STEP 04 // BOOK 档案库 & 音乐台',
      title: '3D 书脊档案库 & 构成主义 OSU! 音乐台',
      description:
        '左侧栏顶部「工作区模式」支持在「搜图 | Book | 音乐」间自由切换，把本地全部谱面曲库化作 3D 档案架与可后台持续播放的本地音乐台。',
      icon: <Disc3 className="h-5 w-5 text-osu" />,
      highlights: [
        {
          label: 'Book 档案库 (3D / 平铺毛玻璃)',
          detail: '按双端历史成绩、最高 PP 与难度归档全部本地歌曲，支持鼠标中键拖拽视角与双页展开详档。',
        },
        {
          label: 'OSU! AUDIO 音乐台',
          detail: '支持画幅 / Braun 唱盘、.osu 红线节拍矩阵、频谱 / 示波可视化、专注画报（随主题同步浅/深色）、歌单与 0.50×–2.00× 原调/NC 变调。',
        },
        {
          label: '跨页后台纯播放 & 托盘挂机',
          detail: '切回搜图或 Book 后自动悬浮迷你条继续播放，Electron 下还可最小化至托盘后台挂机。',
        },
      ],
      tip: '提示：进入音乐台后主左侧栏会自动收起留出宽阔空间，需要切模式时点击左上角展开按钮即可。',
    },
    {
      id: 'overlay-ready',
      eyebrow: 'STEP 05 // 游戏内浮窗与初始检查',
      title: '磨砂游戏内浮窗 & 首次路径核对',
      description:
        '在 osu! 使用无边框窗口游玩时，无需切屏即可呼出磨砂浮窗搜图并直接向游戏发送加载指令。现在可以先核对一次本地路径或直接开始使用！',
      icon: <PictureInPicture2 className="h-5 w-5 text-osu" />,
      highlights: [
        {
          label: '全局热键呼出浮窗',
          detail: '默认按 Alt + Shift + O（可在设置修改）呼出或隐藏顶部磨砂浮窗，支持折叠极简条与透明度调节。',
        },
        {
          label: '核对本地路径与 6174 代理',
          detail: '默认绑定 D:\\OSU 与 D:\\OSU\\OSUlazer\\osu-lazer；若你的安装路径不同，可在「设置」中一键浏览选择。',
        },
        {
          label: '随时重看本引导',
          detail: '之后在左下角打开「设置 → 关于与帮助」，可随时查看当前版本号、GitHub 开源地址或重新观看新手引导。',
        },
      ],
      tip: '准备就绪：点击「前往设置检查路径」可立即确认目录与网络测速，或点击「开始使用」直接进入工作台。',
    },
  ];
}

export function OnboardingModal({
  open,
  version,
  onClose,
  onOpenSettings,
}: OnboardingModalProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) {
      setStep(0);
    }
  }, [open]);

  const steps = buildSteps(version);
  const current = steps[step] ?? steps[0];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStep((prev) => Math.min(steps.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStep((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, steps.length]);

  if (!open) return null;

  return (
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="OSU!Manager! 新手引导"
        onClick={(e) => e.stopPropagation()}
        className="modal-surface animate-modal-in flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-hairline bg-surface-3">
              {current.icon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[1.0625rem] font-bold text-ink">
                  OSU!Manager! 新手引导
                </h2>
                <span className="font-mono rounded-full border border-osu/35 bg-osu/10 px-2 py-0.5 text-[0.6875rem] font-bold text-osu-soft tabular-nums">
                  v{version}
                </span>
              </div>
              <p className="font-mono text-[0.71875rem] font-medium tracking-[0.06em] text-ink-3 uppercase">
                {current.eyebrow} · {step + 1} / {steps.length}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭新手引导"
            className="btn btn-icon shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Clickable Step Progress Bar */}
        <div className="grid grid-cols-5 gap-1.5 border-b border-hairline bg-surface-1/55 px-5 py-2.5">
          {steps.map((s, idx) => {
            const active = idx === step;
            const passed = idx < step;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(idx)}
                title={`${idx + 1}. ${s.title}`}
                aria-label={`跳至第 ${idx + 1} 步：${s.title}`}
                className="group flex flex-col gap-1 text-left focus:outline-none"
              >
                <span
                  className={`h-1.5 w-full rounded-full transition-colors ${
                    active
                      ? 'bg-osu'
                      : passed
                        ? 'bg-osu/45 group-hover:bg-osu/70'
                        : 'bg-hairline-strong group-hover:bg-ink-4'
                  }`}
                />
                <span
                  className={`font-mono truncate text-[0.65625rem] font-semibold transition-colors ${
                    active ? 'text-osu-soft' : 'text-ink-3 group-hover:text-ink-2'
                  }`}
                >
                  0{idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[0.875rem]">
          <div className="space-y-1.5">
            <h3 className="font-display text-[1.1875rem] font-bold tracking-tight text-ink">
              {current.title}
            </h3>
            <p className="leading-relaxed text-ink-2">{current.description}</p>
          </div>

          <div className="space-y-2.5">
            {current.highlights.map((item, idx) => (
              <div
                key={item.label}
                className="panel-flat flex items-start gap-3 p-3.5"
              >
                <span className="font-stat mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-osu/35 bg-osu/10 text-[0.75rem] font-bold text-osu-soft">
                  {idx + 1}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="font-display text-[0.875rem] font-bold text-ink">
                    {item.label}
                  </div>
                  <p className="text-[0.8125rem] leading-relaxed text-ink-2">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2.5 rounded-[10px] border border-osu/25 bg-osu/8 px-3.5 py-2.5 text-[0.8125rem] font-medium text-ink-2">
            {isLast ? (
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-osu-soft" />
            ) : (
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-osu-soft" />
            )}
            <span>{current.tip}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface-1/75 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm text-ink-3 hover:text-ink"
          >
            跳过引导
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="btn"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>上一步</span>
              </button>
            )}

            {isLast ? (
              <>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="btn"
                >
                  <Settings className="h-3.5 w-3.5 text-osu-soft" />
                  <span>前往设置检查路径</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-primary px-4"
                >
                  <span>开始使用</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                className="btn btn-primary px-4"
              >
                <span>下一步</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
