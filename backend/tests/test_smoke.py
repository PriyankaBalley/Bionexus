"""Smoke tests — pure-logic, no network, no Celery.
Run with:  cd backend && DATA_DIR=/tmp/ee_test pytest -q
"""
import tempfile
from pathlib import Path
from app.services.promoter import scan_motifs, analyze_promoter
from app.services.sgrna import find_sgrnas, efficiency_score, design_sgrnas
from app.services.visualization import render_promoter_map


SEQ = ("CACGTGAAACCTAGTGACGTCAATATAAATATTGACGTCAGGTAAGCCGCCAAATTGCATGCATG"
       "ATTAATCAACTGGATAAGGTGAACGACTTGACGTCAATCAATATAAACAAAAAATTTCCAATAA") * 4


def test_scan_motifs_finds_known_elements():
    hits = scan_motifs(SEQ, ["plantcare", "plantpan"], 0.75)
    names = {h["name"] for h in hits}
    assert "G-box" in names
    assert "TATA-box" in names
    assert all(h["start"] >= 1 and h["end"] <= len(SEQ) for h in hits)


def test_find_sgrnas_ngg():
    seq = "ATGCGATCGATCGATCGATCGATCGATCGATCAGG" + "TACGCGCGCGTAGCTAGCTAGCATGCGCGTAGCAGG"
    candidates = find_sgrnas(seq, "NGG", 20)
    assert len(candidates) >= 2
    for c in candidates:
        assert len(c["sgRNA"]) == 20
        assert c["pam"][1:] == "GG"


def test_efficiency_score_bounds():
    for g in ["A" * 20, "G" * 20, "ATCGATCGATCGATCGATCG", "TTTT" + "A" * 16]:
        s = efficiency_score(g)
        assert 0.0 <= s <= 1.0


def test_visualization_outputs(tmp_path):
    hits = scan_motifs(SEQ, ["plantcare"], 0.75)
    out = render_promoter_map("test_seq", len(SEQ), hits, tmp_path)
    for k in ("png", "svg", "pdf", "html"):
        assert Path(out[k]).exists() and Path(out[k]).stat().st_size > 0


def test_analyze_promoter_pipeline(tmp_path):
    fasta = tmp_path / "in.fa"
    fasta.write_text(f">test\n{SEQ}\n")
    job_dir = tmp_path / "job"; job_dir.mkdir()
    res = analyze_promoter(fasta, ["plantcare", "plantpan"], 0.75, job_dir)
    assert res["total_hits"] > 0
    assert (job_dir / "promoter_results.json").exists()
    assert (job_dir / "promoter_hits.csv").exists()


def test_design_sgrnas_pipeline(tmp_path):
    seq = "ATGCGATCGATCGATCGATCGATCGATCGATCAGG" * 6
    fasta = tmp_path / "in.fa"
    fasta.write_text(f">target\n{seq}\n")
    job_dir = tmp_path / "job"; job_dir.mkdir()
    res = design_sgrnas(fasta, "NGG", 20, 3, None, 5, job_dir)
    assert res["total_candidates"] >= 1
    assert (job_dir / "sgrna_results.csv").exists()
    for row in res["top_sgRNAs"]:
        assert 0 <= row["composite_score"] <= 1
        assert row["rank"] >= 1
