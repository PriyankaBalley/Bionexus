"use client";
import { useState } from "react";
import { fetchJson } from "@/lib/api";

const API = "/api/gene-family";

const EXAMPLES = {
  dirigent: {
    label: "Dirigent protein 6 (Arabidopsis thaliana)",
    description:
      "Real UniProt sequence (Q9SUQ8). Genome-wide dirigent-family identification, "
      + "following the approach of Dokka et al. 2024 (Gene 914, 148417).",
    query_sequence:
      "MAFLVEKQLFKALFSFFLLVLLFSDTVLSFRKTIDQKKPCKHFSFYFHDILYDGDNVANATSAAIVSPPGLGNFKFGKFVIFDGPITMDKNYLSKPVARAQGFYFYDMKMDFNSWFSYTLVFNSTEHKGTLNIMGADLMMEPTRDLSVVGGTGDFFMARGIATFVTDLFQGAKYFRVKMDIKLYECY",
    search_database: "swissprot",
    max_hits: 25,
    evalue_threshold: 0.001,
    ncbi_keyword: "dirigent protein",
  },
  nac: {
    label: "NAC001 transcription factor (Arabidopsis thaliana)",
    description:
      "Real UniProt sequence (Q0WV96, locus AT1G01010). Identifies the genome-wide "
      + "NAC-domain transcription factor family, a common CRISPR editing target family.",
    query_sequence:
      "MEDQVGFGFRPNDEELVGHYLRNKIEGNTSRDVEVAISEVNICSYDPWNLRFQSKYKSRDAMWYFFSRRENNKGNRQSRTTVSGKWKLTGESVEVKDQWGFCSEGFRGKIGHKRVLVFLDGRYPDKTKSDWVIHEFHYDLLPEHQRTYVICRLEYKGDDADILSAYAIDPTPAFVPNMTSSAGSVVNQSRQRNSGSYNTYSEYDSANHGQQFNENSNIMQQQPLQGSFNPLLEYDFANHGGQWLSDYIDLQQQVPYLAPYENESEMIWKHVIEENFEFLVDERTSMQQHYSDHRPKKPVSGVLPDDSSDTETGSMIFEDTSSSTDSVGSSDEPGHTRIDDIPSLNIIEPLHNYKAQEQPKQQSKEKVISSQKSECEWKMAEDSIKIPPSTNTVKQSWIVLENAQWNYLKNMIIGVLLFISVISWIILVG",
    search_database: "swissprot",
    max_hits: 25,
    evalue_threshold: 0.001,
    ncbi_keyword: "",
  },
};

function PIBadge({ pi }: { pi: number }) {
  const color = pi > 7 ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800";
  const label = pi > 7 ? "Alkaline" : "Acidic";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      pI {pi} · {label}
    </span>
  );
}

function SignalBadge({ has_sp, end }: { has_sp: boolean; end?: number }) {
  if (!has_sp) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
      SP 1–{end}
    </span>
  );
}

