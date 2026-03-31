"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_CHUNKS = 5000;

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
  name: string;
  original_name: string;
  type: string;
  source: string;
  chunks: number;
  added_at: string;
};

type IngestState = "idle" | "loading" | "success" | "error";
type ModalTab = "pdf" | "url" | "youtube";

// ─── Gradient helpers ─────────────────────────────────────────────────────────

function getUserGradient(username: string): string {
  const gradients = [
    "linear-gradient(135deg, #ff6b6b, #ee5a24)",
    "linear-gradient(135deg, #a29bfe, #6c5ce7)",
    "linear-gradient(135deg, #fd79a8, #e84393)",
    "linear-gradient(135deg, #55efc4, #00b894)",
    "linear-gradient(135deg, #fdcb6e, #e17055)",
    "linear-gradient(135deg, #74b9ff, #0984e3)",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++)
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
}

function isValidYoutubeSource(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be");
  } catch {
    return false;
  }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
const FileIcon = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
const LinkIcon = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5a3.536 3.536 0 0 0 5 0l2-2a3.536 3.536 0 0 0-5-5L7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M9.5 6.5a3.536 3.536 0 0 0-5 0l-2 2a3.536 3.536 0 0 0 5 5L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const YoutubeIcon = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6.5 5.5l4 2.5-4 2.5V5.5z" fill="currentColor"/></svg>;
const EditIcon = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;
const TrashIcon = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const SendIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M14 8L2 2l3 6-3 6 12-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
const XIcon = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const LogoutIcon = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const CheckIcon = () => <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const CopyIcon = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 11V3a1 1 0 0 1 1-1h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
const DiceIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="5" cy="5" r="1" fill="currentColor"/><circle cx="11" cy="5" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="5" cy="11" r="1" fill="currentColor"/><circle cx="11" cy="11" r="1" fill="currentColor"/></svg>;

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress, label }: { progress: number; label: string }) {
  return (
    <div style={{ marginTop: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "12px", color: "#a1a1aa" }}>{label}</span>
        <span style={{ fontSize: "12px", color: "#0ea5e9" }}>{progress}%</span>
      </div>
      <div style={{ background: "#27272a", borderRadius: "999px", height: "6px", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: "999px", background: "linear-gradient(90deg, #0ea5e9, #6366f1)", width: `${progress}%`, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy"
      style={{
        background: "none", border: "none", cursor: "pointer", padding: "4px 6px",
        borderRadius: "6px", color: copied ? "#22c55e" : "#52525b",
        display: "flex", alignItems: "center", gap: "4px",
        fontSize: "11px", transition: "color 0.15s",
      }}
      onMouseEnter={e => { if (!copied) e.currentTarget.style.color = "#a1a1aa"; }}
      onMouseLeave={e => { if (!copied) e.currentTarget.style.color = "#52525b"; }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Add Doc Modal ────────────────────────────────────────────────────────────

function AddDocModal({
  onClose, onIngestUrl, onIngestFile, onIngestYoutube,
  ingestState, ingestMessage, uploadProgress,
}: {
  onClose: () => void;
  onIngestUrl: (url: string) => void;
  onIngestFile: (file: File) => void;
  onIngestYoutube: (url: string) => void;
  ingestState: IngestState;
  ingestMessage: string;
  uploadProgress: number;
}) {
  const [tab, setTab] = useState<ModalTab>("pdf");
  const [url, setUrl] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = ingestState === "loading";

  const tabs: { id: ModalTab; label: string; icon: React.ReactNode }[] = [
    { id: "pdf", label: "PDF", icon: <FileIcon /> },
    { id: "url", label: "URL", icon: <LinkIcon /> },
    { id: "youtube", label: "YouTube", icon: <YoutubeIcon /> },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "18px", width: "460px", padding: "28px", boxShadow: "0 32px 100px rgba(0,0,0,0.7)" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px" }}>
          <h2 style={{ color: "#fafafa", fontSize: "16px", fontWeight: 600 }}>Add document</h2>
          {!busy && (
            <button onClick={onClose} style={{ color: "#71717a", background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", borderRadius: "6px" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fafafa")}
              onMouseLeave={e => (e.currentTarget.style.color = "#71717a")}><XIcon /></button>
          )}
        </div>

        <div style={{ display: "flex", background: "#27272a", borderRadius: "10px", padding: "3px", marginBottom: "22px", gap: "2px" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => !busy && setTab(t.id)} style={{
              flex: 1, padding: "7px 4px", borderRadius: "8px", fontSize: "12px", fontWeight: 500,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
              background: tab === t.id ? "#3f3f46" : "transparent",
              color: tab === t.id ? "#fafafa" : "#71717a",
              border: "none", cursor: busy ? "not-allowed" : "pointer", transition: "all 0.15s",
            }}>{t.icon}{t.label}</button>
          ))}
        </div>

        {/* PDF */}
        {tab === "pdf" && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); if (!busy) setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) { setFileName(f.name); onIngestFile(f); } }}
              onClick={() => !busy && fileRef.current?.click()}
              style={{ border: `2px dashed ${isDragging ? "#0ea5e9" : busy ? "#27272a" : "#3f3f46"}`, borderRadius: "12px", padding: "36px 24px", textAlign: "center", cursor: busy ? "default" : "pointer", transition: "all 0.15s", background: isDragging ? "rgba(14,165,233,0.06)" : "transparent" }}
            >
              <div style={{ color: busy ? "#3f3f46" : "#71717a", marginBottom: "10px", display: "flex", justifyContent: "center" }}><FileIcon /></div>
              <p style={{ color: busy ? "#52525b" : "#e4e4e7", fontSize: "14px", marginBottom: "4px" }}>
                {fileName && busy ? fileName : isDragging ? "Drop your PDF here" : "Drag & drop your PDF"}
              </p>
              <p style={{ color: "#52525b", fontSize: "12px" }}>or click to browse • PDF only</p>
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); onIngestFile(f); } e.target.value = ""; }} />
            </div>
            {busy && <ProgressBar progress={uploadProgress} label="Uploading & indexing…" />}
          </>
        )}

        {/* URL */}
        {tab === "url" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && url.trim() && !busy && onIngestUrl(url)}
              placeholder="https://example.com/article" autoFocus disabled={busy}
              style={{ background: "#27272a", border: "1px solid #3f3f46", borderRadius: "10px", padding: "11px 14px", color: "#fafafa", fontSize: "14px", outline: "none", width: "100%", fontFamily: "inherit" }}
            />
            <button onClick={() => url.trim() && !busy && onIngestUrl(url)} disabled={busy || !url.trim()}
              style={{ background: busy || !url.trim() ? "#27272a" : "#0ea5e9", color: busy || !url.trim() ? "#52525b" : "white", border: "none", borderRadius: "10px", padding: "11px", fontSize: "14px", fontWeight: 500, cursor: busy || !url.trim() ? "not-allowed" : "pointer" }}
            >{busy ? "Ingesting…" : "Ingest URL"}</button>
            {busy && <ProgressBar progress={uploadProgress} label="Fetching & indexing…" />}
          </div>
        )}

        {/* YouTube */}
        {tab === "youtube" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ padding: "10px 14px", background: "#1a1a1e", border: "1px solid #27272a", borderRadius: "10px" }}>
              <p style={{ fontSize: "12px", color: "#71717a", lineHeight: 1.6 }}>
                Paste a YouTube URL. RAGnarok fetches the transcript (manual or auto-generated) and indexes it so you can ask questions about the video.
              </p>
            </div>
            <input value={ytUrl} onChange={e => setYtUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && ytUrl.trim() && !busy && onIngestYoutube(ytUrl)}
              placeholder="https://youtube.com/watch?v=..." autoFocus={tab === "youtube"} disabled={busy}
              style={{ background: "#27272a", border: "1px solid #3f3f46", borderRadius: "10px", padding: "11px 14px", color: "#fafafa", fontSize: "14px", outline: "none", width: "100%", fontFamily: "inherit" }}
            />
            <button onClick={() => ytUrl.trim() && !busy && onIngestYoutube(ytUrl)} disabled={busy || !ytUrl.trim()}
              style={{ background: busy || !ytUrl.trim() ? "#27272a" : "#ef4444", color: busy || !ytUrl.trim() ? "#52525b" : "white", border: "none", borderRadius: "10px", padding: "11px", fontSize: "14px", fontWeight: 500, cursor: busy || !ytUrl.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            ><YoutubeIcon />{busy ? "Fetching transcript…" : "Fetch & Index"}</button>
            {busy && <ProgressBar progress={uploadProgress} label="Fetching transcript & indexing…" />}
          </div>
        )}

        {ingestMessage && (
          <p style={{ marginTop: "14px", fontSize: "12px", color: ingestState === "success" ? "#22c55e" : ingestState === "error" ? "#ef4444" : "#0ea5e9" }}>
            {ingestMessage}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (username: string) => void }) {
  const [name, setName] = useState("");
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function fetchSuggestion() {
    setLoadingSuggestion(true);
    try {
      const r = await fetch(`${API_URL}/api/usernames/suggest`);
      const d = await r.json();
      setName(d.username ?? "");
      inputRef.current?.focus();
    } catch {}
    finally { setLoadingSuggestion(false); }
  }

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0f" }}>
      <div style={{ background: "#111113", border: "1px solid #1e1e22", borderRadius: "20px", padding: "44px 38px", width: "400px", textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>

        <div style={{ width: "54px", height: "54px", borderRadius: "14px", margin: "0 auto 22px", background: "linear-gradient(135deg, #0a84ff, #5e5ce6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 700, color: "white", boxShadow: "0 4px 20px rgba(10,132,255,0.4)" }}>R</div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#fafafa", marginBottom: "6px" }}>RAGnarok</h1>
        <p style={{ fontSize: "13px", color: "#71717a", marginBottom: "30px", lineHeight: 1.5 }}>
          Enter a username to access your<br />personal document library
        </p>

        <div style={{ textAlign: "left", marginBottom: "6px" }}>
          <label style={{ fontSize: "11px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Username</label>
        </div>

        {/* Input + dice button */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && name.trim() && onLogin(name.trim())}
            placeholder="Enter any username"
            style={{ flex: 1, background: "#18181b", border: "1px solid #27272a", borderRadius: "10px", padding: "12px 14px", color: "#fafafa", fontSize: "15px", outline: "none", fontFamily: "inherit" }}
            onFocus={e => (e.target.style.borderColor = "#0a84ff")}
            onBlur={e => (e.target.style.borderColor = "#27272a")}
          />
          <button
            onClick={fetchSuggestion}
            disabled={loadingSuggestion}
            title="Generate a random username"
            style={{ width: "46px", height: "46px", background: "#18181b", border: "1px solid #27272a", borderRadius: "10px", cursor: loadingSuggestion ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: loadingSuggestion ? "#3f3f46" : "#71717a", flexShrink: 0, transition: "all 0.15s" }}
            onMouseEnter={e => { if (!loadingSuggestion) { e.currentTarget.style.borderColor = "#0a84ff"; e.currentTarget.style.color = "#0a84ff"; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#27272a"; e.currentTarget.style.color = "#71717a"; }}
          >
            {loadingSuggestion
              ? <span style={{ fontSize: "18px", animation: "spin 0.6s linear infinite", display: "inline-block" }}>⟳</span>
              : <DiceIcon />}
          </button>
        </div>

        <p style={{ fontSize: "11px", color: "#3f3f46", marginBottom: "12px", textAlign: "left" }}>
          Click 🎲 to generate a unique fun username
        </p>

        <button onClick={() => name.trim() && onLogin(name.trim())} disabled={!name.trim()}
          style={{ width: "100%", background: name.trim() ? "#0a84ff" : "#18181b", color: name.trim() ? "white" : "#52525b", border: "none", borderRadius: "10px", padding: "12px", fontSize: "15px", fontWeight: 600, cursor: name.trim() ? "pointer" : "not-allowed", transition: "all 0.2s", fontFamily: "inherit" }}
        >Continue →</button>

        <div style={{ marginTop: "20px", padding: "12px 14px", background: "#18181b", borderRadius: "8px", border: "1px solid #1e1e22" }}>
          <p style={{ fontSize: "11px", color: "#52525b", lineHeight: 1.7, textAlign: "left" }}>
            No password required. Your documents are stored under your username. Accounts inactive for <strong style={{ color: "#71717a" }}>30 days</strong> are automatically deleted along with all indexed documents.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [userGradient, setUserGradient] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [userChunks, setUserChunks] = useState(0);
  const [selectedDocSources, setSelectedDocSources] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [ingestState, setIngestState] = useState<IngestState>("idle");
  const [ingestMessage, setIngestMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("ragnarok_username");
    if (saved) login(saved);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function login(name: string) {
    setUsername(name);
    setUserGradient(getUserGradient(name));
    localStorage.setItem("ragnarok_username", name);
    setMessages([{ id: "welcome", role: "assistant", content: `Welcome back, **${name}**! Add documents using the **+** button, then ask me anything about them.` }]);
    loadUserDocs(name);
    loadUserStats(name);
  }

  function logout() {
    localStorage.removeItem("ragnarok_username");
    setUsername(null); setDocs([]); setMessages([]); setUserChunks(0); setSelectedDocSources(new Set());
  }

  async function loadUserDocs(name: string) {
    try {
      const r = await fetch(`${API_URL}/api/users/${encodeURIComponent(name)}/docs`);
      if (!r.ok) return;
      setDocs(await r.json());
    } catch {}
  }

  async function loadUserStats(name: string) {
    try {
      const r = await fetch(`${API_URL}/api/stats/user/${encodeURIComponent(name)}`);
      if (!r.ok) return;
      const d = await r.json();
      setUserChunks(d.total_chunks ?? 0);
    } catch {}
  }

  function simulateProgress(): () => void {
    setUploadProgress(0);
    let p = 0;
    const tick = setInterval(() => {
      p += Math.random() * 10;
      if (p >= 88) { clearInterval(tick); setUploadProgress(88); }
      else setUploadProgress(Math.round(p));
    }, 350);
    return () => clearInterval(tick);
  }

  async function registerDoc(docEntry: Omit<Doc, "chunks"> & { chunks: number }) {
    if (!username) return;
    await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}/docs`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(docEntry),
    });
  }

  // ── Ingest URL ────────────────────────────────────────────────────────────

  const handleIngestUrl = useCallback(async (url: string) => {
    if (!username) return;
    setIngestState("loading"); setIngestMessage("");
    const stop = simulateProgress();
    try {
      const res = await fetch(`${API_URL}/api/ingest/url?url=${encodeURIComponent(url.trim())}&username=${encodeURIComponent(username)}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const chunks = data.results?.[0]?.chunks_added ?? 0;
      setUploadProgress(100);
      setUserChunks(p => p + chunks);
      let hostname = url.trim();
      try { hostname = new URL(url.trim()).hostname.replace("www.", ""); } catch {}
      const entry: Doc = { id: crypto.randomUUID(), name: hostname, original_name: hostname, type: "url", source: url.trim(), chunks, added_at: new Date().toISOString() };
      await registerDoc(entry);
      setDocs(p => [...p, entry]);
      setIngestState("success"); setIngestMessage(`✓ ${chunks} chunks indexed`);
      setTimeout(() => { setIngestMessage(""); setIngestState("idle"); setShowModal(false); setUploadProgress(0); }, 1500);
    } catch {
      setIngestState("error"); setIngestMessage("Failed to ingest URL."); setUploadProgress(0);
    } finally { stop(); }
  }, [username]);

  // ── Ingest PDF ────────────────────────────────────────────────────────────

  const handleIngestFile = useCallback(async (file: File) => {
    if (!username) return;
    if (!file.name.endsWith(".pdf")) { setIngestState("error"); setIngestMessage("Only PDF files are supported."); return; }
    setIngestState("loading"); setIngestMessage("");
    const stop = simulateProgress();
    const form = new FormData(); form.append("file", file);
    try {
      const res = await fetch(`${API_URL}/api/ingest/pdf?username=${encodeURIComponent(username)}`, { method: "POST", body: form });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const chunks = data.results?.[0]?.chunks_added ?? 0;
      setUploadProgress(100);
      setUserChunks(p => p + chunks);
      const name = file.name.replace(/\.pdf$/i, "");
      const entry: Doc = { id: crypto.randomUUID(), name, original_name: name, type: "pdf", source: file.name, chunks, added_at: new Date().toISOString() };
      await registerDoc(entry);
      setDocs(p => [...p, entry]);
      setIngestState("success"); setIngestMessage(`✓ ${chunks} chunks indexed`);
      setTimeout(() => { setIngestMessage(""); setIngestState("idle"); setShowModal(false); setUploadProgress(0); }, 1500);
    } catch {
      setIngestState("error"); setIngestMessage("Upload failed."); setUploadProgress(0);
    } finally { stop(); }
  }, [username]);

  // ── Ingest YouTube ────────────────────────────────────────────────────────

  const handleIngestYoutube = useCallback(async (url: string) => {
    if (!username) return;
    setIngestState("loading"); setIngestMessage("");
    const stop = simulateProgress();
    try {
      const res = await fetch(`${API_URL}/api/ingest/youtube?url=${encodeURIComponent(url.trim())}&username=${encodeURIComponent(username)}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      const data = await res.json();
      const chunks = data.results?.[0]?.chunks_added ?? 0;
      // Use the real video title returned by the backend
      const title = data.title || url.trim();
      setUploadProgress(100);
      setUserChunks(p => p + chunks);
      const entry: Doc = { id: crypto.randomUUID(), name: title, original_name: title, type: "youtube", source: url.trim(), chunks, added_at: new Date().toISOString() };
      await registerDoc(entry);
      setDocs(p => [...p, entry]);
      setIngestState("success"); setIngestMessage(`✓ ${chunks} chunks indexed — "${title}"`);
      setTimeout(() => { setIngestMessage(""); setIngestState("idle"); setShowModal(false); setUploadProgress(0); }, 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to fetch transcript.";
      setIngestState("error"); setIngestMessage(msg); setUploadProgress(0);
    } finally { stop(); }
  }, [username]);

  // ── Doc actions ───────────────────────────────────────────────────────────

  async function handleRename(doc: Doc, newName: string) {
    if (!username || !newName.trim()) { setEditingId(null); return; }
    try {
      await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}/docs/${doc.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setDocs(p => p.map(d => d.id === doc.id ? { ...d, name: newName.trim() } : d));
    } catch {}
    setEditingId(null);
  }

  async function handleDelete(doc: Doc) {
    if (!username) return;
    try {
      await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}/docs/${doc.id}`, { method: "DELETE" });
      setDocs(p => p.filter(d => d.id !== doc.id));
      setUserChunks(prev => Math.max(0, prev - doc.chunks));
      setSelectedDocSources(prev => { const s = new Set(prev); s.delete(doc.source); return s; });
    } catch {}
  }

  function toggleDocFilter(source: string) {
    setSelectedDocSources(prev => {
      const s = new Set(prev);
      if (s.has(source)) s.delete(source); else s.add(source);
      return s;
    });
  }

  // ── Send message ──────────────────────────────────────────────────────────

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
      const body: Record<string, unknown> = { question, session_id: sessionId, k: 4, username };
      if (selectedDocSources.size > 0) body.doc_filter = Array.from(selectedDocSources);
      const res = await fetch(`${API_URL}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

  // ── Source URL resolution ─────────────────────────────────────────────────

  function resolveSourceUrl(s: Source): string | null {
    // For YouTube chunks, source_url comes from the JSON metadata field "source"
    // which we set to the original YouTube URL — always valid
    if (s.doc_type === "youtube") {
      return isValidYoutubeSource(s.source_url) ? s.source_url : null;
    }
    if (s.doc_type === "web" || s.doc_type === "api") {
      if (!s.source_url) return null;
      try { new URL(s.source_url); return s.source_url; } catch { return null; }
    }
    return null;
  }

  function sourceLabel(s: Source): string {
    const url = resolveSourceUrl(s);
    if (!url) return s.filename || "source";
    try { return new URL(url).hostname.replace("www.", ""); } catch { return "source"; }
  }

  // ── Storage ───────────────────────────────────────────────────────────────

  const storagePercent = Math.min(100, Math.round((userChunks / MAX_CHUNKS) * 100));
  const storageColor = storagePercent > 80 ? "#ef4444" : storagePercent > 60 ? "#f59e0b" : "#0ea5e9";

  function getDocIcon(type: string) {
    if (type === "youtube") return <YoutubeIcon />;
    if (type === "url") return <LinkIcon />;
    return <FileIcon />;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!username) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #0d0d0f; }
        input, button { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <LoginScreen onLogin={login} />
    </>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #__next { height: 100%; }
        body { font-family: 'DM Sans', sans-serif; background: #0d0d0f; color: #fafafa; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }
        .doc-row .doc-actions { opacity: 0; transition: opacity 0.12s; }
        .doc-row:hover .doc-actions { opacity: 1; }
        .doc-row:hover { background: #18181b !important; }
        .msg-actions { opacity: 0; transition: opacity 0.12s; }
        .msg-wrap:hover .msg-actions { opacity: 1; }
        @keyframes bounce { 0%,100%{transform:translateY(0);opacity:.3} 50%{transform:translateY(-5px);opacity:1} }
        @keyframes fadeSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg-in { animation: fadeSlide 0.22s ease forwards; }
        input, textarea, button { font-family: 'DM Sans', sans-serif; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

        {/* ── TOP BAR ──────────────────────────────────────────────────── */}
        <header style={{ height: "52px", borderBottom: "1px solid #18181b", background: "#111113", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "26px", height: "26px", borderRadius: "7px", background: "linear-gradient(135deg, #0a84ff, #5e5ce6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "white" }}>R</div>
            <span style={{ fontSize: "15px", fontWeight: 600, color: "#fafafa" }}>RAGnarok</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "13px", color: "#71717a" }}>{username}</span>
            <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: userGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "white", userSelect: "none" }}>
              {username[0].toUpperCase()}
            </div>
            <button onClick={logout} title="Sign out"
              style={{ color: "#52525b", background: "none", border: "none", cursor: "pointer", display: "flex", padding: "4px", borderRadius: "6px" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
              onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
            ><LogoutIcon /></button>
          </div>
        </header>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── SIDEBAR ──────────────────────────────────────────────── */}
          <aside style={{ width: "256px", minWidth: "256px", flexShrink: 0, background: "#111113", borderRight: "1px solid #18181b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            <div style={{ padding: "12px 10px 8px", flexShrink: 0 }}>
              <button
                onClick={() => { setIngestState("idle"); setIngestMessage(""); setUploadProgress(0); setShowModal(true); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", background: "#18181b", border: "1px solid #27272a", borderRadius: "10px", color: "#a1a1aa", fontSize: "13px", fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#1e1e22"; e.currentTarget.style.color = "#fafafa"; e.currentTarget.style.borderColor = "#3f3f46"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#18181b"; e.currentTarget.style.color = "#a1a1aa"; e.currentTarget.style.borderColor = "#27272a"; }}
              ><PlusIcon /> Add document or URL</button>
            </div>

            {docs.length > 0 && (
              <div style={{ padding: "4px 14px 4px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: "10px", fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Documents ({docs.length})
                </p>
                {selectedDocSources.size > 0 && (
                  <button onClick={() => setSelectedDocSources(new Set())}
                    style={{ fontSize: "10px", color: "#0ea5e9", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Clear filter
                  </button>
                )}
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px" }}>
              {docs.length === 0 ? (
                <div style={{ padding: "28px 14px", textAlign: "center" }}>
                  <p style={{ fontSize: "12px", color: "#52525b", lineHeight: 1.7 }}>
                    No documents yet.<br />Add a PDF, URL or YouTube video.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  {docs.map(doc => {
                    const selected = selectedDocSources.has(doc.source);
                    const canLink = doc.type === "url" || doc.type === "youtube";
                    return (
                      <div key={doc.id} className="doc-row"
                        style={{ borderRadius: "8px", padding: "7px 8px", cursor: "pointer", background: selected ? "#1a2535" : "transparent", transition: "background 0.1s" }}
                        onClick={() => toggleDocFilter(doc.source)}
                      >
                        {editingId === doc.id ? (
                          <input value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onBlur={() => handleRename(doc, editingName)}
                            onKeyDown={e => { if (e.key === "Enter") handleRename(doc, editingName); if (e.key === "Escape") setEditingId(null); }}
                            onClick={e => e.stopPropagation()} autoFocus
                            style={{ width: "100%", background: "#27272a", border: "1px solid #0ea5e9", borderRadius: "6px", padding: "4px 8px", color: "#fafafa", fontSize: "12px", outline: "none", fontFamily: "inherit" }}
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                            <div style={{ width: "14px", height: "14px", borderRadius: "4px", flexShrink: 0, marginTop: "1px", border: `1.5px solid ${selected ? "#0ea5e9" : "#3f3f46"}`, background: selected ? "#0ea5e9" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                              {selected && <CheckIcon />}
                            </div>
                            <div style={{ color: doc.type === "youtube" ? "#ef4444" : "#71717a", marginTop: "1px", flexShrink: 0 }}>
                              {getDocIcon(doc.type)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: "12px", fontWeight: 500, color: selected ? "#e2e8f0" : "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {doc.name}
                              </p>
                              <p style={{ fontSize: "11px", color: "#52525b", marginTop: "1px" }}>
                                {canLink ? (
                                  <a href={doc.source} target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    style={{ color: "#52525b", textDecoration: "none" }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "#0ea5e9")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
                                  >{doc.chunks} chunks · open ↗</a>
                                ) : (
                                  <span>{doc.chunks} chunks</span>
                                )}
                              </p>
                            </div>
                            <div className="doc-actions" style={{ display: "flex", gap: "1px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditingId(doc.id); setEditingName(doc.name); }} title="Rename"
                                style={{ color: "#3f3f46", background: "none", border: "none", cursor: "pointer", padding: "3px", borderRadius: "4px", display: "flex" }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
                                onMouseLeave={e => (e.currentTarget.style.color = "#3f3f46")}
                              ><EditIcon /></button>
                              <button onClick={() => handleDelete(doc)} title="Remove"
                                style={{ color: "#3f3f46", background: "none", border: "none", cursor: "pointer", padding: "3px", borderRadius: "4px", display: "flex" }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                                onMouseLeave={e => (e.currentTarget.style.color = "#3f3f46")}
                              ><TrashIcon /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Storage bar */}
            <div style={{ padding: "12px 14px", borderTop: "1px solid #18181b", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", color: "#71717a" }}>Your storage</span>
                <span style={{ fontSize: "11px", color: storageColor }}>{userChunks.toLocaleString()} / {MAX_CHUNKS.toLocaleString()}</span>
              </div>
              <div style={{ background: "#27272a", borderRadius: "999px", height: "4px", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: "999px", background: storagePercent > 80 ? "linear-gradient(90deg, #f59e0b, #ef4444)" : "linear-gradient(90deg, #0ea5e9, #6366f1)", width: `${storagePercent}%`, transition: "width 0.4s ease" }} />
              </div>
              {storagePercent > 80 && (
                <p style={{ fontSize: "10px", color: "#ef4444", marginTop: "5px" }}>
                  Storage almost full — delete unused documents
                </p>
              )}
            </div>
          </aside>

          {/* ── CHAT ─────────────────────────────────────────────────── */}
          <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

            <div style={{ flex: 1, overflowY: "auto", padding: "28px 0 12px" }}>
              <div style={{ maxWidth: "720px", margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: "24px" }}>
                {messages.map(msg => (
                  <div key={msg.id} className="msg-in msg-wrap"
                    style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: "10px" }}>

                    {/* AI avatar */}
                    {msg.role === "assistant" && (
                      <div style={{ width: "28px", height: "28px", borderRadius: "8px", flexShrink: 0, marginTop: "2px", background: "linear-gradient(135deg, #0a84ff, #5e5ce6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "white", boxShadow: "0 2px 8px rgba(10,132,255,0.3)" }}>R</div>
                    )}

                    <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", gap: "6px", flex: msg.role === "assistant" ? 1 : "unset" }}>
                      <div style={{ background: msg.role === "user" ? "#18181b" : "#111113", border: `1px solid ${msg.role === "user" ? "#27272a" : "#1e1e22"}`, borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px", padding: "11px 15px", fontSize: "14px", color: "#e4e4e7", lineHeight: 1.7 }}>
                        {msg.loading ? (
                          <div style={{ display: "flex", gap: "5px", alignItems: "center", height: "22px" }}>
                            {[0, 150, 300].map(d => (
                              <span key={d} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#52525b", animation: `bounce 1.1s ${d}ms ease-in-out infinite`, display: "inline-block" }} />
                            ))}
                          </div>
                        ) : (
                          <ReactMarkdown components={{
                            p: ({ children }) => <p style={{ marginBottom: "6px" }}>{children}</p>,
                            strong: ({ children }) => <strong style={{ color: "#fafafa", fontWeight: 600 }}>{children}</strong>,
                            ul: ({ children }) => <ul style={{ paddingLeft: "18px", marginBottom: "6px" }}>{children}</ul>,
                            ol: ({ children }) => <ol style={{ paddingLeft: "18px", marginBottom: "6px" }}>{children}</ol>,
                            li: ({ children }) => <li style={{ marginBottom: "3px" }}>{children}</li>,
                            code: ({ children }) => <code style={{ background: "#1e1e22", border: "1px solid #27272a", borderRadius: "4px", padding: "1px 6px", fontSize: "12px", fontFamily: "monospace", color: "#0ea5e9" }}>{children}</code>,
                          }}>{msg.content}</ReactMarkdown>
                        )}
                      </div>

                      {/* Copy button + Sources row */}
                      {!msg.loading && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          {/* Copy button */}
                          <div className="msg-actions">
                            <CopyButton text={msg.content} />
                          </div>

                          {/* Sources */}
                          {msg.sources && msg.sources.length > 0 && msg.has_answer && msg.sources.slice(0, 4).map(s => {
                            const url = resolveSourceUrl(s);
                            return (
                              <div key={s.index} style={{ fontSize: "11px", background: "#111113", border: "1px solid #1e1e22", borderRadius: "6px", padding: "3px 10px", color: "#71717a" }}>
                                {url ? (
                                  <a href={url} target="_blank" rel="noreferrer"
                                    style={{ color: "#0ea5e9", textDecoration: "none" }}
                                    onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                                    onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                                  >
                                    [{s.index}] {sourceLabel(s)} ↗
                                  </a>
                                ) : (
                                  <span>[{s.index}] {s.filename} p.{s.page}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* User avatar */}
                    {msg.role === "user" && (
                      <div style={{ width: "28px", height: "28px", borderRadius: "8px", flexShrink: 0, marginTop: "2px", background: userGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "white" }}>
                        {username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Active filter pills */}
            {selectedDocSources.size > 0 && (
              <div style={{ padding: "0 24px 6px", flexShrink: 0 }}>
                <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {Array.from(selectedDocSources).map(src => {
                    const doc = docs.find(d => d.source === src);
                    return (
                      <div key={src} style={{ fontSize: "11px", background: "#0ea5e910", border: "1px solid #0ea5e930", borderRadius: "20px", padding: "3px 10px", color: "#0ea5e9", display: "flex", alignItems: "center", gap: "5px" }}>
                        {doc?.name ?? src}
                        <button onClick={() => toggleDocFilter(src)} style={{ background: "none", border: "none", cursor: "pointer", color: "#0ea5e9", display: "flex", padding: 0 }}><XIcon /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{ padding: "6px 24px 20px", flexShrink: 0 }}>
              <div style={{ maxWidth: "720px", margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", background: "#111113", border: "1px solid #27272a", borderRadius: "14px", padding: "10px 12px", transition: "border-color 0.15s" }}
                  onFocusCapture={e => (e.currentTarget.style.borderColor = "#3f3f46")}
                  onBlurCapture={e => (e.currentTarget.style.borderColor = "#27272a")}
                >
                  <textarea ref={textareaRef} value={input}
                    onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder={selectedDocSources.size > 0 ? `Asking ${selectedDocSources.size} selected doc${selectedDocSources.size > 1 ? "s" : ""}…` : "Ask about your documents…"}
                    disabled={loading} rows={1}
                    style={{ flex: 1, background: "transparent", border: "none", color: "#fafafa", fontSize: "14px", lineHeight: 1.6, resize: "none", maxHeight: "120px", fontFamily: "inherit", outline: "none" }}
                  />
                  <button onClick={sendMessage} disabled={loading || !input.trim()}
                    style={{ width: "34px", height: "34px", borderRadius: "9px", flexShrink: 0, background: loading || !input.trim() ? "#1e1e22" : "#0ea5e9", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: loading || !input.trim() ? "#3f3f46" : "white", transition: "all 0.15s" }}
                  ><SendIcon /></button>
                </div>
                <p style={{ fontSize: "11px", color: "#27272a", textAlign: "center", marginTop: "8px" }}>
                  RAGnarok only answers based on your indexed documents
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>

      {showModal && (
        <AddDocModal
          onClose={() => setShowModal(false)}
          onIngestUrl={handleIngestUrl}
          onIngestFile={handleIngestFile}
          onIngestYoutube={handleIngestYoutube}
          ingestState={ingestState}
          ingestMessage={ingestMessage}
          uploadProgress={uploadProgress}
        />
      )}
    </>
  );
}