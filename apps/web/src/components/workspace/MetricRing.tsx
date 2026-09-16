'use client';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  label: string;
  value: number | null;
  tooltip: string;
  /** Stroke color override; when omitted, uses score-band coloring. */
  accent?: 'teal' | 'blue' | 'amber';
  size?: number;
};

const ACCENT = {
  teal: '#2DD4BF',
  blue: '#3B82F6',
  amber: '#FBBF24',
} as const;

/** Score-band colors matching hybrid mockup ringColor(). */
export function scoreBandColor(score: number): string {
  if (score >= 80) return '#34d399';
  if (score >= 65) return '#fbbf24';
  return '#9CA3AF';
}

function RingSvg({
  value,
  color,
  size,
  stroke = 4.5,
  fontSize,
}: {
  value: number | null;
  color: string;
  size: number;
  stroke?: number;
  fontSize: number;
}) {
  const v = value == null ? null : Math.min(100, Math.max(0, value));
  const r = (size - stroke) / 2 - 1;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = v == null ? 0 : v / 100;
  const dash = circumference * pct;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="-rotate-90"
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#121826"
          strokeWidth={stroke}
        />
        {v != null && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        )}
      </svg>
      <span
        className="absolute inset-0 grid place-items-center font-bold tabular-nums leading-none"
        style={{ fontSize, color: v == null ? '#9CA3AF' : color }}
      >
        {v == null ? '—' : Math.round(v)}
      </span>
    </div>
  );
}

export function MetricRing({
  label,
  value,
  tooltip,
  accent,
  size = 48,
}: Props) {
  const v = value == null ? null : Math.min(100, Math.max(0, value));
  const color = accent ? ACCENT[accent] : scoreBandColor(v ?? 0);

  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          <div className="flex flex-col items-center gap-1 cursor-default outline-none" />
        }
      >
        <RingSvg value={v} color={color} size={size} fontSize={size >= 52 ? 14 : 12} />
        <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-500">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-slate-900 text-slate-100">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function QualifyScore({
  score,
  businessFit,
  strategicFit,
  className,
  size = 60,
}: {
  score: number;
  businessFit: number;
  strategicFit: number;
  className?: string;
  size?: number;
}) {
  const color = scoreBandColor(score);

  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          <div
            className={cn(
              'flex flex-col items-center gap-0.5 cursor-default outline-none',
              className,
            )}
          />
        }
      >
        <RingSvg
          value={score}
          color={color}
          size={size}
          stroke={5}
          fontSize={size >= 58 ? 16 : 14}
        />
        <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-500">
          Qualify
        </span>
        <span className="text-[10px] tabular-nums text-slate-400">
          B{businessFit} · S{strategicFit}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-slate-900 text-slate-100">
        Qualification = 60% business fit ({businessFit}) + 40% strategic fit ({strategicFit}).
        Separate from similarity and scoring confidence.
      </TooltipContent>
    </Tooltip>
  );
}
