"use client";

import { useEffect, useRef, useState } from "react";
import { highlightDslLine } from "@/lib/highlight";

export function CodePreview({
  code,
  className = "",
  cursorLine,
  cursorColumn,
  autoFollowCursor = false
}: {
  code: string;
  className?: string;
  cursorLine?: number;
  cursorColumn?: number;
  autoFollowCursor?: boolean;
}) {
  const ref = useRef<HTMLPreElement | null>(null);
  const [followCursor, setFollowCursor] = useState(autoFollowCursor);
  const resumeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setFollowCursor(autoFollowCursor);
  }, [autoFollowCursor]);

  useEffect(() => {
    if (!autoFollowCursor || !followCursor || !cursorLine) return;
    const target = ref.current?.querySelector<HTMLElement>(".teacher-cursor-marker") ?? ref.current?.querySelector<HTMLElement>(`[data-code-line="${cursorLine}"]`);
    target?.scrollIntoView({ block: "center", inline: "center" });
  }, [autoFollowCursor, code, cursorLine, cursorColumn, followCursor]);

  const pauseFollow = () => {
    if (!autoFollowCursor) return;
    setFollowCursor(false);
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
  };

  const resumeFollowSoon = () => {
    if (!autoFollowCursor) return;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => setFollowCursor(true), 900);
  };

  return (
    <pre
      ref={ref}
      className={`code-preview ${className}`}
      aria-label="コードプレビュー"
      onWheel={pauseFollow}
      onPointerDown={pauseFollow}
      onPointerUp={resumeFollowSoon}
      onPointerLeave={resumeFollowSoon}
    >
      {code.split(/\r?\n/).map((line, lineIndex) => (
        <span className={cursorLine === lineIndex + 1 ? "code-line active-cursor-line" : "code-line"} data-code-line={lineIndex + 1} key={lineIndex}>
          {cursorLine === lineIndex + 1 ? renderLineWithCursor(line, cursorColumn ?? 1) : renderHighlighted(line)}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function renderLineWithCursor(line: string, cursorColumn: number) {
  const index = Math.min(Math.max(cursorColumn - 1, 0), line.length);
  const tokens = highlightDslLine(line);
  const result: React.ReactNode[] = [];
  let offset = 0;
  let inserted = false;

  tokens.forEach((token, tokenIndex) => {
    const start = offset;
    const end = offset + token.text.length;
    if (!inserted && index >= start && index <= end) {
      const localIndex = index - start;
      const before = token.text.slice(0, localIndex);
      const after = token.text.slice(localIndex);
      if (before) result.push(renderToken(before, token.className, `cursor-${tokenIndex}-before`));
      result.push(<span className="teacher-cursor-marker" aria-label="生徒のカーソル" key="cursor" />);
      if (after) result.push(renderToken(after, token.className, `cursor-${tokenIndex}-after`));
      inserted = true;
    } else {
      result.push(renderToken(token.text, token.className, `cursor-${tokenIndex}`));
    }
    offset = end;
  });

  if (!inserted) result.push(<span className="teacher-cursor-marker" aria-label="生徒のカーソル" key="cursor" />);
  return <>{result}</>;
}

function renderHighlighted(line: string, keyPrefix = "token") {
  return highlightDslLine(line).map((token, tokenIndex) => renderToken(token.text, token.className, `${keyPrefix}-${tokenIndex}`));
}

function renderToken(text: string, className: string, key: string) {
  return (
    <span className={className || undefined} key={key}>
      {text}
    </span>
  );
}
