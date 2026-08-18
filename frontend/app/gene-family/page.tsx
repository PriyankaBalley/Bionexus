"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/api";

const API = "/api/gene-family";

type SearchDatabase = "swissprot" | "uniprotkb" | "pdb";

type ActiveTab = "table" | "fasta";

interface GeneFamilyForm {
  query_sequence: string;
  search_database: SearchDatabase;
  max_hits: number;
  evalue_threshold: number;
  fetch_sequences: boolean;
  run_interpro: boolean;
  ncbi_keyword: string;
  ncbi_organism: string;
}

interface GeneFamilyExample {
  label: string;
  description: string;
  query_sequence: string;
  search_database: SearchDatabase;
  max_hits: number;
  evalue_threshold: number;
  ncbi_keyword: string;
}

interface GeneFamilySummary {
  total_hits?: number;
  with_sequence?: number;
  avg_length?: number;
  avg_mw_kda?: number;
  alkaline_pi?: number;
  acidic_pi?: number;
  with_signal_peptide?: number;
  search_database?: string;
}

interface GeneFamilyMember {
  rank: number;
  accession: string;
  entry_name?: string;
  description?: string;
  organism?: string;
  length?: number;
  mw_kda?: number;
  pi?: number;
  has_signal_peptide?: boolean;
  signal_peptide_end?: number;
  n_glyc_sites?: Array<number | string>;
  score?: number | string;
  evalue?: number | string;
  source?: string;
}

interface ExampleMetadata {
  name?: string;
  description?: string;
}

interface GeneFamilyResult {
  fasta?: string;
  members?: GeneFamilyMember[];
  summary?: GeneFamilySummary;
  errors?: string[];
  example_metadata?: ExampleMetadata;
}

const EXAMPLES: Record<string, GeneFamilyExample> = {
  dirigent: {
    label: "Dirigent protein 6 (Arabidopsis thaliana)",
    description:
      "Real UniProt sequence (Q9SUQ8). Genome-wide dirigent-family identification, " +
      "following the approach of Dokka et al. 2024 (Gene 914, 148417).",
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
      "Real UniProt sequence (Q0WV96, locus AT1G01010). Identifies the genome-wide " +
      "NAC-domain transcription factor family, a common CRISPR editing target family.",
    query_sequence:
      "MEDQVGFGFRPNDEELVGHYLRNKIEGNTSRDVEVAISEVNICSYDPWNLRFQSKYKSRDAMWYFFSRRENNKGNRQSRTTVSGKWKLTGESVEVKDQWGFCSEGFRGKIGHKRVLVFLDGRYPDKTKSDWVIHEFHYDLLPEHQRTYVICRLEYKGDDADILSAYAIDPTPAFVPNMTSSAGSVVNQSRQRNSGSYNTYSEYDSANHGQQFNENSNIMQQQPLQGSFNPLLEYDFANHGGQWLSDYIDLQQQVPYLAPYENESEMIWKHVIEENFEFLVDERTSMQQHYSDHRPKKPVSGVLPDDSSDTETGSMIFEDTSSSTDSVGSSDEPGHTRIDDIPSLNIIEPLHNYKAQEQPKQQSKEKVISSQKSECEWKMAEDSIKIPPSTNTVKQSWIVLENAQWNYLKNMIIGVLLFISVISWIILVG",
    search_database: "swissprot",
    max_hits: 25,
    evalue_threshold: 0.001,
    ncbi_keyword: "",
  },
};

function PIBadge({ pi }: { pi: number }) {
<<<<<<< HEAD
  const color =
    pi > 7
      ? "bg-blue-100 text-blue-800"
      : "bg-orange-100 text-orange-800";
=======
  const color = pi > 7 ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800";
>>>>>>> 7edc4e9b (Prepare BioNexus for deployment)
  const label = pi > 7 ? "Alkaline" : "Acidic";

  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      pI {pi} · {label}
    </span>
  );
}

