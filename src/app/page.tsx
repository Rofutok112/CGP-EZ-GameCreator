"use client";

import { BookOpen, FolderOpen, Maximize2, Minimize2, Pause, Play, Plus, RotateCcw, Save, Square, X } from "lucide-react";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog, TextInputDialog } from "@/components/AppDialog";
import { AssetBrowser } from "@/components/AssetBrowser";
import { CheatSheet } from "@/components/CheatSheet";
import { CodeEditor, type CodeEditorHandle } from "@/components/CodeEditor";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { GameCanvas } from "@/components/GameCanvas";
import { getBrowserStorage } from "@/lib/browserStorage";
import { analyzeDsl, type DslDiagnostic } from "@/lib/dsl";
import { sampleCode } from "@/lib/sample";

const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

type EditorPage = {
  id: string;
  name: string;
  code: string;
};

export default function Home() {
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const editorPanelRef = useRef<HTMLElement | null>(null);
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [activePageId, setActivePageId] = useState("");
  const [previewCode, setPreviewCode] = useState(sampleCode);
  const [previewState, setPreviewState] = useState<"stopped" | "running" | "paused">("stopped");
  const [sessionId, setSessionId] = useState(0);
  const [staticDiagnostics, setStaticDiagnostics] = useState<DslDiagnostic[]>([]);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<DslDiagnostic[]>([]);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
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
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [newPageDialogOpen, setNewPageDialogOpen] = useState(false);
  const [deletePageDialogOpen, setDeletePageDialogOpen] = useState(false);
  const revisionRef = useRef(0);
  const activePage = useMemo(() => pages.find((page) => page.id === activePageId) ?? pages[0] ?? null, [activePageId, pages]);
  const code = activePage?.code ?? "";
  const hasActivePage = activePage !== null;

  useEffect(() => {
    const storage = getBrowserStorage();
    const loadedPages = loadPagesFromStorage();
    setPages(loadedPages);
    const savedActivePageId = storage.getItem("cgp-ez-active-page-id");
    const nextActivePage = loadedPages.find((page) => page.id === savedActivePageId) ?? loadedPages[0] ?? null;
    setActivePageId(nextActivePage?.id ?? "");
    setPreviewCode(nextActivePage?.code ?? "");
    const savedAtText = storage.getItem("cgp-ez-saved-at");
    if (savedAtText) setSavedAt(new Date(savedAtText));
    let id = storage.getItem("cgp-ez-client-id");
    if (!id) {
      id = createClientId();
      storage.setItem("cgp-ez-client-id", id);
    }
    setClientId(id);
    setClassroomId(storage.getItem("cgp-ez-classroom-id") || "default");
    setStudentName(storage.getItem("cgp-ez-student-name") || "");
    setTitle(storage.getItem("cgp-ez-title") || "左右移動ゲーム");
    const savedRevision = Number(storage.getItem("cgp-ez-revision"));
    revisionRef.current = Number.isFinite(savedRevision) ? Math.max(savedRevision, Date.now()) : Date.now();
    storage.setItem("cgp-ez-revision", String(revisionRef.current));
    const savedSplit = Number(storage.getItem("cgp-ez-split-ratio"));
    if (Number.isFinite(savedSplit) && savedSplit >= 0.32 && savedSplit <= 0.76) setSplitRatio(savedSplit);
    const savedDiagnosticsRatio = Number(storage.getItem("cgp-ez-diagnostics-ratio"));
    if (Number.isFinite(savedDiagnosticsRatio) && savedDiagnosticsRatio >= 0.14 && savedDiagnosticsRatio <= 0.42) setDiagnosticsRatio(savedDiagnosticsRatio);
  }, []);

  useEffect(() => {
    if (!hasActivePage) {
      setStaticDiagnostics([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setStaticDiagnostics(analyzeDsl(code));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [code, hasActivePage]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      persistPages(pages, activePageId);
      persistCode(code);
      setSaveState("saved");
      setSavedAt(new Date());
    }, 900);
    return () => window.clearTimeout(timer);
  }, [activePageId, code, pages, saveState]);

  useEffect(() => {
    if (isStaticExport) return;
    if (!clientId) return;
    setSyncState("syncing");
    const revision = revisionRef.current;
    const clientUpdatedAt = new Date().toISOString();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, classroomId, studentName, title, code, revision, cursorLine: cursorPosition.line, cursorColumn: cursorPosition.column, clientUpdatedAt })
        });
        if (!response.ok) {
          setSyncState("error");
          return;
        }
        const data = (await response.json()) as { ignored?: boolean; revision?: number };
        if (data.ignored) {
          setSyncState("error");
          setMessage("同期競合 / 再編集待ち");
          return;
        }
        if (Number.isFinite(data.revision)) {
          revisionRef.current = Math.max(revisionRef.current, Number(data.revision));
          getBrowserStorage().setItem("cgp-ez-revision", String(revisionRef.current));
        }
        setLastSyncedAt(new Date());
        setSyncState("synced");
      } catch {
        setSyncState("error");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [clientId, classroomId, studentName, title, code, cursorPosition]);

  useEffect(() => {
    if (isStaticExport) return;
    if (!clientId) return;
    const sendHeartbeat = async () => {
      try {
        const response = await fetch("/api/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            classroomId,
            studentName,
            title,
            code,
            revision: revisionRef.current,
            cursorLine: cursorPosition.line,
            cursorColumn: cursorPosition.column,
            clientUpdatedAt: new Date().toISOString()
          })
        });
        if (response.ok) {
          setLastSyncedAt(new Date());
          setSyncState("synced");
        } else {
          setSyncState("error");
        }
      } catch {
        setSyncState("error");
      }
    };
    const timer = window.setInterval(sendHeartbeat, 5000);
    return () => window.clearInterval(timer);
  }, [clientId, classroomId, studentName, title, code, cursorPosition]);

  const start = useCallback(() => {
    if (!hasActivePage) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const nextDiagnostics = analyzeDsl(code);
    setStaticDiagnostics(nextDiagnostics);
    setRuntimeDiagnostics([]);
    if (nextDiagnostics.some((item) => item.severity === "error")) return;
    setPreviewCode(code);
    setPreviewState("running");
    setSessionId((value) => value + 1);
  }, [code, hasActivePage]);

  const pause = useCallback(() => {
    setPreviewState((state) => (state === "running" ? "paused" : "running"));
  }, []);

  const stop = useCallback(() => {
    setPreviewState("stopped");
    setRuntimeDiagnostics([]);
  }, []);

  const save = useCallback(() => {
    setSaveState("saving");
    persistPages(pages, activePageId);
    persistCode(code);
    const now = new Date();
    setSavedAt(now);
    setSaveState("saved");
    setMessage("保存完了");
  }, [activePageId, code, pages]);

  const updateCode = useCallback((nextCode: string) => {
    if (!activePageId) return;
    bumpRevision(revisionRef);
    setPages((currentPages) => currentPages.map((page) => page.id === activePageId ? { ...page, code: nextCode } : page));
    setStaticDiagnostics(analyzeDsl(nextCode));
    setSaveState("dirty");
    setRuntimeDiagnostics([]);
  }, [activePageId]);

  const selectPage = useCallback((pageId: string) => {
    if (previewState !== "stopped") return;
    const nextPage = pages.find((page) => page.id === pageId);
    if (!nextPage) return;
    setActivePageId(pageId);
    getBrowserStorage().setItem("cgp-ez-active-page-id", pageId);
    setStaticDiagnostics(analyzeDsl(nextPage.code));
    setRuntimeDiagnostics([]);
  }, [pages, previewState]);

  const addPage = useCallback((name: string) => {
    const className = toClassName(name, pages.length + 1);
    const nextPage = createEditorPage(className, emptyPageCode(className));
    bumpRevision(revisionRef);
    setPages((currentPages) => [...currentPages, nextPage]);
    setActivePageId(nextPage.id);
    getBrowserStorage().setItem("cgp-ez-active-page-id", nextPage.id);
    setStaticDiagnostics(analyzeDsl(nextPage.code));
    setRuntimeDiagnostics([]);
    setSaveState("dirty");
    setNewPageDialogOpen(false);
  }, [pages.length]);

  const deletePage = useCallback((pageId: string) => {
    bumpRevision(revisionRef);
    const activeIndex = pages.findIndex((page) => page.id === pageId);
    const nextPages = pages.filter((page) => page.id !== pageId);
    const nextActive = pageId === activePageId ? nextPages[Math.max(0, Math.min(activeIndex, nextPages.length - 1))] ?? null : activePage;
    setPages(nextPages);
    setActivePageId(nextActive?.id ?? "");
    getBrowserStorage().setItem("cgp-ez-active-page-id", nextActive?.id ?? "");
    setStaticDiagnostics(nextActive ? analyzeDsl(nextActive.code) : []);
    setRuntimeDiagnostics([]);
    setSaveState("dirty");
    setDeletePageDialogOpen(false);
  }, [activePage, activePageId, pages]);

  const updateClassroomId = useCallback((nextClassroomId: string) => {
    const normalized = nextClassroomId.trim() || "default";
    bumpRevision(revisionRef);
    getBrowserStorage().setItem("cgp-ez-classroom-id", normalized);
    setClassroomId(normalized);
  }, []);

  const updateStudentName = useCallback((nextStudentName: string) => {
    bumpRevision(revisionRef);
    getBrowserStorage().setItem("cgp-ez-student-name", nextStudentName);
    setStudentName(nextStudentName);
  }, []);

  const updateTitle = useCallback((nextTitle: string) => {
    bumpRevision(revisionRef);
    getBrowserStorage().setItem("cgp-ez-title", nextTitle);
    setTitle(nextTitle);
  }, []);

  const resetCode = useCallback(() => {
    if (!hasActivePage) return;
    if (code !== sampleCode) {
      setResetDialogOpen(true);
      return;
    }
    updateCode(sampleCode);
    setPreviewState("stopped");
    setMessage("リセット完了");
  }, [code, hasActivePage, updateCode]);

  const confirmResetCode = useCallback(() => {
    setResetDialogOpen(false);
    updateCode(sampleCode);
    setPreviewState("stopped");
    setMessage("リセット完了");
  }, [updateCode]);

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
      getBrowserStorage().setItem("cgp-ez-split-ratio", String(next));
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
      getBrowserStorage().setItem("cgp-ez-diagnostics-ratio", String(next));
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
          {isStaticExport ? <span>Static Preview</span> : null}
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
          style={{ gridTemplateRows: `auto auto minmax(0, ${1 - diagnosticsRatio}fr) 8px minmax(96px, ${diagnosticsRatio}fr)` }}
        >
          <div className="panel-toolbar">
            <div className="toolbar-group">
              <button className={previewState !== "stopped" || hasErrors || !hasActivePage ? "state-disabled" : "primary"} onClick={start} disabled={previewState !== "stopped" || hasErrors || !hasActivePage} title="Ctrl+Enter">
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
              <button onClick={resetCode} disabled={!hasActivePage}>
                <RotateCcw size={16} /> リセット
              </button>
              <button onClick={() => setDocsOpen(true)}>
                <BookOpen size={16} /> ドキュメント
              </button>
              {!isStaticExport ? (
                <button onClick={() => setAssetsOpen(true)}>
                  <FolderOpen size={16} /> ファイル
                </button>
              ) : null}
            </div>
            <div className={hasErrors ? "diagnostic-state error" : "ok"}>
              {!hasActivePage ? "スクリプトなし" : hasErrors ? "Error" : "実行可能"} / {saveState === "dirty" ? "未保存" : saveState === "saving" ? "保存中" : `保存済${savedAt ? ` ${savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
            </div>
          </div>
          <div className="page-tabs" aria-label="コードページ">
            <div className="page-tab-list">
              {pages.map((page) => (
                <button
                  className={page.id === activePageId ? "page-tab active" : "page-tab"}
                  disabled={previewState !== "stopped"}
                  key={page.id}
                  onClick={() => selectPage(page.id)}
                  title={previewState !== "stopped" ? "停止中のみページ変更可能" : page.name}
                >
                  <span>{page.name}</span>
                  {page.id === activePageId ? (
                    <span
                      className="page-tab-close"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (previewState === "stopped") setDeletePageDialogOpen(true);
                      }}
                      role="button"
                      aria-label={`${page.name}を削除`}
                    >
                      <X size={13} />
                    </span>
                  ) : null}
                </button>
              ))}
              <button className="page-tab add" disabled={previewState !== "stopped"} onClick={() => setNewPageDialogOpen(true)} title="ページ追加">
                <Plus size={16} />
              </button>
            </div>
          </div>
          {hasActivePage ? (
            <CodeEditor ref={editorRef} value={code} diagnostics={diagnostics} readOnly={previewState !== "stopped"} onChange={updateCode} onCursorChange={setCursorPosition} onRun={start} onSave={save} />
          ) : (
            <section className="empty-script-state">
              <h2>スクリプトを作りましょう</h2>
              <p>上の + から新しいスクリプトを追加できます。</p>
              <button className="primary" onClick={() => setNewPageDialogOpen(true)}>
                <Plus size={16} /> スクリプト作成
              </button>
            </section>
          )}
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
              <button className={showCoordinates ? "primary" : ""} onClick={() => setShowCoordinates((value) => !value)} title="座標を表示">
                座標
              </button>
            </div>
          </div>
          <GameCanvas code={previewCode} control={previewState} sessionId={sessionId} assetScope={clientId} showCoordinates={showCoordinates} onDiagnostics={setRuntimeDiagnostics} onStop={() => setPreviewState("stopped")} />
          {isStaticExport ? (
            <section className="submit-box">
              <h2>Static Preview</h2>
              <p className="ok">ローカル保存のみ。Live Sync / Files / Teacher はLAN版限定。</p>
            </section>
          ) : (
            <section className="submit-box">
              <h2>Live Sync</h2>
              <div className="submit-row">
                <input value={classroomId} onChange={(event) => updateClassroomId(event.target.value)} placeholder="授業ID" />
                <input value={studentName} onChange={(event) => updateStudentName(event.target.value)} placeholder="名前" />
                <input value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="作品名" />
                <div className={`sync-badge ${syncState}`}>{syncLabel(syncState)}{lastSyncedAt ? ` ${lastSyncedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
              </div>
              {message ? <p className="ok">{message}</p> : null}
            </section>
          )}
        </section>
      </div>
      <CheatSheet open={docsOpen} onClose={() => setDocsOpen(false)} />
      <AssetBrowser open={assetsOpen} onClose={() => setAssetsOpen(false)} scope={clientId} scopeLabel={studentName || "自分のフォルダ"} />
      <ConfirmDialog
        open={resetDialogOpen}
        title="Reset Code"
        message="現在のコードを初期状態へ戻す。取り消し不可。"
        confirmLabel="リセット"
        danger
        onConfirm={confirmResetCode}
        onCancel={() => setResetDialogOpen(false)}
      />
      <TextInputDialog
        open={newPageDialogOpen}
        title="New Page"
        message="入力した名前がクラス名になります。"
        label="クラス名"
        initialValue={`Script${pages.length + 1}`}
        confirmLabel="追加"
        onConfirm={addPage}
        onCancel={() => setNewPageDialogOpen(false)}
      />
      <ConfirmDialog
        open={deletePageDialogOpen}
        title="Delete Page"
        message={`「${activePage?.name ?? ""}」を削除。取り消し不可。`}
        confirmLabel="削除"
        danger
        hideCloseButton
        onConfirm={() => {
          if (activePage) deletePage(activePage.id);
        }}
        onCancel={() => setDeletePageDialogOpen(false)}
      />
    </main>
  );
}

function syncLabel(state: "idle" | "syncing" | "synced" | "error") {
  if (state === "syncing") return "同期中";
  if (state === "synced") return "同期済";
  if (state === "error") return "同期失敗";
  return "待機中";
}

function persistCode(code: string) {
  const storage = getBrowserStorage();
  storage.setItem("cgp-ez-code", code);
  storage.setItem("cgp-ez-saved-at", new Date().toISOString());
}

function persistPages(pages: EditorPage[], activePageId: string) {
  const storage = getBrowserStorage();
  storage.setItem("cgp-ez-pages", JSON.stringify(pages));
  storage.setItem("cgp-ez-active-page-id", activePageId);
  storage.setItem("cgp-ez-saved-at", new Date().toISOString());
}

function loadPagesFromStorage() {
  const storage = getBrowserStorage();
  const rawPages = storage.getItem("cgp-ez-pages");
  if (rawPages) {
    try {
      const parsed = JSON.parse(rawPages) as EditorPage[];
      const pages = parsed.filter((page) => typeof page?.id === "string" && typeof page?.name === "string" && typeof page?.code === "string");
      if (pages.length) return pages;
    } catch {
      // Legacy single-code storage is used below.
    }
  }
  const legacyCode = storage.getItem("cgp-ez-code");
  return legacyCode ? [createEditorPage("Main", legacyCode)] : [];
}

function createEditorPage(name: string, code: string): EditorPage {
  return {
    id: createClientId(),
    name,
    code
  };
}

function toClassName(name: string, fallbackIndex: number) {
  const normalized = name.trim().replace(/[^A-Za-z0-9_]/g, "");
  const withValidHead = /^[A-Za-z_]/.test(normalized) ? normalized : `Script${fallbackIndex}`;
  return withValidHead || `Script${fallbackIndex}`;
}

function emptyPageCode(className: string) {
  return `class ${className}
{
    void Start()
    {
        
    }

    void Update()
    {
        
    }
}`;
}

function bumpRevision(revisionRef: MutableRefObject<number>) {
  revisionRef.current = Math.max(revisionRef.current + 1, Date.now());
  getBrowserStorage().setItem("cgp-ez-revision", String(revisionRef.current));
}

function createClientId() {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) return randomUUID();

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
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
