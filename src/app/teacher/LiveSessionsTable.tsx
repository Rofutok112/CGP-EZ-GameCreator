"use client";

import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/AppDialog";
import { CodePreview } from "@/components/CodePreview";
import type { LiveSession } from "@/db/schema";
import { getBrowserStorage } from "@/lib/browserStorage";

export function LiveSessionsTable() {
  const [rows, setRows] = useState<LiveSession[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [classroomId, setClassroomId] = useState("default");
  const [teacherToken, setTeacherToken] = useState("teacher");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  useEffect(() => {
    const storage = getBrowserStorage();
    setClassroomId(storage.getItem("cgp-ez-teacher-classroom-id") || "default");
    setTeacherToken(storage.getItem("cgp-ez-teacher-token") || "teacher");
  }, []);

  useEffect(() => {
    let active = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const params = new URLSearchParams({ classroomId, token: teacherToken, activeWithinSeconds: "15", t: String(Date.now()) });
        const response = await fetch(`/api/live?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("load failed");
        const nextRows = (await response.json()) as LiveSession[];
        if (active) {
          setRows(nextRows);
          setError("");
        }
      } catch {
        if (active) setError("リアルタイム一覧を取得できませんでした。");
      } finally {
        loading = false;
      }
    };
    load();
    const timer = window.setInterval(load, 500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [classroomId, teacherToken]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => `${row.studentName} ${row.title} ${row.clientId}`.toLowerCase().includes(normalized));
  }, [query, rows]);

  const updateClassroomId = (value: string) => {
    const next = value.trim() || "default";
    getBrowserStorage().setItem("cgp-ez-teacher-classroom-id", next);
    setClassroomId(next);
  };

  const updateTeacherToken = (value: string) => {
    getBrowserStorage().setItem("cgp-ez-teacher-token", value);
    setTeacherToken(value);
  };

  const archive = async (clientId?: string, olderThanMinutes?: number) => {
    const params = new URLSearchParams({ classroomId, token: teacherToken });
    if (olderThanMinutes) params.set("olderThanMinutes", String(olderThanMinutes));
    const path = clientId ? `/api/live/${clientId}` : "/api/live";
    const response = await fetch(`${path}?${params}`, { method: "DELETE" });
    if (!response.ok) {
      setError("セッションを整理できませんでした。");
      return;
    }
    setRows((current) =>
      clientId
        ? current.filter((row) => row.clientId !== clientId)
        : olderThanMinutes
          ? current.filter((row) => Date.now() - new Date(row.updatedAt).getTime() <= olderThanMinutes * 60_000)
          : []
    );
  };

  return (
    <div className="teacher-stack">
      <section className="panel teacher-controls">
        <label>
          授業ID
          <input value={classroomId} onChange={(event) => updateClassroomId(event.target.value)} />
        </label>
        <label>
          先生トークン
          <input value={teacherToken} onChange={(event) => updateTeacherToken(event.target.value)} />
        </label>
        <label className="search-field">
          検索
          <span>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前、作品名、ID" />
          </span>
        </label>
        <button onClick={() => archive(undefined, 30)}>
          <Trash2 size={16} /> 30分以上未更新を非表示
        </button>
        <button className="state-stop-active" onClick={() => setResetDialogOpen(true)}>
          <Trash2 size={16} /> 授業をリセット
        </button>
      </section>
      <div className="live-board">
      {error ? <div className="panel empty-state">{error}</div> : null}
      {!error && filteredRows.length === 0 ? <div className="panel empty-state">表示できる生徒はいません。</div> : null}
      {!error
        ? filteredRows.map((row) => {
            const ageMs = Date.now() - new Date(row.updatedAt).getTime();
            const online = ageMs < 10000;
            const unnamed = row.studentName === "名前未設定";
            return (
              <article className={`live-card ${unnamed ? "needs-name" : ""}`} key={row.clientId}>
                <header className="live-card-header">
                  <div>
                    <h2>{row.studentName}</h2>
                    <p>{row.title} / rev.{row.revision}</p>
                  </div>
                  <span className={`live-state ${online ? "online" : "offline"}`}>{online ? "同期中" : "未更新"}</span>
                </header>
                <CodePreview code={row.code} className="live-code-preview" cursorLine={row.cursorLine} cursorColumn={row.cursorColumn} autoFollowCursor />
                <footer className="live-card-footer">
                  <span>最終同期 {new Date(row.updatedAt).toLocaleTimeString("ja-JP")}</span>
                  <button onClick={() => archive(row.clientId)}>非表示</button>
                  <Link href={`/teacher/${row.clientId}`}>開く</Link>
                </footer>
              </article>
            );
          })
        : null}
      </div>
      <ConfirmDialog
        open={resetDialogOpen}
        title="授業をリセット"
        message={`授業ID「${classroomId}」の表示中セッションをすべて非表示にします。この操作は元に戻せません。`}
        confirmLabel="リセット"
        danger
        onConfirm={() => {
          setResetDialogOpen(false);
          void archive();
        }}
        onCancel={() => setResetDialogOpen(false)}
      />
    </div>
  );
}
