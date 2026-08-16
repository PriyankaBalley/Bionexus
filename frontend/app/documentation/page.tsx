import Link from "next/link";

/* ── Content ──────────────────────────────────────────────────────────────
   User manual: what BioNexus is and how to use each tool. Kept in sync
   with what each tool's own page actually does — no claims here that
   the tool doesn't back up.
   ────────────────────────────────────────────────────────────────────── */

const TOC = [
  ["#overview", "Overview"],
  ["#inputs", "Input formats"],
  ["#jobs", "Jobs, downloads and chaining tools"],
  ["#gene-family", "1. Gene family identification"],
  ["#gsds", "2. Gene structure display"],
  ["#motif", "3. Conserved motif analysis"],
  ["#orf", "4. ORF prediction"],
  ["#phylogeny", "5. Phylogeny"],
  ["#promoter", "6. Promoter analysis"],
  ["#properties", "7. Protein properties"],
  ["#secstruct", "8. Secondary structure prediction"],
  ["#transmembrane", "9. Transmembrane & signal peptide prediction"],
  ["#localization", "10. Subcellular localization"],
  ["#sgrna", "11. sgRNA design"],
  ["#cloning", "12. Cloning design"],
];

interface ManualEntry {
  id: string; num: string; title: string; href: string;
  purpose: string;
  input: string;
  steps: string[];
  output: string;
  notes?: string;
}

