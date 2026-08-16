"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/api";

const API = "/api/gene-family";

const MOTIF_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#34495e",
  "#e91e63",
  "#00bcd4",
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LogoLetter {
  aa: string;
  height: number;
}

interface LogoPosition {
  position: number | string;
  letters?: LogoLetter[];
}

interface SequenceLogoProps {
  logoData?: LogoPosition[];
  width?: number;
}

interface HeatmapRow {
  seq_id: string;
  presence: Array<boolean | number>;
}

interface MotifDistribution {
  heatmap?: HeatmapRow[];
  seq_ids?: string[];
  motif_ids?: string[];
}

interface MotifHeatmapProps {
  distribution?: MotifDistribution;
}

interface Motif {
  motif_id: string;
  rank?: number;
  width?: number;
  consensus?: string;
  nsites?: number;
  pvalue?: number | string;
  evalue?: number | string;
  information_content?: number;
  description?: string;
  logo_data?: LogoPosition[];
}

interface MotifCardProps {
  motif: Motif;
  index: number;
}

interface MotifExampleMetadata {
  name?: string;
  description?: string;
  expected_result?: string;
}

interface MotifResult {
  motifs?: Motif[];
  distribution?: MotifDistribution;
  example_metadata?: MotifExampleMetadata;
  method?: string;
  n_motifs_found?: number;
  n_sequences?: number;
  errors?: string[];
}

type MotifTab = "motifs" | "heatmap";

type ParsedSequences = Record<string, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Sequence Logo component
// ─────────────────────────────────────────────────────────────────────────────