<<<<<<< HEAD
function SignalBadge({
  has_sp,
  end,
}: {
  has_sp: boolean;
  end?: number;
}) {
  if (!has_sp) {
    return <span className="text-xs text-gray-400">—</span>;
  }

=======
function SignalBadge({ has_sp, end }: { has_sp: boolean; end?: number }) {
  if (!has_sp) return <span className="text-gray-400 text-xs">—</span>;
>>>>>>> 7edc4e9b (Prepare BioNexus for deployment)
  return (
    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
      SP 1–{end ?? "?"}
    </span>
  );
}

<<<<<<< HEAD
function SummaryCard({ summary }: { summary?: GeneFamilySummary }) {
=======
function SummaryCard({ summary }: { summary: any }) {
>>>>>>> 7edc4e9b (Prepare BioNexus for deployment)
  if (!summary) return null;

  const items: Array<{ label: string; value: string | number | undefined }> = [
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
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-gray-200 bg-white p-3"
        >
          <div className="mb-1 text-xs text-gray-500">{item.label}</div>
          <div className="text-lg font-bold text-brand-600">
            {item.value ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GeneFamilyPage() {
  const [form, setForm] = useState<GeneFamilyForm>({
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
  const [result, setResult] = useState<GeneFamilyResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("table");
  const [exampleRunning, setExampleRunning] = useState("");

  const handleChange = <K extends keyof GeneFamilyForm>(
    key: K,
    value: GeneFamilyForm[K]
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  async function loadExample(key: string) {
    const example = EXAMPLES[key];
    if (!example) return;

    setForm((current) => ({
      ...current,
      query_sequence: example.query_sequence,
      search_database: example.search_database,
      max_hits: example.max_hits,
      evalue_threshold: example.evalue_threshold,
      ncbi_keyword: example.ncbi_keyword,
    }));
    setExampleRunning(key);
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const data = (await fetchJson(
        `${API}/identify/example/${key}`
      )) as GeneFamilyResult;

      setResult(data);
      setActiveTab("table");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
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
      const data = (await fetchJson(`${API}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })) as GeneFamilyResult;

      setResult(data);
      setActiveTab("table");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function downloadFasta() {
    if (!result?.fasta) return;

    const blob = new Blob([result.fasta], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "gene_family.fasta";
    anchor.click();

    URL.revokeObjectURL(url);
  }

  function downloadCSV() {
    const members = result?.members;
    if (!members?.length) return;

    const headers = [
      "Rank",
      "Accession",
      "Entry Name",
      "Description",
      "Organism",
      "Length (aa)",
      "MW (kDa)",
      "pI",
      "Signal Peptide",
      "SP End",
      "N-Glyc Sites",
      "Score",
      "E-value",
      "Source",
    ];

    const rows = members.map((member) => [
      member.rank,
      member.accession,
      member.entry_name ?? "",
      `"${String(member.description ?? "").replace(/"/g, '""')}"`,
      `"${String(member.organism ?? "").replace(/"/g, '""')}"`,
      member.length ?? "",
      member.mw_kda ?? "",
      member.pi ?? "",
      member.has_signal_peptide ? "Yes" : "No",
      member.signal_peptide_end ?? "",
      member.n_glyc_sites?.length ?? 0,
      member.score ?? "",
      member.evalue ?? "",
      member.source ?? "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "gene_family_members.csv";
    anchor.click();

    URL.revokeObjectURL(url);
  }

  const members = result?.members ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">
              Gene Family Identification
            </h1>
          </div>

          <p className="text-sm text-gray-500">
            Genome-wide homolog search via pHMMER · Physicochemical
            characterization · Mirrors Dokka et al. 2024 (Gene 914, 148417)
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Quick Examples
          </h2>

          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(EXAMPLES).map(([key, example]) => (
              <button
                key={key}
                type="button"
                onClick={() => loadExample(key)}
                disabled={loading}
                className="rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {example.label}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {example.description}
                    </div>
                  </div>

                  {exampleRunning === key ? (
                    <div className="ml-2 mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                  ) : (
                    <span className="ml-2 mt-0.5 shrink-0 text-xs font-medium text-brand-600">
                      Run →
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">
            Query Sequence
          </h2>

          <textarea
            value={form.query_sequence}
            onChange={(e) => handleChange("query_sequence", e.target.value)}
            placeholder="Paste protein sequence (single-letter code, no FASTA header)..."
            className="h-28 w-full resize-none rounded-lg border border-gray-200 p-3 font-mono text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Database
              </label>
              <select
                value={form.search_database}
                onChange={(e) =>
                  handleChange(
                    "search_database",
                    e.target.value as SearchDatabase
                  )
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="swissprot">SwissProt (curated)</option>
                <option value="uniprotkb">UniProtKB (all)</option>
                <option value="pdb">PDB (structures)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Max hits
              </label>
              <input
                type="number"
                value={form.max_hits}
                onChange={(e) =>
                  handleChange(
                    "max_hits",
                    Number.isNaN(Number(e.target.value))
                      ? 25
                      : Number(e.target.value)
                  )
                }
                min={5}
                max={100}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                E-value threshold
              </label>
              <select
                value={form.evalue_threshold}
                onChange={(e) =>
                  handleChange(
                    "evalue_threshold",
                    Number.parseFloat(e.target.value)
                  )
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value={1e-10}>1e-10 (strict)</option>
                <option value={1e-5}>1e-5 (default)</option>
                <option value={1e-3}>1e-3 (relaxed)</option>
                <option value={0.01}>0.01 (broad)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                NCBI keyword (opt.)
              </label>
              <input
                type="text"
                value={form.ncbi_keyword}
                onChange={(e) => handleChange("ncbi_keyword", e.target.value)}
                placeholder="e.g. dirigent protein"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.fetch_sequences}
                onChange={(e) =>
                  handleChange("fetch_sequences", e.target.checked)
                }
                className="accent-brand-600"
              />
              Fetch sequences from UniProt
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.run_interpro}
                onChange={(e) =>
                  handleChange("run_interpro", e.target.checked)
                }
                className="accent-brand-600"
              />
              InterProScan domain check{" "}
              <span className="text-xs text-gray-400">(slow)</span>
            </label>
          </div>

          <button
            type="button"
            onClick={runSearch}
            disabled={loading || !form.query_sequence.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 font-semibold text-white transition-colors hover:bg-brand-700 disabled:bg-gray-300"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Searching pHMMER...
              </>
            ) : (
              "Search Gene Family"
            )}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {result.example_metadata && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="text-sm font-semibold text-blue-800">
                  {result.example_metadata.name ?? "Example"}
                </div>
                {result.example_metadata.description && (
                  <div className="mt-1 text-xs text-blue-700">
                    {result.example_metadata.description}
                  </div>
                )}
              </div>
            )}

            {!!result.errors?.length && (
              <div className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
                {result.errors.map((message, index) => (
                  <div key={`${message}-${index}`}>⚠ {message}</div>
                ))}
              </div>
            )}

            <SummaryCard summary={result.summary} />

            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-5">
                <div className="flex gap-1">
                  {(["table", "fasta"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
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
                    type="button"
                    onClick={downloadCSV}
                    disabled={!members.length}
                    className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ↓ CSV
                  </button>

                  <button
                    type="button"
                    onClick={downloadFasta}
                    disabled={!result.fasta}
                    className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ↓ FASTA
                  </button>
                </div>
              </div>

              {activeTab === "table" && (
                <div className="overflow-x-auto">
                  {members.length ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 uppercase tracking-wide text-gray-600">
                          {[
                            "#",
                            "Accession",
                            "Description",
                            "Organism",
                            "Len (aa)",
                            "MW (kDa)",
                            "pI",
                            "Signal Peptide",
                            "N-Glyc",
                            "Score",
                            "E-value",
                          ].map((heading) => (
                            <th
                              key={heading}
                              className="whitespace-nowrap px-4 py-3 text-left font-semibold"
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-100">
                        {members.map((member) => (
                          <tr
                            key={`${member.accession}-${member.rank}`}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-4 py-2.5 text-gray-500">
                              {member.rank}
                            </td>

                            <td className="px-4 py-2.5">
                              <a
                                href={`https://www.uniprot.org/uniprot/${encodeURIComponent(
                                  member.accession
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono font-medium text-brand-600 hover:underline"
                              >
                                {member.accession}
                              </a>
                            </td>

                            <td className="max-w-xs truncate px-4 py-2.5 text-gray-700">
                              {member.description ?? "—"}
                            </td>

                            <td className="px-4 py-2.5 text-xs italic text-gray-600">
                              {member.organism ?? "—"}
                            </td>

                            <td className="px-4 py-2.5 text-center">
                              {member.length ?? "—"}
                            </td>

                            <td className="px-4 py-2.5 text-center">
                              {member.mw_kda ?? "—"}
                            </td>

                            <td className="px-4 py-2.5 text-center">
                              {typeof member.pi === "number" ? (
                                <PIBadge pi={member.pi} />
                              ) : (
                                "—"
                              )}
                            </td>

                            <td className="px-4 py-2.5 text-center">
                              <SignalBadge
                                has_sp={Boolean(member.has_signal_peptide)}
                                end={member.signal_peptide_end}
                              />
                            </td>

                            <td className="px-4 py-2.5 text-center">
                              {member.n_glyc_sites?.length ? (
                                <span className="font-medium text-purple-700">
                                  {member.n_glyc_sites.length}
                                </span>
                              ) : (
                                "0"
                              )}
                            </td>

                            <td className="px-4 py-2.5 text-center font-mono">
                              {member.score ?? "—"}
                            </td>

                            <td className="px-4 py-2.5 font-mono text-gray-600">
                              {typeof member.evalue === "number"
                                ? member.evalue.toExponential(1)
                                : member.evalue ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-sm text-gray-500">
                      No gene-family members were returned.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "fasta" && (
                <div className="p-5">
                  <pre className="max-h-96 overflow-x-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 font-mono text-xs text-gray-700">
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