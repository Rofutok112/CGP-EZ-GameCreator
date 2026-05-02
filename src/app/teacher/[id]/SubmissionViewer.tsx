"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, FolderOpen, Maximize2, Minimize2, Pause, Play, Square } from "lucide-react";
import { AssetBrowser } from "@/components/AssetBrowser";
import { CheatSheet } from "@/components/CheatSheet";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { GameCanvas } from "@/components/GameCanvas";
import { CodePreview } from "@/components/CodePreview";
import { analyzeDsl, type DslDiagnostic } from "@/lib/dsl";
import type { LiveSession } from "@/db/schema";
import { getBrowserStorage } from "@/lib/browserStorage";

export function SubmissionViewer({ clientId }: { clientId: string }) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(0);
  const [previewState, setPreviewState] = useState<"stopped" | "running" | "paused">("stopped");
  const [staticDiagnostics, setStaticDiagnostics] = useState<DslDiagnostic[]>([]);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<DslDiagnostic[]>([]);
  const [teacherToken, setTeacherToken] = useState("teacher");
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.7);
  const [diagnosticsRatio, setDiagnosticsRatio] = useState(0.24);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);

  useEffect(() => {
    const storage = getBrowserStorage();
    setTeacherToken(storage.getItem("cgp-ez-teacher-token") || "teacher");
    const savedSplit = Number(storage.getItem("cgp-ez-teacher-split-ratio"));
    if (Number.isFinite(savedSplit) && savedSplit >= 0.32 && savedSplit <= 0.76) setSplitRatio(savedSplit);
    const savedDiagnosticsRatio = Number(storage.getItem("cgp-ez-teacher-diagnostics-ratio"));
    if (Number.isFinite(savedDiagnosticsRatio) && savedDiagnosticsRatio >= 0.14 && savedDiagnosticsRatio <= 0.42) setDiagnosticsRatio(savedDiagnosticsRatio);
  }, []);

  useEffect(() => {
    let active = true;
    let loading = false;
    let lastRevision: number | null = null;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const params = new URLSearchParams({ token: teacherToken, t: String(Date.now()) });
        const response = await fetch(`/api/live/${clientId}?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("load failed");
        const next = (await response.json()) as LiveSession;
        if (active) {
          setSession(next);
          if (lastRevision !== next.revision) {
            lastRevision = next.revision;
            setStaticDiagnostics(analyzeDsl(next.code));
            setRuntimeDiagnostics([]);
          }
          setError("");
        }
      } catch {
        if (active) setError("Liveデータ取得に失敗");
      } finally {
        loading = false;
      }
    };
    load();
    const timer = window.setInterval(load, 400);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [clientId, teacherToken]);

  const start = () => {
    const nextDiagnostics = analyzeDsl(code);
    setStaticDiagnostics(nextDiagnostics);
    setRuntimeDiagnostics([]);
    if (nextDiagnostics.some((item) => item.severity === "error")) return;
    setPreviewState("running");
    setSessionId((value) => value + 1);
    setLoadedRevision(session?.revision ?? null);
  };

  const pause = () => {
    setPreviewState((state) => (state === "running" ? "paused" : "running"));
  };

  const stop = () => {
    setRuntimeDiagnostics([]);
    setPreviewState("stopped");
  };

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    event.preventDefault();
    const rect = workspace.getBoundingClientRect();
    const startX = event.clientX;
    const startRatio = splitRatio;
    const handleMove = (moveEvent: PointerEvent) => {
      const raw = startRatio + (moveEvent.clientX - startX) / rect.width;
      setSplitRatio(Math.min(0.76, Math.max(0.32, raw)));
    };
    const handleUp = (upEvent: PointerEvent) => {
      const raw = startRatio + (upEvent.clientX - startX) / rect.width;
      const next = Math.min(0.76, Math.max(0.32, raw));
      getBrowserStorage().setItem("cgp-ez-teacher-split-ratio", String(next));
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [splitRatio]);

  const startDiagnosticsResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const panel = workspace.querySelector<HTMLElement>(".teacher-code-panel");
    if (!panel) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const startY = event.clientY;
    const startRatio = diagnosticsRatio;
    const handleMove = (moveEvent: PointerEvent) => {
      const next = Math.min(0.42, Math.max(0.14, startRatio - (moveEvent.clientY - startY) / rect.height));
      setDiagnosticsRatio(next);
    };
    const handleUp = (upEvent: PointerEvent) => {
      const next = Math.min(0.42, Math.max(0.14, startRatio - (upEvent.clientY - startY) / rect.height));
      getBrowserStorage().setItem("cgp-ez-teacher-diagnostics-ratio", String(next));
      document.body.classList.remove("is-row-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    document.body.classList.add("is-row-resizing");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [diagnosticsRatio]);

  const code = session?.code ?? "";
  const diagnostics = mergeDiagnostics(staticDiagnostics, runtimeDiagnostics);
  const hasErrors = diagnostics.some((item) => item.severity === "error");
  const hasNewCode = previewState !== "stopped" && session && loadedRevision !== null && session.revision !== loadedRevision;

  return (
    <div
      ref={workspaceRef}
      className={`workspace teacher-workspace ${previewMaximized ? "preview-maximized" : ""}`}
      style={{ gridTemplateColumns: `minmax(360px, ${splitRatio}fr) 10px minmax(320px, ${1 - splitRatio}fr)` }}
    >
      <section
        className="panel editor-panel teacher-code-panel"
        style={{ gridTemplateRows: `auto minmax(0, ${1 - diagnosticsRatio}fr) 8px minmax(96px, ${diagnosticsRatio}fr)` }}
      >
        <div className="panel-toolbar">
          <div>
            <strong>{session?.title ?? "読み込み中"}</strong>
            <span className="teacher-subtitle">
              {session ? `${session.studentName} / rev.${session.revision} / Sync ${new Date(session.updatedAt).toLocaleTimeString("ja-JP")}` : error}
            </span>
            {hasNewCode ? <span className="diagnostic-state warning">New revision / Stop to Start</span> : null}
          </div>
          <div className="toolbar-group">
            <button className={!session || previewState !== "stopped" || hasErrors ? "state-disabled" : "primary"} onClick={start} disabled={!session || previewState !== "stopped" || hasErrors}>
              <Play size={16} /> Start
            </button>
            <button className={previewState === "stopped" ? "state-stopped" : previewState === "paused" ? "state-paused" : ""} onClick={pause} disabled={previewState === "stopped"}>
              <Pause size={16} /> {previewState === "paused" ? "Resume" : "Pause"}
            </button>
            <button className={previewState === "stopped" ? "state-stopped" : "state-stop-active"} onClick={stop} disabled={previewState === "stopped"}>
              <Square size={16} /> Stop
            </button>
            <button onClick={() => setDocsOpen(true)}>
              <BookOpen size={16} /> ドキュメント
            </button>
            <button onClick={() => setAssetsOpen(true)}>
              <FolderOpen size={16} /> ファイル
            </button>
          </div>
        </div>
        <CodePreview code={code} className="readonly-code" cursorLine={session?.cursorLine} cursorColumn={session?.cursorColumn} />
        <div className="row-splitter" role="separator" aria-orientation="horizontal" aria-label="コードと問題パネルの高さを変更" onPointerDown={startDiagnosticsResize} />
        <DiagnosticsPanel diagnostics={diagnostics} />
      </section>

      <div className="splitter" role="separator" aria-orientation="vertical" aria-label="コードとプレビューの幅を変更" onPointerDown={startResize} />

      <section className="panel preview-panel">
        <div className="panel-toolbar">
          <strong>実行プレビュー</strong>
          <div className="toolbar-group">
            <span className="ok">
              {previewState === "running" ? "実行中" : previewState === "paused" ? "一時停止中" : "停止中"}
            </span>
            <button onClick={() => setPreviewMaximized((value) => !value)} title="アプリ内でプレビューを最大化">
              {previewMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {previewMaximized ? "戻す" : "最大化"}
            </button>
          </div>
        </div>
        <GameCanvas code={code} control={previewState} sessionId={sessionId} assetScope={clientId} onDiagnostics={setRuntimeDiagnostics} onStop={() => setPreviewState("stopped")} />
      </section>
      <CheatSheet open={docsOpen} onClose={() => setDocsOpen(false)} />
      <AssetBrowser open={assetsOpen} onClose={() => setAssetsOpen(false)} scope={clientId} scopeLabel={session?.studentName || "生徒フォルダ"} />
    </div>
  );
}

function mergeDiagnostics(a: DslDiagnostic[], b: DslDiagnostic[]) {
  const seen = new Set<string>();
  return [...a, ...b].filter((item) => {
    const key = `${item.severity}:${item.line}:${item.column}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
