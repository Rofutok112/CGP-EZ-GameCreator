"use client";

import { indentMore } from "@codemirror/commands";
import { acceptCompletion, autocompletion, closeBrackets, CompletionContext, snippetCompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput, indentUnit } from "@codemirror/language";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, highlightActiveLine, hoverTooltip, keymap, lineNumbers } from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { DslDiagnostic } from "@/lib/dsl";

export type CodeEditorHandle = {
  focusAt(line: number, column: number): void;
};

const globalCompletions = [
  "class Main", "void Start()", "void Update()", "void MovePlayer(float speed)", "int", "float", "bool", "string", "void", "GameObject", "Text", "List<GameObject>",
  "Create", "Time", "Random", "Math", "key", "game", "sound", "camera"
].map((label) => ({ label, type: label.includes("(") ? "function" : "keyword" }));

const snippetCompletions = [
  snippetCompletion("if (${condition})\n{\n    ${}\n}", {
    label: "if",
    type: "keyword",
    detail: "if文"
  }),
  snippetCompletion("else if (${condition})\n{\n    ${}\n}", {
    label: "else if",
    type: "keyword",
    detail: "else if文"
  }),
  snippetCompletion("else\n{\n    ${}\n}", {
    label: "else",
    type: "keyword",
    detail: "else文"
  }),
  snippetCompletion("for (int ${i} = 0; ${i} < ${count}; ${i} = ${i} + 1)\n{\n    ${}\n}", {
    label: "for",
    type: "keyword",
    detail: "for文"
  }),
  snippetCompletion("foreach (${GameObject} ${item} in ${items})\n{\n    ${}\n}", {
    label: "foreach",
    type: "keyword",
    detail: "foreach文"
  }),
  snippetCompletion("void ${FunctionName}()\n{\n    ${}\n}", {
    label: "void function",
    type: "function",
    detail: "関数定義"
  }),
  snippetCompletion("GameObject ${name};", {
    label: "GameObject field",
    type: "variable",
    detail: "フィールド宣言"
  }),
  snippetCompletion("Text ${name};", {
    label: "Text field",
    type: "variable",
    detail: "テキスト宣言"
  })
];

const memberCompletions: Record<string, { label: string; type: string; detail?: string }[]> = {
  Create: [
    { label: "Box", type: "function", detail: "Create.Box(x, y, width, height)" },
    { label: "Circle", type: "function", detail: "Create.Circle(x, y, radius)" },
    { label: "Sprite", type: "function", detail: "Create.Sprite(name, x, y, width, height)" },
    { label: "Text", type: "function", detail: "Create.Text(value, x, y, size)" }
  ],
  Time: [
    { label: "time", type: "property" },
    { label: "deltaTime", type: "property" },
    { label: "frameCount", type: "property" }
  ],
  Random: [
    { label: "Range", type: "function", detail: "Random.Range(min, max)" },
    { label: "Chance", type: "function", detail: "Random.Chance(0.01f)" }
  ],
  Math: [
    { label: "Round", type: "function", detail: "Math.Round(value, digits)" },
    { label: "Fixed", type: "function", detail: "Math.Fixed(value, digits)" },
    { label: "Floor", type: "function", detail: "Math.Floor(value)" },
    { label: "Ceil", type: "function", detail: "Math.Ceil(value)" }
  ],
  key: [
    { label: "Down", type: "function", detail: "key.Down(\"A\")" },
    { label: "Pressed", type: "function", detail: "key.Pressed(\"Space\")" }
  ],
  game: [{ label: "Reset", type: "function" }],
  sound: [{ label: "Play", type: "function", detail: "sound.Play(\"jump\", 0.5f)" }],
  camera: [{ label: "Follow", type: "function" }],
  GameObject: [
    { label: "x", type: "property" },
    { label: "y", type: "property" },
    { label: "vx", type: "property" },
    { label: "vy", type: "property" },
    { label: "width", type: "property" },
    { label: "height", type: "property" },
    { label: "visible", type: "property" },
    { label: "color", type: "property" },
    { label: "flipX", type: "property", detail: "左右反転: obj.flipX = true" },
    { label: "Touch", type: "function" },
    { label: "TouchWall", type: "function" },
    { label: "Hide", type: "function" },
    { label: "Show", type: "function" },
    { label: "Move", type: "function" },
    { label: "SetSprite", type: "function", detail: "obj.SetSprite(name)" },
    { label: "Destroy", type: "function" }
  ],
  Text: [
    { label: "x", type: "property" },
    { label: "y", type: "property" },
    { label: "value", type: "property" },
    { label: "size", type: "property" },
    { label: "color", type: "property" },
    { label: "visible", type: "property" },
    { label: "Hide", type: "function" },
    { label: "Show", type: "function" },
    { label: "Move", type: "function" },
    { label: "Destroy", type: "function" }
  ],
  int: [
    { label: "ToString", type: "function", detail: "value.ToString(\"F2\")" }
  ],
  float: [
    { label: "ToString", type: "function", detail: "value.ToString(\"F2\")" }
  ],
  List: [
    { label: "Add", type: "function" },
    { label: "Remove", type: "function" },
    { label: "Clear", type: "function" },
    { label: "Count", type: "property" }
  ]
};

