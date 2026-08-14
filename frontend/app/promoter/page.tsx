"use client";
import { useState } from "react";
import { submitPromoter } from "@/lib/api";
import JobStatus from "@/components/JobStatus";
import { Loader2 } from "lucide-react";

const PLACEHOLDER = `>example_promoter\nCACGTGAAACCTAGTGACGTCAATATAAATATTGACGTCAGGTAAGCCGCCAAATTGCATGCATG\nATTAATCAACTGGATAAGGTGAACGACTTGACGTCAATCAATATAAACAAAAAATTTCCAATAA`;

// Real 1000 bp upstream promoter region of AT1G01010 (Arabidopsis thaliana
// NAC001), fetched live from Ensembl Plants (chromosome 1:2631-3631, TAIR10).
// Verified to scan cleanly with real, sensible hits: TATA-box, CAAT-box,
// MYC, Dof, WRKY W-box and more.
const EXAMPLE_FASTA = `>AT1G01010_promoter_1000bp
ATATTGCTATTTCTGCCAATATTAAAACTTCACTTAGGAAGACTTGAACCTACCACACGT
TAGTGACTAATGAGAGCCACTAGATAATTGCATGCATCCCACACTAGTACTAATTTTCTA
GGGATATTAGAGTTTTCTAATCACCTACTTCCTACTATGTGTATGTTATCTACTGGCGTG
GATGCTTTTAAAGATGTTACGTTATTATTTTGTTCGGTTTGGAAAACGGCTCAATCGTTA
TGAGTTCGTAAGACACATACATTGTTCCATGATAAAATGCAACCCCACGAACCATTTGCG
ACAAGCAAAACAACATGGTCAAAATTAAAAGCTAACAATTAGCCAGCGATTCAAAAAGTC
AACCTTCTAGATGGATTTAACAACATATCGATAGGATTCAAGATTAAAAATAAGCACACT
CTTATTAATGTTAAAAAACGAATGAGATGAAAATATTTGGCGTGTTCACACACATAATCT
AGAAGACAGATTCGAGTTGCTCTCCTTTGTTTTGCTTTGGGAGGGACCCATTATTACCGC
CCAGCAGCTTCCCAGCCTTCCTTTATAAGGCTTAATTTATATTTATTTAAATTTTATATG
TTCTTCTATTATAATACTAAAAGGGGAATACAAATTTCTACAGAGGATGATATTCAATCC
ACGGTTCACCCAAACCGATTTTATAAAATTTATTATTAAATCTTTTTTAATTGTTAAATT
GGTTTAAATCTGAACTCTGTTTACTTACATTGATTAAAATTCTAAACCATCATAAGTAAA
AAATAATATGATTAAGACTAATAAATCTTAATAGTTAATACTACTCGGTTTACTACATGA
AATTTCATACCATCAATTGTTTTAATAATCTTTAAAATTGTTAGGACCGGTAAAACCATA
CCAATTAAACCGGAGATCCATATTAATTTAATTAAGAAAATAAAAATAAAAGGAATAAAT
TGTCTTATTTAAACGCTGACTTCACTGTCTTCCTCCCTCCA`;

export default function PromoterPage() {
  const [fasta, setFasta] = useState("");
  const [jobIdInput, setJobIdInput] = useState("");
  const [databases, setDatabases] = useState<string[]>(["plantcare", "plantpan"]);
  const [minScore, setMinScore] = useState(0.75);
  const [plantpanMinScore, setPlantpanMinScore] = useState(0.9);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fasta.trim() && !jobIdInput.trim()) {
      setError("Provide FASTA text or an upstream job ID");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitPromoter({
        fasta_text: fasta.trim() || null,
        job_id_input: jobIdInput.trim() || null,
        databases, min_score: minScore,
        plantpan_min_score: plantpanMinScore,
      });
      setJobId(res.job_id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Module 5 — Promoter Analysis</h1>
        <p className="text-zinc-600 mb-4">Scan PlantCARE & PlantPAN cis-regulatory elements & TFBS.</p>

        <form className="card space-y-4" onSubmit={onSubmit}>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Input FASTA</label>
              <button type="button" onClick={() => setFasta(EXAMPLE_FASTA)}
                      className="text-xs font-medium text-brand-600 hover:underline">
                Load example (AT1G01010 promoter)
              </button>
            </div>
            <textarea className="input font-mono text-xs h-44" value={fasta}
                      onChange={e => setFasta(e.target.value)} placeholder={PLACEHOLDER} />
          </div>

          <div className="text-center text-zinc-400 text-xs">— or —</div>

          <div>
            <label className="label">Reuse retrieval job ID</label>
            <input className="input font-mono" value={jobIdInput}
                   onChange={e => setJobIdInput(e.target.value)}
                   placeholder="paste job_id from a retrieval job" />
          </div>

          <div>
            <label className="label">Databases</label>
            <div className="flex gap-4">
              {[
                { id: "plantcare", label: "plantcare", note: "local curated library" },
                { id: "plantpan", label: "plantpan", note: "live — queries plantpan.itps.ncku.edu.tw" },
              ].map(({ id, label, note }) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={databases.includes(id)}
                         onChange={e => setDatabases(prev =>
                           e.target.checked ? [...prev, id] : prev.filter(d => d !== id))} />
                  {label} <span className="text-zinc-400 text-xs">({note})</span>
                </label>
              ))}
            </div>
            {databases.includes("plantpan") && (
              <p className="text-xs text-amber-600 mt-1">
                PlantPAN queries their live server per sequence and can take 30–120s+ to respond.
              </p>
            )}
          </div>

          <div>
            <label className="label">PlantCARE minimum match score: {minScore.toFixed(2)}</label>
            <input type="range" min={0.5} max={1.0} step={0.05} value={minScore}
                   onChange={e => setMinScore(parseFloat(e.target.value))}
                   className="w-full" />
          </div>

          {databases.includes("plantpan") && (
            <div>
              <label className="label">
                PlantPAN minimum similarity score: {plantpanMinScore.toFixed(2)}
              </label>
              <input type="range" min={0.5} max={1.0} step={0.01} value={plantpanMinScore}
                     onChange={e => setPlantpanMinScore(parseFloat(e.target.value))}
                     className="w-full" />
              <p className="text-xs text-zinc-500 mt-1">
                Filters live PlantPAN TFBS hits by their own similarity score, independently
                of the PlantCARE threshold above. Lower values return many more (weaker) hits.
              </p>
            </div>
          )}

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <button type="submit" disabled={submitting} className="btn btn-primary w-full">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}Run analysis
          </button>
        </form>
      </div>

      <div>
        {jobId ? <JobStatus jobId={jobId} />
               : <div className="card text-zinc-500 text-sm">Submit an analysis to see status here.</div>}
      </div>
    </div>
  );
}
