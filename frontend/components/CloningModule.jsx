"use client";
import { useState, useRef } from "react";
import { fetchJson } from "@/lib/api";

// ─── Colour palette matching EditEase brand-* greens ──────────────────────
const STRATEGY_META = {
  golden_gate: {
    label: "Golden Gate / MoClo",
    icon: "⬡",
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.3)",
    desc: "Type IIS enzyme-based directional assembly. Ideal for sgRNA cloning into CRISPR vectors.",
  },
  gibson: {
    label: "Gibson Assembly",
    icon: "◎",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.3)",
    desc: "Overlap-based isothermal assembly. Seamless, scar-free cloning for any linearised vector.",
  },
  re_ligation: {
    label: "Restriction–Ligation",
    icon: "✂",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.3)",
    desc: "Classical RE digestion + T4 ligation. Reliable for small inserts with compatible ends.",
  },
  gateway: {
    label: "Gateway Recombination",
    icon: "⬟",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.3)",
    desc: "Site-specific att recombination. Best for high-throughput cloning into destination vectors.",
  },
};

const ANNOTATION_COLORS = {
  enzyme: "#f59e0b",
  overhang: "#10b981",
  overlap: "#f59e0b",
  insert: "#3b82f6",
  att: "#8b5cf6",
  feature: "#f97316",
};

//─── API call to EditEase backend ──────────────────────────────────────────
async function callCloningAPI(insert, strategy, params) {
  const body = {
    insert_sequence: insert,
    strategy: strategy,
    gg_enzyme:           params.enzyme,
    gg_overhang_5:       params.overhang_5,
    gg_overhang_3:       params.overhang_3,
    gg_is_sgrna:         params.is_sgrna,
    gibson_overlap_bp:   params.overlap_bp,
    gibson_vector_sequence: params.vector_sequence || "",
    gibson_vector_name:  params.vector_name,
    re_enzyme_5:         params.enzyme_5,
    re_enzyme_3:         params.enzyme_3,
    re_add_kozak:        params.add_kozak,
    re_add_stop:         params.add_stop,
    gw_destination_vector:   params.destination_vector,
    gw_reading_frame_check:  params.reading_frame_check,
  };

  return fetchJson("/api/cloning/design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StrategyCard({ id, meta, selected, onSelect }) {
  return (
    <div
      onClick={() => onSelect(id)}
      style={{
        border: `1.5px solid ${selected ? meta.color : "rgba(255,255,255,0.08)"}`,
        background: selected ? meta.bg : "rgba(255,255,255,0.02)",
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        transition: "all 0.18s ease",
        boxShadow: selected ? `0 0 16px ${meta.color}22` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18, color: meta.color }}>{meta.icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13, color: selected ? meta.color : "#e2e8f0" }}>
          {meta.label}
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>{meta.desc}</p>
    </div>
  );
}

function PrimerCard({ primer }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(primer.full_sequence);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#10b981" }}>{primer.name}</span>
        <button
          onClick={copy}
          style={{
            background: copied ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)",
            border: "none", borderRadius: 6, padding: "3px 10px",
            color: copied ? "#10b981" : "#94a3b8", fontSize: 11, cursor: "pointer",
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {primer.overhang && (
        <div style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: "#f59e0b", letterSpacing: 1 }}>{primer.overhang}</span>
          <span style={{ color: "#60a5fa", letterSpacing: 1 }}>{primer.binding_sequence}</span>
        </div>
      )}
      {!primer.overhang && (
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#60a5fa", marginBottom: 4 }}>
          {primer.full_sequence}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        {[
          ["Tm", `${primer.tm_celsius}°C`],
          ["GC%", `${primer.gc_percent}%`],
          ["Length", `${primer.total_length} nt`],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>{k}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{v}</div>
          </div>
        ))}
      </div>
      {primer.notes && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontStyle: "italic" }}>{primer.notes}</div>
      )}
    </div>
  );
}

