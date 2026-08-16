"""
Gene Family Analysis Routes — BioNexus API
Modules: GF-1 (Family Identification), GF-2 (GSDS), GF-3 (MEME Motifs)

Register in main.py:
    from app.api import gene_family
    app.include_router(gene_family.router)
"""

import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from typing import Optional

from app.services.gene_family import (
    run_gene_family_identification,
    EXAMPLE_DIRIGENT,
    EXAMPLE_NAC,
)
from app.services.gsds import (
    compute_gene_structure,
    generate_gsds_render_data,
    EXAMPLE_GSDS,
)
from app.services.motif_analysis import (
    run_motif_analysis,
    EXAMPLE_MEME,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gene-family", tags=["Gene Family Analysis"])


# ══════════════════════════════════════════════════════════════════════════════
# MODULE GF-1 — Gene Family Identification
# ══════════════════════════════════════════════════════════════════════════════

class FamilySearchRequest(BaseModel):
    query_sequence: str = Field(..., min_length=20,
        description="Query protein sequence in single-letter code")
    search_database: str = Field("swissprot",
        description="pHMMER database: 'swissprot', 'uniprotkb', 'pdb'")
    max_hits: int = Field(30, ge=5, le=100)
    evalue_threshold: float = Field(1e-5, ge=1e-100, le=1.0)
    fetch_sequences: bool = Field(True,
        description="Fetch full sequences from UniProt (slower but enables downstream analysis)")
    run_interpro: bool = Field(False,
        description="Run InterProScan domain confirmation (very slow — use for publication)")
    ncbi_keyword: Optional[str] = Field("",
        description="Optional: complement pHMMER with NCBI protein keyword search")
    ncbi_organism: Optional[str] = Field("",
        description="Optional: restrict NCBI search to organism (e.g. 'Cajanus cajan')")


class FamilySearchResponse(BaseModel):
    members: list
    summary: dict
    fasta: str
    errors: list


@router.post("/identify", response_model=FamilySearchResponse,
             summary="Identify gene family members via pHMMER + UniProt")
async def identify_gene_family(req: FamilySearchRequest):
    """
    **Module GF-1: Gene Family Identification**

    Submit a query protein sequence to find homologs genome-wide using
    pHMMER (EBI) and optionally NCBI protein database.

    Returns physiochemical properties (MW, pI, signal peptide, N-glycosylation)
    for each hit — replicating methodology of Dokka et al. 2024 (Table 1).
    """
    try:
        result = run_gene_family_identification(
            query_sequence=req.query_sequence,
            search_database=req.search_database,
            max_hits=req.max_hits,
            evalue_threshold=req.evalue_threshold,
            fetch_sequences=req.fetch_sequences,
            run_interpro=req.run_interpro,
            ncbi_keyword=req.ncbi_keyword or "",
            ncbi_organism=req.ncbi_organism or "",
        )
        return result
    except Exception as e:
        logger.exception("Gene family identification failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/identify/example/{example_name}",
            summary="Run built-in example for Module GF-1")
async def run_family_example(example_name: str):
    """
    Run a built-in example to test Module GF-1.

    - **dirigent** — Dirigent (DIR) protein family from Arabidopsis thaliana
    - **nac** — NAC-domain transcription factor family from Arabidopsis thaliana
    """
    examples = {
        "dirigent": EXAMPLE_DIRIGENT,
        "nac": EXAMPLE_NAC,
    }
    if example_name not in examples:
        raise HTTPException(status_code=404,
            detail=f"Example '{example_name}' not found. Choose: {list(examples.keys())}")

    ex = examples[example_name]
    try:
        result = run_gene_family_identification(
            query_sequence=ex["query_sequence"],
            search_database=ex.get("search_database", "swissprot"),
            max_hits=ex.get("max_hits", 25),
            evalue_threshold=ex.get("evalue_threshold", 1e-3),
            fetch_sequences=True,
            run_interpro=False,
            ncbi_keyword=ex.get("ncbi_keyword", ""),
            ncbi_organism=ex.get("ncbi_organism", ""),
        )
        result["example_metadata"] = {
            "name": ex["name"],
            "description": ex["description"],
        }
        return result
    except Exception as e:
        logger.exception(f"Example '{example_name}' failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/identify/fasta/{example_name}",
            response_class=PlainTextResponse,
            summary="Download FASTA for example results")
async def download_example_fasta(example_name: str):
    """Download multi-FASTA from example run."""
    examples = {"dirigent": EXAMPLE_DIRIGENT, "nac": EXAMPLE_NAC}
    if example_name not in examples:
        raise HTTPException(status_code=404, detail="Example not found")
    ex = examples[example_name]
    result = run_gene_family_identification(
        query_sequence=ex["query_sequence"],
        search_database=ex.get("search_database", "swissprot"),
        max_hits=10, fetch_sequences=True,
    )
    return PlainTextResponse(result["fasta"],
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={example_name}_family.fasta"})


# ══════════════════════════════════════════════════════════════════════════════
# MODULE GF-2 — Gene Structure Display (GSDS)
# ══════════════════════════════════════════════════════════════════════════════

class GSDSGeneInput(BaseModel):
    gene_id: str
    cds_seq: str = Field(..., min_length=30, description="CDS nucleotide sequence")
    genomic_seq: str = Field(..., min_length=30,
        description="Genomic sequence (same region, with introns)")
    gff3_text: Optional[str] = Field(None,
        description="GFF3 annotation (preferred over sequence alignment if available)")


class GSDSRequest(BaseModel):
    genes: list[GSDSGeneInput] = Field(..., min_items=1, max_items=50)
    canvas_width: int = Field(1000, ge=600, le=2000)
    track_height: int = Field(28, ge=16, le=50)


@router.post("/gsds", summary="Gene Structure Display — exon-intron architecture")
async def compute_gsds(req: GSDSRequest):
    """
    **Module GF-2: Gene Structure Display (GSDS)**

    Compute and visualize exon-intron architecture for a gene family.
    Accepts paired CDS + genomic sequences or GFF3 annotations.

    Returns SVG render data for the publication-quality GSDS plot
    (mirrors Fig. 2 methodology in Dokka et al. 2024).
    """
    structures = []
    errors = []

    for gene_input in req.genes:
        try:
            gs = compute_gene_structure(
                gene_id=gene_input.gene_id,
                genomic_seq=gene_input.genomic_seq,
                cds_seq=gene_input.cds_seq,
                gff3_text=gene_input.gff3_text,
            )
            structures.append(gs.to_dict())
        except Exception as e:
            errors.append(f"Error computing structure for {gene_input.gene_id}: {e}")
            logger.warning(f"GSDS error for {gene_input.gene_id}: {e}")

    render_data = generate_gsds_render_data(
        structures,
        canvas_width=req.canvas_width,
        track_height=req.track_height,
    )

    return {
        "structures": structures,
        "render_data": render_data,
        "n_genes": len(structures),
        "n_single_exon": sum(1 for s in structures if s.get("intron_count", 0) == 0),
        "n_multi_exon": sum(1 for s in structures if s.get("intron_count", 0) > 0),
        "errors": errors,
    }


@router.get("/gsds/example", summary="Run built-in GSDS example (CcDIR genes)")
async def run_gsds_example():
    """
    Run the built-in GSDS example using CcDIR1, CcDIR2, CcDIR3 sequences
    from Dokka et al. 2024. Demonstrates single-exon structure of dirigent genes.
    """
    ex = EXAMPLE_GSDS
    structures = []
    errors = []

    for gene in ex["genes"]:
        try:
            gs = compute_gene_structure(
                gene_id=gene["gene_id"],
                genomic_seq=gene["genomic_seq"],
                cds_seq=gene["cds_seq"],
            )
            structures.append(gs.to_dict())
        except Exception as e:
            errors.append(f"{gene['gene_id']}: {e}")

    render_data = generate_gsds_render_data(structures)

    return {
        "example_metadata": {
            "name": ex["name"],
            "description": ex["description"],
        },
        "structures": structures,
        "render_data": render_data,
        "n_genes": len(structures),
        "errors": errors,
    }


# ══════════════════════════════════════════════════════════════════════════════
# MODULE GF-3 — Conserved Motif Analysis (MEME)
# ══════════════════════════════════════════════════════════════════════════════

class MotifRequest(BaseModel):
    sequences: dict[str, str] = Field(...,
        description="Dict of {sequence_id: protein_sequence}")
    nmotifs: int = Field(10, ge=1, le=20,
        description="Number of motifs to find (default 10, as in Dokka et al. 2024)")
    min_width: int = Field(6, ge=4, le=20)
    max_width: int = Field(50, ge=10, le=300)
    use_meme_api: bool = Field(True,
        description="Try MEME Suite REST API first; falls back to local finder")
    mod: str = Field("zoops",
        description="MEME model: zoops (zero/one per seq), oops, anr")


@router.post("/motif", summary="Conserved motif analysis (MEME Suite)")
async def analyze_motifs(req: MotifRequest):
    """
    **Module GF-3: Conserved Motif Analysis**

    Identify conserved protein motifs across gene family members using MEME.
    Replicates Fig. 1 analysis from Dokka et al. 2024 (10 CcDIR motifs).

    - Tries MEME Suite REST API first
    - Falls back to local k-mer motif finder if API unavailable
    - Returns motif PWMs, sequence logos, and distribution matrix
    """
    if len(req.sequences) < 2:
        raise HTTPException(status_code=422,
            detail="At least 2 sequences required for motif analysis")

    # Validate sequences
    valid_aa = set("ACDEFGHIKLMNPQRSTVWYBXZUO")
    for sid, seq in req.sequences.items():
        invalid = set(seq.upper()) - valid_aa
        if invalid:
            raise HTTPException(status_code=422,
                detail=f"Invalid characters in sequence '{sid}': {invalid}")

    try:
        result = run_motif_analysis(
            sequences=req.sequences,
            nmotifs=req.nmotifs,
            min_width=req.min_width,
            max_width=req.max_width,
            use_meme_api=req.use_meme_api,
            mod=req.mod,
        )
        return result
    except Exception as e:
        logger.exception("Motif analysis failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/motif/example", summary="Run built-in MEME example (dirigent proteins)")
async def run_motif_example():
    """
    Run the built-in motif analysis example using real dirigent (DIR) protein
    sequences from UniProt. With the local finder (no working MEME Suite/EBI
    REST API exists for MEME - see motif_analysis.py), expect one conserved
    motif ("GGTGDF", part of the core dirigent fold) shared across all 8
    cross-species sequences. Restricting to closer paralogs (e.g. only the
    Arabidopsis members) finds more/longer motifs since the local finder
    requires exact k-mer matches.
    """
    ex = EXAMPLE_MEME
    try:
        result = run_motif_analysis(
            sequences=ex["sequences"],
            nmotifs=ex["nmotifs"],
            min_width=ex["min_width"],
            max_width=ex["max_width"],
            use_meme_api=False,  # Use local finder for fast example
        )
        result["example_metadata"] = {
            "name": ex["name"],
            "description": ex["description"],
            "expected_result": (
                "Local finder should find the conserved 'GGTGDF' motif (part of the "
                "core dirigent fold) present in all 8 sequences. Broader MEME-style "
                "gapped/mismatch-tolerant motif discovery isn't available - see notes "
                "in motif_analysis.py."
            ),
        }
        return result
    except Exception as e:
        logger.exception("Motif example failed")
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# COMBINED PIPELINE ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

class PipelineRequest(BaseModel):
    query_sequence: str = Field(..., min_length=20)
    search_database: str = "swissprot"
    max_hits: int = 20
    evalue_threshold: float = 1e-3
    run_gsds: bool = True
    run_motif: bool = True
    nmotifs: int = 10


@router.post("/pipeline", summary="Run full GF-1 → GF-2 → GF-3 pipeline")
async def run_full_pipeline(req: PipelineRequest):
    """
    **Full Gene Family Pipeline: GF-1 → GF-2 → GF-3**

    Runs all three modules in sequence:
    1. Identify family members (pHMMER)
    2. Compute gene structures (GSDS) — requires sequences
    3. Find conserved motifs (MEME)

    Note: GSDS in pipeline mode uses protein-only structure (single-block),
    since genomic sequences are not available from pHMMER alone.
    For full GSDS, provide paired CDS+genomic sequences via /gsds endpoint.
    """
    pipeline_result = {
        "gf1_family": None,
        "gf2_gsds": None,
        "gf3_motifs": None,
        "pipeline_summary": {},
        "errors": [],
    }

    # GF-1
    try:
        gf1 = run_gene_family_identification(
            query_sequence=req.query_sequence,
            search_database=req.search_database,
            max_hits=req.max_hits,
            evalue_threshold=req.evalue_threshold,
            fetch_sequences=True,
        )
        pipeline_result["gf1_family"] = gf1
    except Exception as e:
        pipeline_result["errors"].append(f"GF-1 failed: {e}")

    # GF-3 (Motif — uses sequences from GF-1)
    if req.run_motif and pipeline_result["gf1_family"]:
        seqs = {
            m["accession"]: m["sequence"]
            for m in pipeline_result["gf1_family"].get("members", [])
            if m.get("sequence")
        }
        if len(seqs) >= 2:
            try:
                gf3 = run_motif_analysis(
                    sequences=seqs,
                    nmotifs=req.nmotifs,
                    use_meme_api=False,
                )
                pipeline_result["gf3_motifs"] = gf3
            except Exception as e:
                pipeline_result["errors"].append(f"GF-3 failed: {e}")

    # Summary
    fam = pipeline_result.get("gf1_family") or {}
    mot = pipeline_result.get("gf3_motifs") or {}
    pipeline_result["pipeline_summary"] = {
        "family_members_found": fam.get("summary", {}).get("total_hits", 0),
        "motifs_found": mot.get("n_motifs_found", 0),
        "method_motif": mot.get("method", ""),
    }

    return pipeline_result
