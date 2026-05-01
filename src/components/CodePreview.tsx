"use client";

import { highlightDslLine } from "@/lib/highlight";

export function CodePreview({ code, className = "" }: { code: string; className?: string }) {
  return (
    <pre className={`code-preview ${className}`} aria-label="コードプレビュー">
      {code.split(/\r?\n/).map((line, lineIndex) => (
        <span className="code-line" key={lineIndex}>
          {highlightDslLine(line).map((token, tokenIndex) => (
            <span className={token.className || undefined} key={tokenIndex}>
              {token.text}
            </span>
          ))}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}