const editableCompartment = new Compartment();
const disabledThemeCompartment = new Compartment();
const primitiveTypeMark = Decoration.mark({ class: "tok-primitive" });
const classTypeMark = Decoration.mark({ class: "tok-class" });
const methodMark = Decoration.mark({ class: "tok-method" });
const keywordMark = Decoration.mark({ class: "tok-keyword" });
const stringMark = Decoration.mark({ class: "tok-string" });
const numberMark = Decoration.mark({ class: "tok-number" });
const commentMark = Decoration.mark({ class: "tok-comment" });

const primitiveTypes = new Set(["int", "float", "bool", "string", "void"]);
const classTypes = new Set([
  "GameObject",
  "Text",
  "List",
  "Main",
  "MonoBehaviour",
  "Color",
  "Animator",
  "AudioSource",
  "Image",
  "Slider"
]);
const keywords = new Set(["class", "public", "private", "static", "if", "else", "for", "foreach", "in", "new", "true", "false", "return"]);

const apiDocs: Record<string, string> = {
  "Create.Box": "GameObjectを四角形として作成します: Create.Box(x, y, width, height)",
  "Create.Circle": "GameObjectを円として作成します: Create.Circle(x, y, radius)",
  "Create.Sprite": "画像をGameObjectとして作成します。サイズは画像ではなく指定したwidth/heightです: Create.Sprite(name, x, y, width, height)",
  "SetSprite": "GameObjectの見た目をあとから画像にします。サイズはそのままです: obj.SetSprite(name)",
  "flipX": "GameObjectの画像を左右反転します: obj.flipX = true",
  "Create.Text": "Textを作成します: Create.Text(value, x, y, size)",
  "Touch": "2つのオブジェクトが触れているかをboolで返します。",
  "TouchWall": "画面端に触れているかをboolで返します。",
  "Destroy": "オブジェクトを描画・当たり判定から完全に外します。",
  "Hide": "非表示にし、当たり判定から外します。Show()で戻せます。",
  "Show": "Hide()したオブジェクトを表示・当たり判定に戻します。",
  "Move": "位置を変更します: Move(x, y)",
  "key.Down": "キーを押している間trueです: key.Down(\"A\")",
  "key.Pressed": "キーを押した瞬間だけtrueです: key.Pressed(\"Space\")",
  "Random.Range": "minからmaxまでの乱数を返します。",
  "Random.Chance": "指定した確率でtrueを返します。0.01fなら約1%。",
  "Math.Round": "数値を指定した小数桁に丸めます: Math.Round(value, digits)",
  "Math.Fixed": "数値を指定した小数桁の文字列にします: Math.Fixed(value, digits)",
  "Math.Floor": "小数を切り捨てます。",
  "Math.Ceil": "小数を切り上げます。",
  "ToString": "数値を文字列にします。\"F2\" で小数2桁表示です: value.ToString(\"F2\")",
  "Time.time": "ゲーム開始からの秒数です。",
  "Time.deltaTime": "前フレームからの秒数です。",
  "Time.frameCount": "現在のフレーム数です。"
};