function SummaryCard({ summary }: { summary: any }) {
  if (!summary) return null;
  const items = [
    { label: "Total hits", value: summary.total_hits },
    { label: "With sequence", value: summary.with_sequence },
    { label: "Avg length (aa)", value: summary.avg_length },
    { label: "Avg MW (kDa)", value: summary.avg_mw_kda },
    { label: "Alkaline pI (>7)", value: summary.alkaline_pi },
    { label: "Acidic pI (≤7)", value: summary.acidic_pi },
    { label: "Signal peptide", value: summary.with_signal_peptide },
    { label: "Database", value: summary.search_database },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map((it) => (
        <div key={it.label} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">{it.label}</div>
          <div className="text-lg font-bold text-brand-600">{it.value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

export default function GeneFamilyPage() {
  const [form, setForm] = useState({
    query_sequence: "",
    search_database: "swissprot",
    max_hits: 25,
    evalue_threshold: 1e-5,
    fetch_sequences: true,
    run_interpro: false,
    ncbi_keyword: "",
    ncbi_organism: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("table");
  const [exampleRunning, setExampleRunning] = useState("");

  const handleChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function loadExample(key) {
    const ex = EXAMPLES[key];
    setForm((f) => ({ ...f, ...ex }));
    setExampleRunning(key);
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const data = await fetchJson(`${API}/identify/example/${key}`);
      setResult(data);
      setActiveTab("table");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setExampleRunning("");
    }
  }

  async function runSearch() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await fetchJson(`${API}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setResult(data);
      setActiveTab("table");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadFasta() {
    if (!result?.fasta) return;
    const blob = new Blob([result.fasta], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gene_family.fasta";
    a.click();
  }

  function downloadCSV() {
    if (!result?.members) return;
    const headers = [
      "Rank","Accession","Entry Name","Description","Organism",
      "Length (aa)","MW (kDa)","pI","Signal Peptide","SP End","N-Glyc Sites","Score","E-value","Source"
    ];
    const rows = result.members.map((m) => [
      m.rank, m.accession, m.entry_name, `"${m.description}"`,
      `"${m.organism}"`, m.length, m.mw_kda, m.pi,
      m.has_signal_peptide ? "Yes" : "No", m.signal_peptide_end,
      m.n_glyc_sites?.length ?? 0, m.score, m.evalue, m.source,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gene_family_members.csv";
    a.click();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-gray-900">Gene Family Identification</h1>
          </div>
          <p className="text-sm text-gray-500">
            Genome-wide homolog search via pHMMER · Physiochemical characterization ·
            Mirrors Dokka et al. 2024 (Gene 914, 148417)
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Examples */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Examples</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {Object.entries(EXAMPLES).map(([key, ex]) => (
              <button
                key={key}
                onClick={() => loadExample(key)}
                disabled={loading}
                className="text-left border border-gray-200 rounded-lg p-4 hover:border-brand-400 hover:bg-brand-50 transition-all disabled:opacity-50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{ex.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{ex.description}</div>
                  </div>
                  {exampleRunning === key ? (
                    <div className="animate-spin w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full ml-2 mt-0.5 shrink-0" />
                  ) : (
                    <span className="text-xs text-brand-600 font-medium ml-2 mt-0.5 shrink-0">Run →</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Input Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Query Sequence</h2>

          <textarea
            value={form.query_sequence}
            onChange={(e) => handleChange("query_sequence", e.target.value)}
            placeholder="Paste protein sequence (single-letter code, no FASTA header)..."
            className="w-full h-28 font-mono text-xs border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Database</label>
              <select
                value={form.search_database}
                onChange={(e) => handleChange("search_database", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="swissprot">SwissProt (curated)</option>
                <option value="uniprotkb">UniProtKB (all)</option>
                <option value="pdb">PDB (structures)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max hits</label>
              <input
                type="number"
                value={form.max_hits}
                onChange={(e) => handleChange("max_hits", parseInt(e.target.value))}
                min={5} max={100}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-value threshold</label>
              <select
                value={form.evalue_threshold}
                onChange={(e) => handleChange("evalue_threshold", parseFloat(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value={1e-10}>1e-10 (strict)</option>
                <option value={1e-5}>1e-5 (default)</option>
                <option value={1e-3}>1e-3 (relaxed)</option>
                <option value={0.01}>0.01 (broad)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">NCBI keyword (opt.)</label>
              <input
                type="text"
                value={form.ncbi_keyword}
                onChange={(e) => handleChange("ncbi_keyword", e.target.value)}
                placeholder="e.g. dirigent protein"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.fetch_sequences}
                onChange={(e) => handleChange("fetch_sequences", e.target.checked)}
                className="accent-brand-600"
              />
              Fetch sequences from UniProt
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.run_interpro}
                onChange={(e) => handleChange("run_interpro", e.target.checked)}
                className="accent-brand-600"
              />
              InterProScan domain check <span className="text-xs text-gray-400">(slow)</span>
            </label>
          </div>

          <button
            onClick={runSearch}
            disabled={loading || !form.query_sequence.trim()}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Searching pHMMER...
              </>
            ) : (
              "Search Gene Family"
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Example metadata */}
            {result.example_metadata && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="font-semibold text-blue-800 text-sm">{result.example_metadata.name}</div>
                <div className="text-blue-700 text-xs mt-1">{result.example_metadata.description}</div>
              </div>
            )}

            {/* Errors from backend */}
            {result.errors?.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-xs space-y-1">
                {result.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}

            {/* Summary cards */}
            <SummaryCard summary={result.summary} />

            {/* Tab bar + downloads */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-200 px-5">
                <div className="flex gap-1">
                  {["table", "fasta"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab
                          ? "border-brand-600 text-brand-600"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab === "table" ? "Results Table" : "FASTA Output"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 py-2">
                  <button
                    onClick={downloadCSV}
                    className="text-xs border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 text-gray-600"
                  >
                    ↓ CSV
                  </button>
                  <button
                    onClick={downloadFasta}
                    className="text-xs border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 text-gray-600"
                  >
                    ↓ FASTA
                  </button>
                </div>
              </div>

              {/* Table */}
              {activeTab === "table" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 uppercase tracking-wide">
                        {["#","Accession","Description","Organism","Len (aa)","MW (kDa)","pI","Signal Peptide","N-Glyc","Score","E-value"].map(
                          (h) => <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.members.map((m) => (
                        <tr key={m.accession} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-500">{m.rank}</td>
                          <td className="px-4 py-2.5">
                            <a
                              href={`https://www.uniprot.org/uniprot/${m.accession}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-600 font-medium hover:underline font-mono"
                            >
                              {m.accession}
                            </a>
                          </td>
                          <td className="px-4 py-2.5 max-w-xs truncate text-gray-700">{m.description}</td>
                          <td className="px-4 py-2.5 text-gray-600 italic text-xs">{m.organism}</td>
                          <td className="px-4 py-2.5 text-center">{m.length}</td>
                          <td className="px-4 py-2.5 text-center">{m.mw_kda || "—"}</td>
                          <td className="px-4 py-2.5 text-center">
                            {m.pi ? <PIBadge pi={m.pi} /> : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <SignalBadge has_sp={m.has_signal_peptide} end={m.signal_peptide_end} />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {m.n_glyc_sites?.length > 0 ? (
                              <span className="text-purple-700 font-medium">{m.n_glyc_sites.length}</span>
                            ) : "0"}
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono">{m.score}</td>
                          <td className="px-4 py-2.5 font-mono text-gray-600">
                            {typeof m.evalue === "number" ? m.evalue.toExponential(1) : m.evalue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* FASTA */}
              {activeTab === "fasta" && (
                <div className="p-5">
                  <pre className="bg-gray-50 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-96 whitespace-pre-wrap text-gray-700">
                    {result.fasta || "No sequences retrieved."}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
