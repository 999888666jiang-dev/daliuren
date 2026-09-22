import { useState } from "react";
import { BRANCHES } from "../core";
import type { ChartResult } from "../core/types";
const polar = (r: number, a: number) => ({
  x: 300 + r * Math.sin((a * Math.PI) / 180),
  y: 300 - r * Math.cos((a * Math.PI) / 180),
});
export function Seal() {
  return (
    <svg viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <circle cx="22" cy="22" r="20" />
      <circle cx="22" cy="22" r="16.5" />
      <path d="M14 9v27m16-26v25M8 17h28M8 27h28M21 6v32m-9-24 9-4 12 4M13 32h18M26 17v10M17 18v8" />
    </svg>
  );
}
export function Plate({
  chart,
  compact = false,
}: {
  chart?: ChartResult;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className={`plate-wrap ${compact ? "compact" : ""}`}>
      <svg
        className="plate"
        viewBox="0 0 600 600"
        role={chart ? "group" : "img"}
        aria-label={
          chart ? "大六壬天地盘，南上北下" : "十二地支仪盘装饰，尚未起课"
        }
      >
        <defs>
          <radialGradient id="plate-glow">
            <stop stopColor="#b89b69" stopOpacity=".08" />
            <stop offset="1" stopColor="#b89b69" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="300" cy="300" r="296" fill="url(#plate-glow)" />
        <g fill="none" className="plate-lines">
          {[111, 127, 151, 173, 209, 226, 235, 244, 269, 282].map((r, i) => (
            <circle
              key={r}
              cx="300"
              cy="300"
              r={r}
              strokeDasharray={i === 9 ? "1 4" : undefined}
              opacity={[0.45, 0.7, 0.5, 0.45, 0.7, 0.5, 0.9, 0.5, 0.5, 0.5][i]}
            />
          ))}
          {Array.from({ length: 120 }, (_, i) => {
            const a = i * 3;
            const start = polar(i % 5 === 0 ? 233 : 238, a),
              end = polar(244, a);
            return (
              <path
                key={i}
                d={`M${start.x} ${start.y}L${end.x} ${end.y}`}
                opacity={i % 5 === 0 ? 1 : 0.45}
              />
            );
          })}
          {[0, 90, 180, 270].map((a) => {
            const p = polar(287, a),
              q = polar(250, a);
            return (
              <g key={a}>
                <path d={`M${p.x} ${p.y}L${q.x} ${q.y}`} />
                <circle cx={p.x} cy={p.y} r="4" />
                <circle cx={p.x} cy={p.y} r="1.2" fill="currentColor" />
              </g>
            );
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const a = i * 30 + 15;
            const p = polar(151, a),
              q = polar(225, a);
            return (
              <path key={i} d={`M${p.x} ${p.y}L${q.x} ${q.y}`} opacity=".65" />
            );
          })}
        </g>
        {BRANCHES.map((b, i) => {
          const a = i * 30 + (chart ? 180 : 0),
            p = polar(chart ? 198 : 187, a),
            q = polar(157, a),
            g = polar(258, a);
          const chosen = selected === i;
          return (
            <g
              key={b}
              className={chart ? "plate-palace" : ""}
              role={chart ? "button" : undefined}
              tabIndex={chart ? 0 : undefined}
              aria-label={
                chart
                  ? `地盘${b}，天盘${chart.heavenPlate[i]}，天将${chart.generals[i]}`
                  : undefined
              }
              onClick={() => chart && setSelected(i)}
              onKeyDown={(e) => {
                if (chart && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
            >
              {chart && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="23"
                  fill={chosen ? "#9c815333" : "transparent"}
                  stroke={chosen ? "#c7ab78" : "transparent"}
                />
              )}
              <text className="earth-branch" x={p.x} y={p.y + 9}>
                {b}
              </text>
              {chart && (
                <>
                  <text className="heaven-branch" x={q.x} y={q.y + 7}>
                    {chart.heavenPlate[i]}
                  </text>
                  <text className="general-name" x={g.x} y={g.y + 4}>
                    {chart.generals[i]}
                  </text>
                </>
              )}
            </g>
          );
        })}
        <g className="center-mark">
          <path d="M268 271h64M268 331h64" stroke="currentColor" opacity=".5" />
          <text x="300" y="310" className="plate-title">
            {chart ? chart.day.stem + chart.day.branch : "大六壬"}
          </text>
          <text x="300" y="351" className="plate-subtitle">
            {chart
              ? `${chart.method.name} · ${chart.daytime ? "昼占" : "夜占"}`
              : "一时一课 · 有据可循"}
          </text>
        </g>
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([x, y], i) => (
          <g
            key={i}
            className="constellation"
            transform={`translate(${300 + x * 253} ${300 + y * 248})`}
          >
            <path d="M-18 -13 8 -23 22 7 3 16 -18 -13" fill="none" />
            {[
              [-18, -13],
              [8, -23],
              [22, 7],
              [3, 16],
            ].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" />
            ))}
          </g>
        ))}
      </svg>
      {chart && (
        <p className="palace-detail" aria-live="polite">
          {selected === null
            ? "南上北下 · 外圈地盘，内圈天盘 · 点选宫位查看"
            : `地盘${BRANCHES[selected]}宫，上见${chart.heavenPlate[selected]}，乘${chart.generals[selected]}。`}
        </p>
      )}
    </div>
  );
}
