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
      <TooltipTrigger className="flex flex-col items-center gap-0.5 cursor-default">
        <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`} aria-hidden>
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

export function QualifyScore({
  score,
  businessFit,
  strategicFit,
  className,
}: {
  score: number;
  businessFit: number;
  strategicFit: number;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger className={cn('cursor-default text-left', className)}>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">Qualify</div>
        <div className="text-2xl font-bold tabular-nums text-white leading-none">{score}</div>
        <div className="mt-0.5 text-[10px] text-slate-400">
          B{businessFit} · S{strategicFit}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-slate-900 text-slate-100">
        Qualification = 60% business fit ({businessFit}) + 40% strategic fit ({strategicFit}).
        Separate from similarity and scoring confidence.
      </TooltipContent>
    </Tooltip>
  );
}
