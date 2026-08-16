"use client";
import { useState } from "react";
import useSWR from "swr";
import { getJobStatus, listJobFiles, downloadUrl } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, FileDown, ImageIcon } from "lucide-react";

const fetcher = (jobId: string) => getJobStatus(jobId);
const filesFetcher = (jobId: string) => listJobFiles(jobId);

export default function PhylogenyResults({ jobId }: { jobId: string }) {
  const [showNewick, setShowNewick] = useState(false);
  const { data, error } = useSWR(jobId, fetcher, {
    refreshInterval: (d) => (d?.status === "SUCCESS" || d?.status === "FAILURE" ? 0 : 3000),
  });
  const isSuccess = data?.status === "SUCCESS";
  const { data: files } = useSWR(isSuccess ? [jobId, "files"] : null, () => filesFetcher(jobId));

  if (error) return <div className="text-red-600">Error fetching status</div>;
  if (!data) return <div className="flex items-center gap-2 text-zinc-500">
    <Loader2 className="h-4 w-4 animate-spin" />Loading job…</div>;

  const pngUrl = downloadUrl(jobId, "viz/Phylogenetic_tree.png");
  const svgUrl = downloadUrl(jobId, "viz/Phylogenetic_tree.svg");
  const pdfUrl = downloadUrl(jobId, "viz/Phylogenetic_tree.pdf");

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
          Querying live EBI Clustal Omega + Simple Phylogeny — this can take several
          minutes depending on EBI's queue.
        </p>
      )}

      {data.error && <div className="text-red-600 text-sm">{data.error}</div>}
      {data.result?.method && <p className="text-xs text-zinc-500">{data.result.method}</p>}

      {isSuccess && data.result?.n_leaves && (
        <>
          <p className="text-sm text-zinc-700">
            Tree built from <b>{data.result.n_leaves}</b> sequences:{" "}
            {data.result.leaf_names?.join(", ")}
          </p>

          <div className="border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
            <img src={pngUrl} alt="Phylogenetic tree" className="w-full" loading="lazy" />
            <div className="flex items-center gap-4 px-3 py-2 bg-white border-t border-zinc-200">
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                <ImageIcon className="h-3.5 w-3.5" />Publication-quality figure
              </span>
              <a href={pngUrl} download className="text-xs font-medium text-brand-700 hover:underline">PNG</a>
              <a href={svgUrl} download className="text-xs font-medium text-brand-700 hover:underline">SVG</a>
              <a href={pdfUrl} download className="text-xs font-medium text-brand-700 hover:underline">PDF</a>
            </div>
          </div>

          <div>
            <button onClick={() => setShowNewick(s => !s)}
                    className="text-xs font-medium text-brand-700 hover:underline">
              {showNewick ? "Hide" : "Show"} Newick tree text
            </button>
            {showNewick && (
              <pre className="mt-2 bg-zinc-50 border border-zinc-200 rounded p-3 text-xs overflow-x-auto">
                {data.result.newick}
              </pre>
            )}
          </div>
        </>
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
