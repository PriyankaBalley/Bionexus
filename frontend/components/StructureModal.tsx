"use client";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

interface Props {
  guide: string;
  structure: string;
  mfe: number;
  pam: string;
  rank: number;
  rnaCoords?: { x: number; y: number }[];
  onClose: () => void;
}

const SPCAS9_SCAFFOLD = "GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC";

const NUC_COLORS: Record<string, string> = {
  A: "#16a34a", U: "#dc2626", T: "#dc2626",
  G: "#2563eb", C: "#ea580c",
};

function parsePairs(structure: string): [number, number][] {
  const stack: number[] = [];
  const pairs: [number, number][] = [];
  for (let i = 0; i < structure.length; i++) {
    if (structure[i] === "(") stack.push(i);
    else if (structure[i] === ")") {
      const j = stack.pop();
      if (j !== undefined) pairs.push([j, i]);
    }
  }
  return pairs;
}

/** Normalize coordinates to fit SVG canvas */
function normalizeCoords(
  coords: { x: number; y: number }[],
  W: number, H: number, pad = 30
): { x: number; y: number }[] {
  if (!coords.length) return coords;
  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scaleX = (W - pad * 2) / Math.max(maxX - minX, 1);
  const scaleY = (H - pad * 2) / Math.max(maxY - minY, 1);
  const scale = Math.min(scaleX, scaleY);
  return coords.map(c => ({
    x: pad + (c.x - minX) * scale,
    y: pad + (c.y - minY) * scale,
  }));
}

/** Simple arc-based layout fallback when no real coords available */
function arcLayout(n: number, W: number, H: number): { x: number; y: number }[] {
  const padX = 40, baseY = H - 50;
  const step = (W - padX * 2) / Math.max(n - 1, 1);
  return Array.from({ length: n }, (_, i) => ({
    x: padX + i * step,
    y: baseY,
  }));
}

