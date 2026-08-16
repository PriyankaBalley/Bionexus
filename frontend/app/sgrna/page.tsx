"use client";
import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { submitSgrna, getJobStatus } from "@/lib/api";
import SgRNAResults from "@/components/SgRNAResults";
import GenomeTrack from "@/components/GenomeTrack";
import MultiplexPicker from "@/components/MultiplexPicker";
import StructureModal from "@/components/StructureModal";
import { SavedJobsList } from "@/components/SavedJobs";
import type { SgRNARow } from "@/components/SgRNAResults";
import { Loader2, Sliders, BarChart3, Image as ImageIcon, FolderOpen } from "lucide-react";

type Tab = "input" | "results" | "visualize";

// Real AT1G01010 (Arabidopsis thaliana NAC001) CDS, fetched live from
// Ensembl Plants - the same verified sequence used for ORF prediction's
// example and for real sgRNA jobs earlier in this project's testing.
const EXAMPLE_FASTA = `>AT1G01010_CDS
ATGGAGGATCAAGTTGGGTTTGGGTTCCGTCCGAACGACGAGGAGCTCGTTGGTCACTAT
CTCCGTAACAAAATCGAAGGAAACACTAGCCGCGACGTTGAAGTAGCCATCAGCGAGGTC
AACATCTGTAGCTACGATCCTTGGAACTTGCGCTTCCAGTCAAAGTACAAATCGAGAGAT
GCTATGTGGTACTTCTTCTCTCGTAGAGAAAACAACAAAGGGAATCGACAGAGCAGGACA
ACGGTTTCTGGTAAATGGAAGCTTACCGGAGAATCTGTTGAGGTCAAGGACCAGTGGGGA
TTTTGTAGTGAGGGCTTTCGTGGTAAGATTGGTCATAAAAGGGTTTTGGTGTTCCTCGAT
GGAAGATACCCTGACAAAACCAAATCTGATTGGGTTATCCACGAGTTCCACTACGACCTC
TTACCAGAACATCAGAGGACATATGTCATCTGCAGACTTGAGTACAAGGGTGATGATGCG
GACATTCTATCTGCTTATGCAATAGATCCCACTCCCGCTTTTGTCCCCAATATGACTAGT
AGTGCAGGTTCTGTGGTCAACCAATCACGTCAACGAAATTCAGGATCTTACAACACTTAC
TCTGAGTATGATTCAGCAAATCATGGCCAGCAGTTTAATGAAAACTCTAACATTATGCAG
CAGCAACCACTTCAAGGATCATTCAACCCTCTCCTTGAGTATGATTTTGCAAATCACGGC
GGTCAGTGGCTGAGTGACTATATCGACCTGCAACAGCAAGTTCCTTACTTGGCACCTTAT
GAAAATGAGTCGGAGATGATTTGGAAGCATGTGATTGAAGAAAATTTTGAGTTTTTGGTA
GATGAAAGGACATCTATGCAACAGCATTACAGTGATCACCGGCCCAAAAAACCTGTGTCT
GGGGTTTTGCCTGATGATAGCAGTGATACTGAAACTGGATCAATGATTTTCGAAGACACT
TCGAGCTCCACTGATAGTGTTGGTAGTTCAGATGAACCGGGCCATACTCGTATAGATGAT
ATTCCATCATTGAACATTATTGAGCCTTTGCACAATTATAAGGCACAAGAGCAACCAAAG
CAGCAGAGCAAAGAAAAGGTGATAAGTTCGCAGAAAAGCGAATGCGAGTGGAAAATGGCT
GAAGACTCGATCAAGATACCTCCATCCACCAACACGGTGAAGCAGAGCTGGATTGTTTTG
GAGAATGCACAGTGGAACTATCTCAAGAACATGATCATTGGTGTCTTGTTGTTCATCTCC
GTCATTAGTTGGATCATTCTTGTTGGTTAA`;