function ConstructMap({ annotations, totalLength }) {
  if (!annotations?.length) return null;
  const W = 100; // percent
  const maxEnd = Math.max(...annotations.map((a) => a.end), totalLength || 1);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
        Construct Map
      </div>
      <div style={{ position: "relative", height: 36, background: "rgba(255,255,255,0.03)", borderRadius: 8, overflow: "hidden" }}>
        {annotations.map((ann, i) => {
          const left = (ann.start / maxEnd) * 100;
          const width = Math.max(((ann.end - ann.start) / maxEnd) * 100, 1);
          const color = ANNOTATION_COLORS[ann.type] || ann.color || "#94a3b8";
          return (
            <div
              key={i}
              title={`${ann.label} (${ann.start}–${ann.end})`}
              style={{
                position: "absolute",
                left: `${left}%`,
                width: `${width}%`,
                height: "100%",
                background: color + "cc",
                borderRight: `1px solid ${color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <span style={{ fontSize: 9, color: "#fff", fontWeight: 700, whiteSpace: "nowrap", padding: "0 2px" }}>
                {ann.label}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 8 }}>
        {annotations.map((ann, i) => {
          const color = ANNOTATION_COLORS[ann.type] || ann.color || "#94a3b8";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
              <span style={{ color: "#94a3b8" }}>{ann.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RESitesTable({ sites }) {
  if (!sites?.length) return (
    <div style={{ fontSize: 12, color: "#10b981", padding: "10px 0" }}>
      ✓ No restriction sites found in insert
    </div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["Enzyme", "Position", "Strand", "Sequence", "Overhang"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#64748b", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sites.map((s, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "6px 10px", color: "#f59e0b", fontWeight: 600 }}>{s.enzyme}</td>
              <td style={{ padding: "6px 10px", color: "#e2e8f0" }}>{s.position}</td>
              <td style={{ padding: "6px 10px", color: "#94a3b8" }}>{s.strand}</td>
              <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#60a5fa" }}>{s.sequence}</td>
              <td style={{ padding: "6px 10px", color: "#94a3b8" }}>{s.overhang_seq || "blunt"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DownloadButton({ label, content, filename, color }) {
  const download = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={download}
      style={{
        background: `linear-gradient(135deg, ${color}22, ${color}11)`,
        border: `1px solid ${color}55`,
        borderRadius: 8,
        padding: "8px 16px",
        color: color,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      ↓ {label}
    </button>
  );
}

// ─── Strategy-specific param panels ──────────────────────────────────────────

function GoldenGateParams({ p, set }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <label style={labelStyle}>Type IIS Enzyme</label>
        <select value={p.enzyme} onChange={e => set({ ...p, enzyme: e.target.value })} style={selectStyle}>
          {["BsaI", "BbsI", "BsmBI", "SapI"].map(e => <option key={e}>{e}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>5' Fusion Site (4 nt)</label>
        <input value={p.overhang_5} maxLength={4} onChange={e => set({ ...p, overhang_5: e.target.value.toUpperCase() })} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>3' Fusion Site (4 nt)</label>
        <input value={p.overhang_3} maxLength={4} onChange={e => set({ ...p, overhang_3: e.target.value.toUpperCase() })} style={inputStyle} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 20 }}>
        <input type="checkbox" id="sgrna" checked={p.is_sgrna} onChange={e => set({ ...p, is_sgrna: e.target.checked })} />
        <label htmlFor="sgrna" style={{ ...labelStyle, margin: 0 }}>sgRNA oligo mode</label>
      </div>
    </div>
  );
}

function GibsonParams({ p, set }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <label style={labelStyle}>Overlap Length (bp)</label>
        <input type="number" min={10} max={50} value={p.overlap_bp}
          onChange={e => set({ ...p, overlap_bp: parseInt(e.target.value) })} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Vector Name</label>
        <select value={p.vector_name} onChange={e => set({ ...p, vector_name: e.target.value })} style={selectStyle}>
          {["pUC19", "pBluescript SK+", "pDONR207", "pCAMBIA1300"].map(v => <option key={v}>{v}</option>)}
        </select>
      </div>
      <div style={{ gridColumn: "1/-1" }}>
        <label style={labelStyle}>Vector Sequence (optional — for custom overlap)</label>
        <textarea value={p.vector_sequence} onChange={e => set({ ...p, vector_sequence: e.target.value })}
          placeholder="Paste vector sequence to auto-calculate overlaps..."
          style={{ ...inputStyle, height: 70, fontFamily: "monospace", fontSize: 11, resize: "vertical" }} />
      </div>
    </div>
  );
}

function REParams({ p, set }) {
  const enzymes = ["EcoRI", "BamHI", "HindIII", "NcoI", "NheI", "XhoI", "SalI", "SacI", "KpnI", "XbaI", "NotI", "PstI", "SphI", "ClaI"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <label style={labelStyle}>5' Enzyme</label>
        <select value={p.enzyme_5} onChange={e => set({ ...p, enzyme_5: e.target.value })} style={selectStyle}>
          {enzymes.map(e => <option key={e}>{e}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>3' Enzyme</label>
        <select value={p.enzyme_3} onChange={e => set({ ...p, enzyme_3: e.target.value })} style={selectStyle}>
          {enzymes.map(e => <option key={e}>{e}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6 }}>
        <input type="checkbox" id="kozak" checked={p.add_kozak} onChange={e => set({ ...p, add_kozak: e.target.checked })} />
        <label htmlFor="kozak" style={{ ...labelStyle, margin: 0 }}>Add Kozak sequence</label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6 }}>
        <input type="checkbox" id="stop" checked={p.add_stop} onChange={e => set({ ...p, add_stop: e.target.checked })} />
        <label htmlFor="stop" style={{ ...labelStyle, margin: 0 }}>Add stop codon</label>
      </div>
    </div>
  );
}

function GatewayParams({ p, set }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <label style={labelStyle}>Destination Vector</label>
        <select value={p.destination_vector} onChange={e => set({ ...p, destination_vector: e.target.value })} style={selectStyle}>
          {["pDONR207", "pDONR221", "pB7WG2", "pK7WG2 (plant)", "pDEST22"].map(v => <option key={v}>{v}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 20 }}>
        <input type="checkbox" id="rfcheck" checked={p.reading_frame_check}
          onChange={e => set({ ...p, reading_frame_check: e.target.checked })} />
        <label htmlFor="rfcheck" style={{ ...labelStyle, margin: 0 }}>Reading frame check</label>
      </div>
    </div>
  );
}

// ─── Shared input styles ──────────────────────────────────────────────────────
const labelStyle = { display: "block", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, outline: "none",
};
const selectStyle = { ...inputStyle, cursor: "pointer" };

// ─── Built-in examples ────────────────────────────────────────────────────────
const EXAMPLES = [
  {
    label: "AT1G01010 sgRNA (Golden Gate)",
    strategy: "golden_gate",
    description: "Real Cas9 guide designed by EditEase Module 7 for Arabidopsis AT1G01010 — BsaI Golden Gate into a plant CRISPR vector",
    sequence: "CGTTGAAGTAGCCATCAGCG",
    params: { enzyme: "BsaI", overhang_5: "AACG", overhang_3: "AAAC", is_sgrna: true },
  },
  {
    label: "Mi-crt N-terminus (Gibson)",
    strategy: "gibson",
    description: "5' coding fragment of M. incognita calreticulin (GenBank AF402771.1) for Gibson into pUC19",
    sequence: "ATGGTGAGCAGGTTTTGTTTTGTATCCTTGCTGATAGCTTGTTGGCCAATTTTTGGAGTTTTTGGGGAAGTTTTCTTCAAGGAGGAA",
    params: { overlap_bp: 25, vector_name: "pUC19", vector_sequence: "" },
  },
  {
    label: "EGFP reporter (RE-Ligation)",
    strategy: "re_ligation",
    description: "5' coding fragment of EGFP into an expression vector",
    sequence: "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAG",
    params: { enzyme_5: "NcoI", enzyme_3: "BamHI", add_kozak: true, add_stop: true },
  },
  {
    label: "Mi-msp-1 (Gateway)",
    strategy: "gateway",
    description: "M. incognita secreted protein MSP-1 (GenBank AF013289.1), complete CDS, for Gateway BP/LR into pB7WG2",
    sequence: "ATGTCAAATAAATTAATTATTTCTATTTTAATATTGACAATTATTTATACTGTTGTAAATTCTTTGACTGTTCCTGAACAAAATGCCGTCGTTGATTGTATCAATAAATACCGTTCTCAACTTGCCAATGGAAAAACTAAAAATAAAAATGGGGGGAATTTCCCCTCTGGAAAGGATATTTTGGAAGTTTCTTATAGTAAAGACTTAGAGAAATCTGCTCAAAGATGGGCTAATAAATGCATATTTGATCATAATGGAACAGATTTATATTCTGGAGGAAAATTTTATGGAGAAAATCTTTATTTGGATGGAGACTTTGAGCATAAAAACATAACCCAATTGATGATTGATGCCTGTAATGCATGGTGGGGAGAAAGTACTACAGATGGAGTGCCCCCAAGTTGGATAAATAACTTTTTGCCTACTGATAATAAGGAGAATGATGAAAAATTCGAAGCGGTTGGACACTGGACACAAATGGCGTGGGCTAAAACTTACCAAATTGGTTGTGCGCTTAAAGTTTGCCACAAACCAGACTGTAACGGGAATTTGATTGATTGTCGTTATTATCCAGGTGGAAATGGTATGGGTTCGCCGATTTATCAACAAGGAAAACCAGCTTCAGGATGTGGAAAAGCTGGACCTAGTACGAAATATAGCGGACTATGCAAGCCTGATCCACACCAAAATAATTAATAAATTTATTTGA",
    params: { destination_vector: "pB7WG2", reading_frame_check: true },
  },
];

// ─── Default param states ─────────────────────────────────────────────────────
const DEFAULT_PARAMS = {
  golden_gate: { enzyme: "BsaI", overhang_5: "AACG", overhang_3: "AAAC", is_sgrna: false },
  gibson:      { overlap_bp: 20, vector_name: "pUC19", vector_sequence: "" },
  re_ligation: { enzyme_5: "EcoRI", enzyme_3: "BamHI", add_kozak: false, add_stop: true },
  gateway:     { destination_vector: "pB7WG2", reading_frame_check: true },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CloningModule({ pipelineJobId = null }) {
  const [strategy, setStrategy] = useState("golden_gate");
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });
  const [insertSeq, setInsertSeq] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("primers");
  const seqRef = useRef(null);

  const meta = STRATEGY_META[strategy];

  const loadExample = (ex) => {
    setStrategy(ex.strategy);
    setInsertSeq(ex.sequence);
    setParams(prev => ({ ...prev, [ex.strategy]: ex.params }));
    setResult(null);
    setError("");
  };

  const handleDesign = async () => {
    if (!insertSeq.trim()) { setError("Please enter an insert sequence."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await callCloningAPI(insertSeq.trim().toUpperCase(), strategy, params[strategy]);
      setResult(res);
      setActiveTab("primers");
    } catch (e) {
      setError("Design failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const tabs = ["primers", "re_sites", "protocol", "downloads"];
  const tabLabels = { primers: "Primers", re_sites: "RE Sites", protocol: "Protocol", downloads: "Downloads" };

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Inter', sans-serif",
      background: "#0a0f1a",
      minHeight: "100vh",
      color: "#e2e8f0",
      padding: "24px 16px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #10b981, #059669)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 700, color: "#fff",
          }}>✄</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Cloning Design</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>EditEase · Module 8</div>
          </div>
        </div>
        {pipelineJobId && (
          <div style={{ fontSize: 11, color: "#10b981", background: "rgba(16,185,129,0.08)", borderRadius: 6, padding: "4px 10px", display: "inline-block", marginTop: 8 }}>
            ↳ Pipeline input from sgRNA job {pipelineJobId}
          </div>
        )}
      </div>

      {/* Examples panel */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Try an Example
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {EXAMPLES.map((ex, i) => {
            const stratColor = STRATEGY_META[ex.strategy].color;
            return (
              <button
                key={i}
                onClick={() => loadExample(ex)}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid rgba(255,255,255,0.08)`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.border = `1px solid ${stratColor}55`}
                onMouseLeave={e => e.currentTarget.style.border = "1px solid rgba(255,255,255,0.08)"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, background: `${stratColor}22`, color: stratColor, borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>
                    {STRATEGY_META[ex.strategy].label.split(" /")[0].split(" Assembly")[0]}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{ex.label}</div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{ex.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strategy selector */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Cloning Strategy
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {Object.entries(STRATEGY_META).map(([id, m]) => (
            <StrategyCard key={id} id={id} meta={m} selected={strategy === id} onSelect={setStrategy} />
          ))}
        </div>
      </div>

      {/* Insert Sequence */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Insert Sequence (5'→3')</label>
        <textarea
          ref={seqRef}
          value={insertSeq}
          onChange={e => setInsertSeq(e.target.value.toUpperCase().replace(/[^ATGCNRYWSMKHBVD\s]/gi, ""))}
          placeholder="Paste your DNA sequence here..."
          style={{
            ...inputStyle,
            height: 90,
            fontFamily: "monospace",
            fontSize: 12,
            resize: "vertical",
            letterSpacing: 1,
          }}
        />
        <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
          {insertSeq.replace(/\s/g, "").length} nt
          {insertSeq.length > 0 && ` · GC: ${Math.round((insertSeq.replace(/[^GC]/gi,"").length / insertSeq.replace(/\s/g,"").length) * 100)}%`}
        </div>
      </div>

      {/* Strategy-specific params */}
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${meta.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, color: meta.color, fontWeight: 600, marginBottom: 12 }}>
          {meta.icon} {meta.label} — Parameters
        </div>
        {strategy === "golden_gate" && <GoldenGateParams p={params.golden_gate} set={v => setParams({ ...params, golden_gate: v })} />}
        {strategy === "gibson"      && <GibsonParams     p={params.gibson}      set={v => setParams({ ...params, gibson: v })} />}
        {strategy === "re_ligation" && <REParams          p={params.re_ligation} set={v => setParams({ ...params, re_ligation: v })} />}
        {strategy === "gateway"     && <GatewayParams     p={params.gateway}     set={v => setParams({ ...params, gateway: v })} />}
      </div>

      {/* Run button */}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f87171", marginBottom: 12 }}>
          {error}
        </div>
      )}
      <button
        onClick={handleDesign}
        disabled={loading}
        style={{
          width: "100%",
          background: loading ? "rgba(16,185,129,0.2)" : "linear-gradient(135deg, #10b981, #059669)",
          border: "none", borderRadius: 10, padding: "13px",
          color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
          transition: "all 0.2s",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {loading ? (
          <>
            <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            Designing...
          </>
        ) : (
          "▶ Run Cloning Design"
        )}
      </button>

      {/* Results */}
      {result && (
        <div style={{ marginTop: 28 }}>
          {/* Summary bar */}
          <div style={{
            background: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981", marginBottom: 8 }}>
              ✓ {result.strategy}
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                ["Insert", `${result.insert_length} bp`],
                ["Primers", `${result.primers?.length ?? 0}`],
                ["RE Sites", `${result.restriction_sites_in_insert?.length ?? 0}`],
                ["Warnings", `${result.warnings?.length ?? 0}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Warnings */}
          {result.warnings?.length > 0 && result.warnings.map((w, i) => (
            <div key={i} style={{
              background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
              borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fbbf24", marginBottom: 8,
            }}>
              {w}
            </div>
          ))}

          {/* Suggested vectors */}
          {result.vector_suggestions?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Recommended Vectors
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {result.vector_suggestions.map((v, i) => (
                  <span key={i} style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#94a3b8",
                  }}>{v}</span>
                ))}
              </div>
            </div>
          )}

          {/* Construct Map */}
          <ConstructMap annotations={result.construct_annotations} totalLength={result.insert_length} />

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 0 }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{
                  background: "none", border: "none",
                  borderBottom: activeTab === t ? "2px solid #10b981" : "2px solid transparent",
                  padding: "8px 12px 10px", cursor: "pointer",
                  color: activeTab === t ? "#10b981" : "#64748b",
                  fontSize: 12, fontWeight: 600, transition: "all 0.15s",
                }}>
                {tabLabels[t]}
              </button>
            ))}
          </div>

          {activeTab === "primers" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.primers?.map((p, i) => <PrimerCard key={i} primer={p} />)}
            </div>
          )}

          {activeTab === "re_sites" && (
            <RESitesTable sites={result.restriction_sites_in_insert} />
          )}

          {activeTab === "protocol" && (
            <div>
              {result.protocol_notes?.map((note, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div style={{
                    minWidth: 22, height: 22, borderRadius: "50%",
                    background: "rgba(16,185,129,0.15)", border: "1px solid #10b981",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#10b981",
                  }}>{i + 1}</div>
                  <span style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>{note}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "downloads" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>
                Download construct files for sequence verification, annotation, or submission.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <DownloadButton
                  label="FASTA (.fa)"
                  content={result.downloads?.fasta || ""}
                  filename="editease_construct.fa"
                  color="#3b82f6"
                />
                <DownloadButton
                  label="GenBank (.gb)"
                  content={result.downloads?.genbank || ""}
                  filename="editease_construct.gb"
                  color="#10b981"
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#475569" }}>
                GenBank file includes all feature annotations and is compatible with SnapGene, Benchling, and ApE.
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: #1e293b; }
        textarea:focus, input:focus, select:focus {
          border-color: rgba(16,185,129,0.5) !important;
        }
      `}</style>
    </div>
  );
}
