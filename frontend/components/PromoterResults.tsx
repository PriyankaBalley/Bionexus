"use client";
import { useState } from "react";
import useSWR from "swr";
import { getJobStatus, listJobFiles } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, FileDown, Image as ImageIcon } from "lucide-react";

interface JobFile { name: string; size: number; url: string }
interface SeqMaps { seqId: string; html?: JobFile; png?: JobFile; others: JobFile[] }

const MAP_FILE_RE = /^viz\/(.+)_map\.(html|png|svg|pdf)$/;

// Groups viz/ files by sequence id so every sequence in a multi-sequence
// promoter analysis gets its own map shown, not just whichever file
// happened to be first in the list.
function groupBySequence(files: JobFile[]): SeqMaps[] {
  const bySeq = new Map<string, SeqMaps>();
  for (const f of files) {
    const m = f.name.match(MAP_FILE_RE);
    if (!m) continue;
    const [, seqId, ext] = m;
    if (!bySeq.has(seqId)) bySeq.set(seqId, { seqId, others: [] });
    const entry = bySeq.get(seqId)!;
    if (ext === "html") entry.html = f;
    else if (ext === "png") entry.png = f;
    else entry.others.push(f);
  }
  return [...bySeq.values()];
}

const fetcher = (jobId: string) => getJobStatus(jobId);
const filesFetcher = (jobId: string) => listJobFiles(jobId);

export default function PromoterResults({ jobId }: { jobId: string }) {
  const [showRaw, setShowRaw] = useState(false);
  const { data, error } = useSWR(jobId, fetcher, {
    refreshInterval: (d) => (d?.status === "SUCCESS" || d?.status === "FAILURE" ? 0 : 1500),
  });
  const isSuccess = data?.status === "SUCCESS";
  const { data: files } = useSWR(isSuccess ? [jobId, "files"] : null, () => filesFetcher(jobId));

  if (error) return <div className="text-red-600">Error fetching status</div>;
  if (!data) return <div className="flex items-center gap-2 text-zinc-500">
    <Loader2 className="h-4 w-4 animate-spin" />Loading job…</div>;

  const seqMaps = files ? groupBySequence(files.files.filter(f => f.name.startsWith("viz/"))) : [];

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

      {isSuccess && data.result?.total_hits !== undefined && (
        <p className="text-sm text-zinc-700">
          <b>{data.result.total_hits}</b> total cis-element hits across{" "}
          <b>{data.result.sequences?.length ?? 0}</b> sequence(s).
        </p>
      )}

      {seqMaps.length > 1 && (
        <p className="text-sm text-zinc-500">
          {seqMaps.length} sequences in this job — showing a map for each below.
        </p>
      )}

      {seqMaps.map(({ seqId, html, png, others }) => (
        <div key={seqId} className="border-t border-zinc-200 pt-4 space-y-3">
          <h3 className="font-semibold text-sm">{seqId}</h3>

          {html && (
            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-50 border-b border-zinc-200 text-xs text-zinc-500">
                <ImageIcon className="h-3.5 w-3.5" />Interactive map
              </div>
              <iframe src={html.url} className="w-full h-[420px]" title={`Cis-element map: ${seqId}`} />
            </div>
          )}

          {png && (
            <div className="border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
              <img src={png.url} alt={`Cis-element map: ${seqId}`} className="w-full" loading="lazy" />
            </div>
          )}

          {others.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {others.map(f => (
                <a key={f.name} href={f.url} target="_blank"
                   className="inline-flex items-center gap-1.5 text-brand-700 hover:underline text-xs">
                  <FileDown className="h-3.5 w-3.5" />{f.name}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}

      {isSuccess && data.result && (
        <div>
          <button onClick={() => setShowRaw(s => !s)}
                  className="text-xs font-medium text-brand-700 hover:underline">
            {showRaw ? "Hide" : "Show"} raw result
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-96 overflow-auto bg-zinc-50 border border-zinc-200 rounded p-3 text-xs">
              {JSON.stringify(data.result, null, 2)}
            </pre>
          )}
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