const MANUAL: ManualEntry[] = [
  {
    id: "gene-family", num: "01", title: "Gene family identification", href: "/gene-family",
    purpose: "Find homologs of a query protein across a proteome, using profile hidden Markov "
      + "model search rather than simple sequence similarity, then annotate each hit with its "
      + "domain composition and basic physicochemical properties.",
    input: "A single protein sequence, pasted as plain single-letter amino acid code (no FASTA header needed).",
    steps: [
      "Paste a protein sequence, or click one of the two provided examples (a dirigent protein and a NAC001 transcription factor, both from Arabidopsis thaliana) to see real output first.",
      "Choose the search database, the maximum number of hits to return, and the E-value threshold — lower thresholds are stricter and return fewer, more confident matches.",
      "Optionally add an NCBI keyword to narrow the search further.",
      "Submit. The search runs against pHMMER via the EBI Job Dispatcher, then each hit is annotated with domain information from InterProScan and physicochemical data from UniProt — this can take from several seconds to a couple of minutes depending on the database size.",
    ],
    output: "A ranked hit table (accession, description, E-value, bit score), summary statistics "
      + "(average length, average molecular weight, pI distribution, signal-peptide count), and a "
      + "downloadable results file.",
  },
  {
    id: "gsds", num: "02", title: "Gene structure display", href: "/gsds",
    purpose: "Draw the exon/intron layout of a set of genes to a common coordinate axis, so "
      + "structural differences across a gene family are easy to compare at a glance.",
    input: "One or more gene records, each needing a CDS sequence and a genomic sequence "
      + "(or annotation coordinates) so exon boundaries can be computed.",
    steps: [
      "Add one gene at a time using the input form, or load the provided example set.",
      "Provide the CDS and genomic sequence (or paste coordinates directly) for each gene you want compared.",
      "Submit once all genes are added — structure is computed locally from the sequence pair, not via an external service, so this returns immediately.",
    ],
    output: "A scaled diagram with one row per gene, exons and introns drawn to the same axis, "
      + "plus a summary of gene count, single-exon vs. multi-exon genes, and a downloadable rendering.",
  },
  {
    id: "motif", num: "03", title: "Conserved motif analysis", href: "/motif",
    purpose: "Identify short motifs shared across a set of related sequences and show where "
      + "each one occurs, with a consensus sequence logo per motif.",
    input: "Multiple related protein sequences (FASTA).",
    steps: [
      "Paste multiple related sequences in FASTA format, or load the example set.",
      "Set the number of motifs to search for and their expected width.",
      "Submit — motif discovery runs locally.",
    ],
    output: "Each motif's consensus sequence logo, its position within every input sequence, and "
      + "a distribution diagram showing which sequences contain which motifs.",
  },
  {
    id: "orf", num: "04", title: "ORF prediction", href: "/orf-prediction",
    purpose: "Scan a nucleotide sequence in all 6 reading frames for open reading frames, "
      + "following the same convention as NCBI's ORFfinder and EMBOSS's getorf.",
    input: "One or more nucleotide sequences — FASTA (single or multi-record), a CSV/TSV with a "
      + "sequence column, or one plain sequence per line. Format is detected automatically.",
    steps: [
      "Paste or upload nucleotide sequence(s), or click \"Load example\" to use the real AT1G01010 coding sequence.",
      "Set the minimum ORF length in amino acids, and whether an ATG start codon is required.",
      "Submit. The scan is entirely local, so this returns in well under a second even for long sequences.",
    ],
    output: "Every ORF found, in every frame, ranked by length — strand, frame, nucleotide "
      + "coordinates and the translated protein — alongside a positional map figure (downloadable "
      + "as PNG/SVG/PDF) showing all six frames at once, plus CSV and FASTA downloads of the "
      + "predicted proteins.",
  },
  {
    id: "phylogeny", num: "05", title: "Phylogeny", href: "/phylogeny",
    purpose: "Align a set of sequences and build a neighbour-joining tree from that alignment.",
    input: "3 or more related sequences (protein or nucleotide), FASTA or plain text.",
    steps: [
      "Paste at least 3 sequences, or load the example set (four real Arabidopsis NAC transcription factor family members).",
      "Submit. This queries live EBI web services in two steps — Clustal Omega for the alignment, then Simple Phylogeny for the tree — and can take anywhere from under a minute to several minutes depending on EBI's queue.",
    ],
    output: "A rendered phylogenetic tree figure (downloadable as PNG/SVG/PDF), the raw Newick "
      + "tree text, and the underlying multiple sequence alignment.",
    notes: "Because this depends on a live external queue, a run can occasionally take much "
      + "longer than usual if EBI's service is under heavy load.",
  },
  {
    id: "promoter", num: "06", title: "Promoter analysis", href: "/promoter",
    purpose: "Scan a promoter sequence for cis-regulatory elements and predicted transcription "
      + "factor binding sites, and draw the results as a positional map.",
    input: "One or more promoter sequences (FASTA), or the output of a prior sequence retrieval job.",
    steps: [
      "Paste a promoter sequence, or load the example (a real 1000 bp AT1G01010 upstream region), or paste a retrieval job's ID to reuse its output directly.",
      "Choose which sources to scan: a local curated cis-element library, and/or live PlantPAN.",
      "Set the minimum match score for the local library, and — independently — the minimum similarity score for PlantPAN hits, since PlantPAN can otherwise return hundreds of low-confidence sites.",
      "Submit. The local scan returns immediately; PlantPAN, being a live per-sequence query, can take 30–120+ seconds.",
    ],
    output: "Every cis-element/TFBS hit (name, position, strand, score, source), a positional "
      + "cis-element map per sequence rendered inline (interactive HTML plus static PNG/SVG/PDF), "
      + "and CSV/JSON downloads.",
  },
  {
    id: "properties", num: "07", title: "Protein properties", href: "/protein-properties",
    purpose: "Compute the standard physicochemical property profile of a protein — the same "
      + "14 property groups ExPASy's own ProtParam reports.",
    input: "One or more protein sequences — FASTA, CSV/TSV with a sequence column, or one "
      + "sequence per line.",
    steps: [
      "Paste or upload sequence(s), or load the example.",
      "Submit. Each sequence is sent to the live ExPASy ProtParam service in turn.",
    ],
    output: "Molecular weight, theoretical pI, full amino acid composition, net charge, atomic "
      + "composition and formula, extinction coefficient(s) — two values if the sequence contains "
      + "cysteine — estimated half-life across three organisms, instability index with a "
      + "stable/unstable call, aliphatic index and GRAVY, shown per sequence, plus CSV/JSON downloads.",
  },
  {
    id: "secstruct", num: "08", title: "Secondary structure prediction", href: "/secondary-structure",
    purpose: "Predict a per-residue Helix / Sheet / Turn / Coil assignment using GOR I "
      + "(Garnier, Osguthorpe & Robson, 1978) — the original single-residue directional-"
      + "information method, not GOR III or IV, which use a different and much larger "
      + "pairwise-residue parameter set.",
    input: "One or more protein sequences — FASTA, CSV/TSV, or plain sequence(s).",
    steps: [
      "Paste or upload sequence(s), or load the example.",
      "Submit. Prediction is entirely local and returns quickly.",
    ],
    output: "A colour-coded per-residue track in the browser, plus a downloadable "
      + "publication-quality figure (PNG/SVG/PDF) showing the same assignment with a legend and "
      + "helix/sheet/turn/coil percentages, and CSV/JSON downloads of the raw per-residue calls.",
    notes: "Treat this as a starting hypothesis. It is a 1978-era classical method, meaningfully "
      + "less accurate than modern deep-learning structure predictors.",
  },
  {
    id: "transmembrane", num: "09", title: "Transmembrane & signal peptide prediction", href: "/transmembrane",
    purpose: "Predict transmembrane helix topology and signal peptides together, using EBI's "
      + "Phobius.",
    input: "One or more protein sequences — FASTA, CSV/TSV, or plain sequence(s).",
    steps: [
      "Paste or upload sequence(s), or load the example (bacteriorhodopsin, a real 7-transmembrane-helix protein).",
      "Submit. This queries live EBI Phobius and can take anywhere from under a minute to several minutes depending on their queue.",
    ],
    output: "A topology diagram per sequence — transmembrane helices and any signal peptide "
      + "drawn along the sequence, downloadable as PNG/SVG/PDF — plus the transmembrane helix "
      + "count and signal-peptide call in a summary table.",
    notes: "When Phobius's exact per-residue boundaries aren't available, the diagram falls back "
      + "to an evenly-spaced schematic and says so explicitly in its own caption, rather than "
      + "implying precision it doesn't have.",
  },
  {
    id: "localization", num: "10", title: "Subcellular localization", href: "/localization",
    purpose: "Predict where a protein is likely to be targeted, combining DTU's TargetP-2.0 "
      + "(N-terminal signal peptide / mitochondrial transfer peptide / chloroplast transfer "
      + "peptide prediction) with an independent cross-check from WoLF PSORT.",
    input: "One or more protein sequences — FASTA, CSV/TSV, or plain sequence(s).",
    steps: [
      "Paste or upload sequence(s), or load the example (a real Arabidopsis Rubisco small subunit, a genuinely chloroplast-targeted protein).",
      "Submit. Sequences are queried as plant organism against both live services and can take a minute or more.",
    ],
    output: "TargetP's call with its full likelihood breakdown across all target classes and the "
      + "predicted cleavage site if any, shown alongside WoLF PSORT's independent call, per sequence.",
    notes: "WoLF PSORT's own processing backend has been intermittently slow. If its result is "
      + "missing for a sequence, TargetP's call is still shown rather than the whole job failing.",
  },
  {
    id: "sgrna", num: "11", title: "sgRNA design", href: "/sgrna",
    purpose: "Design and rank CRISPR guides for a target sequence, combining several published "
      + "efficiency models with an off-target search and guide secondary structure.",
    input: "One or more target sequences (FASTA), or a prior retrieval job's output.",
    steps: [
      "Paste target sequence(s), or load the example (the real AT1G01010 coding sequence), or reuse a retrieval job's ID.",
      "Choose the PAM matching your nuclease (NGG for SpCas9, TTTV for Cas12a, and others), guide length, and the mode — knockout, CRISPRi or CRISPRa — which shifts which part of the target is favoured.",
      "Set the maximum off-target mismatches to tolerate and how many top guides to return, and optionally name a genome for a wider off-target scan.",
      "Submit and review the ranked guide table.",
    ],
    output: "Every candidate guide with its PAM, position, strand, GC content, efficiency scores "
      + "from multiple published models, off-target count, predicted secondary structure with a "
      + "folding diagram, and a composite rank — plus a genome-track view, a multiplex guide "
      + "picker, and downloadable CSV/XLSX/PDF reports.",
  },
  {
    id: "cloning", num: "12", title: "Cloning design", href: "/cloning",
    purpose: "Turn a designed guide or any insert sequence into an ordering-ready construct, "
      + "for four different cloning strategies.",
    input: "One insert sequence, plus a chosen cloning strategy.",
    steps: [
      "Paste an insert sequence, or load one of the four provided examples (one per strategy, all real sequences).",
      "Choose a strategy: Golden Gate/MoClo, Gibson Assembly, restriction–ligation, or Gateway recombination, then set that strategy's parameters (enzyme, fusion sites, overlap length, vector, and so on).",
      "Submit. Design is computed locally and returns immediately.",
    ],
    output: "Primers or oligos with melting temperature and GC content, any internal restriction "
      + "site conflicts flagged, a construct map, step-by-step protocol notes, and downloadable "
      + "GenBank and FASTA records — the GenBank file carries full feature annotations and opens "
      + "directly in SnapGene, Benchling or ApE.",
  },
];

