"use client";
import { useState, useMemo } from "react";
import type { SgRNARow } from "./SgRNAResults";

interface Props {
  sgrnas: SgRNARow[];
  sequenceId: string;
  sequenceLength: number;
  onSelect?: (sg: SgRNARow) => void;
}

/** Genome-browser-style track showing sgRNA positions on a sequence. */
export default function GenomeTrack({ sgrnas, sequenceId, sequenceLength, onSelect }: Props) {
  const [hovered, setHovered] = useState<SgRNARow | null>(null);
  const [showOff, setShowOff] = useState(true);

  const W = 1200, H = 280;
  const pad = { l: 60, r: 30, t: 30, b: 50 };
  const innerW = W - pad.l - pad.r;
  const baselineY = H / 2;

  const xScale = (pos: number) => pad.l + (pos / Math.max(sequenceLength, 1)) * innerW;

  // Lane assignment for + strand (above baseline) and - strand (below)
  const laneFor = useMemo(() => {
    const lanes: { plus: [number, number][][]; minus: [number, number][][] } = {
      plus: [], minus: [],
    };
    const out = new Map<string, number>();
    const sorted = [...sgrnas].sort((a, b) => a.start - b.start);
    for (const s of sorted) {
      const stack = s.strand === "+" ? lanes.plus : lanes.minus;
      let placed = false;
      for (let i = 0; i < stack.length; i++) {
        if (stack[i].every(([rs, re]) => s.end < rs || s.start > re)) {
          stack[i].push([s.start, s.end]);
          out.set(`${s.sgRNA}-${s.start}-${s.strand}`, i);
          placed = true;
          break;
        }
      }
      if (!placed) {
        stack.push([[s.start, s.end]]);
        out.set(`${s.sgRNA}-${s.start}-${s.strand}`, stack.length - 1);
      }
    }
    return out;
  }, [sgrnas]);

  const ticks = useMemo(() => {
    const n = 6;
    const out: number[] = [];
    for (let i = 0; i <= n; i++) {
      out.push(Math.round((sequenceLength / n) * i));
    }
    return out;
  }, [sequenceLength]);

  const filtered = useMemo(() => {
    return sgrnas.filter(s => showOff || s.off_targets === 0);
  }, [sgrnas, showOff]);

  if (!sgrnas.length) {
    return <div className="text-zinc-500 text-sm py-8 text-center">
      No sgRNAs to plot.
    </div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <span className="font-medium">Sequence: <span className="font-mono">{sequenceId}</span></span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-500">{sequenceLength.toLocaleString()} bp</span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-500">{filtered.length} sgRNAs shown</span>
        <label className="flex items-center gap-1.5 ml-auto">
          <input type="checkbox" checked={showOff}
                 onChange={e => setShowOff(e.target.checked)} />
          Include sgRNAs with off-targets
        </label>
      </div>

      <div className="border border-zinc-200 rounded bg-white overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 700 }}>
          {/* Strand labels */}
          <text x={pad.l - 10} y={baselineY - 25} textAnchor="end"
                fontSize={12} fontWeight={600} fill="#27272a">+</text>
          <text x={pad.l - 10} y={baselineY + 30} textAnchor="end"
                fontSize={12} fontWeight={600} fill="#27272a">−</text>

          {/* Backbone */}
          <line x1={pad.l} y1={baselineY} x2={pad.l + innerW} y2={baselineY}
                stroke="#52525b" strokeWidth={2} />

          {/* Tick marks + labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={xScale(t)} y1={baselineY - 4}
                    x2={xScale(t)} y2={baselineY + 4}
                    stroke="#52525b" strokeWidth={1} />
              <text x={xScale(t)} y={H - pad.b + 18} textAnchor="middle"
                    fontSize={10} fill="#71717a" fontFamily="monospace">
                {t.toLocaleString()}
              </text>
            </g>
          ))}

          {/* sgRNA markers */}
          {filtered.map((s) => {
            const x1 = xScale(s.start);
            const x2 = xScale(s.end);
            const w = Math.max(x2 - x1, 3);
            const lane = laneFor.get(`${s.sgRNA}-${s.start}-${s.strand}`) ?? 0;
            const isPlus = s.strand === "+";
            const y = isPlus
              ? baselineY - 14 - lane * 14
              : baselineY + 6 + lane * 14;
            const opacity = 0.35 + s.composite_score * 0.6;
            const color = s.composite_score >= 0.8 ? "#16a34a"
                       : s.composite_score >= 0.6 ? "#eab308"
                                                  : "#dc2626";
            return (
              <g key={`${s.sgRNA}-${s.start}-${s.strand}`}
                 onMouseEnter={() => setHovered(s)}
                 onMouseLeave={() => setHovered(null)}
                 onClick={() => onSelect?.(s)}
                 style={{ cursor: "pointer" }}>
                {/* Triangle pointer indicating strand */}
                {isPlus ? (
                  <polygon points={`${x1},${y + 9} ${x2 - 4},${y + 9} ${x2},${y + 5} ${x2 - 4},${y + 1} ${x1},${y + 1}`}
                           fill={color} opacity={opacity}
                           stroke="black" strokeWidth={0.3} />
                ) : (
                  <polygon points={`${x1 + 4},${y + 1} ${x2},${y + 1} ${x2},${y + 9} ${x1 + 4},${y + 9} ${x1},${y + 5}`}
                           fill={color} opacity={opacity}
                           stroke="black" strokeWidth={0.3} />
                )}
                {/* Off-target dot */}
                {s.off_targets > 0 && (
                  <circle cx={(x1 + x2) / 2} cy={y + 5} r={2}
                          fill="#dc2626" />
                )}
              </g>
            );
          })}

          {/* Hover tooltip */}
          {hovered && (() => {
            const x = xScale((hovered.start + hovered.end) / 2);
            const isLeft = x > W * 0.6;
            const tx = isLeft ? x - 240 : x + 10;
            return (
              <g pointerEvents="none">
                <rect x={tx} y={20} width={230} height={92} rx={4}
                      fill="white" stroke="#a1a1aa" strokeWidth={1}
                      style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))" }} />
                <text x={tx + 8} y={38} fontSize={11} fontWeight={700}
                      fontFamily="monospace">#{hovered.rank} {hovered.sgRNA}</text>
                <text x={tx + 8} y={55} fontSize={10} fill="#52525b">
                  {hovered.start}-{hovered.end} ({hovered.strand}) · GC {(hovered.gc_content*100).toFixed(0)}%
                </text>
                <text x={tx + 8} y={71} fontSize={10} fill="#52525b">
                  Eff: {hovered.efficiency_score.toFixed(2)} · OT: {hovered.off_targets} · MFE: {hovered.mfe.toFixed(1)}
                </text>
                <text x={tx + 8} y={87} fontSize={11} fontWeight={700} fill="#15803d">
                  Score: {hovered.composite_score.toFixed(3)}
                </text>
                <text x={tx + 8} y={103} fontSize={9} fill="#71717a">
                  Click for structure preview
                </text>
              </g>
            );
          })()}

          {/* Axis label */}
          <text x={pad.l + innerW / 2} y={H - 8} textAnchor="middle"
                fontSize={11} fill="#52525b">Position (bp)</text>
        </svg>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5" style={{ background: "#16a34a" }} />
          Score ≥ 0.80
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5" style={{ background: "#eab308" }} />
          Score 0.60–0.80
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5" style={{ background: "#dc2626" }} />
          Score &lt; 0.60
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#dc2626" }} />
          Has off-targets
        </span>
        <span className="text-zinc-400 ml-auto">Hover for details · click to preview structure</span>
      </div>
    </div>
  );
}