export default function StructureModal({
  guide, structure, mfe, pam, rank, rnaCoords = [], onClose,
}: Props) {
  const [scaffold, setScaffold] = useState(SPCAS9_SCAFFOLD);
  const [showScaffold, setShowScaffold] = useState(true);

  const fullSeq = (guide + scaffold).replace(/T/g, "U");
  const displaySeq = showScaffold ? fullSeq : guide.replace(/T/g, "U");
  const displayStruct = showScaffold
    ? structure
    : structure.slice(0, guide.length);

  const pairs = useMemo(() => parsePairs(displayStruct), [displayStruct]);

  const svgW = 860, svgH = 540;

  // Use real RNAfold coordinates if available, else arc fallback
  const positions = useMemo(() => {
    if (rnaCoords.length >= displaySeq.length) {
      return normalizeCoords(rnaCoords.slice(0, displaySeq.length), svgW, svgH);
    }
    return arcLayout(displaySeq.length, svgW, svgH);
  }, [rnaCoords, displaySeq.length]);

  const hasRealCoords = rnaCoords.length >= displaySeq.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
         onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[92vh] overflow-auto"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <div>
            <h3 className="font-semibold text-lg">
              Structure preview — sgRNA #{rank}
            </h3>
            <p className="text-sm text-zinc-500 font-mono">
              {guide} <span className="text-zinc-400">+ {pam}</span>
            </p>
          </div>
          <button onClick={onClose}
                  className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 text-sm">
            {[
              ["MFE", `${mfe.toFixed(2)} kcal/mol`],
              ["Base pairs", pairs.length],
              ["Spacer", `${guide.length} nt`],
              ["Full length", `${displaySeq.length} nt`],
            ].map(([label, val]) => (
              <div key={String(label)} className="p-3 bg-zinc-50 rounded">
                <div className="text-zinc-500 text-xs">{label}</div>
                <div className="text-xl font-mono font-semibold mt-0.5">{val}</div>
              </div>
            ))}
          </div>

          {/* Scaffold input */}
          <div className="border border-zinc-200 rounded-lg p-4 bg-zinc-50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">
                Scaffold sequence
              </span>
              <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                <input type="checkbox" checked={showScaffold}
                       onChange={e => setShowScaffold(e.target.checked)}
                       className="rounded" />
                Include in structure
              </label>
            </div>
            <textarea
              value={scaffold}
              onChange={e => setScaffold(
                e.target.value.toUpperCase().replace(/[^ATGCU]/g, "")
              )}
              className="w-full font-mono text-xs p-2 border border-zinc-300 rounded bg-white resize-none"
              rows={2}
            />
            <div className="flex gap-2 text-xs">
              {[
                ["SpCas9", SPCAS9_SCAFFOLD],
                ["SpCas9 ext.", SPCAS9_SCAFFOLD + "TTTTTT"],
              ].map(([label, seq]) => (
                <button key={String(label)}
                        onClick={() => setScaffold(String(seq))}
                        className="px-2 py-1 bg-white border border-zinc-300 rounded hover:bg-zinc-100 text-zinc-600">
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Dot-bracket */}
          <div>
            <div className="text-xs text-zinc-500 mb-1.5 font-medium">
              Dot-bracket notation
            </div>
            <div className="font-mono text-xs bg-zinc-900 text-zinc-100 p-3 rounded overflow-x-auto leading-relaxed whitespace-pre">
              <div className="text-zinc-300">{displaySeq}</div>
              <div className="text-emerald-400">{displayStruct}</div>
            </div>
          </div>

          {/* 2D structure */}
          <div>
            <div className="text-xs text-zinc-500 mb-1.5 font-medium flex items-center gap-2">
              2D structure
              {hasRealCoords
                ? <span className="text-emerald-600 font-semibold">
                    ✓ RNAfold coordinates
                  </span>
                : <span className="text-amber-500">
                    ⚠ Arc layout (run RNAfold for true 2D)
                  </span>
              }
            </div>
            <div className="border border-zinc-200 rounded overflow-x-auto bg-white">
              <svg viewBox={`0 0 ${svgW} ${svgH}`}
                   className="w-full" style={{ minWidth: 700 }}>

                {/* Base pair bonds */}
                {pairs.map(([i, j], idx) => (
                  <line key={idx}
                        x1={positions[i]?.x} y1={positions[i]?.y}
                        x2={positions[j]?.x} y2={positions[j]?.y}
                        stroke="#a1a1aa" strokeWidth={1}
                        strokeDasharray="3 2" opacity={0.7} />
                ))}

                {/* Backbone */}
                {Array.from({ length: displaySeq.length - 1 }, (_, i) => (
                  <line key={i}
                        x1={positions[i]?.x} y1={positions[i]?.y}
                        x2={positions[i + 1]?.x} y2={positions[i + 1]?.y}
                        stroke={i < guide.length ? "#94a3b8" : "#d4d4d8"}
                        strokeWidth={1.5} />
                ))}

                {/* Nucleotides */}
                {Array.from(displaySeq).map((nuc, i) => {
                  const isSpacer = i < guide.length;
                  const color = isSpacer
                    ? (NUC_COLORS[nuc] || "#71717a")
                    : "#a1a1aa";
                  return (
                    <g key={i}>
                      <circle cx={positions[i]?.x} cy={positions[i]?.y}
                              r={isSpacer ? 10 : 8}
                              fill={color}
                              opacity={isSpacer ? 0.95 : 0.55} />
                      <text x={positions[i]?.x}
                            y={(positions[i]?.y || 0) + 3.5}
                            textAnchor="middle" fill="white"
                            fontSize={isSpacer ? 9 : 7}
                            fontWeight={700} fontFamily="monospace">
                        {nuc}
                      </text>
                    </g>
                  );
                })}

                {/* Labels */}
                <text x={10} y={16} fill="#16a34a" fontSize={11} fontWeight={600}>
                  Spacer (nt 1–{guide.length})
                </text>
                <text x={10} y={30} fill="#a1a1aa" fontSize={11}>
                  Scaffold (nt {guide.length + 1}–{displaySeq.length})
                </text>
              </svg>
            </div>

            {/* Legend */}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
              {Object.entries({
                A: "adenine", U: "uracil", G: "guanine", C: "cytosine"
              }).map(([nuc, name]) => (
                <span key={nuc} className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full inline-block"
                        style={{ background: NUC_COLORS[nuc] }} />
                  {nuc} ({name})
                </span>
              ))}
            </div>
          </div>

          <div className="text-xs text-zinc-500 italic">
            Structure shown is spacer + scaffold folded together.
            Lower MFE = more stable. For active sgRNAs, the spacer
            region should be mostly unpaired (dots).
          </div>
        </div>
      </div>
    </div>
  );
}