export default function SgrnaPage() {
  const [tab, setTab] = useState<Tab>("input");

  const [fasta, setFasta] = useState("");
  const [jobIdInput, setJobIdInput] = useState("");
  const [pam, setPam] = useState("NGG");
  const [guideLength, setGuideLength] = useState(20);
  const [maxMm, setMaxMm] = useState(3);
  const [topN, setTopN] = useState(20);
  const [genome, setGenome] = useState("");
  const [mode, setMode] = useState("knockout");
  const [region, setRegion] = useState<"all" | "exon" | "promoter" | "custom">("all");

  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fasta.trim() && !jobIdInput.trim()) {
      setError("Provide FASTA or upstream job id"); return;
    }
    setSubmitting(true);
    try {
      const res = await submitSgrna({
        fasta_text: fasta.trim() || null,
        job_id_input: jobIdInput.trim() || null,
        pam, guide_length: guideLength, max_mismatches: maxMm,
        genome: genome.trim() || null, top_n: topN, mode,
      });
      setJobId(res.job_id);
      setTab("results");
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">sgRNA Design</h1>
          <p className="text-zinc-600">
            Multi-model CRISPR sgRNA design. CHOPCHOP-style table with off-target search,
            structure preview, genome track, multiplex picker, and CRISPR mode-aware ranking.
          </p>
        </div>
        <button onClick={() => setShowSaved(s => !s)}
                className="btn btn-ghost border border-zinc-300 shrink-0">
          <FolderOpen className="h-4 w-4" />Saved projects
        </button>
      </div>

      {showSaved && (
        <div className="card">
          <h3 className="font-semibold mb-2 text-sm">Saved sgRNA jobs</h3>
          <SavedJobsList filterModule="sgrna"
                         onPick={(j) => { setJobId(j.job_id); setTab("results"); setShowSaved(false); }} />
        </div>
      )}

      <div className="border-b border-zinc-200">
        <nav className="flex gap-1">
          <TabButton active={tab === "input"} onClick={() => setTab("input")}
                     icon={<Sliders className="h-4 w-4" />}>1. Input</TabButton>
          <TabButton active={tab === "results"} onClick={() => setTab("results")}
                     icon={<BarChart3 className="h-4 w-4" />} disabled={!jobId}>2. Results</TabButton>
          <TabButton active={tab === "visualize"} onClick={() => setTab("visualize")}
                     icon={<ImageIcon className="h-4 w-4" />} disabled={!jobId}>3. Visualization</TabButton>
        </nav>
      </div>

      {tab === "input" && (
        <form className="card space-y-5" onSubmit={onSubmit}>
          <section>
            <h3 className="font-semibold mb-2">Sequence input</h3>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Target FASTA (single or multi-record)</label>
                <button type="button" onClick={() => setFasta(EXAMPLE_FASTA)}
                        className="text-xs font-medium text-brand-600 hover:underline">
                  Load example (AT1G01010 CDS)
                </button>
              </div>
              <textarea className="input font-mono text-xs h-32" value={fasta}
                        onChange={e => setFasta(e.target.value)}
                        placeholder=">target_1&#10;ATGCGATCG...&#10;>target_2&#10;ATGGCAT..." />
            </div>
            <div className="text-center text-zinc-400 text-xs my-2">— or —</div>
            <div>
              <label className="label">Reuse retrieval job ID</label>
              <input className="input font-mono" value={jobIdInput}
                     onChange={e => setJobIdInput(e.target.value)}
                     placeholder="paste job_id from a Sequence Retrieval job" />
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-2">CRISPR system</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="label">PAM</label>
                <select className="input" value={pam} onChange={e => setPam(e.target.value)}>
                  <option value="NGG">NGG (SpCas9)</option>
                  <option value="NAG">NAG (SpCas9 alt)</option>
                  <option value="TTTV">TTTV (Cas12a)</option>
                  <option value="NNGRRT">NNGRRT (SaCas9)</option>
                </select>
              </div>
              <div>
                <label className="label">Guide length</label>
                <input type="number" className="input" min={17} max={24}
                       value={guideLength}
                       onChange={e => setGuideLength(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Mode</label>
                <select className="input" value={mode}
                        onChange={e => setMode(e.target.value)}>
                  <option value="knockout">Knockout (CRISPR-Cas9)</option>
                  <option value="crispri">CRISPRi (interference)</option>
                  <option value="crispra">CRISPRa (activation)</option>
                </select>
              </div>
              <div>
                <label className="label">Region</label>
                <select className="input" value={region}
                        onChange={e => setRegion(e.target.value as any)}>
                  <option value="all">Whole sequence</option>
                  <option value="exon">Exon (auto from GenBank)</option>
                  <option value="promoter">Promoter (5' end)</option>
                  <option value="custom">Custom range</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              <strong>Mode</strong> shifts the positional weighting:
              knockout favors 5'-CDS, CRISPRi favors mid-region, CRISPRa favors upstream of TSS.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Off-target & output</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="label">Max mismatches (off-target)</label>
                <input type="number" className="input" min={0} max={5}
                       value={maxMm}
                       onChange={e => setMaxMm(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Top N sgRNAs</label>
                <input type="number" className="input" min={1} max={500}
                       value={topN}
                       onChange={e => setTopN(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Genome (optional)</label>
                <input className="input" value={genome}
                       onChange={e => setGenome(e.target.value)}
                       placeholder="e.g. arabidopsis_thaliana" />
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              If a genome is named and present at <code>/data/genomes/&lt;name&gt;.fa</code>,
              Cas-OFFinder will scan it. Otherwise off-targets are counted within the input sequence only.
            </p>
          </section>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <button type="submit" disabled={submitting} className="btn btn-primary w-full">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Design sgRNAs
          </button>
        </form>
      )}

      {tab === "results" && (
        jobId
          ? <SgRNAResults jobId={jobId} />
          : <div className="card text-zinc-500 text-sm">Submit a design job first.</div>
      )}

      {tab === "visualize" && (
        jobId
          ? <VisualizationTab jobId={jobId} />
          : <div className="card text-zinc-500 text-sm">Submit a design job first.</div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children, icon, disabled = false }: {
  active: boolean; onClick: () => void;
  children: React.ReactNode; icon: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
        ${active
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      {icon}{children}
    </button>
  );
}

const fetcher = (id: string) => getJobStatus(id);

function VisualizationTab({ jobId }: { jobId: string }) {
  const { data } = useSWR(jobId, fetcher, { refreshInterval: 0 });
  const [seqId, setSeqId] = useState<string>("");
  const [previewSgrna, setPreviewSgrna] = useState<SgRNARow | null>(null);

  const allRows: SgRNARow[] = useMemo(
    () => (data?.result?.all_sgRNAs as SgRNARow[]) ?? [],
    [data]
  );

  const sequenceIds = useMemo(() => {
    const s = new Set<string>();
    allRows.forEach(r => s.add(r.sequence_id));
    return Array.from(s);
  }, [allRows]);

  // Auto-pick first sequence if none selected
  useEffect(() => {
    if (!seqId && sequenceIds.length > 0) setSeqId(sequenceIds[0]);
  }, [seqId, sequenceIds]);

  const rowsForSeq = useMemo(
    () => allRows.filter(r => r.sequence_id === seqId),
    [allRows, seqId]
  );

  const seqLength = useMemo(() => {
    if (!rowsForSeq.length) return 0;
    return Math.max(...rowsForSeq.map(r => r.end));
  }, [rowsForSeq]);

  if (!data) {
    return <div className="card flex items-center gap-2 text-zinc-500">
      <Loader2 className="h-4 w-4 animate-spin" />Loading job…
    </div>;
  }

  if (data.status !== "SUCCESS") {
    return <div className="card text-zinc-500 text-sm">
      Job is still {data.status.toLowerCase()}. Visualization will appear when it finishes.
    </div>;
  }

  if (allRows.length === 0) {
    return <div className="card text-zinc-500 text-sm">No sgRNAs to visualize.</div>;
  }

  return (
    <div className="space-y-6">
      {sequenceIds.length > 1 && (
        <div className="card">
          <label className="label">Sequence</label>
          <select className="input max-w-md" value={seqId}
                  onChange={e => setSeqId(e.target.value)}>
            {sequenceIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold mb-3">Genome track</h3>
        <GenomeTrack
          sgrnas={rowsForSeq}
          sequenceId={seqId}
          sequenceLength={seqLength}
          onSelect={(s) => setPreviewSgrna(s)} />
      </div>

      <MultiplexPicker sgrnas={rowsForSeq} />

      {previewSgrna && (
        <StructureModal
          guide={previewSgrna.sgRNA}
          structure={previewSgrna.structure}
          mfe={previewSgrna.mfe}
          pam={previewSgrna.pam}
          rank={previewSgrna.rank}
          onClose={() => setPreviewSgrna(null)} />
      )}
    </div>
  );
}