function SequenceLogo({
  logoData,
  width = 320,
}: SequenceLogoProps) {
  if (!logoData?.length) return null;

  const maxIC = 4.32; // log2(20)
  const colW = Math.max(width / logoData.length, 8);
  const height = 60;
  const svgWidth = Math.min(width, logoData.length * colW);

  return (
    <svg
      width={svgWidth}
      height={height + 20}
      style={{ fontFamily: "monospace" }}
      role="img"
      aria-label="Protein motif sequence logo"
    >
      {logoData.map((position, positionIndex) => {
        let yOffset = height;

        const sortedLetters = [...(position.letters ?? [])].sort(
          (a, b) => a.height - b.height
        );

        return (
          <g
            key={`${position.position}-${positionIndex}`}
            transform={`translate(${positionIndex * colW}, 0)`}
          >
            {sortedLetters.map((letter) => {
              const letterHeight = (letter.height / maxIC) * height;
              yOffset -= letterHeight;

              return (
                <text
                  key={`${positionIndex}-${letter.aa}`}
                  x={colW / 2}
                  y={yOffset + letterHeight}
                  textAnchor="middle"
                  fontSize={Math.max(letterHeight * 0.9, 4)}
                  fill={getAAColor(letter.aa)}
                  style={{
                    transformOrigin: `${colW / 2}px ${
                      yOffset + letterHeight
                    }px`,
                  }}
                >
                  {letter.aa}
                </text>
              );
            })}

            <text
              x={colW / 2}
              y={height + 14}
              textAnchor="middle"
              fontSize="7"
              fill="#aaa"
            >
              {position.position}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function getAAColor(aa: string): string {
  const colors: Record<string, string> = {
    // Hydrophobic
    A: "#f0a500",
    V: "#f0a500",
    L: "#f0a500",
    I: "#f0a500",
    P: "#f0a500",
    F: "#f0a500",
    W: "#f0a500",
    M: "#f0a500",

    // Polar
    S: "#17a589",
    T: "#17a589",
    C: "#17a589",
    Y: "#17a589",
    N: "#17a589",
    Q: "#17a589",

    // Positively charged
    K: "#2874a6",
    R: "#2874a6",
    H: "#2874a6",

    // Negatively charged
    D: "#cb4335",
    E: "#cb4335",

    // Special
    G: "#555",
    X: "#aaa",
  };

  return colors[aa.toUpperCase()] ?? "#888";
}

// ─────────────────────────────────────────────────────────────────────────────
// Motif distribution heatmap
// ─────────────────────────────────────────────────────────────────────────────

function MotifHeatmap({ distribution }: MotifHeatmapProps) {
  if (!distribution?.heatmap?.length) return null;

  const heatmap = distribution.heatmap;
  const motifIds = distribution.motif_ids ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-32 px-2 py-1 text-left font-medium text-gray-500">
              Sequence
            </th>

            {motifIds.map((motifId, index) => (
              <th
                key={`${motifId}-${index}`}
                className="px-1 py-1 text-center"
                style={{ minWidth: 32 }}
              >
                <div
                  className="mx-auto h-4 w-6 rounded"
                  style={{
                    backgroundColor:
                      MOTIF_COLORS[index % MOTIF_COLORS.length],
                  }}
                  title={motifId}
                />
                <div className="mt-0.5 text-xs text-gray-400">
                  {index + 1}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {heatmap.map((row, rowIndex) => (
            <tr
              key={`${row.seq_id}-${rowIndex}`}
              className="hover:bg-gray-50"
            >
              <td className="whitespace-nowrap px-2 py-1 font-mono text-gray-700">
                {row.seq_id}
              </td>

              {row.presence.map((present, index) => {
                const isPresent = Boolean(present);
                const motifColor =
                  MOTIF_COLORS[index % MOTIF_COLORS.length];

                return (
                  <td
                    key={`${row.seq_id}-${index}`}
                    className="px-1 py-1 text-center"
                  >
                    <div
                      className="mx-auto h-4 w-6 rounded border"
                      style={{
                        backgroundColor: isPresent
                          ? motifColor
                          : "#f3f4f6",
                        borderColor: isPresent
                          ? motifColor
                          : "#e5e7eb",
                        opacity: isPresent ? 0.9 : 1,
                      }}
                      title={
                        isPresent
                          ? `Motif ${index + 1} present`
                          : `Motif ${index + 1} absent`
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Motif card
// ─────────────────────────────────────────────────────────────────────────────

function MotifCard({ motif, index }: MotifCardProps) {
  const [showLogo, setShowLogo] = useState(false);
  const color = MOTIF_COLORS[index % MOTIF_COLORS.length];

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900">
            {motif.motif_id}
          </div>

          <div className="text-xs text-gray-500">
            Width {motif.width ?? "—"} · {motif.nsites ?? "—"} sites ·
            E-value{" "}
            {typeof motif.evalue === "number"
              ? motif.evalue.toExponential(2)
              : motif.evalue ?? "—"}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs text-gray-400">IC</div>
          <div className="text-sm font-bold text-gray-700">
            {typeof motif.information_content === "number"
              ? motif.information_content.toFixed(1)
              : "—"}
          </div>
        </div>
      </div>

      {/* Consensus */}
      <div className="overflow-x-auto border-b border-gray-100 bg-gray-50 px-4 py-2 font-mono text-xs tracking-widest text-gray-800">
        {motif.consensus || "—"}
      </div>

      {motif.description && (
        <div className="px-4 py-2 text-xs text-gray-500">
          {motif.description}
        </div>
      )}

      {/* Toggle logo */}
      <div className="px-4 py-2">
        <button
          type="button"
          onClick={() => setShowLogo((current) => !current)}
          className="text-xs text-brand-600 hover:text-brand-800"
        >
          {showLogo ? "Hide" : "Show"} sequence logo
        </button>

        {showLogo && !!motif.logo_data?.length && (
          <div className="mt-2 overflow-x-auto">
            <SequenceLogo logoData={motif.logo_data} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FASTA parser
// ─────────────────────────────────────────────────────────────────────────────

function parseMultiFasta(text: string): ParsedSequences {
  const sequences: ParsedSequences = {};
  let currentId: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) continue;

    if (line.startsWith(">")) {
      const header = line.slice(1).trim();
      const sequenceId = header.split(/\s+/)[0];

      if (!sequenceId) {
        currentId = null;
        continue;
      }

      currentId = sequenceId;
      sequences[currentId] = "";
      continue;
    }

    if (currentId) {
      sequences[currentId] += line.replace(/\s+/g, "");
    }
  }

  return sequences;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function MotifPage() {
  const [fastaInput, setFastaInput] = useState("");
  const [nmotifs, setNmotifs] = useState(10);
  const [minWidth, setMinWidth] = useState(6);
  const [maxWidth, setMaxWidth] = useState(50);
  const [useMemeApi, setUseMemeApi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MotifResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<MotifTab>("motifs");

  async function runExample() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = (await fetchJson(
        `${API}/motif/example`
      )) as MotifResult;

      setResult(data);
      setActiveTab("motifs");
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to run the motif example."
      );
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    const sequences = parseMultiFasta(fastaInput);

    if (Object.keys(sequences).length < 2) {
      setError("Paste at least 2 sequences in FASTA format.");
      return;
    }

    if (minWidth > maxWidth) {
      setError("Minimum motif width cannot be greater than maximum motif width.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = (await fetchJson(`${API}/motif`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sequences,
          nmotifs,
          min_width: minWidth,
          max_width: maxWidth,
          use_meme_api: useMemeApi,
          mod: "zoops",
        }),
      })) as MotifResult;

      setResult(data);
      setActiveTab("motifs");
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to complete motif analysis."
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadMotifTsv() {
    const motifs = result?.motifs;
    if (!motifs?.length) return;

    const headers = [
      "Motif ID",
      "Rank",
      "Width",
      "Consensus",
      "Sites",
      "P-value",
      "E-value",
      "IC (bits)",
    ];

    const rows = motifs.map((motif) => [
      motif.motif_id,
      motif.rank ?? "",
      motif.width ?? "",
      motif.consensus ?? "",
      motif.nsites ?? "",
      motif.pvalue ?? "",
      motif.evalue ?? "",
      motif.information_content ?? "",
    ]);

    const tsv = [headers, ...rows]
      .map((row) => row.join("\t"))
      .join("\n");

    const blob = new Blob([tsv], {
      type: "text/tab-separated-values;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "motifs.tsv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  const parsedCount = fastaInput
    ? Object.keys(parseMultiFasta(fastaInput)).length
    : 0;

  const motifs = result?.motifs ?? [];
  const resultErrors = result?.errors ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">
              Conserved Motif Analysis
            </h1>
          </div>

          <p className="text-sm text-gray-500">
            Local k-mer motif finder · Sequence logos · Motif distribution
            heatmap · Following the approach of Dokka et al. 2024
            (Gene 914, 148417)
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* Example */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                Built-in Example
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                8 real dirigent (DIR) protein sequences from UniProt,
                across Arabidopsis, Sinopodophyllum, and pea. Expects to
                find the conserved "GGTGDF" motif (part of the core
                dirigent fold) present in all 8 sequences.
              </p>
            </div>

            <button
              type="button"
              onClick={runExample}
              disabled={loading}
              className="ml-4 shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? "Running..." : "Run Example →"}
            </button>
          </div>
        </div>

        {/* Input */}
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Custom Input
            </h2>

            {parsedCount > 0 && (
              <span className="text-xs font-medium text-teal-600">
                {parsedCount} sequences detected
              </span>
            )}
          </div>

          <textarea
            value={fastaInput}
            onChange={(e) => setFastaInput(e.target.value)}
            placeholder={`>Protein_1
MAAFILFLLASVAVAAPAAQVIDDPLT...
>Protein_2
MAVFILFLLASVAVAAPAAQ...`}
            className="h-40 w-full resize-none rounded-lg border border-gray-200 p-3 font-mono text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
          />

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Number of motifs
              </label>

              <input
                type="number"
                value={nmotifs}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10);
                  setNmotifs(Number.isNaN(value) ? 1 : value);
                }}
                min={1}
                max={20}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Min width (aa)
              </label>

              <input
                type="number"
                value={minWidth}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10);
                  setMinWidth(Number.isNaN(value) ? 4 : value);
                }}
                min={4}
                max={20}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Max width (aa)
              </label>

              <input
                type="number"
                value={maxWidth}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10);
                  setMaxWidth(Number.isNaN(value) ? 10 : value);
                }}
                min={10}
                max={300}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={useMemeApi}
                  onChange={(e) => setUseMemeApi(e.target.checked)}
                  className="accent-teal-600"
                />
                Use MEME API
                <span className="text-xs text-gray-400">
                  (slower, more accurate)
                </span>
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading || parsedCount < 2}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 font-semibold text-white transition-colors hover:bg-teal-700 disabled:bg-gray-300"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {useMemeApi
                  ? "Submitting to MEME Suite..."
                  : "Running local motif finder..."}
              </>
            ) : (
              "Find Conserved Motifs"
            )}
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
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
                <div className="text-sm font-semibold text-teal-800">
                  {result.example_metadata.name ?? "Example"}
                </div>

                {result.example_metadata.description && (
                  <div className="mt-1 text-xs text-teal-700">
                    {result.example_metadata.description}
                  </div>
                )}

                {result.example_metadata.expected_result && (
                  <div className="mt-2 rounded border border-teal-100 bg-white p-2 text-xs text-gray-600">
                    <span className="font-medium">Expected: </span>
                    {result.example_metadata.expected_result}
                  </div>
                )}
              </div>
            )}

            {/* Method badge + stats */}
            <div className="flex flex-wrap items-center gap-4">
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  result.method === "meme_api"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {result.method === "meme_api"
                  ? "✓ MEME Suite API"
                  : "⚡ Local k-mer finder"}
              </span>

              <span className="text-sm text-gray-600">
                <b>{result.n_motifs_found ?? motifs.length}</b> motifs found
                in <b>{result.n_sequences ?? parsedCount}</b> sequences
              </span>

              <button
                type="button"
                onClick={downloadMotifTsv}
                disabled={!motifs.length}
                className="ml-auto rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ↓ Download TSV
              </button>
            </div>

            {/* Backend errors */}
            {resultErrors.length > 0 && (
              <div className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
                {resultErrors.map((message, index) => (
                  <div key={`${message}-${index}`}>⚠ {message}</div>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex border-b border-gray-200 px-5">
                {(["motifs", "heatmap"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "border-teal-600 text-teal-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab === "motifs"
                      ? "Motif Cards"
                      : "Distribution Heatmap"}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {activeTab === "motifs" && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {motifs.map((motif, index) => (
                      <MotifCard
                        key={`${motif.motif_id}-${index}`}
                        motif={motif}
                        index={index}
                      />
                    ))}

                    {!motifs.length && (
                      <div className="col-span-3 py-8 text-center text-gray-400">
                        No motifs found. Try relaxing the E-value or reducing
                        min_width.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "heatmap" && (
                  <div>
                    <p className="mb-4 text-xs text-gray-500">
                      Each row = sequence · Each column = motif · Colored =
                      motif present · Gray = absent
                    </p>

                    <MotifHeatmap distribution={result.distribution} />

                    {!result.distribution?.heatmap?.length && (
                      <div className="py-8 text-center text-gray-400">
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