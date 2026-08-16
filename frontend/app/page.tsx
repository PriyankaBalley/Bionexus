import Link from "next/link";

/* ── Content ──────────────────────────────────────────────────────────────
   Claims are limited to what the code actually does. Where a tool runs a
   local implementation rather than querying the original resource, the
   "uses" line says so instead of implying a live connection.
   ────────────────────────────────────────────────────────────────────── */

const FACTS = [
  { value: "12", label: "Analysis tools" },
  { value: "4", label: "PAM types" },
  { value: "42", label: "Cis-element motifs" },
  { value: "4", label: "Cloning strategies" },
];

const TOOLS = [
  {
    step: "01", href: "/gene-family", title: "Gene family identification",
    body: "Search a proteome for homologs of a query sequence using profile hidden Markov models, then annotate the hits with domain and physicochemical information.",
    uses: "pHMMER and InterProScan via EBI, UniProt",
  },
  {
    step: "02", href: "/gsds", title: "Gene structure display",
    body: "Draw exon and intron organisation for a set of genes from their annotation coordinates, scaled to a common axis for comparison across family members.",
    uses: "Local rendering from annotation records",
  },
  {
    step: "03", href: "/motif", title: "Conserved motif analysis",
    body: "Identify motifs shared across a set of related sequences and show their position in each sequence, with per-motif consensus and sequence logos.",
    uses: "Local implementation",
  },
  {
    step: "04", href: "/orf-prediction", title: "ORF prediction",
    body: "Scan all 6 reading frames for open reading frames and translate them, with a positional map showing every ORF found.",
    uses: "6-frame scan (NCBI ORFfinder / EMBOSS getorf convention)",
  },
  {
    step: "05", href: "/phylogeny", title: "Phylogeny",
    body: "Align a set of sequences and build a neighbour-joining tree from the alignment, rendered as a publication-quality figure.",
    uses: "EBI Clustal Omega + Simple Phylogeny (live)",
  },
  {
    step: "06", href: "/promoter", title: "Promoter analysis",
    body: "Scan promoter sequences for cis-regulatory elements and predicted transcription factor binding sites, and render the results as a positional cis-element map per sequence.",
    uses: "Curated motif library, PlantPAN (live); PNG/SVG/PDF/HTML map output",
  },
  {
    step: "07", href: "/protein-properties", title: "Protein properties",
    body: "Compute molecular weight, theoretical pI, amino acid composition, instability index, aliphatic index and GRAVY for one or more protein sequences.",
    uses: "ExPASy ProtParam (live)",
  },
  {
    step: "08", href: "/secondary-structure", title: "Secondary structure prediction",
    body: "Predict per-residue Helix / Sheet / Turn / Coil assignment from a protein sequence using single-residue directional information statistics.",
    uses: "GOR I (Garnier, Osguthorpe & Robson, 1978)",
  },
  {
    step: "09", href: "/transmembrane", title: "Transmembrane & signal peptide prediction",
    body: "Predict transmembrane helix topology and signal peptides together, rendered as a topology diagram per sequence.",
    uses: "EBI Phobius (live)",
  },
  {
    step: "10", href: "/localization", title: "Subcellular localization",
    body: "Predict N-terminal targeting peptides (signal peptide, mitochondrial or chloroplast transfer peptide) and cross-check against an independent localization classifier.",
    uses: "DTU TargetP-2.0 (live) + WoLF PSORT (live)",
  },
  {
    step: "11", href: "/sgrna", title: "sgRNA design",
    body: "Enumerate protospacers next to a chosen PAM, then rank them on predicted cutting efficiency, off-target profile and guide secondary structure for knockout, CRISPRi or CRISPRa.",
    uses: "Doench 2016, Moreno-Mateos, CRISPRater, CFD, ViennaRNA",
  },
  {
    step: "12", href: "/cloning", title: "Cloning design",
    body: "Turn a guide or insert into an ordering-ready construct: oligos and primers with melting temperature and GC content, internal restriction site conflicts flagged, and an annotated construct record.",
    uses: "Golden Gate, Gibson, restriction–ligation, Gateway",
  },
];

