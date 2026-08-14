"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  submitRetrieval, getJobStatus, listJobFiles, fetchFileText,
} from "@/lib/api";
import {
  Loader2, Search, Copy, Download, Trash2, CheckCircle2, XCircle,
} from "lucide-react";

type FormState = {
  source: "ncbi" | "ensembl_plants" | "sgn" | "gramene";
  query: string;
  species: string;
  upstream_bp: number;
  downstream_bp: number;
  region: "promoter" | "gene" | "cds" | "custom";
};

const DEFAULT_FORM: FormState = {
  source: "ensembl_plants",
  query: "AT1G01010",
  species: "arabidopsis_thaliana",
  upstream_bp: 2000,
  downstream_bp: 0,
  region: "promoter",
};

const SOURCE_LABEL: Record<FormState["source"], string> = {
  ncbi: "NCBI",
  ensembl_plants: "Ensembl Plants",
  sgn: "Sol Genomics Network",
  gramene: "Gramene",
};

const SPECIES_OPTIONS = [
  { value: "arabidopsis_thaliana", label: "Arabidopsis thaliana" },
  { value: "oryza_sativa", label: "Oryza sativa (rice)" },
  { value: "zea_mays", label: "Zea mays (maize)" },
  { value: "glycine_max", label: "Glycine max (soybean)" },
  { value: "solanum_lycopersicum", label: "Solanum lycopersicum (tomato)" },
  { value: "triticum_aestivum", label: "Triticum aestivum (wheat)" },
];

const BP_OPTIONS = [0, 500, 1000, 1500, 2000, 3000, 5000];

const EXAMPLES: { label: string; source: string; gene: string; badge: string; accent: string; form: FormState }[] = [
  {
    label: "Arabidopsis Promoter", source: "Ensembl Plants", gene: "AT1G01010",
    badge: "Promoter 2000 bp", accent: "border-orange-400",
    form: { source: "ensembl_plants", species: "arabidopsis_thaliana", query: "AT1G01010", region: "promoter", upstream_bp: 2000, downstream_bp: 0 },
  },
  {
    label: "Rice Gene", source: "Ensembl Plants", gene: "Os01g0100100",
    badge: "Gene Sequence", accent: "border-violet-500",
    form: { source: "ensembl_plants", species: "oryza_sativa", query: "Os01g0100100", region: "gene", upstream_bp: 0, downstream_bp: 0 },
  },
  {
    label: "Rice CDS", source: "Ensembl Plants", gene: "Os01g0100100",
    badge: "CDS Sequence", accent: "border-violet-500",
    form: { source: "ensembl_plants", species: "oryza_sativa", query: "Os01g0100100", region: "cds", upstream_bp: 0, downstream_bp: 0 },
  },
  {
    label: "NCBI Accession", source: "NCBI Nuccore", gene: "NC_003070.9",
    badge: "NCBI", accent: "border-violet-500",
    form: { source: "ncbi", species: "", query: "NC_003070.9", region: "custom", upstream_bp: 0, downstream_bp: 0 },
  },
  {
    label: "Gramene Rice Gene", source: "Gramene", gene: "Os01g0100100",
    badge: "Gramene", accent: "border-emerald-500",
    form: { source: "gramene", species: "", query: "Os01g0100100", region: "gene", upstream_bp: 0, downstream_bp: 0 },
  },
  {
    label: "Gramene Wheat Gene", source: "Gramene", gene: "TraesCS3B02G102400",
    badge: "Gramene", accent: "border-emerald-500",
    form: { source: "gramene", species: "", query: "TraesCS3B02G102400", region: "promoter", upstream_bp: 500, downstream_bp: 0 },
  },
  {
    label: "Tomato Gene", source: "Sol Genomics Network", gene: "Solyc01g005000",
    badge: "SGN", accent: "border-sky-500",
    form: { source: "sgn", species: "", query: "Solyc01g005000", region: "gene", upstream_bp: 0, downstream_bp: 0 },
  },
];

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { text: string; dot: string; bg: string }> = {
    IDLE: { text: "Waiting", dot: "bg-zinc-400", bg: "bg-zinc-100 text-zinc-700" },
    PENDING: { text: "Waiting", dot: "bg-zinc-400", bg: "bg-zinc-100 text-zinc-700" },
    STARTED: { text: "Running", dot: "bg-blue-500", bg: "bg-blue-50 text-blue-700" },
    SUCCESS: { text: "Completed", dot: "bg-emerald-500", bg: "bg-emerald-50 text-emerald-700" },
    FAILURE: { text: "Failed", dot: "bg-red-500", bg: "bg-red-50 text-red-700" },
  };
  const s = map[status] || map.IDLE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.text}
    </span>
  );
}

