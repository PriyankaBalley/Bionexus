"use client";
import { useState, useRef } from "react";
import { submitTransmembrane, fetchJson } from "@/lib/api";
import TransmembraneResults from "@/components/TransmembraneResults";
import { Loader2, Upload } from "lucide-react";

const PLACEHOLDER =
  ">protein_1\nMKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVK\n\n"
  + "or a CSV with an \"id\" and \"sequence\" column, or one sequence per line.";

export default function TransmembranePage() {
  const [inputText, setInputText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadExample() {
    setError(null); setLoadingExample(true);
    try {
      const res = await fetchJson("/api/transmembrane/example");
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
    if (!inputText.trim()) { setError("Provide at least one protein sequence"); return; }
    setSubmitting(true);
    try {
      const res = await submitTransmembrane({ input_text: inputText.trim() });
      setJobId(res.job_id);
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Transmembrane &amp; Signal Peptide Prediction</h1>
      <p className="text-zinc-600 mb-4">
        Live EBI Phobius (Käll, Krogh &amp; Sonnhammer, 2004) — combined
        transmembrane topology and signal peptide prediction, rendered as a
        publication-quality topology diagram.
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
            Accepts FASTA (single or multi-record), a CSV/TSV with a sequence column,
            or one plain sequence per line. Format is auto-detected.
          </p>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}Predict Topology
        </button>
      </form>

      <p className="text-xs text-zinc-400 mt-3 max-w-3xl">
        This queries live EBI Phobius and depends on their queue — jobs can
        take anywhere from under a minute to several minutes.
      </p>

      {jobId ? <TransmembraneResults jobId={jobId} />
             : <div className="card mt-4 text-zinc-500 text-sm">Submit sequences to see results here.</div>}
    </div>
  );
}
