"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";

export type Point = { x: number; y: number };

export type Series = {
  id: string;
  label: string;
  points: Point[];
  /** CSS colour. Defaults to the accent token. */
  color?: string;
  /** Fill the area under the line with a fade of `color`. */
  area?: boolean;
  dashed?: boolean;
};

export type Marker = {
  x: number;
  y: number;
  label: string;
};

const VIEW_W = 800;
const PAD = { top: 18, right: 18, bottom: 30, left: 42 };

/** Catmull-Rom to cubic bezier — a readable curve without overshooting the data. */
function smoothPath(points: Point[], toX: (v: number) => number, toY: (v: number) => number): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const only = points[0];
    return `M ${toX(only.x)} ${toY(only.y)} L ${toX(only.x) + 0.01} ${toY(only.y)}`;
  }

  let d = `M ${toX(points[0].x)} ${toY(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const c1x = toX(p1.x) + (toX(p2.x) - toX(p0.x)) / 6;
    const c1y = toY(p1.y) + (toY(p2.y) - toY(p0.y)) / 6;
    const c2x = toX(p2.x) - (toX(p3.x) - toX(p1.x)) / 6;
    const c2y = toY(p2.y) - (toY(p3.y) - toY(p1.y)) / 6;

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toX(p2.x)} ${toY(p2.y)}`;
  }
  return d;
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.01; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function LineChart({
  series,
  markers = [],
  height = 260,
  xLabel,
  yLabel,
  xFormat = (v: number) => `${v}`,
  yFormat = (v: number) => `${Math.round(v)}`,
  animate = true,
}: {
  series: Series[];
  markers?: Marker[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  xFormat?: (value: number) => string;
  yFormat?: (value: number) => string;
  animate?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const primary = series[0];
  const allPoints = series.flatMap((s) => s.points);

  const { toX, toY, xTicks, yTicks, maxY } = useMemo(() => {
    const xs = allPoints.map((p) => p.x);
    const ys = allPoints.map((p) => p.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxXRaw = xs.length ? Math.max(...xs) : 1;
    const maxX = maxXRaw === minX ? minX + 1 : maxXRaw;
    const maxYRaw = ys.length ? Math.max(...ys) : 1;
    const top = Math.max(1, maxYRaw * 1.15);

    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;

    return {
      maxY: top,
      toX: (v: number) => PAD.left + ((v - minX) / (maxX - minX)) * plotW,
      toY: (v: number) => PAD.top + plotH - (v / top) * plotH,
      xTicks: [minX, minX + (maxX - minX) / 2, maxX],
      yTicks: niceTicks(top, 4),
    };
  }, [allPoints, height]);

  const handlePointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!primary || primary.points.length === 0 || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const localX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
      let nearest = 0;
      let bestDistance = Infinity;
      primary.points.forEach((point, index) => {
        const distance = Math.abs(toX(point.x) - localX);
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = index;
        }
      });
      setHoverIndex(nearest);
    },
    [primary, toX],
  );

  if (!primary || primary.points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-sub"
        style={{ height }}
      >
        Not enough data yet
      </div>
    );
  }

  const hovered = hoverIndex === null ? null : primary.points[hoverIndex];
  const multi = series.length > 1;

  return (
    <figure className="m-0">
      {multi ? (
        <figcaption className="mb-3 flex flex-wrap items-center gap-4 text-xs text-sub">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded-full"
                style={{
                  background: s.color ?? "var(--accent)",
                  opacity: s.dashed ? 0.7 : 1,
                }}
              />
              {s.label}
            </span>
          ))}
        </figcaption>
      ) : null}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`${primary.label}${xLabel ? ` over ${xLabel}` : ""}`}
        onPointerMove={handlePointer}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={`${gradientId}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? "var(--accent)"} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color ?? "var(--accent)"} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Recessive grid: horizontal rules only. */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={toY(tick) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--sub)"
            >
              {yFormat(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((tick, index) => (
          <text
            key={`${tick}-${index}`}
            x={toX(tick)}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill="var(--sub)"
          >
            {xFormat(tick)}
          </text>
        ))}

        {series.map((s) => {
          const color = s.color ?? "var(--accent)";
          const path = smoothPath(s.points, toX, toY);
          const areaPath = `${path} L ${toX(s.points[s.points.length - 1].x)} ${toY(0)} L ${toX(s.points[0].x)} ${toY(0)} Z`;
          return (
            <g key={s.id}>
              {s.area ? <path d={areaPath} fill={`url(#${gradientId}-${s.id})`} /> : null}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? "5 6" : undefined}
                className={animate && !s.dashed ? "draw-line" : undefined}
                style={animate && !s.dashed ? ({ "--path-length": 2600 } as React.CSSProperties) : undefined}
              />
            </g>
          );
        })}

        {/* Error moments, sitting on the baseline. */}
        {markers.map((marker, index) => (
          <circle
            key={`${marker.x}-${index}`}
            cx={toX(marker.x)}
            cy={toY(marker.y)}
            r={4}
            fill="var(--error)"
            stroke="var(--bg)"
            strokeWidth={2}
          >
            <title>{marker.label}</title>
          </circle>
        ))}

        {hovered ? (
          <g pointerEvents="none">
            <line
              x1={toX(hovered.x)}
              x2={toX(hovered.x)}
              y1={PAD.top}
              y2={height - PAD.bottom}
              stroke="var(--sub)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            {series.map((s) => {
              const point = s.points[hoverIndex ?? 0];
              if (!point) return null;
              return (
                <circle
                  key={s.id}
                  cx={toX(point.x)}
                  cy={toY(point.y)}
                  r={5}
                  fill={s.color ?? "var(--accent)"}
                  stroke="var(--bg)"
                  strokeWidth={2}
                />
              );
            })}
          </g>
        ) : null}
      </svg>

      <div className="mt-2 flex min-h-5 items-center justify-between text-xs text-sub">
        <span>{xLabel}</span>
        {hovered ? (
          <span className="font-mono text-text">
            {xFormat(hovered.x)} ·{" "}
            {series
              .map((s) => {
                const point = s.points[hoverIndex ?? 0];
                return point ? `${s.label} ${yFormat(point.y)}` : null;
              })
              .filter(Boolean)
              .join("  ·  ")}
          </span>
        ) : (
          <span>{yLabel}</span>
        )}
      </div>
      <span className="sr-only">Peak {yFormat(maxY)}</span>
    </figure>
  );
}
