"""Pydantic request/response schemas."""
from pydantic import BaseModel, Field
from typing import Optional, Literal, Any
from enum import Enum


class JobStatus(str, Enum):
    PENDING = "PENDING"
    STARTED = "STARTED"
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    REVOKED = "REVOKED"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str = ""


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: int = 0
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None


# ── Module 1: Sequence retrieval ─────────────────────────────────────────────
class SequenceSource(str, Enum):
    NCBI = "ncbi"
    ENSEMBL_PLANTS = "ensembl_plants"
    SGN = "sgn"
    GRAMENE = "gramene"


class RetrievalRequest(BaseModel):
    source: SequenceSource
    query: str = Field(..., description="Gene name, accession, or coordinates")
    species: Optional[str] = Field(None, description="e.g. arabidopsis_thaliana")
    upstream_bp: int = Field(2000, ge=0, le=10000)
    downstream_bp: int = Field(0, ge=0, le=10000)
    region: Literal["promoter", "gene", "cds", "custom"] = "promoter"


# ── Module 2: Promoter analysis ──────────────────────────────────────────────
class PromoterAnalysisRequest(BaseModel):
    fasta_text: Optional[str] = None
    job_id_input: Optional[str] = Field(None, description="Reuse output of a retrieval job")
    databases: list[Literal["plantcare", "plantpan"]] = ["plantcare", "plantpan"]
    min_score: float = Field(0.75, description="Minimum match score for the local PlantCARE scan")
    plantpan_min_score: float = Field(
        0.9, ge=0.0, le=1.0,
        description="Minimum similarity score for live PlantPAN TFBS hits (independent of min_score)",
    )


class CisElement(BaseModel):
    name: str
    sequence: str
    start: int
    end: int
    strand: Literal["+", "-"]
    score: float
    description: str = ""
    database: str


# ── Module 4: sgRNA design ───────────────────────────────────────────────────
class SgRNADesignRequest(BaseModel):
    fasta_text: Optional[str] = None
    job_id_input: Optional[str] = None
    pam: Literal["NGG", "NAG", "TTTV", "NNGRRT"] = "NGG"
    guide_length: int = Field(20, ge=17, le=24)
    genome: Optional[str] = Field(None, description="Genome name for off-target")
    max_mismatches: int = Field(3, ge=0, le=5)
    top_n: int = Field(20, ge=1, le=200)
    mode: Literal["knockout", "crispri", "crispra"] = "knockout"


class SgRNAResult(BaseModel):
    sgRNA: str
    pam: str
    start: int
    end: int
    strand: Literal["+", "-"]
    gc_content: float
    efficiency_score: float
    off_targets: int
    off_target_score: float
    mfe: float                 # minimum free energy (RNAfold)
    structure_score: float
    composite_score: float
    rank: int


# ── Module: Protein properties (ExPASy ProtParam, live) ─────────────────────
class ProtParamRequest(BaseModel):
    input_text: str = Field(
        ..., description="One or more protein sequences: raw sequence(s), "
                          "FASTA, or CSV/TSV with a sequence column",
    )


# ── Module: Secondary structure prediction (GOR I) ───────────────────────────
class SecondaryStructureRequest(BaseModel):
    input_text: str = Field(
        ..., description="One or more protein sequences: raw sequence(s), "
                          "FASTA, or CSV/TSV with a sequence column",
    )


# ── Module: ORF prediction ────────────────────────────────────────────────────
class ORFPredictionRequest(BaseModel):
    input_text: str = Field(
        ..., description="One or more nucleotide sequences: raw sequence(s), "
                          "FASTA, or CSV/TSV with a sequence column",
    )
    min_aa: int = Field(25, ge=1, le=1000, description="Minimum ORF length in amino acids")
    require_atg: bool = Field(True, description="Require ATG as the start codon")


# ── Module: Phylogeny ─────────────────────────────────────────────────────────
class PhylogenyRequest(BaseModel):
    input_text: str = Field(
        ..., description="3+ protein or nucleotide sequences (FASTA or CSV/TSV) "
                          "to align and build a tree from",
    )


# ── Module: Transmembrane + signal peptide prediction ────────────────────────
class TransmembraneRequest(BaseModel):
    input_text: str = Field(
        ..., description="One or more protein sequences: raw sequence(s), "
                          "FASTA, or CSV/TSV with a sequence column",
    )


# ── Module: Subcellular localization ──────────────────────────────────────────
class LocalizationRequest(BaseModel):
    input_text: str = Field(
        ..., description="One or more protein sequences: raw sequence(s), "
                          "FASTA, or CSV/TSV with a sequence column",
    )
