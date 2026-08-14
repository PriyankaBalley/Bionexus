"use client";
import { useState } from "react";
import { fetchJson } from "@/lib/api";

const API = "/api/gene-family";

const MOTIF_COLORS = [
  "#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6",
  "#1abc9c","#e67e22","#34495e","#e91e63","#00bcd4",
];

// ── Sequence Logo component ────────────────────────────────────────────────
function SequenceLogo({ logoData, width = 320 }) {
  if (!logoData?.length) return null;
  const maxIC = 4.32; // log2(20)
  const colW = Math.max(width / logoData.length, 8);
  const h = 60;

  return (
    <svg width={Math.min(width, logoData.length * colW)} height={h + 20}
      style={{ fontFamily: "monospace" }}>
      {logoData.map((pos, i) => {
        let yOffset = h;
        const sortedLetters = [...(pos.letters || [])].sort((a, b) => a.height - b.height);
        return (
          <g key={i} transform={`translate(${i * colW}, 0)`}>
            {sortedLetters.map((lt) => {
              const letterH = (lt.height / maxIC) * h;
              yOffset -= letterH;
              return (
                <text
                  key={lt.aa}
                  x={colW / 2}
                  y={yOffset + letterH}
                  textAnchor="middle"
                  fontSize={Math.max(letterH * 0.9, 4)}
                  fill={getAAColor(lt.aa)}
                  transform={`scale(1, ${letterH / Math.max(letterH, 1)})`}
                  style={{ transformOrigin: `${colW / 2}px ${yOffset + letterH}px` }}
                >
                  {lt.aa}
                </text>
              );
            })}
            <text x={colW / 2} y={h + 14} textAnchor="middle" fontSize="7" fill="#aaa">
              {pos.position}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function getAAColor(aa) {
  const colors = {
    // Hydrophobic
    A:"#f0a500", V:"#f0a500", L:"#f0a500", I:"#f0a500",
    P:"#f0a500", F:"#f0a500", W:"#f0a500", M:"#f0a500",
    // Polar
    S:"#17a589", T:"#17a589", C:"#17a589", Y:"#17a589", N:"#17a589", Q:"#17a589",
    // Charged+
    K:"#2874a6", R:"#2874a6", H:"#2874a6",
    // Charged-
    D:"#cb4335", E:"#cb4335",
    // Special
    G:"#555", X:"#aaa",
  };
  return colors[aa] || "#888";
}

// ── Motif distribution heatmap ─────────────────────────────────────────────
function MotifHeatmap({ distribution }) {
  if (!distribution?.heatmap?.length) return null;
  const { heatmap, seq_ids, motif_ids } = distribution;

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left px-2 py-1 text-gray-500 font-medium w-32">Sequence</th>
            {motif_ids.map((mid, i) => (
              <th key={mid} className="px-1 py-1 text-center" style={{ minWidth: 32 }}>
                <div
                  className="w-6 h-4 rounded mx-auto"
                  style={{ backgroundColor: MOTIF_COLORS[i % MOTIF_COLORS.length] }}
                  title={mid}
                />
                <div className="text-gray-400 text-xs mt-0.5">{i + 1}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.map((row) => (
            <tr key={row.seq_id} className="hover:bg-gray-50">
              <td className="px-2 py-1 font-mono text-gray-700 whitespace-nowrap">{row.seq_id}</td>
              {row.presence.map((present, i) => (
                <td key={i} className="px-1 py-1 text-center">
                  <div
                    className="w-6 h-4 rounded mx-auto border"
                    style={{
                      backgroundColor: present
                        ? MOTIF_COLORS[i % MOTIF_COLORS.length]
                        : "#f3f4f6",
                      borderColor: present
                        ? MOTIF_COLORS[i % MOTIF_COLORS.length]
                        : "#e5e7eb",
                      opacity: present ? 0.9 : 1,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Motif card ─────────────────────────────────────────────────────────────
function MotifCard({ motif, index }) {
  const [showLogo, setShowLogo] = useState(false);
  const color = MOTIF_COLORS[index % MOTIF_COLORS.length];

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 truncate">
            {motif.motif_id}
          </div>
          <div className="text-xs text-gray-500">
            Width {motif.width} · {motif.nsites} sites ·{" "}
            E-value {typeof motif.evalue === "number" ? motif.evalue.toExponential(2) : motif.evalue}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-400">IC</div>
          <div className="text-sm font-bold text-gray-700">
            {motif.information_content?.toFixed(1) ?? "—"}
          </div>
        </div>
      </div>

      {/* Consensus */}
      <div className="px-4 py-2 bg-gray-50 font-mono text-xs tracking-widest overflow-x-auto text-gray-800 border-b border-gray-100">
        {motif.consensus || "—"}
      </div>

      {motif.description && (
        <div className="px-4 py-2 text-xs text-gray-500">{motif.description}</div>
      )}

      {/* Toggle logo */}
      <div className="px-4 py-2">
        <button
          onClick={() => setShowLogo(!showLogo)}
          className="text-xs text-brand-600 hover:text-brand-800"
        >
          {showLogo ? "Hide" : "Show"} sequence logo
        </button>
        {showLogo && motif.logo_data?.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <SequenceLogo logoData={motif.logo_data} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sequence input panel ───────────────────────────────────────────────────
function parseMultiFasta(text) {
  const seqs = {};
  let current = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('>')) {
      current = line.slice(1).split(/\s+/)[0];
      seqs[current] = '';
    } else if (current) {
      seqs[current] += line.trim();
    }
  }
  return seqs;
}

export default function MotifPage() {
  const [fastaInput, setFastaInput] = useState("");
  const [nmotifs, setNmotifs] = useState(10);
  const [minWidth, setMinWidth] = useState(6);
  const [maxWidth, setMaxWidth] = useState(50);
  const [useMemeApi, setUseMemeApi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("motifs");

  async function runExample() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await fetchJson(`${API}/motif/example`);
      setResult(data);
      setActiveTab("motifs");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    const seqs = parseMultiFasta(fastaInput);
    if (Object.keys(seqs).length < 2) {
      setError("Paste at least 2 sequences in FASTA format.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await fetchJson(`${API}/motif`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequences: seqs,
          nmotifs,
          min_width: minWidth,
          max_width: maxWidth,
          use_meme_api: useMemeApi,
          mod: "zoops",
        }),
      });
      setResult(data);
      setActiveTab("motifs");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadMotifTsv() {
    if (!result?.motifs) return;
    const headers = ["Motif ID","Rank","Width","Consensus","Sites","P-value","E-value","IC (bits)"];
    const rows = result.motifs.map((m) => [
      m.motif_id, m.rank, m.width, m.consensus,
      m.nsites, m.pvalue, m.evalue, m.information_content,
    ]);
    const tsv = [headers, ...rows].map((r) => r.join("\t")).join("\n");
    const blob = new Blob([tsv], { type: "text/tab-separated-values" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "motifs.tsv";
    a.click();
  }

  const parsedCount = fastaInput
    ? Object.keys(parseMultiFasta(fastaInput)).length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-gray-900">Conserved Motif Analysis</h1>
          </div>
          <p className="text-sm text-gray-500">
            Local k-mer motif finder · Sequence logos · Motif distribution heatmap ·
            Following the approach of Dokka et al. 2024 (Gene 914, 148417)
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Example */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Built-in Example</h2>
              <p className="text-xs text-gray-500 mt-1">
                8 real dirigent (DIR) protein sequences from UniProt, across Arabidopsis,
                Sinopodophyllum, and pea. Expects to find the conserved "GGTGDF" motif
                (part of the core dirigent fold) present in all 8 sequences.
              </p>
            </div>
            <button
              onClick={runExample}
              disabled={loading}
              className="shrink-0 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors ml-4"
            >
              {loading ? "Running..." : "Run Example →"}
            </button>
          </div>
        </div>

        {/* Input */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Custom Input</h2>
            {parsedCount > 0 && (
              <span className="text-xs text-teal-600 font-medium">
                {parsedCount} sequences detected
              </span>
            )}
          </div>

          <textarea
            value={fastaInput}
            onChange={(e) => setFastaInput(e.target.value)}
            placeholder={`>Protein_1\nMAAFILFLLASVAVAAPAAQVIDDPLT...\n>Protein_2\nMAVFILFLLASVAVAAPAAQ...`}
            className="w-full h-40 font-mono text-xs border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Number of motifs
              </label>
              <input
                type="number"
                value={nmotifs}
                onChange={(e) => setNmotifs(parseInt(e.target.value))}
                min={1} max={20}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Min width (aa)
              </label>
              <input
                type="number"
                value={minWidth}
                onChange={(e) => setMinWidth(parseInt(e.target.value))}
                min={4} max={20}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Max width (aa)
              </label>
              <input
                type="number"
                value={maxWidth}
                onChange={(e) => setMaxWidth(parseInt(e.target.value))}
                min={10} max={300}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
                <input
                  type="checkbox"
                  checked={useMemeApi}
                  onChange={(e) => setUseMemeApi(e.target.checked)}
                  className="accent-teal-600"
                />
                Use MEME API
                <span className="text-xs text-gray-400">(slower, more accurate)</span>
              </label>
            </div>
          </div>

          <button
            onClick={runAnalysis}
            disabled={loading || parsedCount < 2}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                {useMemeApi ? "Submitting to MEME Suite..." : "Running local motif finder..."}
              </>
            ) : (
              "Find Conserved Motifs"
            )}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {result.example_metadata && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <div className="font-semibold text-teal-800 text-sm">{result.example_metadata.name}</div>
                <div className="text-teal-700 text-xs mt-1">{result.example_metadata.description}</div>
                {result.example_metadata.expected_result && (
                  <div className="mt-2 text-xs bg-white border border-teal-100 rounded p-2 text-gray-600">
                    <span className="font-medium">Expected: </span>
                    {result.example_metadata.expected_result}
                  </div>
                )}
              </div>
            )}

            {/* Method badge + stats */}
            <div className="flex items-center gap-4 flex-wrap">
              <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                result.method === "meme_api"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}>
                {result.method === "meme_api" ? "✓ MEME Suite API" : "⚡ Local k-mer finder"}
              </span>
              <span className="text-sm text-gray-600">
                <b>{result.n_motifs_found}</b> motifs found in{" "}
                <b>{result.n_sequences}</b> sequences
              </span>
              <button
                onClick={downloadMotifTsv}
                className="text-xs border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 text-gray-600 ml-auto"
              >
                ↓ Download TSV
              </button>
            </div>

            {result.errors?.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-xs space-y-1">
                {result.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="flex border-b border-gray-200 px-5">
                {["motifs", "heatmap"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? "border-teal-600 text-teal-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab === "motifs" ? "Motif Cards" : "Distribution Heatmap"}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {activeTab === "motifs" && (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {result.motifs.map((motif, i) => (
                      <MotifCard key={motif.motif_id} motif={motif} index={i} />
                    ))}
                    {!result.motifs.length && (
                      <div className="col-span-3 text-center text-gray-400 py-8">
                        No motifs found. Try relaxing the E-value or reducing min_width.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "heatmap" && (
                  <div>
                    <p className="text-xs text-gray-500 mb-4">
                      Each row = sequence · Each column = motif ·
                      Colored = motif present · Gray = absent
                    </p>
                    <MotifHeatmap distribution={result.distribution} />
                    {!result.distribution?.heatmap?.length && (
                      <div className="text-center text-gray-400 py-8">
                        No distribution data available.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
