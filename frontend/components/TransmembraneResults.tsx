"use client";
import useSWR from "swr";
import { getJobStatus, listJobFiles, downloadUrl } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, FileDown, ImageIcon } from "lucide-react";

interface Row { sequence_id: string; length: number; tm_count: number; has_signal_peptide: boolean; prediction_string: string }

const fetcher = (jobId: string) => getJobStatus(jobId);
const filesFetcher = (jobId: string) => listJobFiles(jobId);

export default function TransmembraneResults({ jobId }: { jobId: string }) {
  const { data, error } = useSWR(jobId, fetcher, {
    refreshInterval: (d) => (d?.status === "SUCCESS" || d?.status === "FAILURE" ? 0 : 3000),
  });
  const isSuccess = data?.status === "SUCCESS";
  const { data: files } = useSWR(isSuccess ? [jobId, "files"] : null, () => filesFetcher(jobId));

  if (error) return <div className="text-red-600">Error fetching status</div>;
  if (!data) return <div className="flex items-center gap-2 text-zinc-500">
    <Loader2 className="h-4 w-4 animate-spin" />Loading job…</div>;

  const rows: Row[] | undefined = data.result?.sequences;

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

      {(data.status === "PENDING" || data.status === "STARTED") && (
        <p className="text-xs text-amber-600">
          Querying live EBI Phobius — this can take a while depending on EBI's queue.
        </p>
      )}

      {data.error && <div className="text-red-600 text-sm">{data.error}</div>}
      {data.result?.method && <p className="text-xs text-zinc-500">{data.result.method}</p>}

      {rows && rows.map(row => {
        const pngUrl = downloadUrl(jobId, `viz/${row.sequence_id}_topology.png`);
        const svgUrl = downloadUrl(jobId, `viz/${row.sequence_id}_topology.svg`);
        const pdfUrl = downloadUrl(jobId, `viz/${row.sequence_id}_topology.pdf`);
        return (
          <div key={row.sequence_id} className="border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">{row.sequence_id}</h3>
              <div className="flex gap-4 text-xs text-zinc-500">
                <span>{row.tm_count} TM helix/helices</span>
                <span>Signal peptide: {row.has_signal_peptide ? "yes" : "no"}</span>
              </div>
            </div>
            <div className="border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
              <img src={pngUrl} alt={`Topology: ${row.sequence_id}`} className="w-full" loading="lazy" />
              <div className="flex items-center gap-4 px-3 py-2 bg-white border-t border-zinc-200">
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                  <ImageIcon className="h-3.5 w-3.5" />Publication-quality figure
                </span>
                <a href={pngUrl} download className="text-xs font-medium text-brand-700 hover:underline">PNG</a>
                <a href={svgUrl} download className="text-xs font-medium text-brand-700 hover:underline">SVG</a>
                <a href={pdfUrl} download className="text-xs font-medium text-brand-700 hover:underline">PDF</a>
              </div>
            </div>
          </div>
        );
      })}

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
