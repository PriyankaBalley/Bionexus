"use client";
import { useState, useRef } from "react";
import { submitORFPrediction, fetchJson } from "@/lib/api";
import ORFResults from "@/components/ORFResults";
import { Loader2, Upload } from "lucide-react";

const PLACEHOLDER =
  ">gene_1\nATGGAGGATCAAGTTGGGTTTGGGTTCCGTCCGAACGACGAGGAGCTCGTT...\n\n"
  + "or a CSV with an \"id\" and \"sequence\" column, or one sequence per line.";

export default function ORFPredictionPage() {
  const [inputText, setInputText] = useState("");
  const [minAa, setMinAa] = useState(25);
  const [requireAtg, setRequireAtg] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadExample() {
    setError(null); setLoadingExample(true);
    try {
      const res = await fetchJson("/api/orf/example");
      setInputText(res.input_text);
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setLoadingExample(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setInputText(String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!inputText.trim()) { setError("Provide at least one nucleotide sequence"); return; }
    setSubmitting(true);
    try {
      const res = await submitORFPrediction({
        input_text: inputText.trim(), min_aa: minAa, require_atg: requireAtg,
      });
      setJobId(res.job_id);
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">ORF Prediction</h1>
      <p className="text-zinc-600 mb-4">
        Scans all 6 reading frames for open reading frames, following the same
        convention as NCBI ORFfinder / EMBOSS getorf, with a publication-quality
        ORF map.
      </p>

      <form className="card space-y-4 max-w-3xl" onSubmit={onSubmit}>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Sequence(s)</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={loadExample} disabled={loadingExample}
                      className="text-xs font-medium text-brand-600 hover:underline">
                {loadingExample ? "Loading…" : "Load example"}
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}
                      className="text-xs font-medium text-brand-600 hover:underline
                                 inline-flex items-center gap-1">
                <Upload className="h-3 w-3" />Upload file
              </button>
              <input ref={fileRef} type="file" accept=".fasta,.fa,.csv,.tsv,.txt"
                     className="hidden" onChange={onFile} />
            </div>
          </div>
          <textarea className="input font-mono text-xs h-40" value={inputText}
                    onChange={e => setInputText(e.target.value)} placeholder={PLACEHOLDER} />
          <p className="text-xs text-zinc-500 mt-1">
            Nucleotide sequence(s) — FASTA (single or multi-record), a CSV/TSV
            with a sequence column, or one plain sequence per line.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Minimum ORF length (aa): {minAa}</label>
            <input type="range" min={10} max={200} step={5} value={minAa}
                   onChange={e => setMinAa(parseInt(e.target.value))} className="w-full" />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" id="atg" checked={requireAtg}
                   onChange={e => setRequireAtg(e.target.checked)} />
            <label htmlFor="atg" className="text-sm text-zinc-700">Require ATG start codon</label>
          </div>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}Find ORFs
        </button>
      </form>

      {jobId ? <ORFResults jobId={jobId} />
             : <div className="card mt-4 text-zinc-500 text-sm">Submit sequences to see results here.</div>}
    </div>
  );
}
