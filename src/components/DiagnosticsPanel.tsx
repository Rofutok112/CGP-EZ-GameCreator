"use client";

import type { DslDiagnostic } from "@/lib/dsl";

export function DiagnosticsPanel({ diagnostics, onSelect }: { diagnostics: DslDiagnostic[]; onSelect?(diagnostic: DslDiagnostic): void }) {
  const sorted = [...diagnostics].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
  const errorCount = diagnostics.filter((item) => item.severity === "error").length;
  const warningCount = diagnostics.length - errorCount;

  return (
    <section className="diagnostics">
      <div className="diagnostics-header">
        <h2>問題</h2>
        <span>
          エラー {errorCount} / 警告 {warningCount}
        </span>
      </div>
      {diagnostics.length === 0 ? (
        <div className="ok">No Issues / Ctrl+Enter</div>
      ) : (
        sorted.map((item, index) => (
          <button className={`diagnostic ${item.severity}`} key={`${item.line}-${item.column}-${index}`} onClick={() => onSelect?.(item)}>
            <strong>
              {item.severity === "warning" ? "警告" : "エラー"}: {item.line}行目 {item.column}文字目
            </strong>
            {item.message}
          </button>
        ))
      )}
    </section>
  );
}
