"use client";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { getJobStatus, listJobFiles } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, FileDown, Eye, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import StructureModal from "./StructureModal";
import { SaveJobButton } from "./SavedJobs";

export interface SgRNARow {
  rank: number;
  sequence_id: string;
  sgRNA: string;
  pam: string;
  start: number;
  end: number;
  strand: "+" | "-";
  gc_content: number;
  doench_score: number;
  doench_validated?: boolean;
  moreno_mateos_score: number;
  crisprater_score: number;
  efficiency_score: number;
  off_targets: number;
  off_target_score: number;
  specificity_score?: number;
  mfe: number;
  structure_score: number;
  structure: string;
  rna_coords?: { x: number; y: number }[];
  self_complementarity: number;
  restriction_sites: string[];
  mode_weight: number;
  composite_score: number;
}

const fetcher = (jobId: string) => getJobStatus(jobId);
const filesFetcher = (jobId: string) => listJobFiles(jobId);

function scoreColor(v: number): string {
  if (v >= 0.8) return "bg-emerald-100 text-emerald-800";
  if (v >= 0.6) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

type SortKey = keyof SgRNARow | null;
type SortDir = "asc" | "desc";

export default function SgRNAResults({ jobId }: { jobId: string }) {
  const { data, error } = useSWR(jobId, fetcher, {
    refreshInterval: (d) => (d?.status === "SUCCESS" || d?.status === "FAILURE" ? 0 : 1500),
  });
  const isSuccess = data?.status === "SUCCESS";
  const { data: files } = useSWR(isSuccess ? [jobId, "files"] : null, () => filesFetcher(jobId));

  const [sortKey, setSortKey] = useState<SortKey>("composite_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [minEff, setMinEff] = useState(0);
  const [maxOff, setMaxOff] = useState(50);
  const [gcMin, setGcMin] = useState(0);
  const [gcMax, setGcMax] = useState(100);
  const [maxMfe, setMaxMfe] = useState(0);   // MFE upper bound (closer to 0 = looser structure)
  const [excludeRestriction, setExcludeRestriction] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [previewSgrna, setPreviewSgrna] = useState<SgRNARow | null>(null);
  const [seqFilter, setSeqFilter] = useState<string>("");

  const allRows: SgRNARow[] = useMemo(() => {
    const all = data?.result?.all_sgRNAs as SgRNARow[] | undefined;
    const top = data?.result?.top_sgRNAs as SgRNARow[] | undefined;
    return showAll ? (all ?? []) : (top ?? []);
  }, [data, showAll]);

  // Distinct sequence IDs
  const sequenceIds = useMemo(() => {
    const s = new Set<string>();
    allRows.forEach(r => s.add(r.sequence_id));
    return [...s];
  }, [allRows]);

  const filtered = useMemo(() => {
    return allRows.filter(r =>
      r.efficiency_score >= minEff &&
      r.off_targets <= maxOff &&
      r.gc_content * 100 >= gcMin &&
      r.gc_content * 100 <= gcMax &&
      r.mfe <= maxMfe &&
      (!excludeRestriction || r.restriction_sites.length === 0) &&
      (!seqFilter || r.sequence_id === seqFilter)
    );
  }, [allRows, minEff, maxOff, gcMin, gcMax, maxMfe, excludeRestriction, seqFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const out = [...filtered];
    out.sort((a, b) => {
      const av = a[sortKey] as any, bv = b[sortKey] as any;
      if (av === bv) return 0;
      if (typeof av === "number" && typeof bv === "number")
        return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return out;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3 inline" /> : <ArrowDown className="h-3 w-3 inline" />)
      : <ArrowUpDown className="h-3 w-3 inline opacity-30" />;

  if (error) return <div className="text-red-600">Error fetching status</div>;
  if (!data) return <div className="flex items-center gap-2 text-zinc-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;

  return (
    <div className="card mt-4 space-y-4">
      <div className="flex items-center gap-2">
        {data.status === "SUCCESS" && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
        {data.status === "FAILURE" && <XCircle className="h-5 w-5 text-red-600" />}
        {(data.status === "PENDING" || data.status === "STARTED") &&
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />}
        <span className="font-medium">Status: {data.status}</span>
        <span className="text-zinc-500 text-sm">·</span>
        <span className="text-sm text-zinc-500 font-mono">{jobId}</span>
      </div>

      <div className="w-full bg-zinc-100 rounded-full h-2">
        <div className="bg-brand-500 h-2 rounded-full transition-all"
             style={{ width: `${data.progress}%` }} />
      </div>

      {data.error && <div className="text-red-600 text-sm">{data.error}</div>}

      {isSuccess && data.result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <div className="p-3 rounded bg-zinc-50">
              <div className="text-zinc-500">Total candidates</div>
              <div className="text-2xl font-semibold">{data.result.total_candidates}</div>
            </div>
            <div className="p-3 rounded bg-zinc-50">
              <div className="text-zinc-500">Top returned</div>
              <div className="text-2xl font-semibold">{data.result.top_n_returned}</div>
            </div>
            <div className="p-3 rounded bg-zinc-50">
              <div className="text-zinc-500">Mode</div>
              <div className="text-lg font-semibold capitalize">{data.result.mode}</div>
            </div>
            <div className="p-3 rounded bg-zinc-50">
              <div className="text-zinc-500">Best score</div>
              <div className="text-2xl font-semibold">
                {allRows[0]?.composite_score.toFixed(3) ?? "—"}
              </div>
            </div>
            <div className="p-3 rounded bg-zinc-50">
              <div className="text-zinc-500">Showing</div>
              <div className="text-2xl font-semibold">{sorted.length}</div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => setShowFilters(s => !s)}
                    className="btn btn-ghost border border-zinc-300">
              <Filter className="h-4 w-4" />Filters
            </button>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={showAll}
                     onChange={e => setShowAll(e.target.checked)} />
              Show all candidates (not just top N)
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={excludeRestriction}
                     onChange={e => setExcludeRestriction(e.target.checked)} />
              Exclude restriction sites
            </label>
            {sequenceIds.length > 1 && (
              <select className="input max-w-xs" value={seqFilter}
                      onChange={e => setSeqFilter(e.target.value)}>
                <option value="">All sequences ({sequenceIds.length})</option>
                {sequenceIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            )}
            <div className="ml-auto">
              <SaveJobButton jobId={jobId} module="sgrna"
                             defaultName={`sgRNA ${data.result.mode} · ${jobId.slice(0, 8)}`} />
            </div>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="border border-zinc-200 rounded p-4 space-y-3 bg-zinc-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-600 font-medium">
                    Min efficiency: {minEff.toFixed(2)}
                  </label>
                  <input type="range" min={0} max={1} step={0.05} value={minEff}
                         onChange={e => setMinEff(parseFloat(e.target.value))}
                         className="w-full" />
                </div>
                <div>
                  <label className="text-xs text-zinc-600 font-medium">
                    Max off-targets: {maxOff}
                  </label>
                  <input type="range" min={0} max={50} step={1} value={maxOff}
                         onChange={e => setMaxOff(parseInt(e.target.value))}
                         className="w-full" />
                </div>
                <div>
                  <label className="text-xs text-zinc-600 font-medium">
                    GC content: {gcMin}% – {gcMax}%
                  </label>
                  <div className="flex gap-2">
                    <input type="range" min={0} max={100} value={gcMin}
                           onChange={e => setGcMin(parseInt(e.target.value))}
                           className="w-full" />
                    <input type="range" min={0} max={100} value={gcMax}
                           onChange={e => setGcMax(parseInt(e.target.value))}
                           className="w-full" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-600 font-medium">
                    Max MFE (closer to 0 is better): {maxMfe.toFixed(1)}
                  </label>
                  <input type="range" min={-15} max={0} step={0.5} value={maxMfe}
                         onChange={e => setMaxMfe(parseFloat(e.target.value))}
                         className="w-full" />
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          {sorted.length > 0 ? (
            <div className="overflow-auto border border-zinc-200 rounded max-h-[640px]">
              <table className="min-w-full text-xs">
                <thead className="bg-zinc-50 sticky top-0 z-10">
                  <tr className="text-left text-zinc-700">
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("rank")}>
                      # <SortIcon k="rank" />
                    </th>
                    <th className="px-2 py-2">sgRNA (5'→3')</th>
                    <th className="px-2 py-2">PAM</th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("start")}>
                      Pos <SortIcon k="start" />
                    </th>
                    <th className="px-2 py-2">Str</th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("gc_content")}>
                      GC <SortIcon k="gc_content" />
                    </th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("doench_score")}
                        title="Doench Rule Set 2 (Doench et al. 2016) — published linear-feature implementation">
                      Doench
                      <span className="ml-1 inline-block px-1 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-700 font-semibold align-middle">
                        ✓ validated
                      </span>
                      <SortIcon k="doench_score" />
                    </th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("moreno_mateos_score")}
                        title="Moreno-Mateos approximation — heuristic stand-in">
                      M-Mateos
                      <span className="ml-1 inline-block px-1 py-0.5 rounded text-[9px] bg-zinc-100 text-zinc-600 font-semibold align-middle">
                        approx
                      </span>
                      <SortIcon k="moreno_mateos_score" />
                    </th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("crisprater_score")}
                        title="CRISPRater approximation — heuristic stand-in">
                      CRater
                      <span className="ml-1 inline-block px-1 py-0.5 rounded text-[9px] bg-zinc-100 text-zinc-600 font-semibold align-middle">
                        approx
                      </span>
                      <SortIcon k="crisprater_score" />
                    </th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("efficiency_score")}>
                      Eff <SortIcon k="efficiency_score" />
                    </th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("off_targets")}>
                      OT <SortIcon k="off_targets" />
                    </th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("mfe")}>
                      MFE <SortIcon k="mfe" />
                    </th>
                    <th className="px-2 py-2">Self-comp</th>
                    <th className="px-2 py-2">Restr.</th>
                    <th className="px-2 py-2 cursor-pointer hover:bg-zinc-100"
                        onClick={() => handleSort("composite_score")}>
                      Score <SortIcon k="composite_score" />
                    </th>
                    <th className="px-2 py-2">Struct.</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={`${r.sgRNA}-${r.start}-${r.strand}`}
                        className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-2 py-1.5 font-mono">{r.rank}</td>
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.sgRNA}</td>
                      <td className="px-2 py-1.5 font-mono text-zinc-500">{r.pam}</td>
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.start}-{r.end}</td>
                      <td className="px-2 py-1.5 font-mono">{r.strand}</td>
                      <td className="px-2 py-1.5">{(r.gc_content * 100).toFixed(0)}%</td>
                      <td className="px-2 py-1.5">{r.doench_score.toFixed(2)}</td>
                      <td className="px-2 py-1.5">{r.moreno_mateos_score.toFixed(2)}</td>
                      <td className="px-2 py-1.5">{r.crisprater_score.toFixed(2)}</td>
                      <td className="px-2 py-1.5">
                        <span className={`badge ${scoreColor(r.efficiency_score)}`}>
                          {r.efficiency_score.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`badge ${scoreColor(r.off_target_score)}`}>
                          {r.off_targets}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono">{r.mfe.toFixed(1)}</td>
                      <td className="px-2 py-1.5">{r.self_complementarity.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-xs text-zinc-600">
                        {r.restriction_sites.length === 0 ? "—" : r.restriction_sites.join(", ")}
                      </td>
                      <td className="px-2 py-1.5 font-mono font-semibold">
                        <span className={`badge ${scoreColor(r.composite_score)}`}>
                          {r.composite_score.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setPreviewSgrna(r)}
                                className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                          <Eye className="h-3.5 w-3.5" />view
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-zinc-500 text-sm py-8 text-center">
              No sgRNAs match the current filters.
            </div>
          )}

          {files && files.files.length > 0 && (
            <div className="border-t border-zinc-200 pt-3">
              <p className="font-medium text-sm mb-2">Output files</p>
              <ul className="space-y-1">
                {files.files.map(f => (
                  <li key={f.name}>
                    <a href={f.url} target="_blank"
                       className="inline-flex items-center gap-1.5 text-brand-700 hover:underline text-sm">
                      <FileDown className="h-3.5 w-3.5" />{f.name}
                      <span className="text-zinc-400 text-xs">({(f.size/1024).toFixed(1)} KB)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {previewSgrna && (
        <StructureModal
          guide={previewSgrna.sgRNA}
          structure={previewSgrna.structure}
          mfe={previewSgrna.mfe}
          pam={previewSgrna.pam}
          rank={previewSgrna.rank}
          rnaCoords={(previewSgrna as any).rna_coords || []}
          onClose={() => setPreviewSgrna(null)}
        />
      )}
    </div>
  );
}