const GUIDE = [
  {
    n: "1", title: "Choose a starting point",
    body: "Every tool accepts a pasted sequence or an uploaded FASTA file, so you can enter the workflow at whichever step matches the stage you are at. Plain sequence and multi-FASTA input are both accepted; repeated FASTA headers are made unique by appending __2, __3 and so on.",
  },
  {
    n: "2", title: "Submit the run",
    body: "Longer analyses are queued rather than run in the browser. The page returns a job identifier immediately and updates on its own when the run finishes, so you can leave the tab open or come back later. Nothing is installed locally and no account is required.",
  },
  {
    n: "3", title: "Carry results forward",
    body: "Each finished job keeps its output files on the server. Paste a retrieval or promoter analysis job identifier into a later tool's own \"reuse job ID\" field to feed its output forward, rather than resubmitting the sequences by hand.",
  },
  {
    n: "4", title: "Set thresholds deliberately",
    body: "Promoter analysis applies two separate cut-offs: one for the local cis-element library and one for the similarity score returned by PlantPAN. Raising the PlantPAN threshold reduces the number of predicted sites and is worth doing before generating a map, since a permissive threshold can return several hundred sites for a single promoter.",
  },
  {
    n: "5", title: "Export what you need",
    body: "Results are downloadable as CSV, JSON, XLSX, GenBank, FASTA and PDF depending on the tool, and figures as PNG, SVG, PDF or interactive HTML. The GenBank records carry feature annotations and open directly in SnapGene, Benchling or ApE.",
  },
];

// APA 7th edition, verified against CrossRef (real DOIs, author lists,
// volume/issue/page numbers) rather than reformatted from memory.
const REFERENCES = [
  "Doench, J. G., Fusi, N., Sullender, M., et al. (2016). Optimized sgRNA design to maximize activity and minimize off-target effects of CRISPR-Cas9. Nature Biotechnology, 34(2), 184–191. https://doi.org/10.1038/nbt.3437",
  "Moreno-Mateos, M. A., Vejnar, C. E., Beaudoin, J.-D., Fernandez, J. P., Mis, E. K., & Khokha, M. K. (2015). CRISPRscan: Designing highly efficient sgRNAs for CRISPR-Cas9 targeting in vivo. Nature Methods, 12(10), 982–988. https://doi.org/10.1038/nmeth.3543",
  "Labuhn, M., Adams, F. F., Ng, M., et al. (2018). Refined sgRNA efficacy prediction improves large- and small-scale CRISPR-Cas9 applications. Nucleic Acids Research, 46(3), 1375–1385. https://doi.org/10.1093/nar/gkx1268",
  "Lorenz, R., Bernhart, S. H., Höner zu Siederdissen, C., Tafer, H., Flamm, C., Stadler, P. F., & Hofacker, I. L. (2011). ViennaRNA Package 2.0. Algorithms for Molecular Biology, 6, Article 26. https://doi.org/10.1186/1748-7188-6-26",
  "Bae, S., Park, J., & Kim, J.-S. (2014). Cas-OFFinder: A fast and versatile algorithm that searches for potential off-target sites of Cas9 RNA-guided endonucleases. Bioinformatics, 30(10), 1473–1475. https://doi.org/10.1093/bioinformatics/btu048",
  "Lescot, M., Déhais, P., Thijs, G., et al. (2002). PlantCARE, a database of plant cis-acting regulatory elements. Nucleic Acids Research, 30(1), 325–327. https://doi.org/10.1093/nar/30.1.325",
  "Potter, S. C., Luciani, A., Eddy, S. R., Park, Y., Lopez, R., & Finn, R. D. (2018). HMMER web server: 2018 update. Nucleic Acids Research, 46(W1), W200–W204. https://doi.org/10.1093/nar/gky448",
  "Gasteiger, E., Hoogland, C., Gattiker, A., Duvaud, S., Wilkins, M. R., Appel, R. D., & Bairoch, A. (2005). Protein identification and analysis tools on the ExPASy server. In J. M. Walker (Ed.), The proteomics protocols handbook (pp. 571–607). Humana Press. https://doi.org/10.1385/1-59259-890-0:571",
  "Garnier, J., Osguthorpe, D. J., & Robson, B. (1978). Analysis of the accuracy and implications of simple methods for predicting the secondary structure of globular proteins. Journal of Molecular Biology, 120(1), 97–120. https://doi.org/10.1016/0022-2836(78)90297-8",
  "Käll, L., Krogh, A., & Sonnhammer, E. L. L. (2004). A combined transmembrane topology and signal peptide prediction method. Journal of Molecular Biology, 338(5), 1027–1036. https://doi.org/10.1016/j.jmb.2004.03.016",
  "Sievers, F., Wilm, A., Dineen, D., et al. (2011). Fast, scalable generation of high-quality protein multiple sequence alignments using Clustal Omega. Molecular Systems Biology, 7, Article 539. https://doi.org/10.1038/msb.2011.75",
  "Saitou, N., & Nei, M. (1987). The neighbor-joining method: A new method for reconstructing phylogenetic trees. Molecular Biology and Evolution, 4(4), 406–425. https://doi.org/10.1093/oxfordjournals.molbev.a040454",
  "Almagro Armenteros, J. J., Salvatore, M., Emanuelsson, O., Winther, O., von Heijne, G., Elofsson, A., & Nielsen, H. (2019). Detecting sequence signals in targeting peptides using deep learning. Life Science Alliance, 2(5), Article e201900429. https://doi.org/10.26508/lsa.201900429",
  "Horton, P., Park, K.-J., Obayashi, T., Fujita, N., Harada, H., Adams-Collier, C. J., & Nakai, K. (2007). WoLF PSORT: Protein localization predictor. Nucleic Acids Research, 35(Suppl. 2), W585–W587. https://doi.org/10.1093/nar/gkm259",
];

