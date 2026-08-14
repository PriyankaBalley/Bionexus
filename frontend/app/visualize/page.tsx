"use client";
import { useState } from "react";
import { listJobFiles } from "@/lib/api";
import { Image as ImageIcon, Loader2, FileDown } from "lucide-react";

interface JobFile { name: string; size: number; url: string }
interface SeqMaps { seqId: string; html?: JobFile; png?: JobFile; others: JobFile[] }

const MAP_FILE_RE = /^viz\/(.+)_map\.(html|png|svg|pdf)$/;

// Groups viz/ files by sequence id so every sequence in a multi-sequence
// promoter analysis gets its own map shown, not just whichever file happened
// to be first in the list (the previous version only ever showed one).
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

export default function VisualizePage() {
  const [jobId, setJobId] = useState("");
  const [seqMaps, setSeqMaps] = useState<SeqMaps[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null); setLoading(true);
    try {
      const res = await listJobFiles(jobId.trim());
      setSeqMaps(groupBySequence(res.files.filter(f => f.name.startsWith("viz/"))));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Module 6 — Visualization</h1>
        <p className="text-zinc-600">
          Publication-quality cis-element maps. Provide a promoter analysis job ID.
        </p>
      </div>

      <div className="card flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1 w-full">
          <label className="label">Promoter analysis job ID</label>
          <input className="input font-mono" value={jobId} onChange={e => setJobId(e.target.value)} />
        </div>
        <button onClick={load} disabled={loading || !jobId.trim()} className="btn btn-primary">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}Load
        </button>
      </div>

      {error && <div className="text-red-600">{error}</div>}

      {seqMaps.length > 1 && (
        <p className="text-sm text-zinc-500">
          {seqMaps.length} sequences in this job — showing a map for each below.
        </p>
      )}

      {seqMaps.map(({ seqId, html, png, others }) => (
        <div key={seqId} className="space-y-3">
          <h2 className="font-semibold text-lg">{seqId}</h2>

          {html && (
            <div className="card">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />Interactive map
              </h3>
              <iframe src={html.url} className="w-full h-[520px] border border-zinc-200 rounded"
                      title={`Cis-element map: ${seqId}`} />
            </div>
          )}

          {png && (
            <div className="card">
              <h3 className="font-semibold mb-3">Static map (PNG)</h3>
              <img src={png.url} alt={`cis-element map: ${seqId}`} className="w-full" />
            </div>
          )}

          {others.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-3">Other files</h3>
              <ul className="space-y-1">
                {others.map(f => (
                  <li key={f.name}>
                    <a href={f.url} target="_blank"
                       className="inline-flex items-center gap-1.5 text-brand-700 hover:underline text-sm">
                      <FileDown className="h-3.5 w-3.5" />{f.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
