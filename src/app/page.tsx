"use client";

import Link from "next/link";
import { BookOpen, FolderOpen, Maximize2, Minimize2, Pause, Play, RotateCcw, Save, Square } from "lucide-react";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssetBrowser } from "@/components/AssetBrowser";
import { CheatSheet } from "@/components/CheatSheet";
import { CodeEditor, type CodeEditorHandle } from "@/components/CodeEditor";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { GameCanvas } from "@/components/GameCanvas";
import { analyzeDsl, type DslDiagnostic } from "@/lib/dsl";
import { sampleCode } from "@/lib/sample";

export default function Home() {
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const editorPanelRef = useRef<HTMLElement | null>(null);
  const [code, setCode] = useState(sampleCode);
  const [previewCode, setPreviewCode] = useState(sampleCode);
  const [previewState, setPreviewState] = useState<"stopped" | "running" | "paused">("stopped");
  const [sessionId, setSessionId] = useState(0);
  const [staticDiagnostics, setStaticDiagnostics] = useState<DslDiagnostic[]>([]);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<DslDiagnostic[]>([]);
  const [clientId, setClientId] = useState("");
  const [classroomId, setClassroomId] = useState("default");
  const [studentName, setStudentName] = useState("");
  const [title, setTitle] = useState("左右移動ゲーム");
  const [message, setMessage] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.7);
  const [diagnosticsRatio, setDiagnosticsRatio] = useState(0.24);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const revisionRef = useRef(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("cgp-ez-code");
    if (saved) {
      setCode(saved);
      setPreviewCode(saved);
    }
    const savedAtText = window.localStorage.getItem("cgp-ez-saved-at");
    if (savedAtText) setSavedAt(new Date(savedAtText));
    let id = window.localStorage.getItem("cgp-ez-client-id");
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem("cgp-ez-client-id", id);
    }
    setClientId(id);
    setClassroomId(window.localStorage.getItem("cgp-ez-classroom-id") || "default");
    setStudentName(window.localStorage.getItem("cgp-ez-student-name") || "");
    setTitle(window.localStorage.getItem("cgp-ez-title") || "左右移動ゲーム");
    const savedRevision = Number(window.localStorage.getItem("cgp-ez-revision"));
    revisionRef.current = Number.isFinite(savedRevision) ? Math.max(savedRevision, Date.now()) : Date.now();
    window.localStorage.setItem("cgp-ez-revision", String(revisionRef.current));
    const savedSplit = Number(window.localStorage.getItem("cgp-ez-split-ratio"));
    if (Number.isFinite(savedSplit) && savedSplit >= 0.32 && savedSplit <= 0.76) setSplitRatio(savedSplit);
    const savedDiagnosticsRatio = Number(window.localStorage.getItem("cgp-ez-diagnostics-ratio"));
    if (Number.isFinite(savedDiagnosticsRatio) && savedDiagnosticsRatio >= 0.14 && savedDiagnosticsRatio <= 0.42) setDiagnosticsRatio(savedDiagnosticsRatio);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStaticDiagnostics(analyzeDsl(code));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [code]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      persistCode(code);
      setSaveState("saved");
      setSavedAt(new Date());
    }, 900);
    return () => window.clearTimeout(timer);
  }, [code, saveState]);

  useEffect(() => {
    if (!clientId) return;
    setSyncState("syncing");
    const revision = revisionRef.current;
    const clientUpdatedAt = new Date().toISOString();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, classroomId, studentName, title, code, revision, clientUpdatedAt })
        });
        if (!response.ok) {
          setSyncState("error");
          return;
        }
        const data = (await response.json()) as { ignored?: boolean; revision?: number };
        if (data.ignored) {
          setSyncState("error");
          setMessage("同期が古い更新として無視されました。もう一度編集してください。");
          return;
        }
        if (Number.isFinite(data.revision)) {
          revisionRef.current = Math.max(revisionRef.current, Number(data.revision));
          window.localStorage.setItem("cgp-ez-revision", String(revisionRef.current));
        }
        setLastSyncedAt(new Date());
        setSyncState("synced");
      } catch {
        setSyncState("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [clientId, classroomId, studentName, title, code]);

  const start = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const nextDiagnostics = analyzeDsl(code);
    setStaticDiagnostics(nextDiagnostics);
    setRuntimeDiagnostics([]);
    if (nextDiagnostics.some((item) => item.severity === "error")) return;
    setPreviewCode(code);
    setPreviewState("running");
    setSessionId((value) => value + 1);
  }, [code]);

  const pause = useCallback(() => {
    setPreviewState((state) => (state === "running" ? "paused" : "running"));
  }, []);

  const stop = useCallback(() => {
    setPreviewState("stopped");
    setRuntimeDiagnostics([]);
  }, []);

  const save = useCallback(() => {
    setSaveState("saving");
    persistCode(code);
    const now = new Date();
    setSavedAt(now);
    setSaveState("saved");
    setMessage("ブラウザに保存しました。");
  }, [code]);

  const updateCode = useCallback((nextCode: string) => {
    bumpRevision(revisionRef);
    setCode(nextCode);
    setStaticDiagnostics(analyzeDsl(nextCode));
    setSaveState("dirty");
    setRuntimeDiagnostics([]);
  }, []);

  const updateClassroomId = useCallback((nextClassroomId: string) => {
    const normalized = nextClassroomId.trim() || "default";
    bumpRevision(revisionRef);
    window.localStorage.setItem("cgp-ez-classroom-id", normalized);
    setClassroomId(normalized);
  }, []);

  const updateStudentName = useCallback((nextStudentName: string) => {
    bumpRevision(revisionRef);
    window.localStorage.setItem("cgp-ez-student-name", nextStudentName);
    setStudentName(nextStudentName);
  }, []);

  const updateTitle = useCallback((nextTitle: string) => {
    bumpRevision(revisionRef);
    window.localStorage.setItem("cgp-ez-title", nextTitle);
    setTitle(nextTitle);
  }, []);

  const resetCode = useCallback(() => {
    if (code !== sampleCode && !window.confirm("現在のコードを空のStart/Updateにリセットしますか？")) return;
    updateCode(sampleCode);
    setPreviewState("stopped");
    setMessage("初期状態にリセットしました。");
  }, [code, updateCode]);

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    event.preventDefault();
    const rect = workspace.getBoundingClientRect();
    const startX = event.clientX;
    const startRatio = splitRatio;
    const handleMove = (moveEvent: PointerEvent) => {
      const raw = startRatio + (moveEvent.clientX - startX) / rect.width;
      const next = Math.min(0.76, Math.max(0.32, raw));
      setSplitRatio(next);
    };
    const handleUp = (upEvent: PointerEvent) => {
      const raw = startRatio + (upEvent.clientX - startX) / rect.width;
      const next = Math.min(0.76, Math.max(0.32, raw));
      window.localStorage.setItem("cgp-ez-split-ratio", String(next));
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [splitRatio]);

  const startDiagnosticsResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const panel = editorPanelRef.current;
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
      window.localStorage.setItem("cgp-ez-diagnostics-ratio", String(next));
      document.body.classList.remove("is-row-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    document.body.classList.add("is-row-resizing");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [diagnosticsRatio]);

  const diagnostics = useMemo(() => mergeDiagnostics(staticDiagnostics, runtimeDiagnostics), [staticDiagnostics, runtimeDiagnostics]);
  const hasErrors = useMemo(() => diagnostics.some((item) => item.severity === "error"), [diagnostics]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>CGP EZ GameCreator</h1>
          <span>C#風DSLでゲームを作るLAN内エディタ</span>
        </div>
        <div className="toolbar-group">
          <Link href="/teacher">先生画面</Link>
        </div>
      </header>

      <div
        ref={workspaceRef}
        className={`workspace ${previewMaximized ? "preview-maximized" : ""}`}
        style={{ gridTemplateColumns: `minmax(360px, ${splitRatio}fr) 10px minmax(320px, ${1 - splitRatio}fr)` }}
      >
        <section
          ref={editorPanelRef}
          className="panel editor-panel"
          style={{ gridTemplateRows: `auto minmax(0, ${1 - diagnosticsRatio}fr) 8px minmax(96px, ${diagnosticsRatio}fr)` }}
        >
          <div className="panel-toolbar">
            <div className="toolbar-group">
              <button className={previewState !== "stopped" || hasErrors ? "state-disabled" : "primary"} onClick={start} disabled={previewState !== "stopped" || hasErrors} title="Ctrl+Enter">
                <Play size={16} /> Start
              </button>
              <button className={previewState === "stopped" ? "state-stopped" : previewState === "paused" ? "state-paused" : ""} onClick={pause} disabled={previewState === "stopped"}>
                <Pause size={16} /> {previewState === "paused" ? "Resume" : "Pause"}
              </button>
              <button className={previewState === "stopped" ? "state-stopped" : "state-stop-active"} onClick={stop} disabled={previewState === "stopped"}>
                <Square size={16} /> Stop
              </button>
              <button onClick={save} title="Ctrl+S">
                <Save size={16} /> 保存
              </button>
              <button onClick={resetCode}>
                <RotateCcw size={16} /> リセット
              </button>
              <button onClick={() => setDocsOpen(true)}>
                <BookOpen size={16} /> ドキュメント
              </button>
              <button onClick={() => setAssetsOpen(true)}>
                <FolderOpen size={16} /> ファイル
              </button>
            </div>
            <div className={hasErrors ? "diagnostic-state error" : "ok"}>
              {hasErrors ? "エラーあり" : "実行できます"} / {saveState === "dirty" ? "未保存" : saveState === "saving" ? "保存中" : `保存済み${savedAt ? ` ${savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
            </div>
          </div>
          <CodeEditor ref={editorRef} value={code} diagnostics={diagnostics} readOnly={previewState !== "stopped"} onChange={updateCode} onRun={start} onSave={save} />
          <div className="row-splitter" role="separator" aria-orientation="horizontal" aria-label="エディタと問題パネルの高さを変更" onPointerDown={startDiagnosticsResize} />
          <DiagnosticsPanel diagnostics={diagnostics} onSelect={(item) => editorRef.current?.focusAt(item.line, item.column)} />
        </section>

        <div className="splitter" role="separator" aria-orientation="vertical" aria-label="エディタとプレビューの幅を変更" onPointerDown={startResize} />

        <section className="panel preview-panel">
          <div className="panel-toolbar">
            <div className="toolbar-group">
              <BookOpen size={16} />
              <strong>プレビュー</strong>
            </div>
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
          <GameCanvas code={previewCode} control={previewState} sessionId={sessionId} assetScope={clientId} onDiagnostics={setRuntimeDiagnostics} onStop={() => setPreviewState("stopped")} />
          <section className="submit-box">
            <h2>リアルタイム共有</h2>
            <div className="submit-row">
              <input value={classroomId} onChange={(event) => updateClassroomId(event.target.value)} placeholder="授業ID" />
              <input value={studentName} onChange={(event) => updateStudentName(event.target.value)} placeholder="名前" />
              <input value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="作品名" />
              <div className={`sync-badge ${syncState}`}>{syncLabel(syncState)}{lastSyncedAt ? ` ${lastSyncedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
            </div>
            {message ? <p className="ok">{message}</p> : null}
          </section>
        </section>
      </div>
      <CheatSheet open={docsOpen} onClose={() => setDocsOpen(false)} />
      <AssetBrowser open={assetsOpen} onClose={() => setAssetsOpen(false)} scope={clientId} scopeLabel={studentName || "自分のフォルダ"} />
    </main>
  );
}

function syncLabel(state: "idle" | "syncing" | "synced" | "error") {
  if (state === "syncing") return "同期中";
  if (state === "synced") return "同期済み";
  if (state === "error") return "同期失敗";
  return "待機中";
}

function persistCode(code: string) {
  window.localStorage.setItem("cgp-ez-code", code);
  window.localStorage.setItem("cgp-ez-saved-at", new Date().toISOString());
}

function bumpRevision(revisionRef: MutableRefObject<number>) {
  revisionRef.current = Math.max(revisionRef.current + 1, Date.now());
  window.localStorage.setItem("cgp-ez-revision", String(revisionRef.current));
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
