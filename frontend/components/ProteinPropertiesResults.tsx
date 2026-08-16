"use client";
import useSWR from "swr";
import { getJobStatus, listJobFiles } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, FileDown } from "lucide-react";

interface AAEntry { name: string; count: number; percent: number }
interface ExtinctionEntry {
  extinction_coefficient: number;
  abs_0_1_percent: number;
  assumption: string | null;
}
interface Properties {
  num_amino_acids: number;
  molecular_weight: number;
  theoretical_pi: number;
  amino_acid_composition: Record<string, AAEntry>;
  negatively_charged_residues: number;
  positively_charged_residues: number;
  atomic_composition: Record<string, number>;
  formula: string;
  total_atoms: number;
  extinction_coefficients: ExtinctionEntry[];
  estimated_half_life: Record<string, string>;
  instability_index: number;
  instability_classification: string;
  aliphatic_index: number;
  gravy: number;
  warning: string | null;
}

const fetcher = (jobId: string) => getJobStatus(jobId);
const filesFetcher = (jobId: string) => listJobFiles(jobId);

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function PropertyCard({ seqId, p }: { seqId: string; p: Properties }) {
  const aaRows = Object.entries(p.amino_acid_composition);
  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{seqId}</h3>
        <span className="text-xs text-zinc-500">{p.num_amino_acids} aa</span>
      </div>

      <div className="p-4 space-y-5">
        {p.warning && (
          <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs">
            {p.warning}
          </div>
        )}

        {/* 1-3: basic */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Molecular weight" value={`${p.molecular_weight.toLocaleString()} Da`} />
          <Field label="Theoretical pI" value={p.theoretical_pi} />
          <Field label="Length" value={`${p.num_amino_acids} aa`} />
        </div>

        {/* 5-6: charge */}
        <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4">
          <Field label="Negatively charged (Asp+Glu)" value={p.negatively_charged_residues} />
          <Field label="Positively charged (Arg+Lys)" value={p.positively_charged_residues} />
        </div>

        {/* 7-9: atomic composition / formula / total atoms */}
        <div className="border-t border-zinc-100 pt-4">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1.5">
            Atomic composition
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {Object.entries(p.atomic_composition).map(([el, n]) => (
              <span key={el}><span className="text-zinc-500">{el}:</span> <b>{n}</b></span>
            ))}
          </div>
          <div className="mt-2 flex gap-6 text-sm">
            <span className="text-zinc-500">Formula: <span className="font-mono text-zinc-900">{p.formula}</span></span>
            <span className="text-zinc-500">Total atoms: <b className="text-zinc-900">{p.total_atoms}</b></span>
          </div>
        </div>

        {/* 10: extinction coefficients */}
        <div className="border-t border-zinc-100 pt-4">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1.5">
            Extinction coefficient (280 nm, M⁻¹cm⁻¹)
          </div>
          <table className="w-full text-sm">
            <tbody>
              {p.extinction_coefficients.map((e, i) => (
                <tr key={i} className="border-b border-zinc-50 last:border-0">
                  <td className="py-1 pr-3 font-semibold">{e.extinction_coefficient.toLocaleString()}</td>
                  <td className="py-1 pr-3 text-zinc-500">Abs 0.1% = {e.abs_0_1_percent}</td>
                  <td className="py-1 text-zinc-400 text-xs">{e.assumption || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 11: half-life */}
        <div className="border-t border-zinc-100 pt-4">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1.5">
            Estimated half-life
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {Object.entries(p.estimated_half_life).map(([org, val]) => (
              <span key={org}><b>{val}h</b> <span className="text-zinc-500">({org})</span></span>
            ))}
          </div>
        </div>

        {/* 12-14: stability / aliphatic / gravy */}
        <div className="grid grid-cols-3 gap-3 border-t border-zinc-100 pt-4">
          <Field label="Instability index" value={
            <>
              {p.instability_index}{" "}
              <span className={`badge ml-1 ${p.instability_classification === "stable"
                ? "bg-brand-100 text-brand-700" : "bg-red-100 text-red-700"}`}>
                {p.instability_classification}
              </span>
            </>
          } />
          <Field label="Aliphatic index" value={p.aliphatic_index} />
          <Field label="GRAVY" value={p.gravy} />
        </div>

        {/* 4: amino acid composition table */}
        <div className="border-t border-zinc-100 pt-4">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1.5">
            Amino acid composition
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-x-4 gap-y-1 text-xs">
            {aaRows.map(([code, e]) => (
              <div key={code} className="flex justify-between">
                <span className="text-zinc-500">{e.name} ({code})</span>
                <span className="font-medium">{e.count} · {e.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProteinPropertiesResults({ jobId }: { jobId: string }) {
  const { data, error } = useSWR(jobId, fetcher, {
    refreshInterval: (d) => (d?.status === "SUCCESS" || d?.status === "FAILURE" ? 0 : 1500),
  });
  const isSuccess = data?.status === "SUCCESS";
  const { data: files } = useSWR(isSuccess ? [jobId, "files"] : null, () => filesFetcher(jobId));

  if (error) return <div className="text-red-600">Error fetching status</div>;
  if (!data) return <div className="flex items-center gap-2 text-zinc-500">
    <Loader2 className="h-4 w-4 animate-spin" />Loading job…</div>;

  const results: Record<string, Properties> | undefined = data.result?.results;

  return (
    <div className="card mt-4 space-y-4">
      <div className="flex items-center gap-2">
        {data.status === "SUCCESS" && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
        {data.status === "FAILURE" && <XCircle className="h-5 w-5 text-red-600" />}
        {(data.status === "PENDING" || data.status === "STARTED") && <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />}
        <span className="font-medium">Status: {data.status}</span>
        <span className="text-zinc-500 text-sm">·</span>
        <span className="text-sm text-zinc-500 font-mono">{jobId}</span>
      </div>

      <div className="w-full bg-zinc-100 rounded-full h-2">
        <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${data.progress}%` }} />
      </div>

      {data.error && <div className="text-red-600 text-sm">{data.error}</div>}

      {data.result?.source && (
        <p className="text-xs text-zinc-500">{data.result.source}</p>
      )}

      {results && (
        <div className="space-y-4">
          {Object.entries(results).map(([seqId, p]) => (
            <PropertyCard key={seqId} seqId={seqId} p={p} />
          ))}
        </div>
      )}

      {data.result?.errors?.length > 0 && (
        <div className="text-amber-700 text-xs space-y-0.5">
          {data.result.errors.map((e: string, i: number) => <div key={i}>{e}</div>)}
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
                  <span className="text-zinc-400 text-xs">({(f.size / 1024).toFixed(1)} KB)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
