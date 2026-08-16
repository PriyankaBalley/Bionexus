"""
BioNexus — Cloning Module API Routes
POST /api/cloning/design       — main design endpoint
GET  /api/cloning/enzymes      — list available RE + Type IIS enzymes
GET  /api/cloning/vectors      — list suggested vectors by strategy
POST /api/cloning/re-scan      — scan a sequence for restriction sites only
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator
from typing import Optional
from app.services.cloning import (
    run_cloning_design,
    find_restriction_sites,
    RESTRICTION_ENZYMES,
    COMMON_VECTORS,
    CRISPR_VECTORS,
    CloningStrategy,
)

router = APIRouter(prefix="/cloning", tags=["Cloning Design"])

# ─── Request / Response Models ────────────────────────────────────────────────

class CloningDesignRequest(BaseModel):
    insert_sequence: str = Field(..., description="DNA sequence of insert (IUPAC)")
    strategy: CloningStrategy = Field(..., description="Cloning strategy")

    # Golden Gate params
    gg_enzyme: Optional[str] = Field("BsaI", description="Type IIS enzyme for Golden Gate")
    gg_overhang_5: Optional[str] = Field("AACG", description="4-nt 5' fusion site")
    gg_overhang_3: Optional[str] = Field("AAAC", description="4-nt 3' fusion site")
    gg_is_sgrna: Optional[bool] = Field(False, description="Design as CRISPR sgRNA oligos")

    # Gibson params
    gibson_overlap_bp: Optional[int] = Field(20, ge=10, le=50)
    gibson_vector_sequence: Optional[str] = Field("", description="Vector sequence for overlap (optional)")
    gibson_vector_name: Optional[str] = Field("pUC19")

    # RE-ligation params
    re_enzyme_5: Optional[str] = Field("EcoRI", description="5' restriction enzyme")
    re_enzyme_3: Optional[str] = Field("BamHI", description="3' restriction enzyme")
    re_add_kozak: Optional[bool] = Field(False)
    re_add_stop: Optional[bool] = Field(True)

    # Gateway params
    gw_destination_vector: Optional[str] = Field("pB7WG2")
    gw_reading_frame_check: Optional[bool] = Field(True)

    # Pipeline integration
    job_id_input: Optional[str] = Field(None, description="Upstream sgRNA job ID for pipeline mode")

    @validator("insert_sequence")
    def validate_sequence(cls, v):
        v = v.upper().replace(" ", "").replace("\n", "")
        import re
        if not re.match(r"^[ATGCNRYWSMKHBVD]+$", v):
            raise ValueError("Sequence contains invalid characters")
        if len(v) < 10:
            raise ValueError("Sequence too short (< 10 bp)")
        return v

    @validator("gg_overhang_5", "gg_overhang_3")
    def validate_overhang(cls, v):
        if v and len(v) != 4:
            raise ValueError("Golden Gate overhangs must be exactly 4 nt")
        return v.upper() if v else v


class REScanRequest(BaseModel):
    sequence: str
    enzymes: Optional[list[str]] = Field(None, description="Specific enzymes to scan; all if omitted")


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/design")
async def cloning_design(req: CloningDesignRequest):
    """
    Main cloning design endpoint.
    Returns primers, restriction sites, construct map, protocol notes,
    and downloadable GenBank / FASTA records.
    """
    params = {}

    if req.strategy == CloningStrategy.GOLDEN_GATE:
        params = {
            "enzyme": req.gg_enzyme,
            "overhang_5": req.gg_overhang_5,
            "overhang_3": req.gg_overhang_3,
            "is_sgrna": req.gg_is_sgrna,
        }
    elif req.strategy == CloningStrategy.GIBSON:
        params = {
            "overlap_bp": req.gibson_overlap_bp,
            "vector_sequence": req.gibson_vector_sequence,
            "vector_name": req.gibson_vector_name,
        }
    elif req.strategy == CloningStrategy.RE_LIGATION:
        enzyme_5 = req.re_enzyme_5
        enzyme_3 = req.re_enzyme_3
        if enzyme_5 not in RESTRICTION_ENZYMES:
            raise HTTPException(400, f"Unknown enzyme: {enzyme_5}")
        if enzyme_3 not in RESTRICTION_ENZYMES:
            raise HTTPException(400, f"Unknown enzyme: {enzyme_3}")
        if enzyme_5 == enzyme_3:
            raise HTTPException(400, "5' and 3' enzymes must differ for directional cloning")
        params = {
            "enzyme_5": enzyme_5,
            "enzyme_3": enzyme_3,
            "add_kozak": req.re_add_kozak,
            "add_stop": req.re_add_stop,
        }
    elif req.strategy == CloningStrategy.GATEWAY:
        params = {
            "destination_vector": req.gw_destination_vector,
            "reading_frame_check": req.gw_reading_frame_check,
        }

    result = run_cloning_design(req.insert_sequence, req.strategy, params)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@router.get("/enzymes")
async def list_enzymes():
    """Return all available restriction and Type IIS enzymes."""
    output = {}
    for name, data in RESTRICTION_ENZYMES.items():
        output[name] = {
            "recognition_sequence": data.get("pattern", ""),
            "type": data.get("type", "II"),
            "overhang_bp": data.get("overhang", 0),
        }
    return output


@router.get("/vectors")
async def list_vectors(strategy: Optional[str] = None, crispr: bool = False):
    """Return recommended vectors for a given strategy."""
    source = CRISPR_VECTORS if crispr else COMMON_VECTORS
    if strategy:
        return {strategy: source.get(strategy, [])}
    return source


@router.post("/re-scan")
async def re_scan(req: REScanRequest):
    """
    Scan a sequence for restriction sites.
    Useful standalone — does not require a full cloning design run.
    """
    seq = req.sequence.upper().replace(" ", "").replace("\n", "")
    sites = find_restriction_sites(seq, req.enzymes)
    return {
        "sequence_length": len(seq),
        "sites_found": len(sites),
        "sites": [
            {
                "enzyme": s.enzyme,
                "position": s.position,
                "strand": s.strand,
                "recognition_sequence": s.sequence,
                "overhang_type": s.overhang_type,
                "overhang_sequence": s.overhang_seq,
            }
            for s in sites
        ],
    }