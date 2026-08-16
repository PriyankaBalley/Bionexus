"use client";

import { useRef, useState } from "react";
import { fetchJson } from "@/lib/api";

const API = "/api/gene-family";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ExonType = "CDS" | "UTR5" | "UTR3" | "UTR" | string;

interface GeneInput {
  gene_id: string;
  cds_seq: string;
  genomic_seq: string;
}

interface ExonRect {
  x: number;
  y: number;
  width: number;
  height: number;
  type: ExonType;
  tooltip?: string;
}

interface IntronLine {
  x1: number;
  y1: number;
  mid_x: number;
  mid_y: number;
  x2: number;
  y2: number;
  tooltip?: string;
}

interface TrackBaseline {
  x1: number;
  x2: number;
  y: number;
}

interface GSDSTrack {
  gene_id: string;
  label_x: number;
  label_y: number;
  exon_count: number;
  intron_count: number;
  baseline: TrackBaseline;
  exon_rects: ExonRect[];
  intron_lines: IntronLine[];
}

interface GSDSLegendItem {
  label: string;
  color: string;
}

interface GSDSRenderData {
  tracks: GSDSTrack[];
  width: number;
  height: number;
  legend?: GSDSLegendItem[];
}

interface GSDSIntron {
  length: number;
  donor_site?: string;
  acceptor_site?: string;
}

interface GSDSStructure {
  gene_id: string;
  structure_type: string;
  exon_count: number;
  intron_count: number;
  cds_length: number;
  genomic_length: number;
  introns?: GSDSIntron[];
}

interface GSDSExampleMetadata {
  name?: string;
  description?: string;
}

interface GSDSResult {
  n_genes?: number;
  n_single_exon?: number;
  n_multi_exon?: number;
  structures?: GSDSStructure[];
  render_data?: GSDSRenderData;
  example_metadata?: GSDSExampleMetadata;
  errors?: string[];
}

interface GSDSCanvasProps {
  renderData?: GSDSRenderData;
}

interface StructureCardProps {
  s: GSDSStructure;
}

