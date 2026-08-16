"use client";
import useSWR from "swr";
import { getJobStatus, listJobFiles, downloadUrl } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, FileDown, ImageIcon } from "lucide-react";

interface Residue { position: number; residue: string; state: "H" | "E" | "T" | "C" | "-" }
interface Prediction {
  length: number;
  per_residue: Residue[];
  counts: Record<string, number>;
  percent: Record<string, number>;
}

const STATE_COLOR: Record<string, string> = {
  H: "bg-rose-200 text-rose-900",
  E: "bg-amber-200 text-amber-900",
  T: "bg-sky-200 text-sky-900",
  C: "bg-zinc-100 text-zinc-500",
  "-": "bg-zinc-50 text-zinc-300",
};
const STATE_LABEL: Record<string, string> = {
  H: "Helix", E: "Sheet", T: "Turn", C: "Coil", "-": "Unscored",
};

const fetcher = (jobId: string) => getJobStatus(jobId);
const filesFetcher = (jobId: string) => listJobFiles(jobId);

function Track({ pred }: { pred: Prediction }) {
  const rows: Residue[][] = [];
  for (let i = 0; i < pred.per_residue.length; i += 60) {
    rows.push(pred.per_residue.slice(i, i + 60));
  }
  return (
    <div className="space-y-1 font-mono text-[11px] leading-4">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap">
          {row.map(r => (
            <span key={r.position} title={`${r.position}: ${r.residue} — ${STATE_LABEL[r.state]}`}
                  className={`inline-block w-[14px] text-center ${STATE_COLOR[r.state]}`}>
              {r.residue}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function SecondaryStructureResults({ jobId }: { jobId: string }) {
  const { data, error } = useSWR(jobId, fetcher, {
    refreshInterval: (d) => (d?.status === "SUCCESS" || d?.status === "FAILURE" ? 0 : 1500),
  });
  const isSuccess = data?.status === "SUCCESS";
  const { data: files } = useSWR(isSuccess ? [jobId, "files"] : null, () => filesFetcher(jobId));

  if (error) return <div className="text-red-600">Error fetching status</div>;
  if (!data) return <div className="flex items-center gap-2 text-zinc-500">
    <Loader2 className="h-4 w-4 animate-spin" />Loading job…</div>;

  const results: Record<string, Prediction> | undefined = data.result?.results;

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

      {data.result?.method && (
        <p className="text-xs text-zinc-500">{data.result.method}</p>
      )}

      {results && Object.entries(results).map(([seqId, pred]) => {
        const pngUrl = downloadUrl(jobId, `viz/${seqId}_gor1.png`);
        const svgUrl = downloadUrl(jobId, `viz/${seqId}_gor1.svg`);
        const pdfUrl = downloadUrl(jobId, `viz/${seqId}_gor1.pdf`);
        return (
          <div key={seqId} className="border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">{seqId}</h3>
              <div className="flex gap-3 text-xs text-zinc-500">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-200 mr-1 align-middle" />Helix {pred.percent.H}%</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-200 mr-1 align-middle" />Sheet {pred.percent.E}%</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-200 mr-1 align-middle" />Turn {pred.percent.T}%</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-100 mr-1 align-middle" />Coil {pred.percent.C}%</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Track pred={pred} />
            </div>

            <div className="mt-4 border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
              <img src={pngUrl} alt={`GOR I secondary structure: ${seqId}`}
                   className="w-full" loading="lazy" />
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