function dslCompletions(context: CompletionContext) {
  const before = context.state.sliceDoc(Math.max(0, context.pos - 80), context.pos);
  const member = before.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_]*)$/);
  if (member) {
    const owner = member[1];
    const inferredType = inferSymbolType(context.state.doc.toString().slice(0, context.pos), owner);
    const options = memberCompletions[owner] ?? (inferredType ? memberCompletions[inferredType] : undefined);
    if (options) return { from: context.pos - member[2].length, options };
  }

  const word = context.matchBefore(/[A-Za-z_.<>]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: [...snippetCompletions, ...globalCompletions, ...collectSymbolCompletions(context.state.doc.toString().slice(0, context.pos))] };
}

function inferSymbolType(source: string, name: string): string | null {
  const code = maskCommentsAndStrings(source);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...code.matchAll(new RegExp(`\\b(GameObject|Text|List\\s*<[^>]+>|int|float|bool|string)\\s+${escaped}\\b`, "g"))];
  const match = matches.at(-1);
  if (!match) return null;
  if (match[1].startsWith("List")) return "List";
  return match[1];
}

function collectSymbolCompletions(source: string) {
  const results: { label: string; type: string }[] = [];
  const seen = new Set<string>();
  const code = maskCommentsAndStrings(source);
  const symbolPattern = /\b(?:GameObject|Text|List\s*<[^>]+>|int|float|bool|string)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = symbolPattern.exec(code))) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ label: match[1], type: "variable" });
    }
  }
  const methodPattern = /\bvoid\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  while ((match = methodPattern.exec(code))) {
    if (!["Start", "Update"].includes(match[1]) && !seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ label: match[1], type: "function" });
    }
  }
  return results;
}

function maskCommentsAndStrings(source: string) {
  return source
    .replace(/\/\/.*$/gm, "")
    .replace(/"(?:\\.|[^"\\])*"?/g, "\"\"");
}