interface GeneInputRowProps {
  gene: GeneInput;
  index: number;
  onChange: (
    index: number,
    field: keyof GeneInput,
    value: string
  ) => void;
  onRemove: (index: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// GSDS SVG Renderer
// ─────────────────────────────────────────────────────────────────────────────

function GSDSCanvas({ renderData }: GSDSCanvasProps) {
  if (!renderData?.tracks?.length) return null;

  const { tracks, width, height, legend } = renderData;

  const COLORS: Record<string, string> = {
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
        style={{
          minWidth: Math.min(width, 800),
          fontFamily: "monospace",
        }}
      >
        {/* Scale ruler */}
        <line
          x1="200"
          y1="10"
          x2={width - 20}
          y2="10"
          stroke="#ccc"
          strokeWidth="1"
        />

        {[0, 25, 50, 75, 100].map((pct) => {
          const x = 200 + ((width - 220) * pct) / 100;

          return (
            <g key={pct}>
              <line
                x1={x}
                y1="7"
                x2={x}
                y2="13"
                stroke="#aaa"
                strokeWidth="1"
              />
              <text
                x={x}
                y="6"
                textAnchor="middle"
                fontSize="9"
                fill="#888"
              >
                {pct}%
              </text>
            </g>
          );
        })}

        {tracks.map((track) => (
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

            {/* Exon / intron count */}
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
            {track.exon_rects.map((rect, index) => (
              <g key={`${track.gene_id}-exon-${index}`}>
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill={COLORS[rect.type] ?? "#e74c3c"}
                  rx="2"
                  opacity="0.9"
                >
                  {rect.tooltip ? <title>{rect.tooltip}</title> : null}
                </rect>
              </g>
            ))}

            {/* Intron V-lines */}
            {track.intron_lines.map((iv, index) => (
              <g key={`${track.gene_id}-intron-${index}`}>
                <polyline
                  points={`${iv.x1},${iv.y1} ${iv.mid_x},${iv.mid_y} ${iv.x2},${iv.y2}`}
                  fill="none"
                  stroke="#7f8c8d"
                  strokeWidth="1.5"
                >
                  {iv.tooltip ? <title>{iv.tooltip}</title> : null}
                </polyline>
              </g>
            ))}
          </g>
        ))}

        {/* Legend */}
        {legend?.length ? (
          <g transform={`translate(200, ${height - 25})`}>
            {legend.map((item, index) => (
              <g
                key={`${item.label}-${index}`}
                transform={`translate(${index * 150}, 0)`}
              >
                <rect
                  x="0"
                  y="0"
                  width="14"
                  height="12"
                  fill={item.color}
                  rx="2"
                />
                <text x="18" y="10" fontSize="10" fill="#555">
                  {item.label}
                </text>
              </g>
            ))}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure stats card
// ─────────────────────────────────────────────────────────────────────────────

function StructureCard({ s }: StructureCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold italic text-gray-900">
          {s.gene_id}
        </span>

        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            s.structure_type === "single_exon"
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {s.structure_type === "single_exon"
            ? "Single exon"
            : `${s.exon_count} exons`}
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

      {!!s.introns?.length && (
        <div className="mt-2 text-xs">
          {s.introns.map((iv, index) => {
            const canonicalSpliceSite =
              Boolean(iv.donor_site) &&
              Boolean(iv.acceptor_site) &&
              iv.donor_site!.startsWith("GT") &&
              iv.acceptor_site!.endsWith("AG");

            return (
              <span
                key={`${s.gene_id}-intron-detail-${index}`}
                className="mr-2 text-gray-500"
              >
                I{index + 1}: {iv.length} bp{" "}
                {iv.donor_site && iv.acceptor_site ? (
                  <span
                    className={`font-mono ${
                      canonicalSpliceSite
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    ({iv.donor_site}-{iv.acceptor_site})
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gene input row
// ─────────────────────────────────────────────────────────────────────────────

function GeneInputRow({
  gene,
  index,
  onChange,
  onRemove,
}: GeneInputRowProps) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <input
          value={gene.gene_id}
          onChange={(e) => onChange(index, "gene_id", e.target.value)}
          placeholder="Gene ID (e.g. CcDIR1)"
          className="w-40 rounded border border-gray-200 px-3 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Remove
        </button>
      </div>

      <textarea
        value={gene.cds_seq}
        onChange={(e) => onChange(index, "cds_seq", e.target.value)}
        placeholder="CDS sequence (nucleotides only)..."
        className="h-16 w-full resize-none rounded border border-gray-200 p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-500"
      />

      <textarea
        value={gene.genomic_seq}
        onChange={(e) => onChange(index, "genomic_seq", e.target.value)}
        placeholder="Genomic sequence (same region, may include introns)..."
        className="h-16 w-full resize-none rounded border border-gray-200 p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function GSDSPage() {
  const [genes, setGenes] = useState<GeneInput[]>([
    {
      gene_id: "",
      cds_seq: "",
      genomic_seq: "",
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GSDSResult | null>(null);
  const [error, setError] = useState("");
  const svgRef = useRef<HTMLDivElement | null>(null);

  function addGene() {
    setGenes((currentGenes) => [
      ...currentGenes,
      {
        gene_id: "",
        cds_seq: "",
        genomic_seq: "",
      },
    ]);
  }

  function removeGene(index: number) {
    setGenes((currentGenes) =>
      currentGenes.filter((_, currentIndex) => currentIndex !== index)
    );
  }

  function updateGene(
    index: number,
    field: keyof GeneInput,
    value: string
  ) {
    setGenes((currentGenes) =>
      currentGenes.map((gene, currentIndex) =>
        currentIndex === index
          ? {
              ...gene,
              [field]: value,
            }
          : gene
      )
    );
  }

  async function runExample() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = (await fetchJson(
        `${API}/gsds/example`
      )) as GSDSResult;

      setResult(data);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Unable to run the GSDS example."
      );
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    const validGenes = genes.filter(
      (gene) =>
        gene.gene_id.trim() &&
        gene.cds_seq.trim() &&
        gene.genomic_seq.trim()
    );

    if (!validGenes.length) {
      setError("Please fill in at least one complete gene entry.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = (await fetchJson(`${API}/gsds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          genes: validGenes,
        }),
      })) as GSDSResult;

      setResult(data);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Unable to compute gene structures."
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadSVG() {
    const svgElement = svgRef.current?.querySelector("svg");
    if (!svgElement) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "gene_structure.svg";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  const structures = result?.structures ?? [];
  const resultErrors = result?.errors ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">
              Gene Structure Display (GSDS)
            </h1>
          </div>

          <p className="text-sm text-gray-500">
            Exon-intron architecture visualization · GT-AG splice site
            validation · Publication-quality SVG output · Mirrors GSDS 2.0
            (Hu et al. 2015)
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* Example panel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                Built-in Example
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                CcDIR1, CcDIR2, CcDIR3 from Dokka et al. 2024 —
                demonstrates the classic single-exon structure of dirigent
                genes. CcDIR2 includes a synthetic intron to show multi-exon
                detection.
              </p>
            </div>

            <button
              type="button"
              onClick={runExample}
              disabled={loading}
              className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? "Running..." : "Run Example →"}
            </button>
          </div>
        </div>

        {/* Manual input */}
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Custom Gene Input
            </h2>

            <button
              type="button"
              onClick={addGene}
              className="rounded border border-brand-200 px-3 py-1.5 text-xs text-brand-600 transition-colors hover:bg-brand-50"
            >
              + Add Gene
            </button>
          </div>

          <div className="space-y-4">
            {genes.map((gene, index) => (
              <GeneInputRow
                key={`gene-input-${index}`}
                gene={gene}
                index={index}
                onChange={updateGene}
                onRemove={removeGene}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="w-full rounded-lg bg-purple-600 py-2.5 font-semibold text-white transition-colors hover:bg-purple-700 disabled:bg-gray-300"
          >
            {loading
              ? "Computing structures..."
              : "Compute Gene Structures"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Example metadata */}
            {result.example_metadata && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <div className="text-sm font-semibold text-purple-800">
                  {result.example_metadata.name ?? "Example"}
                </div>

                {result.example_metadata.description && (
                  <div className="mt-1 text-xs text-purple-700">
                    {result.example_metadata.description}
                  </div>
                )}
              </div>
            )}

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Genes analyzed",
                  value: result.n_genes ?? 0,
                },
                {
                  label: "Single-exon",
                  value: result.n_single_exon ?? 0,
                },
                {
                  label: "Multi-exon",
                  value: result.n_multi_exon ?? 0,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-center"
                >
                  <div className="mb-1 text-xs text-gray-500">
                    {stat.label}
                  </div>

                  <div className="text-2xl font-bold text-purple-600">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Structure cards */}
            {structures.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {structures.map((structure) => (
                  <StructureCard
                    key={structure.gene_id}
                    s={structure}
                  />
                ))}
              </div>
            )}

            {/* GSDS SVG */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  Gene Structure Diagram
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    (red = CDS, dark = UTR, line = intron)
                  </span>
                </h3>

                <button
                  type="button"
                  onClick={downloadSVG}
                  disabled={!result.render_data?.tracks?.length}
                  className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ↓ SVG
                </button>
              </div>

              <div ref={svgRef}>
                <GSDSCanvas renderData={result.render_data} />
              </div>
            </div>

            {/* Backend errors */}
            {resultErrors.length > 0 && (
              <div className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
                {resultErrors.map((message, index) => (
                  <div key={`${message}-${index}`}>⚠ {message}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}