const SECTIONS = [
  ["#about", "About"],
  ["#workflow", "Workflow"],
  ["#guide", "User guide"],
  ["#references", "Key references"],
  ["#team", "Developed by"],
  ["/documentation", "Documentation"],
];

const TEAM = [
  "Rupini Krishna",
  "Tushar Kanti Dutta",
  "Gurram Mallikarjun",
  "Sharan Basavappa",
  "Priyanka",
];

/* ── Page ─────────────────────────────────────────────────────────────── */

function Heading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-24 mb-8">
      <div className="text-xs font-medium uppercase tracking-widest text-brand-700">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{title}</h2>
    </div>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl">

      {/* Hero */}
      <section className="border-b border-zinc-200 pb-12 pt-6">
        <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Bioinformatics platform · v1.0
        </div>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-900">
          BioNexus
        </h1>
        <p className="lead mt-3">
          Promoter analysis, gene family characterisation and CRISPR guide design for plants.
        </p>
        <p className="mt-5 max-w-3xl text-zinc-600 leading-relaxed">
          BioNexus links twelve analysis steps — from characterising a gene family to preparing a
          cloning-ready construct — into a single workflow, so that intermediate results move
          between steps without manual reformatting. It runs published algorithms and queries
          public databases; it does not introduce scoring methods of its own.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/gene-family" className="btn btn-primary">Start an analysis</Link>
          <a href="#guide" className="btn btn-ghost border border-zinc-300">Read the user guide</a>
          <Link href="/documentation" className="btn btn-ghost border border-zinc-300">Documentation</Link>
          <a href="/docs" target="_blank" rel="noreferrer"
             className="btn btn-ghost border border-zinc-300">API documentation</a>
        </div>

        <dl className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-200 border border-zinc-200 rounded-lg overflow-hidden">
          {FACTS.map(({ value, label }) => (
            <div key={label} className="bg-white px-5 py-4">
              <dt className="text-2xl font-semibold tabular-nums text-zinc-900">{value}</dt>
              <dd className="mt-0.5 text-sm text-zinc-600">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Section nav */}
      <nav className="flex flex-wrap gap-x-6 gap-y-2 border-b border-zinc-200 py-4 text-sm">
        {SECTIONS.map(([href, label]) => (
          href.startsWith("#")
            ? <a key={href} href={href} className="text-zinc-600 hover:text-brand-700">{label}</a>
            : <Link key={href} href={href} className="text-zinc-600 hover:text-brand-700">{label}</Link>
        ))}
      </nav>

      {/* About */}
      <section className="py-14">
        <Heading id="about" eyebrow="About" title="What the platform does" />
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-6 text-zinc-700 leading-relaxed">
          <p>
            Characterising a gene family and then editing one of its members normally means moving
            between several web servers and desktop programs, each with its own input format and
            output convention. Most of the effort goes into reshaping files rather than into the
            analysis itself.
          </p>
          <p>
            BioNexus keeps that sequence of tasks in one place. Each tool writes standard output —
            FASTA, CSV, JSON, GenBank, PNG, SVG, PDF — and every run is stored as a job that can be
            reopened by its identifier, so the result of one step can be used directly as the input
            to the next.
          </p>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-14 border-t border-zinc-200">
        <Heading id="workflow" eyebrow="Workflow" title="Twelve tools, in the order they are used" />
        <p className="-mt-4 mb-8 max-w-3xl text-zinc-600 leading-relaxed">
          They follow the order of a typical experiment, but each one is independent — any tool
          can be run on its own with pasted or uploaded sequence.
        </p>

        <ol className="border-t border-zinc-200">
          {TOOLS.map(({ step, href, title, body, uses }) => (
            <li key={href} className="border-b border-zinc-200">
              <Link href={href} className="group grid sm:grid-cols-[3rem_1fr_auto] gap-x-5 gap-y-2 py-6 hover:bg-white transition-colors">
                <span className="font-mono text-sm text-zinc-400 pt-0.5 tabular-nums">{step}</span>
                <div>
                  <h3 className="font-semibold text-zinc-900 group-hover:text-brand-700">{title}</h3>
                  <p className="mt-1.5 text-zinc-600 leading-relaxed max-w-2xl">{body}</p>
                  <p className="mt-2 text-sm text-zinc-500">{uses}</p>
                </div>
                <span className="text-sm text-zinc-400 group-hover:text-brand-700 sm:pt-0.5 whitespace-nowrap">
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* User guide */}
      <section className="py-14 border-t border-zinc-200">
        <Heading id="guide" eyebrow="User guide" title="How to run an analysis" />
        <ol className="space-y-7">
          {GUIDE.map(({ n, title, body }) => (
            <li key={n} className="grid sm:grid-cols-[2rem_1fr] gap-x-5">
              <span className="font-mono text-sm text-zinc-400 pt-1 tabular-nums">{n}</span>
              <div>
                <h3 className="font-semibold text-zinc-900">{title}</h3>
                <p className="mt-1.5 text-zinc-700 leading-relaxed max-w-3xl">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-lg border border-zinc-200 bg-white p-6">
          <h3 className="font-semibold text-zinc-900">A worked example</h3>
          <p className="mt-2 text-zinc-700 leading-relaxed max-w-3xl">
            To go from a coding sequence to an ordering-ready guide construct: paste the sequence
            into sgRNA design and choose the PAM matching your nuclease, review the ranked table and
            pick a guide with high predicted efficiency and no off-targets found, then paste that
            guide into Cloning design and select Golden Gate with the fusion sites of your vector.
            It returns the annealed oligo pair to order, together with an annotated
            construct record.
          </p>
        </div>
      </section>

      {/* Key references */}
      <section className="py-14 border-t border-zinc-200">
        <Heading id="references" eyebrow="Key references" title="Methods implemented in this platform" />

        <div className="mb-10 rounded-lg border border-zinc-200 bg-white p-6">
          <h3 className="font-semibold text-zinc-900">How to cite</h3>
          <p className="mt-2 text-zinc-700 leading-relaxed">
            If you use BioNexus in published work, please cite it as:
          </p>
          <p className="mt-3 text-zinc-900">
            Katakam Rupini Krishna <span className="italic">et al.</span>, 2026. BioNexus.
          </p>
        </div>

        <p className="mb-4 max-w-3xl text-zinc-600 leading-relaxed">
          The scoring models and resources the platform builds on are listed below, in APA
          format, for reference.
        </p>
        <details className="group rounded-lg border border-zinc-200 bg-white">
          <summary className="cursor-pointer select-none list-none px-4 py-3 text-sm font-medium
                              text-zinc-700 hover:text-brand-700 flex items-center justify-between">
            <span>References ({REFERENCES.length})</span>
            <span className="text-zinc-400 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <ol className="space-y-3 text-sm text-zinc-600 leading-relaxed px-4 pb-4 pt-1 border-t border-zinc-100">
            {REFERENCES.map((r, i) => (
              <li key={i} className="grid grid-cols-[2rem_1fr] gap-x-3">
                <span className="font-mono text-zinc-400 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </details>
      </section>

      {/* Developed by */}
      <section className="py-14 border-t border-zinc-200">
        <Heading id="team" eyebrow="Developed by" title="Team" />
        <ol className="flex flex-wrap gap-x-10 gap-y-3">
          {TEAM.map((name, i) => (
            <li key={name} className="flex items-baseline gap-2.5">
              <span className="font-mono text-sm text-zinc-400 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-medium text-zinc-900">{name}</span>
            </li>
          ))}
        </ol>
      </section>

    </div>
  );
}