function smartEnter(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const line = view.state.doc.lineAt(selection.head);
  const beforeCursor = line.text.slice(0, selection.head - line.from);
  const afterCursor = line.text.slice(selection.head - line.from);
  const indent = beforeCursor.match(/^\s*/)?.[0] ?? "";
  const trimmedBefore = beforeCursor.trimEnd();
  const trimmedAfter = afterCursor.trimStart();

  const allman = expandAllmanBlock(view, line, selection.head, beforeCursor, afterCursor);
  if (allman) return true;

  if (trimmedBefore.endsWith("{") && trimmedAfter.startsWith("}")) {
    view.dispatch({
      changes: { from: selection.head, to: selection.head, insert: `\n${indent}    \n${indent}` },
      selection: { anchor: selection.head + 1 + indent.length + 4 },
      scrollIntoView: true
    });
    return true;
  }

  if (trimmedBefore.endsWith("{") && trimmedAfter === "") {
    view.dispatch({
      changes: { from: selection.head, to: selection.head, insert: `\n${indent}    ` },
      selection: { anchor: selection.head + 1 + indent.length + 4 },
      scrollIntoView: true
    });
    return true;
  }

  if (/^(?:[A-Za-z_][A-Za-z0-9_<>]*\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{\s*$/.test(trimmedBefore) && trimmedAfter === "") {
    view.dispatch({
      changes: { from: selection.head, to: selection.head, insert: `\n${indent}    \n${indent}}` },
      selection: { anchor: selection.head + 1 + indent.length + 4 },
      scrollIntoView: true
    });
    return true;
  }

  return false;
}

function smartTab(view: EditorView): boolean {
  if (acceptCompletion(view)) return true;
  const selection = view.state.selection.main;
  if (!selection.empty) return indentMore(view);
  view.dispatch({
    changes: { from: selection.head, to: selection.head, insert: "    " },
    selection: { anchor: selection.head + 4 },
    scrollIntoView: true
  });
  return true;
}

function expandAllmanBlock(view: EditorView, line: { from: number; text: string }, cursor: number, beforeCursor: string, afterCursor: string): boolean {
  const braceIndex = beforeCursor.lastIndexOf("{");
  if (braceIndex < 0) return false;

  const prefix = beforeCursor.slice(0, braceIndex).trimEnd();
  const indent = beforeCursor.match(/^\s*/)?.[0] ?? "";
  const afterBlock = view.state.doc.sliceString(cursor, Math.min(view.state.doc.length, cursor + 200));
  if (prefix === "" && /^\s*}/.test(afterBlock)) {
    const closeOffset = afterBlock.indexOf("}");
    const replaceTo = closeOffset >= 0 ? cursor + closeOffset : cursor;
    const insert = `\n${indent}    \n${indent}`;
    view.dispatch({
      changes: { from: cursor, to: replaceTo, insert },
      selection: { anchor: cursor + 1 + indent.length + 4 },
      scrollIntoView: true
    });
    return true;
  }

  if (!/^(?:if|else if|else|for|foreach)\b/.test(prefix.trim()) && !/^(?:[A-Za-z_][A-Za-z0-9_<>]*\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)$/.test(prefix.trim())) {
    return false;
  }

  const replaceFrom = line.from + prefix.length;
  const replaceTo = cursor + (afterCursor.trimStart().startsWith("}") ? afterCursor.indexOf("}") + 1 : 0);
  const insert = `\n${indent}{\n${indent}    \n${indent}}`;
  const cursorOffset = insert.indexOf(`${indent}    `) + indent.length + 4;
  view.dispatch({
    changes: { from: replaceFrom, to: replaceTo, insert },
    selection: { anchor: replaceFrom + cursorOffset },
    scrollIntoView: true
  });
  return true;
}

const semanticHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildSemanticDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = buildSemanticDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

function buildSemanticDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const token = /\/\/.*|"(?:\\.|[^"\\])*"?|\b\d+(?:\.\d+)?[fF]?\b|[A-Za-z_][A-Za-z0-9_]*/g;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;
    while ((match = token.exec(text))) {
      const start = from + match.index;
      const end = start + match[0].length;
      if (match[0].startsWith("//")) {
        builder.add(start, end, commentMark);
        continue;
      }
      if (match[0].startsWith("\"")) {
        builder.add(start, end, stringMark);
        continue;
      }
      if (/^\d/.test(match[0])) {
        builder.add(start, end, numberMark);
        continue;
      }
      const next = view.state.doc.sliceString(end, Math.min(view.state.doc.length, end + 20)).trimStart()[0];
      const text = match[0];
      const looksLikeType = /^[A-Z][A-Za-z0-9_]*$/.test(text);
      const mark =
        primitiveTypes.has(text) ? primitiveTypeMark :
        keywords.has(text) ? keywordMark :
        next === "(" ? methodMark :
        classTypes.has(text) || looksLikeType ? classTypeMark :
        null;
      if (mark) builder.add(start, end, mark);
    }
  }
  return builder.finish();
}

const apiHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const offset = pos - line.from;
  const word = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/g;
  let match: RegExpExecArray | null;
  while ((match = word.exec(text))) {
    if (match.index <= offset && offset <= match.index + match[0].length) {
      const key = apiDocs[match[0]] ? match[0] : apiDocs[match[0].split(".").at(-1) ?? ""] ? match[0].split(".").at(-1) ?? "" : "";
      if (!key) return null;
      return {
        pos: line.from + match.index,
        end: line.from + match.index + match[0].length,
        create() {
          const dom = document.createElement("div");
          dom.className = "api-hover";
          dom.textContent = apiDocs[key];
          return { dom };
        }
      };
    }
  }
  return null;
});

