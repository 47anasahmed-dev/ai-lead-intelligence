'use client';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  label: string;
  value: number | null;
  tooltip: string;
  accent?: 'teal' | 'blue' | 'amber';
  size?: number;
};

const ACCENT = {
  teal: '#2DD4BF',
  blue: '#3B82F6',
  amber: '#FBBF24',
} as const;

const QUALIFY_TEAL = '#2DD4BF';

/** Half-arc ring for Similarity / Confidence / Evidence (pre–PR #6 style). */
export function MetricRing({
  label,
  value,
  tooltip,
  accent = 'teal',
  size = 56,
}: Props) {
  const v = value == null ? null : Math.min(100, Math.max(0, value));
  const stroke = 4;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r;
  const pct = v == null ? 0 : v / 100;
  const dash = circumference * pct;
  const color = ACCENT[accent];

  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          <div className="flex flex-col items-center gap-0.5 cursor-default outline-none" />
        }
      >
        <svg
          width={size}
          height={size / 2 + 8}
          viewBox={`0 0 ${size} ${size / 2 + 8}`}
          aria-hidden
        >
          <path
            d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
            fill="none"
            stroke="rgba(148,163,184,0.25)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          {v != null && (
            <path
              d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          )}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fill="#fff"
            style={{ fontSize: 12, fontWeight: 700 }}
          >
            {v == null ? '—' : Math.round(v)}
          </text>
        </svg>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-slate-900 text-slate-100">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

/** Full-circle Qualify score with fixed teal stroke (not score-band coloring). */
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
  const v = Math.min(100, Math.max(0, score));
  const stroke = 5;
  const r = (size - stroke) / 2 - 1;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * (v / 100);
  const color = QUALIFY_TEAL;
  const fontSize = size >= 58 ? 16 : 14;

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
          </svg>
          <span
            className="absolute inset-0 grid place-items-center font-bold tabular-nums leading-none"
            style={{ fontSize, color }}
          >
            {Math.round(v)}
          </span>
        </div>
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
