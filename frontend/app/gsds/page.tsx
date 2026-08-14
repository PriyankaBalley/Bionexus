"use client";
import { useState, useRef } from "react";
import { fetchJson } from "@/lib/api";

const API = "/api/gene-family";

// ── GSDS SVG Renderer ──────────────────────────────────────────────────────
function GSDSCanvas({ renderData }) {
  if (!renderData?.tracks?.length) return null;

  const { tracks, width, height, legend } = renderData;

  const COLORS = {
    CDS: "#e74c3c",
    UTR5: "#2c3e50",
    UTR3: "#2c3e50",
    UTR: "#2c3e50",
    intron: "#95a5a6",
  };

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ minWidth: Math.min(width, 800), fontFamily: "monospace" }}
      >
        {/* Scale ruler */}
        <line x1="200" y1="10" x2={width - 20} y2="10" stroke="#ccc" strokeWidth="1" />
        {[0, 25, 50, 75, 100].map((pct) => {
          const x = 200 + ((width - 220) * pct) / 100;
          return (
            <g key={pct}>
              <line x1={x} y1="7" x2={x} y2="13" stroke="#aaa" strokeWidth="1" />
              <text x={x} y="6" textAnchor="middle" fontSize="9" fill="#888">
                {pct}%
              </text>
            </g>
          );
        })}

        {tracks.map((track, idx) => (
          <g key={track.gene_id}>
            {/* Gene label */}
            <text
              x={track.label_x}
              y={track.label_y}
              textAnchor="end"
              fontSize="11"
              fontStyle="italic"
              fill="#2c3e50"
              fontWeight="600"
            >
              {track.gene_id}
            </text>

            {/* Exon/intron count badge */}
            <text
              x={track.label_x}
              y={track.label_y + 10}
              textAnchor="end"
              fontSize="8"
              fill="#95a5a6"
            >
              {track.exon_count}E {track.intron_count}I
            </text>

            {/* Baseline */}
            <line
              x1={track.baseline.x1}
              y1={track.baseline.y}
              x2={track.baseline.x2}
              y2={track.baseline.y}
              stroke="#bdc3c7"
              strokeWidth="1.5"
            />

            {/* Exon blocks */}
            {track.exon_rects.map((rect, i) => (
              <g key={i}>
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill={COLORS[rect.type] || "#e74c3c"}
                  rx="2"
                  opacity="0.9"
                >
                  <title>{rect.tooltip}</title>
                </rect>
              </g>
            ))}

            {/* Intron V-lines */}
            {track.intron_lines.map((iv, i) => (
              <g key={i}>
                <polyline
                  points={`${iv.x1},${iv.y1} ${iv.mid_x},${iv.mid_y} ${iv.x2},${iv.y2}`}
                  fill="none"
                  stroke="#7f8c8d"
                  strokeWidth="1.5"
                >
                  <title>{iv.tooltip}</title>
                </polyline>
              </g>
            ))}
          </g>
        ))}

        {/* Legend */}
        {legend && (
          <g transform={`translate(200, ${height - 25})`}>
            {legend.map((item, i) => (
              <g key={i} transform={`translate(${i * 150}, 0)`}>
                <rect x="0" y="0" width="14" height="12" fill={item.color} rx="2" />
                <text x="18" y="10" fontSize="10" fill="#555">
                  {item.label}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

// ── Structure stats card ──────────────────────────────────────────────────
function StructureCard({ s }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm text-gray-900 italic">{s.gene_id}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded font-medium ${
            s.structure_type === "single_exon"
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {s.structure_type === "single_exon" ? "Single exon" : `${s.exon_count} exons`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
        <div>
          <span className="text-gray-400">CDS</span>
          <div className="font-mono">{s.cds_length} bp</div>
        </div>
        <div>
          <span className="text-gray-400">Introns</span>
          <div className="font-mono">{s.intron_count}</div>
        </div>
        <div>
          <span className="text-gray-400">Genomic</span>
          <div className="font-mono">{s.genomic_length} bp</div>
        </div>
      </div>
      {s.introns?.length > 0 && (
        <div className="mt-2 text-xs">
          {s.introns.map((iv, i) => (
            <span key={i} className="mr-2 text-gray-500">
              I{i + 1}: {iv.length} bp{" "}
              {iv.donor_site && iv.acceptor_site ? (
                <span className={`font-mono ${
                  iv.donor_site.startsWith("GT") && iv.acceptor_site.endsWith("AG")
                    ? "text-green-600"
                    : "text-red-600"
                }`}>
                  ({iv.donor_site}-{iv.acceptor_site})
                </span>
              ) : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Gene input row ────────────────────────────────────────────────────────
function GeneInputRow({ gene, index, onChange, onRemove }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <input
          value={gene.gene_id}
          onChange={(e) => onChange(index, "gene_id", e.target.value)}
          placeholder="Gene ID (e.g. CcDIR1)"
          className="font-mono text-sm border border-gray-200 rounded px-3 py-1.5 w-40 focus:ring-2 focus:ring-brand-500 outline-none"
        />
        <button
          onClick={() => onRemove(index)}
          className="text-red-400 hover:text-red-600 text-xs"
        >
          Remove
        </button>
      </div>
      <textarea
        value={gene.cds_seq}
        onChange={(e) => onChange(index, "cds_seq", e.target.value)}
        placeholder="CDS sequence (nucleotides only)..."
        className="w-full h-16 font-mono text-xs border border-gray-200 rounded p-2 focus:ring-2 focus:ring-brand-500 outline-none resize-none"
      />
      <textarea
        value={gene.genomic_seq}
        onChange={(e) => onChange(index, "genomic_seq", e.target.value)}
        placeholder="Genomic sequence (same region, may include introns)..."
        className="w-full h-16 font-mono text-xs border border-gray-200 rounded p-2 focus:ring-2 focus:ring-brand-500 outline-none resize-none"
      />
    </div>
  );
}

export default function GSDSPage() {
  const [genes, setGenes] = useState([
    { gene_id: "", cds_seq: "", genomic_seq: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const svgRef = useRef(null);

  function addGene() {
    setGenes((g) => [...g, { gene_id: "", cds_seq: "", genomic_seq: "" }]);
  }

  function removeGene(i) {
    setGenes((g) => g.filter((_, idx) => idx !== i));
  }

  function updateGene(i, field, val) {
    setGenes((g) => g.map((gene, idx) => (idx === i ? { ...gene, [field]: val } : gene)));
  }

  async function runExample() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await fetchJson(`${API}/gsds/example`);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    const validGenes = genes.filter((g) => g.gene_id && g.cds_seq && g.genomic_seq);
    if (!validGenes.length) {
      setError("Please fill in at least one complete gene entry.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await fetchJson(`${API}/gsds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genes: validGenes }),
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadSVG() {
    const svgEl = svgRef.current?.querySelector("svg");
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gene_structure.svg";
    a.click();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-gray-900">Gene Structure Display (GSDS)</h1>
          </div>
          <p className="text-sm text-gray-500">
            Exon-intron architecture visualization · GT-AG splice site validation ·
            Publication-quality SVG output · Mirrors GSDS 2.0 (Hu et al. 2015)
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Example panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Built-in Example</h2>
              <p className="text-xs text-gray-500 mt-1">
                CcDIR1, CcDIR2, CcDIR3 from Dokka et al. 2024 —
                demonstrates the classic single-exon structure of dirigent genes.
                CcDIR2 includes a synthetic intron to show multi-exon detection.
              </p>
            </div>
            <button
              onClick={runExample}
              disabled={loading}
              className="shrink-0 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? "Running..." : "Run Example →"}
            </button>
          </div>
        </div>

        {/* Manual input */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Custom Gene Input</h2>
            <button
              onClick={addGene}
              className="text-xs text-brand-600 border border-brand-200 hover:bg-brand-50 px-3 py-1.5 rounded transition-colors"
            >
              + Add Gene
            </button>
          </div>

          <div className="space-y-4">
            {genes.map((g, i) => (
              <GeneInputRow
                key={i}
                gene={g}
                index={i}
                onChange={updateGene}
                onRemove={removeGene}
              />
            ))}
          </div>

          <button
            onClick={runAnalysis}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Computing structures..." : "Compute Gene Structures"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {result.example_metadata && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="font-semibold text-purple-800 text-sm">{result.example_metadata.name}</div>
                <div className="text-purple-700 text-xs mt-1">{result.example_metadata.description}</div>
              </div>
            )}

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Genes analyzed", value: result.n_genes },
                { label: "Single-exon", value: result.n_single_exon },
                { label: "Multi-exon", value: result.n_multi_exon },
              ].map((s) => (
                <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                  <div className="text-2xl font-bold text-purple-600">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Structure cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.structures.map((s) => (
                <StructureCard key={s.gene_id} s={s} />
              ))}
            </div>

            {/* GSDS SVG */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  Gene Structure Diagram
                  <span className="text-xs font-normal text-gray-400 ml-2">
                    (red = CDS, dark = UTR, line = intron)
                  </span>
                </h3>
                <button
                  onClick={downloadSVG}
                  className="text-xs border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 text-gray-600"
                >
                  ↓ SVG
                </button>
              </div>
              <div ref={svgRef}>
                <GSDSCanvas renderData={result.render_data} />
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-xs space-y-1">
                {result.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
