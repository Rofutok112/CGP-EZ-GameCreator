export type HighlightToken = {
  text: string;
  className: string;
};

const primitiveTypes = new Set(["int", "float", "bool", "string", "void"]);
const classTypes = new Set(["GameObject", "UIText", "UIBox", "UICircle", "UIButton", "List", "Main", "MonoBehaviour", "Color", "Animator", "AudioSource", "Image", "Slider"]);
const keywords = new Set(["class", "public", "private", "static", "if", "else", "for", "foreach", "in", "new", "true", "false", "return"]);
const tokenPattern = /\/\/.*|"(?:\\.|[^"\\])*"?|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|\s+|./g;

export function highlightDslLine(line: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const matches = [...line.matchAll(tokenPattern)];
  for (let i = 0; i < matches.length; i += 1) {
    const text = matches[i][0];
    if (text.startsWith("//")) {
      tokens.push({ text, className: "code-comment" });
      continue;
    }
    if (text.startsWith("\"")) {
      tokens.push({ text, className: "code-string" });
      continue;
    }
    if (/^\d/.test(text)) {
      tokens.push({ text, className: "code-number" });
      continue;
    }
    if (/^[A-Za-z_]/.test(text)) {
      const next = nextNonWhitespace(matches, i + 1);
      const looksLikeType = /^[A-Z][A-Za-z0-9_]*$/.test(text);
      const className =
        primitiveTypes.has(text) ? "code-primitive" :
        keywords.has(text) ? "code-keyword" :
        next === "(" ? "code-method" :
        classTypes.has(text) || looksLikeType ? "code-class" :
        "";
      tokens.push({ text, className });
      continue;
    }
    tokens.push({ text, className: "" });
  }
  return tokens;
}

function nextNonWhitespace(matches: RegExpMatchArray[], start: number) {
  for (let i = start; i < matches.length; i += 1) {
    const text = matches[i][0];
    if (!/^\s+$/.test(text)) return text;
  }
  return "";
}
