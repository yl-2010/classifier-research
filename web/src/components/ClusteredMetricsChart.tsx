import type { CSSProperties } from "react";

export type ArmMetrics = {
  name: string;
  label?: string;
  accuracy: number;
  micro_f1: number;
  macro_f1: number;
  n?: number;
};

type Props = {
  arms: ArmMetrics[];
  /** Display order of arm keys */
  order?: string[];
};

const METRICS: { key: "accuracy" | "micro_f1" | "macro_f1"; label: string; color: string }[] = [
  { key: "accuracy", label: "Accuracy", color: "#1a6b8a" },
  { key: "micro_f1", label: "Micro-F1", color: "#2f9e8a" },
  { key: "macro_f1", label: "Macro-F1", color: "#c45c26" },
];

const DEFAULT_ORDER = ["zero_shot", "fine_tuned", "gpt_oss"];

export function ClusteredMetricsChart({ arms, order = DEFAULT_ORDER }: Props) {
  const byName = new Map(arms.map((a) => [a.name, a]));
  const ordered = order.map((k) => byName.get(k)).filter(Boolean) as ArmMetrics[];

  const chartH = 220;
  const padTop = 16;
  const padBottom = 48;
  const padLeft = 40;
  const padRight = 16;
  const innerH = chartH - padTop - padBottom;
  const groupGap = 48;
  const barW = 22;
  const clusterW = barW * METRICS.length; // touching, no gap
  const width =
    padLeft +
    padRight +
    ordered.length * clusterW +
    Math.max(0, ordered.length - 1) * groupGap +
    24;

  const y = (v: number) => padTop + innerH * (1 - Math.min(1, Math.max(0, v)));

  return (
    <figure className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${chartH}`}
        role="img"
        aria-label="Accuracy, micro-F1, and macro-F1 by classifier"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={y(tick)}
              y2={y(tick)}
              className="grid"
            />
            <text x={padLeft - 8} y={y(tick) + 4} className="tick" textAnchor="end">
              {Math.round(tick * 100)}
            </text>
          </g>
        ))}

        {ordered.map((arm, gi) => {
          const gx = padLeft + 12 + gi * (clusterW + groupGap);
          return (
            <g key={arm.name}>
              {METRICS.map((m, mi) => {
                const val = arm[m.key] ?? 0;
                const bh = innerH * Math.min(1, Math.max(0, val));
                const x = gx + mi * barW;
                const top = y(val);
                return (
                  <g key={m.key}>
                    <rect
                      x={x}
                      y={top}
                      width={barW}
                      height={bh}
                      fill={m.color}
                      className="bar"
                      style={{ "--i": gi * 3 + mi } as CSSProperties}
                    >
                      <title>
                        {arm.label || arm.name} · {m.label}: {(val * 100).toFixed(1)}%
                      </title>
                    </rect>
                  </g>
                );
              })}
              <text
                x={gx + clusterW / 2}
                y={chartH - 18}
                textAnchor="middle"
                className="group-label"
              >
                {arm.label || arm.name}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">
        {METRICS.map((m) => (
          <span key={m.key} className="legend-item">
            <i style={{ background: m.color }} aria-hidden />
            {m.label}
          </span>
        ))}
      </figcaption>
      <style jsx>{`
        .chart-wrap {
          margin: 0;
        }

        .chart {
          width: 100%;
          max-width: 640px;
          height: auto;
          display: block;
        }

        .grid {
          stroke: color-mix(in srgb, var(--line) 80%, transparent);
          stroke-width: 1;
        }

        .tick {
          fill: var(--mute);
          font-size: 10px;
          font-family: var(--font);
        }

        .group-label {
          fill: var(--ink);
          font-size: 11px;
          font-family: var(--font);
          font-weight: 600;
        }

        :global(.bar) {
          transform-origin: bottom;
          animation: bar-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
          animation-delay: calc(var(--i, 0) * 60ms);
        }

        @keyframes bar-in {
          from {
            opacity: 0;
            transform: scaleY(0.15);
          }
          to {
            opacity: 1;
            transform: scaleY(1);
          }
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin: 0.85rem 0 0;
          font-size: 0.85rem;
          color: var(--mute);
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }

        .legend-item i {
          display: inline-block;
          width: 0.7rem;
          height: 0.7rem;
          border-radius: 2px;
        }
      `}</style>
    </figure>
  );
}
