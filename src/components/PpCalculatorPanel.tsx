import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Award, Calculator, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { NormalizedBeatmap } from '../types';
import {
  DEFAULT_PP_MODS,
  PpMods,
  PpScenarioInput,
  calculateBeatmapPp,
  formatPp,
  isRankedForPp,
} from '../utils/pp';
import { SelectField } from './SelectField';

interface PpCalculatorPanelProps {
  beatmaps: NormalizedBeatmap[];
  selectedDiffId: number | null;
  onSelectDiff: (id: number) => void;
  status: string;
  bpm: number;
  initialScenario?: Partial<PpScenarioInput>;
}

const ACC_PRESETS = [
  { label: '95%', value: 95 },
  { label: '97%', value: 97 },
  { label: '98%', value: 98 },
  { label: '99%', value: 99 },
  { label: '99.5%', value: 99.5 },
  { label: '100% SS', value: 100 },
];

const MISS_PRESETS = [0, 1, 3, 5, 10];

const RATE_PRESETS = [
  { label: 'HT 0.75x', value: 0.75 },
  { label: '0.9x', value: 0.9 },
  { label: 'NM 1.0x', value: 1 },
  { label: '1.1x', value: 1.1 },
  { label: '1.2x', value: 1.2 },
  { label: 'DT 1.5x', value: 1.5 },
];

const MA_PRESETS: Array<{ label: string; ratio: number | null; hint: string }> = [
  { label: '直算', ratio: null, hint: '直接按自定义准度计算 (不按 320:300 拆分)' },
  { label: '1:1', ratio: 1, hint: '彩300:黄300 = 1:1 (彩占 50%)' },
  { label: '2:1', ratio: 2, hint: '彩300:黄300 = 2:1 (彩占 66.7%)' },
  { label: '3:1', ratio: 3, hint: '彩300:黄300 = 3:1 (彩占 75%)' },
  { label: '5:1', ratio: 5, hint: '彩300:黄300 = 5:1 (彩占 83.3%)' },
  { label: '8:1', ratio: 8, hint: '彩300:黄300 = 8:1 (彩占 88.9%)' },
  { label: '全彩', ratio: 1000, hint: '近似全彩 320 MAX 上限' },
];

