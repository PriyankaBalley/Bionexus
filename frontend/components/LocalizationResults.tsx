"use client";
import useSWR from "swr";
import { getJobStatus, listJobFiles } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, FileDown } from "lucide-react";

interface TargetPCall {
  prediction: string;
  likelihoods: Record<string, number>;
  cleavage_site: string | null;
}
interface WolfPSORTCall { prediction: string; score: number }
interface Result { targetp: TargetPCall | null; wolfpsort: WolfPSORTCall | null }

const fetcher = (jobId: string) => getJobStatus(jobId);
const filesFetcher = (jobId: string) => listJobFiles(jobId);

const PREDICTION_COLOR: Record<string, string> = {
  "Chloroplast transfer peptide": "bg-emerald-100 text-emerald-800",
  "Mitochondrial transfer peptide": "bg-orange-100 text-orange-800",
  "Signal peptide": "bg-rose-100 text-rose-800",
  "Thylakoid luminal transfer peptide": "bg-teal-100 text-teal-800",
  "Other": "bg-zinc-100 text-zinc-700",
};

export default function LocalizationResults({ jobId }: { jobId: string }) {
  const { data, error } = useSWR(jobId, fetcher, {
    refreshInterval: (d) => (d?.status === "SUCCESS" || d?.status === "FAILURE" ? 0 : 3000),
  });
  const isSuccess = data?.status === "SUCCESS";
  const { data: files } = useSWR(isSuccess ? [jobId, "files"] : null, () => filesFetcher(jobId));

  if (error) return <div className="text-red-600">Error fetching status</div>;
  if (!data) return <div className="flex items-center gap-2 text-zinc-500">
    <Loader2 className="h-4 w-4 animate-spin" />Loading job…</div>;

  const results: Record<string, Result> | undefined = data.result?.results;

  return (
    <div className="card mt-4 space-y-4">
      <div className="flex items-center gap-2">
        {data.status === "SUCCESS" && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
        {data.status === "FAILURE" && <XCircle className="h-5 w-5 text-red-600" />}
        {(data.status === "PENDING" || data.status === "STARTED") && <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />}
        <span className="font-medium">Status: {data.status}</span>
        {data.result?.stage && <span className="text-xs text-zinc-500">({data.result.stage})</span>}
        <span className="text-zinc-500 text-sm">·</span>
        <span className="text-sm text-zinc-500 font-mono">{jobId}</span>
      </div>

      <div className="w-full bg-zinc-100 rounded-full h-2">
        <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${data.progress}%` }} />
      </div>

      {(data.status === "PENDING" || data.status === "STARTED") && (
        <p className="text-xs text-amber-600">
          Querying live DTU TargetP-2.0 and WoLF PSORT — this can take a
          minute or more depending on their queues.
        </p>
      )}

      {data.error && <div className="text-red-600 text-sm">{data.error}</div>}
      {data.result?.method && <p className="text-xs text-zinc-500">{data.result.method}</p>}

      {results && Object.entries(results).map(([seqId, r]) => (
        <div key={seqId} className="border-t border-zinc-200 pt-4">
          <h3 className="font-semibold text-sm mb-3">{seqId}</h3>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-zinc-200 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1.5">
                TargetP-2.0
              </div>
              {r.targetp ? (
                <>
                  <span className={`badge ${PREDICTION_COLOR[r.targetp.prediction] || "bg-zinc-100 text-zinc-700"}`}>
                    {r.targetp.prediction}
                  </span>
                  <div className="mt-2 space-y-0.5 text-xs">
                    {Object.entries(r.targetp.likelihoods).map(([cls, p]) => (
                      <div key={cls} className="flex justify-between text-zinc-500">
                        <span>{cls}</span><span className="font-mono">{(p * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                  {r.targetp.cleavage_site && (
                    <p className="mt-2 text-xs text-zinc-500">{r.targetp.cleavage_site}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-zinc-400">Unavailable for this sequence</p>
              )}
            </div>

            <div className="border border-zinc-200 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1.5">
                WoLF PSORT (cross-check)
              </div>
              {r.wolfpsort ? (
                <>
                  <span className={`badge ${PREDICTION_COLOR[r.wolfpsort.prediction] || "bg-zinc-100 text-zinc-700"}`}>
                    {r.wolfpsort.prediction}
                  </span>
                  <p className="mt-2 text-xs text-zinc-500">Score: {r.wolfpsort.score}</p>
                </>
              ) : (
                <p className="text-xs text-zinc-400">Unavailable for this sequence</p>
              )}
            </div>
          </div>
        </div>
      ))}

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
