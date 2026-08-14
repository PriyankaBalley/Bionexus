"use client";
import { useState, useMemo } from "react";
import type { SgRNARow } from "./SgRNAResults";
import { Copy, Check } from "lucide-react";

interface Props {
  sgrnas: SgRNARow[];
}

/** Greedy multiplex picker: pick top-scoring non-overlapping sgRNAs separated by >= minSep bp. */
function pickMultiplex(rows: SgRNARow[], n: number, minSep: number, minScore: number): SgRNARow[] {
  const candidates = rows
    .filter(r => r.composite_score >= minScore)
    .sort((a, b) => b.composite_score - a.composite_score);
  const picked: SgRNARow[] = [];
  for (const c of candidates) {
    if (picked.length >= n) break;
    const tooClose = picked.some(p =>
      Math.max(0, Math.min(c.end, p.end) - Math.max(c.start, p.start)) > 0
      || Math.abs((c.start + c.end) / 2 - (p.start + p.end) / 2) < minSep
    );
    if (!tooClose) picked.push(c);
  }
  // Re-sort by genomic position for sensible display
  return picked.sort((a, b) => a.start - b.start);
}

export default function MultiplexPicker({ sgrnas }: Props) {
  const [n, setN] = useState(3);
  const [minSep, setMinSep] = useState(100);
  const [minScore, setMinScore] = useState(0.7);
  const [copied, setCopied] = useState(false);

  const picked = useMemo(
    () => pickMultiplex(sgrnas, n, minSep, minScore),
    [sgrnas, n, minSep, minScore]
  );

  function copyFasta() {
    const text = picked.map((p, i) =>
      `>sgRNA_${i + 1}_rank${p.rank}_pos${p.start}-${p.end}_strand${p.strand}\n${p.sgRNA}`
    ).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-semibold">Multiplex sgRNA picker</h3>
        <p className="text-sm text-zinc-600 mt-0.5">
          Greedy selection of top-scoring sgRNAs that don't overlap and are
          separated by at least the chosen distance. Useful for targeting a
          locus with multiple guides.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-zinc-600 font-medium">
            Number to pick: {n}
          </label>
          <input type="range" min={1} max={10} value={n}
                 onChange={e => setN(parseInt(e.target.value))}
                 className="w-full" />
        </div>
        <div>
          <label className="text-xs text-zinc-600 font-medium">
            Min separation: {minSep} bp
          </label>
          <input type="range" min={20} max={500} step={10} value={minSep}
                 onChange={e => setMinSep(parseInt(e.target.value))}
                 className="w-full" />
        </div>
        <div>
          <label className="text-xs text-zinc-600 font-medium">
            Min composite score: {minScore.toFixed(2)}
          </label>
          <input type="range" min={0} max={1} step={0.05} value={minScore}
                 onChange={e => setMinScore(parseFloat(e.target.value))}
                 className="w-full" />
        </div>
      </div>

      {picked.length > 0 ? (
        <>
          <div className="overflow-auto border border-zinc-200 rounded">
            <table className="min-w-full text-xs">
              <thead className="bg-zinc-50">
                <tr className="text-left text-zinc-700">
                  <th className="px-2 py-2">Slot</th>
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">sgRNA</th>
                  <th className="px-2 py-2">PAM</th>
                  <th className="px-2 py-2">Pos</th>
                  <th className="px-2 py-2">Strand</th>
                  <th className="px-2 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {picked.map((p, i) => (
                  <tr key={`${p.sgRNA}-${p.start}`}
                      className="border-t border-zinc-100">
                    <td className="px-2 py-1.5 font-mono">{i + 1}</td>
                    <td className="px-2 py-1.5 font-mono">#{p.rank}</td>
                    <td className="px-2 py-1.5 font-mono">{p.sgRNA}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-500">{p.pam}</td>
                    <td className="px-2 py-1.5 font-mono">{p.start}-{p.end}</td>
                    <td className="px-2 py-1.5 font-mono">{p.strand}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold text-emerald-700">
                      {p.composite_score.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyFasta} className="btn btn-ghost border border-zinc-300">
              {copied ? <Check className="h-4 w-4 text-brand-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy as FASTA"}
            </button>
          </div>
        </>
      ) : (
        <div className="text-zinc-500 text-sm py-4 text-center">
          No combination meets these constraints. Try lowering the score threshold
          or reducing the minimum separation.
        </div>
      )}
    </div>
  );
}