function toCodeMirrorDiagnostics(view: EditorView, diagnostics: DslDiagnostic[]): Diagnostic[] {
  return diagnostics.map((item) => {
    const line = view.state.doc.line(Math.min(item.line, view.state.doc.lines));
    const from = Math.min(Math.max(line.from, line.from + item.column - 1), line.to);
    const to = from >= line.to ? line.to : Math.max(from + 1, line.to);
    return {
      from,
      to,
      severity: item.severity,
      message: item.message
    };
  });
}

export const CodeEditor = forwardRef<CodeEditorHandle, {
  value: string;
  diagnostics: DslDiagnostic[];
  readOnly?: boolean;
  onChange(value: string): void;
  onRun(): void;
  onSave(): void;
}>(function CodeEditor({
  value,
  diagnostics,
  readOnly = false,
  onChange,
  onRun,
  onSave
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const diagnosticsRef = useRef(diagnostics);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    diagnosticsRef.current = diagnostics;
    const view = viewRef.current;
    if (view) view.dispatch(setDiagnostics(view.state, toCodeMirrorDiagnostics(view, diagnostics)));
  }, [diagnostics]);

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
    onSaveRef.current = onSave;
  }, [onChange, onRun, onSave]);

  useImperativeHandle(ref, () => ({
    focusAt(line: number, column: number) {
      const view = viewRef.current;
      if (!view) return;
      const targetLine = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
      const pos = Math.min(targetLine.to, targetLine.from + Math.max(column - 1, 0));
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "center" })
      });
      view.focus();
    }
  }), []);

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        foldGutter(),
        history(),
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        disabledThemeCompartment.of(readOnly ? disabledEditorTheme : []),
        closeBrackets(),
        indentUnit.of("    "),
        semanticHighlight,
        apiHover,
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        autocompletion({ override: [dslCompletions] }),
        keymap.of([
          { key: "Tab", run: smartTab },
          { key: "Enter", run: smartEnter },
          { key: "Ctrl-Enter", run: () => (onRunRef.current(), true) },
          { key: "Mod-s", run: () => (onSaveRef.current(), true) },
          ...defaultKeymap,
          ...historyKeymap
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%", backgroundColor: "#1e1e1e", color: "#d4d4d4", fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace" },
          "& *": { fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace" },
          ".cm-content": { caretColor: "#ffffff" },
          ".cm-line": { lineHeight: "1.55", tabSize: "4" },
          ".cm-gutters": { backgroundColor: "#1e1e1e", color: "#858585", borderRight: "1px solid #333333" },
          ".cm-activeLine": { backgroundColor: "#262626" },
          ".cm-activeLineGutter": { backgroundColor: "#262626", color: "#c6c6c6" },
          ".cm-cursor": { borderLeftColor: "#ffffff" },
          ".cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#264f78 !important" },
          ".cm-tooltip": { borderRadius: "3px", backgroundColor: "#252526", color: "#cccccc", border: "1px solid #454545" },
          ".cm-diagnostic": { backgroundColor: "#5a1d1d", color: "#f5c2c2" },
          ".tok-keyword, .tok-primitive": { color: "#569cd6" },
          ".tok-class": { color: "#4ec9b0" },
          ".tok-method": { color: "#dcdcaa" },
          ".tok-string": { color: "#ce9178" },
          ".tok-number": { color: "#b5cea8" },
          ".tok-comment": { color: "#6a9955" },
          ".api-hover": { maxWidth: "360px", padding: "8px 10px", lineHeight: "1.5" }
        })
      ]
    });
    viewRef.current = new EditorView({ state, parent: hostRef.current });
    viewRef.current.dispatch(setDiagnostics(viewRef.current.state, toCodeMirrorDiagnostics(viewRef.current, diagnosticsRef.current)));
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
        disabledThemeCompartment.reconfigure(readOnly ? disabledEditorTheme : [])
      ]
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} className="editor-host" />;
});

const disabledEditorTheme = EditorView.theme({
  "&": { filter: "brightness(0.68)", cursor: "not-allowed" },
  ".cm-content": { caretColor: "transparent" },
  ".cm-line": { opacity: "0.72" }
});
