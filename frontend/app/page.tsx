"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

type Source = {
  index: number;
  filename: string;
  page: number | string;
  score: number;
  source_url: string | null;
  doc_type: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  has_answer?: boolean;
  loading?: boolean;
};

type Doc = {
  id: string;
  type: "pdf" | "url";
  name: string;
  originalName: string;
  chunks: number;
  addedAt: Date;
};

type IngestState = "idle" | "loading" | "success" | "error";

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const FileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M4 2h6l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);
const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M6.5 9.5a3.536 3.536 0 0 0 5 0l2-2a3.536 3.536 0 0 0-5-5L7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M9.5 6.5a3.536 3.536 0 0 0-5 0l-2 2a3.536 3.536 0 0 0 5 5L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M14 8L2 2l3 6-3 6 12-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ─── Add Document Modal ───────────────────────────────────────────────────────

function AddDocModal({
  onClose,
  onIngestUrl,
  onIngestFile,
  ingestState,
  ingestMessage,
}: {
  onClose: () => void;
  onIngestUrl: (url: string) => void;
  onIngestFile: (file: File) => void;
  ingestState: IngestState;
  ingestMessage: string;
}) {
  const [tab, setTab] = useState<"pdf" | "url">("pdf");
  const [url, setUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#1c1c1e", border: "1px solid #2a2a2e", borderRadius: "16px",
        width: "440px", padding: "24px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h2 style={{ color: "#f5f5f7", fontSize: "16px", fontWeight: 600 }}>Add document</h2>
          <button onClick={onClose} style={{ color: "#6e6e73", background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex" }}>
            <XIcon />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", background: "#2a2a2e", borderRadius: "10px", padding: "3px", marginBottom: "20px" }}>
          {(["pdf", "url"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "7px", borderRadius: "8px", fontSize: "13px", fontWeight: 500,
              transition: "all 0.15s", background: tab === t ? "#3a3a3e" : "transparent",
              color: tab === t ? "#f5f5f7" : "#6e6e73", border: "none", cursor: "pointer",
            }}>
              {t === "pdf" ? "PDF File" : "URL"}
            </button>
          ))}
        </div>

        {tab === "pdf" && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onIngestFile(f); }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? "#0a84ff" : "#3a3a3e"}`,
              borderRadius: "12px", padding: "40px 24px", textAlign: "center",
              cursor: "pointer", transition: "all 0.15s",
              background: isDragging ? "rgba(10,132,255,0.05)" : "transparent",
            }}
          >
            <div style={{ color: "#6e6e73", marginBottom: "8px", display: "flex", justifyContent: "center" }}><FileIcon /></div>
            <p style={{ color: "#f5f5f7", fontSize: "14px", marginBottom: "4px" }}>
              {isDragging ? "Drop your PDF here" : "Drag & drop your PDF"}
            </p>
            <p style={{ color: "#6e6e73", fontSize: "12px" }}>or click to browse</p>
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onIngestFile(f); e.target.value = ""; }}
            />
          </div>
        )}

        {tab === "url" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url.trim() && onIngestUrl(url)}
              placeholder="https://example.com/article"
              autoFocus
              style={{
                background: "#2a2a2e", border: "1px solid #3a3a3e", borderRadius: "10px",
                padding: "10px 14px", color: "#f5f5f7", fontSize: "14px", outline: "none", width: "100%",
              }}
            />
            <button
              onClick={() => url.trim() && onIngestUrl(url)}
              disabled={ingestState === "loading" || !url.trim()}
              style={{
                background: "#0a84ff", color: "white", border: "none", borderRadius: "10px",
                padding: "10px", fontSize: "14px", fontWeight: 500,
                cursor: ingestState === "loading" || !url.trim() ? "not-allowed" : "pointer",
                opacity: ingestState === "loading" || !url.trim() ? 0.5 : 1,
              }}
            >
              {ingestState === "loading" ? "Ingesting…" : "Ingest URL"}
            </button>
          </div>
        )}

        {ingestMessage && (
          <p style={{
            marginTop: "12px", fontSize: "12px",
            color: ingestState === "success" ? "#30d158" : ingestState === "error" ? "#ff453a" : "#0a84ff",
          }}>
            {ingestMessage}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome", role: "assistant",
    content: "Hello! I'm RAGnarok. Add documents or URLs using the **+** button, then ask me anything about them.",
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [ingestState, setIngestState] = useState<IngestState>("idle");
  const [ingestMessage, setIngestMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    fetch(`${API_URL}/api/stats`).then(r => r.json()).then(d => setTotalChunks(d.total_chunks ?? 0)).catch(() => {});
  }, []);

  const handleIngestUrl = useCallback(async (url: string) => {
    setIngestState("loading"); setIngestMessage("Fetching and indexing…");
    try {
      const res = await fetch(`${API_URL}/api/ingest/url?url=${encodeURIComponent(url.trim())}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const chunks = data.results?.[0]?.chunks_added ?? 0;
      setTotalChunks(data.total_chunks ?? 0);
      let hostname = url.trim();
      try { hostname = new URL(url.trim()).hostname.replace("www.", ""); } catch {}
      setDocs(p => [...p, { id: crypto.randomUUID(), type: "url", name: hostname, originalName: hostname, chunks, addedAt: new Date() }]);
      setIngestState("success"); setIngestMessage(`✓ ${chunks} chunks indexed`);
      setTimeout(() => { setIngestMessage(""); setIngestState("idle"); setShowModal(false); }, 1500);
    } catch {
      setIngestState("error"); setIngestMessage("Failed to ingest URL.");
    }
  }, []);

  const handleIngestFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".pdf")) { setIngestState("error"); setIngestMessage("Only PDF files are supported."); return; }
    setIngestState("loading"); setIngestMessage(`Uploading ${file.name}…`);
    const form = new FormData(); form.append("file", file);
    try {
      const res = await fetch(`${API_URL}/api/ingest/pdf`, { method: "POST", body: form });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const chunks = data.results?.[0]?.chunks_added ?? 0;
      setTotalChunks(data.total_chunks ?? 0);
      const name = file.name.replace(".pdf", "");
      setDocs(p => [...p, { id: crypto.randomUUID(), type: "pdf", name, originalName: name, chunks, addedAt: new Date() }]);
      setIngestState("success"); setIngestMessage(`✓ ${chunks} chunks indexed`);
      setTimeout(() => { setIngestMessage(""); setIngestState("idle"); setShowModal(false); }, 1500);
    } catch {
      setIngestState("error"); setIngestMessage("Upload failed.");
    }
  }, []);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const question = input.trim(); setInput(""); setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const uId = `u-${Date.now()}`; const aId = `a-${Date.now()}`;
    setMessages(p => [...p,
      { id: uId, role: "user", content: question },
      { id: aId, role: "assistant", content: "", loading: true },
    ]);
    try {
      const res = await fetch(`${API_URL}/api/query`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, session_id: sessionId, k: 4 }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(p => p.map(m => m.id === aId
        ? { ...m, content: data.answer, sources: data.sources, has_answer: data.has_answer, loading: false }
        : m));
    } catch {
      setMessages(p => p.map(m => m.id === aId
        ? { ...m, content: "Something went wrong. Is the API running?", loading: false }
        : m));
    } finally { setLoading(false); }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; font-family: 'DM Sans', sans-serif; background: #0d0d0f; color: #f5f5f7; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a2e; border-radius: 2px; }
        .doc-row .doc-actions { opacity: 0; transition: opacity 0.15s; }
        .doc-row:hover .doc-actions { opacity: 1; }
        @keyframes bounce { 0%,100%{transform:translateY(0);opacity:.4} 50%{transform:translateY(-4px);opacity:1} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .msg-enter { animation: fadeIn 0.2s ease forwards; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* ── SIDEBAR ────────────────────────────────────────────────────── */}
        <aside style={{
          width: "260px", minWidth: "260px", flexShrink: 0,
          background: "#111113", borderRight: "1px solid #1e1e22",
          display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden",
        }}>
          {/* Logo */}
          <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1e1e22", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "9px", flexShrink: 0,
                background: "linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "15px", fontWeight: 700, color: "white",
                boxShadow: "0 2px 8px rgba(10,132,255,0.35)",
              }}>R</div>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#f5f5f7", lineHeight: 1.2 }}>RAGnarok</p>
                <p style={{ fontSize: "11px", color: "#48484a", lineHeight: 1 }}>
                  {totalChunks.toLocaleString()} chunks indexed
                </p>
              </div>
            </div>
          </div>

          {/* Add button */}
          <div style={{ padding: "12px 12px 6px", flexShrink: 0 }}>
            <button
              onClick={() => { setIngestState("idle"); setIngestMessage(""); setShowModal(true); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "8px",
                padding: "9px 12px", background: "#1a1a1e", border: "1px solid #2a2a2e",
                borderRadius: "10px", color: "#c0c0c5", fontSize: "13px", fontWeight: 500,
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#222226"; e.currentTarget.style.color = "#f5f5f7"; e.currentTarget.style.borderColor = "#3a3a3e"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#1a1a1e"; e.currentTarget.style.color = "#c0c0c5"; e.currentTarget.style.borderColor = "#2a2a2e"; }}
            >
              <PlusIcon />
              Add document or URL
            </button>
          </div>

          {/* Section label */}
          {docs.length > 0 && (
            <div style={{ padding: "10px 16px 4px", flexShrink: 0 }}>
              <p style={{ fontSize: "10px", fontWeight: 600, color: "#48484a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Documents ({docs.length})
              </p>
            </div>
          )}

          {/* Doc list — scrollable */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
            {docs.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <p style={{ fontSize: "12px", color: "#48484a", lineHeight: 1.7 }}>
                  No documents yet.<br />Add a PDF or URL to get started.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                {docs.map(doc => (
                  <div key={doc.id} className="doc-row" style={{ borderRadius: "8px", padding: "8px 8px" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1a1a1e")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {editingId === doc.id ? (
                      <input
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onBlur={() => { setDocs(p => p.map(d => d.id === doc.id ? { ...d, name: editingName || d.originalName } : d)); setEditingId(null); }}
                        onKeyDown={e => {
                          if (e.key === "Enter") { setDocs(p => p.map(d => d.id === doc.id ? { ...d, name: editingName || d.originalName } : d)); setEditingId(null); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        style={{
                          width: "100%", background: "#2a2a2e", border: "1px solid #0a84ff",
                          borderRadius: "6px", padding: "5px 8px", color: "#f5f5f7",
                          fontSize: "12px", outline: "none", fontFamily: "inherit",
                        }}
                      />
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <div style={{ color: "#6e6e73", marginTop: "2px", flexShrink: 0 }}>
                          {doc.type === "pdf" ? <FileIcon /> : <LinkIcon />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "12px", fontWeight: 500, color: "#d0d0d5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {doc.name}
                          </p>
                          <p style={{ fontSize: "11px", color: "#48484a", marginTop: "1px" }}>
                            {doc.chunks} chunks
                          </p>
                        </div>
                        <div className="doc-actions" style={{ display: "flex", gap: "1px", flexShrink: 0 }}>
                          <button
                            onClick={() => { setEditingId(doc.id); setEditingName(doc.name); }}
                            title="Rename"
                            style={{ color: "#48484a", background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "4px", display: "flex" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#f5f5f7")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#48484a")}
                          ><EditIcon /></button>
                          <button
                            onClick={() => setDocs(p => p.filter(d => d.id !== doc.id))}
                            title="Remove"
                            style={{ color: "#48484a", background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "4px", display: "flex" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#ff453a")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#48484a")}
                          ><TrashIcon /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "10px 16px", borderTop: "1px solid #1e1e22", flexShrink: 0 }}>
            <p style={{ fontSize: "10px", color: "#2a2a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {API_URL}
            </p>
          </div>
        </aside>

        {/* ── CHAT ───────────────────────────────────────────────────────── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 0 16px" }}>
            <div style={{ maxWidth: "700px", margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: "28px" }}>
              {messages.map(msg => (
                <div key={msg.id} className="msg-enter" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "user" ? (
                    <div style={{
                      background: "#1a1a1e", border: "1px solid #2a2a2e",
                      borderRadius: "16px 16px 4px 16px",
                      padding: "12px 16px", maxWidth: "72%",
                      fontSize: "14px", color: "#e5e5e7", lineHeight: 1.65,
                    }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div style={{ maxWidth: "88%", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                        {/* Avatar */}
                        <div style={{
                          width: "28px", height: "28px", borderRadius: "8px", flexShrink: 0,
                          background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "12px", fontWeight: 700, color: "white",
                          boxShadow: "0 2px 6px rgba(10,132,255,0.3)",
                        }}>R</div>
                        {/* Bubble */}
                        <div style={{
                          background: "#111113", border: "1px solid #1e1e22",
                          borderRadius: "4px 16px 16px 16px",
                          padding: "12px 16px", fontSize: "14px", color: "#d0d0d5", lineHeight: 1.7,
                          flex: 1,
                        }}>
                          {msg.loading ? (
                            <div style={{ display: "flex", gap: "5px", alignItems: "center", height: "22px" }}>
                              {[0, 150, 300].map(d => (
                                <span key={d} style={{
                                  width: "6px", height: "6px", borderRadius: "50%", background: "#48484a",
                                  animation: `bounce 1.1s ${d}ms ease-in-out infinite`, display: "inline-block",
                                }} />
                              ))}
                            </div>
                          ) : (
                            <ReactMarkdown components={{
                              p: ({ children }) => <p style={{ marginBottom: "8px", lastChild: "none" } as React.CSSProperties}>{children}</p>,
                              strong: ({ children }) => <strong style={{ color: "#f0f0f2", fontWeight: 600 }}>{children}</strong>,
                              ul: ({ children }) => <ul style={{ paddingLeft: "18px", marginBottom: "8px" }}>{children}</ul>,
                              ol: ({ children }) => <ol style={{ paddingLeft: "18px", marginBottom: "8px" }}>{children}</ol>,
                              li: ({ children }) => <li style={{ marginBottom: "3px" }}>{children}</li>,
                              code: ({ children }) => (
                                <code style={{
                                  background: "#1e1e22", border: "1px solid #2a2a2e", borderRadius: "4px",
                                  padding: "1px 6px", fontSize: "12px", fontFamily: "monospace", color: "#0a84ff",
                                }}>{children}</code>
                              ),
                            }}>
                              {msg.content}
                            </ReactMarkdown>
                          )}
                        </div>
                      </div>

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && msg.has_answer && (
                        <div style={{ paddingLeft: "40px", display: "flex", flexWrap: "wrap", gap: "5px" }}>
                          {msg.sources.map(s => (
                            <div key={s.index} style={{
                              fontSize: "11px", background: "#111113", border: "1px solid #1e1e22",
                              borderRadius: "6px", padding: "3px 10px", color: "#48484a",
                            }}>
                              {s.doc_type === "web" ? (
                                <a
                                  href={s.source_url ?? "#"} target="_blank" rel="noreferrer"
                                  style={{ color: "#0a84ff", textDecoration: "none" }}
                                  onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                                  onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                                >
                                  [{s.index}] {s.source_url ? (() => { try { return new URL(s.source_url).hostname; } catch { return "web"; } })() : "web"}
                                </a>
                              ) : (
                                <span>[{s.index}] {s.filename} p.{s.page}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input bar */}
          <div style={{ padding: "12px 24px 20px", flexShrink: 0 }}>
            <div style={{ maxWidth: "700px", margin: "0 auto" }}>
              <div
                style={{
                  display: "flex", alignItems: "flex-end", gap: "10px",
                  background: "#111113", border: "1px solid #2a2a2e", borderRadius: "14px",
                  padding: "10px 12px", transition: "border-color 0.15s",
                }}
                onFocusCapture={e => (e.currentTarget.style.borderColor = "#3a3a3e")}
                onBlurCapture={e => (e.currentTarget.style.borderColor = "#2a2a2e")}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Ask about your documents…"
                  disabled={loading}
                  rows={1}
                  style={{
                    flex: 1, background: "transparent", border: "none", color: "#f5f5f7",
                    fontSize: "14px", lineHeight: 1.6, resize: "none", maxHeight: "120px",
                    fontFamily: "inherit", outline: "none",
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  style={{
                    width: "34px", height: "34px", borderRadius: "9px", flexShrink: 0,
                    background: loading || !input.trim() ? "#1e1e22" : "#0a84ff",
                    border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: loading || !input.trim() ? "#3a3a3e" : "white",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <SendIcon />
                </button>
              </div>
              <p style={{ fontSize: "11px", color: "#2a2a2e", textAlign: "center", marginTop: "8px" }}>
                RAGnarok only answers based on indexed documents
              </p>
            </div>
          </div>
        </main>
      </div>

      {showModal && (
        <AddDocModal
          onClose={() => setShowModal(false)}
          onIngestUrl={handleIngestUrl}
          onIngestFile={handleIngestFile}
          ingestState={ingestState}
          ingestMessage={ingestMessage}
        />
      )}
    </>
  );
}