export function PpCalculatorPanel({
  beatmaps,
  selectedDiffId,
  onSelectDiff,
  status,
  bpm,
  initialScenario,
}: PpCalculatorPanelProps) {
  const initAcc = initialScenario?.accuracy ?? 98;
  const initMisses = initialScenario?.misses ?? 0;
  const initRate = initialScenario?.rate ?? 1;
  const initClassic = Boolean(initialScenario?.mods?.classic);
  const initEz = Boolean(initialScenario?.mods?.ez);
  const initNf = Boolean(initialScenario?.mods?.nf);
  const initMaRatio =
    initialScenario?.maRatio !== undefined && initialScenario?.maRatio !== null
      ? initialScenario.maRatio
      : null;

  const [accuracy, setAccuracy] = useState<number>(initAcc);
  const [misses, setMisses] = useState<number>(initMisses);
  const [rate, setRate] = useState<number>(initRate);
  const [mods, setMods] = useState<PpMods>({
    classic: initClassic,
    ez: initEz,
    nf: initNf,
  });
  const [maRatio, setMaRatio] = useState<number | null>(initMaRatio);
  const [simulateRanked, setSimulateRanked] = useState(false);

  const ranked = isRankedForPp(status);

  useEffect(() => {
    setSimulateRanked(false);
  }, [status]);

  useEffect(() => {
    setAccuracy(initAcc);
    setMisses(initMisses);
    setRate(initRate);
    setMods({ classic: initClassic, ez: initEz, nf: initNf });
    setMaRatio(initMaRatio);
  }, [initAcc, initMisses, initRate, initClassic, initEz, initNf, initMaRatio]);

  const sortedDiffs = useMemo(
    () => [...beatmaps].sort((a, b) => a.difficultyRating - b.difficultyRating),
    [beatmaps],
  );

  const activeDiff = useMemo(() => {
    if (sortedDiffs.length === 0) return null;
    if (selectedDiffId !== null) {
      const found = sortedDiffs.find((d) => d.id === selectedDiffId);
      if (found) return found;
    }
    return sortedDiffs[sortedDiffs.length - 1];
  }, [sortedDiffs, selectedDiffId]);

  const result = useMemo(() => {
    if (!activeDiff) return null;
    return calculateBeatmapPp(activeDiff, {
      accuracy,
      misses,
      rate,
      mods,
      maRatio: activeDiff.modeInt === 3 ? maRatio : null,
    });
  }, [activeDiff, accuracy, misses, rate, mods, maRatio]);

  const matrix = useMemo(() => {
    if (!activeDiff) return [];
    const activeMa = activeDiff.modeInt === 3 ? maRatio : null;
    return [95, 98, 99, 100].map((accVal) => ({
      acc: accVal,
      label: accVal === 100 ? '100% SS' : `${accVal}%`,
      pp: calculateBeatmapPp(activeDiff, {
        accuracy: accVal,
        misses,
        rate,
        mods,
        maRatio: activeMa,
      }).pp,
    }));
  }, [activeDiff, misses, rate, mods, maRatio]);

  if (!activeDiff || !result) return null;

  const totalHits = Math.max(
    1,
    activeDiff.countCircles + activeDiff.countSliders + activeDiff.countSpinners,
  );
  const baseBpm = activeDiff.bpm > 0 ? activeDiff.bpm : bpm;
  const effectiveBpm = Math.round(baseBpm * rate);
  const accFillPct = Math.min(100, Math.max(0, ((accuracy - 80) / 20) * 100));
  const rateFillPct = Math.min(100, Math.max(0, ((rate - 0.5) / 1.5) * 100));
  const maSliderVal = maRatio !== null ? Math.min(20, Math.max(0, maRatio)) : 20;
  const maFillPct = Math.min(100, Math.max(0, (maSliderVal / 20) * 100));

  const maDescription = (() => {
    if (maRatio === null) {
      return '当前：直算模式（直接按上方准度计算，不区分黄/彩 300）';
    }
    const clean = Number(maRatio.toFixed(2));
    const maxPct = ((maRatio / (maRatio + 1)) * 100).toFixed(1);
    if (maRatio === 0) {
      return `彩:黄 0:1 · 仅黄 300（彩占 0%）· 折算准度 ${result.effectiveAcc.toFixed(2)}%`;
    }
    if (maRatio >= 999) {
      return `彩:黄 ${clean}:1 · 近乎全彩 320（彩占 ${maxPct}%）· 折算准度 ${result.effectiveAcc.toFixed(2)}%`;
    }
    return `彩:黄 ${clean}:1 · 黄:彩 1:${clean}（彩占 ${maxPct}%）· 折算准度 ${result.effectiveAcc.toFixed(2)}%`;
  })();

  const handleReset = () => {
    setAccuracy(98);
    setMisses(0);
    setRate(1);
    setMods(DEFAULT_PP_MODS);
    setMaRatio(null);
  };

  return (
    <section className="panel-flat space-y-3.5 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-lazer/35 bg-lazer/15 text-lazer-soft">
            <Calculator className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="font-display text-[0.9375rem] font-bold text-ink">
              PP 情景估算计算器
            </h3>
            <p className="text-[0.78125rem] font-medium text-ink-3">
              按当前选中难度实时模拟准度、黄彩比、失误、倍速与 Mod 组合
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-[210px] sm:w-[250px]">
            <SelectField
              value={activeDiff.id}
              onChange={(val) => onSelectDiff(Number(val))}
              title="选择用于 PP 计算的难度"
            >
              {sortedDiffs.map((bm) => {
                const keyTag = bm.modeInt === 3 ? `${Math.round(bm.cs)}K ` : `${bm.mode} `;
                return (
                  <option key={bm.id} value={bm.id}>
                    {keyTag}
                    {bm.difficultyRating.toFixed(2)}★ · {bm.version}
                  </option>
                );
              })}
            </SelectField>
          </div>
          <button
            type="button"
            onClick={handleReset}
            title="重置为 NM 98% 0 Miss"
            className="btn btn-sm"
          >
            <RotateCcw className="h-3 w-3" />
            <span>重置</span>
          </button>
        </div>
      </div>

      {/* Unranked Warning Banner */}
      {!ranked && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[0.8125rem] font-medium">
          <div className="flex items-center gap-2 text-warn">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>
              当前谱面状态为 <strong className="uppercase">{status}</strong>，未上架图在官方不计入 PP。
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSimulateRanked((v) => !v)}
            className={`btn btn-sm ${
              simulateRanked
                ? 'border-lazer/50 bg-lazer/20 text-lazer-soft'
                : 'border-amber-500/40 bg-surface-2 text-ink'
            }`}
          >
            {simulateRanked ? '正在模拟上架 (If Ranked)' : '模拟上架计算 (If Ranked)'}
          </button>
        </div>
      )}

      {/* Live Output + Scenario Matrix */}
      <div
        className={`grid grid-cols-1 gap-3 rounded-[12px] border border-hairline bg-surface-2/85 p-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] ${
          !ranked && !simulateRanked ? 'opacity-60' : ''
        }`}
      >
        <div className="flex flex-col justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-stat text-[1.875rem] leading-none font-bold tracking-tight text-lazer-soft tabular-nums">
              {!ranked && !simulateRanked ? '—' : `${formatPp(result.pp)}`}
            </span>
            <span className="font-stat text-[0.875rem] font-bold text-ink-2">
              {!ranked && !simulateRanked ? '不计官方 PP' : 'pp'}
            </span>
          </div>

          <div className="font-mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] font-medium text-ink-2 tabular-nums">
            <span>
              等效 SR:{' '}
              <strong className="text-ink">
                {result.isRateEstimated ? '≈' : ''}
                {result.effectiveSr.toFixed(2)}★
              </strong>
            </span>
            <span>
              BPM: <strong className="text-ink">{effectiveBpm}</strong>
            </span>
            <span>
              长度加成: <strong className="text-ink">×{result.lengthBonus.toFixed(2)}</strong>
            </span>
            <span>
              Mod: <strong className="text-ink">×{result.modMultiplier.toFixed(2)}</strong>
            </span>
            {activeDiff.modeInt === 3 && maRatio !== null && (
              <span>
                折算准度: <strong className="text-ink">{result.effectiveAcc.toFixed(2)}%</strong>
              </span>
            )}
          </div>
        </div>

        {/* 4-Scenario Matrix */}
        <div className="grid grid-cols-4 gap-1.5">
          {matrix.map((item) => {
            const active = Math.abs(accuracy - item.acc) < 0.05;
            return (
              <button
                key={item.acc}
                type="button"
                onClick={() => setAccuracy(item.acc)}
                title={`点击将准度设为 ${item.label}`}
                className={`flex flex-col items-center justify-center rounded-[9px] border px-2 py-2 text-center transition-colors ${
                  active
                    ? 'border-lazer/60 bg-lazer/16 text-ink'
                    : 'border-hairline bg-surface-1/75 text-ink-2 hover:border-hairline-strong hover:text-ink'
                }`}
              >
                <span className="font-stat text-[0.71875rem] font-semibold text-ink-3">
                  {item.label}
                </span>
                <span className="font-stat mt-0.5 text-[0.9375rem] font-bold text-ink tabular-nums">
                  {!ranked && !simulateRanked ? '—' : `${formatPp(item.pp)}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {/* Accuracy */}
        <div className="space-y-2 rounded-[10px] border border-hairline bg-surface-1/55 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="field-label flex items-center gap-1">
              <Award className="h-3 w-3 text-osu" />
              准度 (Accuracy)
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={50}
                max={100}
                step={0.1}
                value={accuracy}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setAccuracy(Math.min(100, Math.max(0, v)));
                }}
                aria-label="准度百分比"
                className="field font-mono min-h-[28px] w-20 text-right text-[0.8125rem] tabular-nums"
              />
              <span className="font-mono text-[0.75rem] text-ink-3">%</span>
            </div>
          </div>

          <input
            type="range"
            min={80}
            max={100}
            step={0.1}
            value={Math.max(80, Math.min(100, accuracy))}
            onChange={(e) => setAccuracy(Number(e.target.value))}
            style={{ '--fill': `${accFillPct}%` } as CSSProperties}
            className="slim-range w-full"
            aria-label="准度滑块"
          />

          <div className="flex flex-wrap gap-1">
            {ACC_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setAccuracy(p.value)}
                className={`btn btn-sm font-stat min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                  Math.abs(accuracy - p.value) < 0.05
                    ? 'border-osu/60 bg-osu/15 text-osu-soft'
                    : ''
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rate / Speed */}
        <div className="space-y-2 rounded-[10px] border border-hairline bg-surface-1/55 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="field-label flex items-center gap-1">
              <Zap className="h-3 w-3 text-lazer-soft" />
              倍速调节 (HT / NM / DT)
            </span>
            <span className="font-mono text-[0.78125rem] font-semibold text-ink tabular-nums">
              {rate.toFixed(2)}x · {effectiveBpm} BPM
            </span>
          </div>

          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            style={{ '--fill': `${rateFillPct}%` } as CSSProperties}
            className="slim-range w-full"
            aria-label="倍速滑块"
          />

          <div className="flex flex-wrap gap-1">
            {RATE_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setRate(p.value)}
                className={`btn btn-sm font-stat min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                  Math.abs(rate - p.value) < 0.01
                    ? 'border-lazer/60 bg-lazer/18 text-lazer-soft'
                    : ''
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom MA / 黄彩比 (Mania only) */}
        {activeDiff.modeInt === 3 && (
          <div className="space-y-2 rounded-[10px] border border-hairline bg-surface-1/55 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="field-label">自定义黄彩比 (彩300 : 黄300)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={999}
                  step={0.1}
                  value={maRatio !== null ? maRatio : ''}
                  placeholder="直算"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === '') {
                      setMaRatio(null);
                      return;
                    }
                    const v = Number(raw);
                    if (Number.isFinite(v)) {
                      setMaRatio(Math.min(999, Math.max(0, Math.round(v * 100) / 100)));
                    }
                  }}
                  aria-label="黄彩比数值"
                  className="field font-mono min-h-[28px] w-20 text-right text-[0.8125rem] tabular-nums"
                />
                <span className="font-mono text-[0.75rem] font-semibold text-ink-3">: 1</span>
                {maRatio !== null && (
                  <button
                    type="button"
                    onClick={() => setMaRatio(null)}
                    title="清除自定义黄彩比，恢复直算"
                    className="btn btn-sm min-h-[26px] px-1.5 text-[0.6875rem] text-ink-3"
                  >
                    直算
                  </button>
                )}
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={20}
              step={0.1}
              value={maSliderVal}
              onChange={(e) => setMaRatio(Math.round(Number(e.target.value) * 10) / 10)}
              style={{ '--fill': `${maFillPct}%` } as CSSProperties}
              className={`slim-range w-full ${maRatio === null ? 'opacity-60' : ''}`}
              aria-label="黄彩比滑块"
            />

            <p className="font-mono text-[0.6875rem] font-medium text-ink-3 tabular-nums">
              {maDescription}
            </p>

            <div className="flex flex-wrap gap-1">
              {MA_PRESETS.map((opt) => {
                const active =
                  opt.ratio === null
                    ? maRatio === null
                    : maRatio !== null && Math.abs(maRatio - opt.ratio) < 0.05;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    title={opt.hint}
                    onClick={() => setMaRatio(opt.ratio)}
                    className={`btn btn-sm font-mono min-h-[26px] px-2 text-[0.71875rem] font-semibold ${
                      active ? 'border-lazer/60 bg-lazer/16 text-lazer-soft' : ''
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Misses & Mods (Combined cleanly for Mania; separate for non-Mania) */}
        {activeDiff.modeInt === 3 ? (
          <div className="flex flex-col justify-between space-y-2.5 rounded-[10px] border border-hairline bg-surface-1/55 p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="field-label">失误数 (Miss)</span>
                <input
                  type="number"
                  min={0}
                  max={totalHits}
                  step={1}
                  value={misses}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      setMisses(Math.min(totalHits, Math.max(0, Math.round(v))));
                    }
                  }}
                  aria-label="失误数"
                  className="field font-mono min-h-[28px] w-20 text-right text-[0.8125rem] tabular-nums"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {MISS_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMisses(m)}
                    className={`btn btn-sm font-mono min-h-[26px] px-2.5 text-[0.75rem] font-semibold ${
                      misses === m ? 'border-osu/60 bg-osu/15 text-osu-soft' : ''
                    }`}
                  >
                    {m} Miss
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5">
              <span className="field-label">计分与 Mod</span>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setMods((m) => ({ ...m, classic: !m.classic }))}
                  title="Classic / Stable 计分规则 (×0.96)"
                  className={`btn btn-sm font-stat min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                    mods.classic
                      ? 'border-stable/60 bg-stable/16 text-stable-soft'
                      : 'border-lazer/45 bg-lazer/12 text-lazer-soft'
                  }`}
                >
                  {mods.classic ? 'Classic (×0.96)' : 'Lazer (×1.00)'}
                </button>
                <button
                  type="button"
                  onClick={() => setMods((m) => ({ ...m, ez: !m.ez }))}
                  title="Easy Mod (×0.50)"
                  className={`btn btn-sm font-stat min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                    mods.ez ? 'border-emerald-500/60 bg-emerald-500/16 text-ok' : ''
                  }`}
                >
                  EZ ×0.5
                </button>
                <button
                  type="button"
                  onClick={() => setMods((m) => ({ ...m, nf: !m.nf }))}
                  title="NoFail Mod (×0.75)"
                  className={`btn btn-sm font-stat min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                    mods.nf ? 'border-amber-500/60 bg-amber-500/16 text-warn' : ''
                  }`}
                >
                  NF ×0.75
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2 rounded-[10px] border border-hairline bg-surface-1/55 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="field-label">失误数 (Miss)</span>
                <input
                  type="number"
                  min={0}
                  max={totalHits}
                  step={1}
                  value={misses}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      setMisses(Math.min(totalHits, Math.max(0, Math.round(v))));
                    }
                  }}
                  aria-label="失误数"
                  className="field font-mono min-h-[28px] w-20 text-right text-[0.8125rem] tabular-nums"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {MISS_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMisses(m)}
                    className={`btn btn-sm font-mono min-h-[26px] px-2.5 text-[0.75rem] font-semibold ${
                      misses === m ? 'border-osu/60 bg-osu/15 text-osu-soft' : ''
                    }`}
                  >
                    {m} Miss
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-[10px] border border-hairline bg-surface-1/55 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="field-label">计分规则与减分 Mod</span>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setMods((m) => ({ ...m, classic: !m.classic }))}
                    title="Classic / Stable 计分规则 (×0.96)"
                    className={`btn btn-sm font-stat min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                      mods.classic
                        ? 'border-stable/60 bg-stable/16 text-stable-soft'
                        : 'border-lazer/45 bg-lazer/12 text-lazer-soft'
                    }`}
                  >
                    {mods.classic ? 'Classic (×0.96)' : 'Lazer (×1.00)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMods((m) => ({ ...m, ez: !m.ez }))}
                    title="Easy Mod (×0.50)"
                    className={`btn btn-sm font-stat min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                      mods.ez ? 'border-emerald-500/60 bg-emerald-500/16 text-ok' : ''
                    }`}
                  >
                    EZ ×0.5
                  </button>
                  <button
                    type="button"
                    onClick={() => setMods((m) => ({ ...m, nf: !m.nf }))}
                    title="NoFail Mod (×0.75)"
                    className={`btn btn-sm font-stat min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                      mods.nf ? 'border-amber-500/60 bg-amber-500/16 text-warn' : ''
                    }`}
                  >
                    NF ×0.75
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Concise Disclaimer */}
      <p className="text-[0.75rem] font-medium leading-relaxed text-ink-3">
        说明：NM (1.00x) 依据 <code className="font-mono">ppy/osu</code> 官方 Mania 准度制公式计算（含 80% 门槛与物件数长度加成）；HT / DT / 自定义倍速的等效星数与 PP 为基于原星数的近似估算，最终结算以官服在线算分为准。
      </p>
    </section>
  );
}