export default function RetrievePage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submittedSource, setSubmittedSource] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fastaText, setFastaText] = useState<string>("");
  const [fastaLoading, setFastaLoading] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const { data: job } = useSWR(jobId, () => getJobStatus(jobId!), {
    refreshInterval: (d) => (d?.status === "SUCCESS" || d?.status === "FAILURE" ? 0 : 1500),
  });

  const isSuccess = job?.status === "SUCCESS";
  const { data: files } = useSWR(isSuccess ? [jobId, "files"] : null, () => listJobFiles(jobId!));

  useEffect(() => {
    if (!isSuccess || !files) return;
    const fastaFile = files.files.find(f => f.name.endsWith(".fasta") || f.name.endsWith(".fa"));
    if (!fastaFile) return;
    setFastaLoading(true);
    fetchFileText(fastaFile.url)
      .then(setFastaText)
      .catch(() => setFastaText(""))
      .finally(() => setFastaLoading(false));
  }, [isSuccess, files]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    setFastaText("");
    try {
      const res = await submitRetrieval({
        ...form,
        species: form.source === "ensembl_plants" ? (form.species || undefined) : undefined,
      });
      setJobId(res.job_id);
      setSubmittedSource(SOURCE_LABEL[form.source]);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to submit retrieval job");
    } finally {
      setSubmitting(false);
    }
  }

  function applyExample(ex: typeof EXAMPLES[number]) {
    setForm(ex.form as FormState);
  }

  function onClear() {
    setFastaText("");
  }

  function onCopy() {
    if (fastaText) navigator.clipboard.writeText(fastaText);
  }

  function onDownload() {
    if (!fastaText) return;
    const blob = new Blob([fastaText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job?.result?.id || jobId || "sequence"}.fasta`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const status = job?.status || "IDLE";
  const progress = job?.progress ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Sequence Retrieval</h1>
      <p className="text-zinc-600 mb-6">Fetch genomic sequences from public databases.</p>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Examples */}
        <div className="lg:col-span-3 space-y-3">
          <p className="text-xs text-zinc-500">Use these examples first to confirm retrieval is working.</p>
          {EXAMPLES.map(ex => (
            <button
              key={ex.label}
              type="button"
              onClick={() => applyExample(ex)}
              className={`w-full text-left rounded-lg border border-zinc-200 border-l-4 ${ex.accent} bg-white p-4 shadow-sm hover:shadow-md transition-shadow`}
            >
              <p className="font-semibold text-sm">{ex.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{ex.source}</p>
              <p className="text-xs text-zinc-500 font-mono">Gene: {ex.gene}</p>
              <span className="badge bg-violet-100 text-violet-700 mt-2">{ex.badge}</span>
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="lg:col-span-5 space-y-4">
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 flex items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white text-xs font-bold">1</span>
              <h2 className="font-semibold">Source Database</h2>
            </div>
            <div>
              <label className="label">Select Source</label>
              <select className="input" value={form.source}
                      onChange={e => set("source", e.target.value as FormState["source"])}>
                <option value="ensembl_plants">Ensembl Plants</option>
                <option value="gramene">Gramene</option>
                <option value="ncbi">NCBI</option>
                <option value="sgn">Sol Genomics Network</option>
              </select>
            </div>
          </div>

          {form.source === "ensembl_plants" && (
            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 flex items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white text-xs font-bold">2</span>
                <h2 className="font-semibold">Species</h2>
              </div>
              <div>
                <label className="label">Select Species</label>
                <select className="input" value={form.species}
                        onChange={e => set("species", e.target.value)}>
                  {SPECIES_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 flex items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white text-xs font-bold">3</span>
              <h2 className="font-semibold">Query</h2>
            </div>
            <div>
              <label className="label">Gene ID / Accession ID / Gene Name</label>
              <input className="input font-mono" required value={form.query}
                     onChange={e => set("query", e.target.value)}
                     placeholder="e.g. AT1G01010, NM_001036960.2, Solyc01g005000" />
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 flex items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white text-xs font-bold">4</span>
              <h2 className="font-semibold">Region and Range</h2>
            </div>
            <div>
              <label className="label">Select Region</label>
              <select className="input" value={form.region}
                      onChange={e => set("region", e.target.value as FormState["region"])}>
                <option value="promoter">Promoter - Upstream Sequence</option>
                <option value="gene">Gene</option>
                <option value="cds">CDS</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Upstream bp</label>
                <select className="input" value={form.upstream_bp}
                        onChange={e => set("upstream_bp", Number(e.target.value))}>
                  {BP_OPTIONS.map(v => (
                    <option key={v} value={v}>{v === 0 ? "0 - Not required" : `${v} bp`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Downstream bp</label>
                <select className="input" value={form.downstream_bp}
                        onChange={e => set("downstream_bp", Number(e.target.value))}>
                  {BP_OPTIONS.map(v => (
                    <option key={v} value={v}>{v === 0 ? "0 - Not required" : `${v} bp`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <button type="submit" disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 transition-colors disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Retrieve Sequence
          </button>
        </form>

        {/* Status + result */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex justify-end">
            <StatusDot status={status} />
          </div>

          <div className="card space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {status === "SUCCESS" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {status === "FAILURE" && <XCircle className="h-4 w-4 text-red-600" />}
              <span className="font-semibold">Job ID:</span>
              <span className="font-mono text-zinc-600">{jobId || "Not submitted"}</span>
            </div>
            <div><span className="font-semibold">Status:</span>{" "}
              <span className="text-zinc-600">{jobId ? (status === "STARTED" || status === "PENDING" ? "Waiting..." : status) : "Waiting..."}</span>
            </div>
            <div><span className="font-semibold">Data Source:</span>{" "}
              <span className="text-zinc-600">{submittedSource || "Waiting..."}</span>
            </div>
            {job?.error && <div className="text-red-600 text-sm pt-1 border-t border-zinc-200">{job.error}</div>}
          </div>

          <div className="card space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Retrieval Progress</span>
              <span className="text-zinc-500">{progress}%</span>
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-2">
              <div className="h-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-all"
                   style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <span className="font-mono text-xs">{"</>"}</span> Retrieved FASTA Sequence
              </h3>
              <div className="flex gap-2">
                <button type="button" onClick={onCopy} disabled={!fastaText}
                        className="inline-flex items-center gap-1 rounded-md bg-sky-500 text-white text-xs font-medium px-2.5 py-1.5 disabled:opacity-50 hover:bg-sky-600">
                  <Copy className="h-3 w-3" />Copy
                </button>
                <button type="button" onClick={onDownload} disabled={!fastaText}
                        className="inline-flex items-center gap-1 rounded-md bg-violet-600 text-white text-xs font-medium px-2.5 py-1.5 disabled:opacity-50 hover:bg-violet-700">
                  <Download className="h-3 w-3" />Download
                </button>
                <button type="button" onClick={onClear} disabled={!fastaText}
                        className="inline-flex items-center gap-1 rounded-md bg-red-500 text-white text-xs font-medium px-2.5 py-1.5 disabled:opacity-50 hover:bg-red-600">
                  <Trash2 className="h-3 w-3" />Clear
                </button>
              </div>
            </div>
            <pre className="rounded-lg bg-zinc-900 text-zinc-100 font-mono text-xs p-4 min-h-[280px] max-h-[420px] overflow-auto whitespace-pre-wrap">
              {fastaLoading
                ? "Loading sequence…"
                : fastaText || "Retrieved FASTA sequence will appear here..."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