function Heading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-24 mb-6">
      <div className="text-xs font-medium uppercase tracking-widest text-brand-700">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{title}</h2>
    </div>
  );
}

export default function DocumentationPage() {
  return (
    <div className="mx-auto max-w-5xl">

      {/* Header */}
      <section className="border-b border-zinc-200 pb-10 pt-2">
        <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          User manual
        </div>
        <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900">
          Documentation
        </h1>
        <p className="mt-4 max-w-3xl text-zinc-600 leading-relaxed">
          What BioNexus is, how the workflow fits together, and exactly how to use each of its
          twelve tools — what input each one expects, what happens when you submit, and what
          you get back.
        </p>
      </section>

      {/* TOC */}
      <nav className="border-b border-zinc-200 py-6 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        {TOC.map(([href, label]) => (
          <a key={href} href={href} className="text-zinc-600 hover:text-brand-700">{label}</a>
        ))}
      </nav>

      {/* Overview */}
      <section className="py-14">
        <Heading id="overview" eyebrow="Overview" title="What BioNexus is" />
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-6 text-zinc-700 leading-relaxed">
          <p>
            BioNexus is an open-source platform for plant promoter analysis, gene family
            characterisation, and CRISPR guide design. It links twelve tools that together cover
            a typical experimental path — from identifying a gene family and studying its
            structure and regulation, through to designing and preparing a CRISPR construct for
            that gene — into one workflow, so results move from one tool to the next without
            manual reformatting.
          </p>
          <p>
            Every tool runs a published algorithm or queries a named public database; none of
            them introduce a new scoring method of their own. Where a tool queries a live
            external service, that is stated on its own page and in this manual, so it's always
            clear whether a result came from a real-time query or a local computation.
          </p>
        </div>
      </section>

      {/* Input formats */}
      <section className="py-14 border-t border-zinc-200">
        <Heading id="inputs" eyebrow="Conventions" title="Input formats" />
        <div className="text-zinc-700 leading-relaxed space-y-4 max-w-3xl">
          <p>
            Most tools accept sequence input in more than one shape, detected automatically:
            FASTA (single or multi-record), a CSV or TSV file with a recognisable sequence
            column (and optionally an id column), or plain sequence text with one sequence per
            line. You can either paste text directly or upload a file — both go through the same
            parser.
          </p>
          <p>
            Repeated FASTA headers are made unique automatically by appending{" "}
            <code className="font-mono text-sm bg-zinc-100 px-1 rounded">__2</code>,{" "}
            <code className="font-mono text-sm bg-zinc-100 px-1 rounded">__3</code> and so on, so
            a multi-transcript file with the same gene name more than once won't silently
            overwrite results.
          </p>
        </div>
      </section>

      {/* Jobs */}
      <section className="py-14 border-t border-zinc-200">
        <Heading id="jobs" eyebrow="Conventions" title="Jobs, downloads and chaining tools" />
        <div className="text-zinc-700 leading-relaxed space-y-4 max-w-3xl">
          <p>
            Submitting a run returns a job identifier immediately rather than blocking the page —
            longer analyses are queued and the page updates on its own as the job progresses, so
            you can leave the tab open or come back to it later. Nothing is installed locally and
            no account is required.
          </p>
          <p>
            Every finished job keeps its output files on the server, downloadable individually
            (CSV, JSON, XLSX, GenBank, FASTA, PDF, PNG, SVG, or interactive HTML depending on the
            tool). Several tools also accept a prior job's identifier directly — pasting a
            retrieval job's ID into promoter analysis or sgRNA design, for instance, reuses that
            sequence without copying it by hand.
          </p>
        </div>
      </section>

      {/* Per-tool manual */}
      {MANUAL.map(({ id, num, title, href, purpose, input, steps, output, notes }) => (
        <section key={id} className="py-14 border-t border-zinc-200">
          <div id={id} className="scroll-mt-24 mb-6 flex items-baseline gap-4">
            <span className="font-mono text-sm text-zinc-400 tabular-nums">{num}</span>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h2>
            <Link href={href} className="text-sm font-medium text-brand-700 hover:underline ml-auto">
              Open this tool →
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">
                Purpose
              </h3>
              <p className="text-zinc-700 leading-relaxed">{purpose}</p>

              <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500 mt-6 mb-2">
                Input
              </h3>
              <p className="text-zinc-700 leading-relaxed">{input}</p>
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">
                How to use it
              </h3>
              <ol className="space-y-2">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-zinc-700 leading-relaxed">
                    <span className="font-mono text-xs text-zinc-400 pt-0.5 shrink-0">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>

              <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500 mt-6 mb-2">
                Output
              </h3>
              <p className="text-zinc-700 leading-relaxed">{output}</p>

              {notes && (
                <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {notes}
                </p>
              )}
            </div>
          </div>
        </section>
      ))}

    </div>
  );
}
