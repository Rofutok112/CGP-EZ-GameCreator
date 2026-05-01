export type Severity = "error" | "warning";

export type DslDiagnostic = {
  severity: Severity;
  line: number;
  column: number;
  message: string;
};

type TokenKind =
  | "identifier"
  | "number"
  | "string"
  | "keyword"
  | "symbol"
  | "operator"
  | "eof";

type Token = {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
};

type TypeName = "int" | "float" | "bool" | "string" | "GameObject" | "Text" | `List<${string}>`;

type ProgramAst = {
  fields: FieldDecl[];
  start: BlockStmt;
  update: BlockStmt;
  methods: Map<string, MethodDecl>;
};

type FieldDecl = {
  kind: "field";
  typeName: TypeName;
  name: string;
  initializer?: Expr;
  token: Token;
};

type MethodDecl = {
  name: string;
  params: ParamDecl[];
  body: BlockStmt;
  token: Token;
};

type ParamDecl = {
  typeName: TypeName;
  name: string;
  token: Token;
};

type Stmt =
  | BlockStmt
  | VarDeclStmt
  | ExprStmt
  | IfStmt
  | ForStmt
  | ForeachStmt;

type BlockStmt = { kind: "block"; statements: Stmt[]; token: Token };
type VarDeclStmt = { kind: "var"; typeName: TypeName; name: string; initializer?: Expr; token: Token };
type ExprStmt = { kind: "expr"; expr: Expr; token: Token };
type IfStmt = { kind: "if"; condition: Expr; thenBranch: Stmt; elseBranch?: Stmt; token: Token };
type ForStmt = {
  kind: "for";
  initializer?: VarDeclStmt | ExprStmt;
  condition?: Expr;
  increment?: Expr;
  body: Stmt;
  token: Token;
};
type ForeachStmt = { kind: "foreach"; typeName: TypeName; name: string; list: Expr; body: Stmt; token: Token };

type Expr =
  | LiteralExpr
  | IdentifierExpr
  | UnaryExpr
  | BinaryExpr
  | AssignExpr
  | MemberExpr
  | CallExpr
  | IndexExpr
  | NewListExpr;

type LiteralExpr = { kind: "literal"; value: RuntimeValue; token: Token };
type IdentifierExpr = { kind: "identifier"; name: string; token: Token };
type UnaryExpr = { kind: "unary"; op: string; right: Expr; token: Token };
type BinaryExpr = { kind: "binary"; left: Expr; op: string; right: Expr; token: Token };
type AssignExpr = { kind: "assign"; target: Expr; value: Expr; token: Token };
type MemberExpr = { kind: "member"; object: Expr; property: string; token: Token };
type CallExpr = { kind: "call"; callee: Expr; args: Expr[]; token: Token };
type IndexExpr = { kind: "index"; object: Expr; index: Expr; token: Token };
type NewListExpr = { kind: "newList"; itemType: string; token: Token };

export type RuntimeEntity = {
  id: number;
  kind: "GameObject" | "Text";
  shape?: "box" | "circle" | "sprite";
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  radius?: number;
  visible: boolean;
  destroyed: boolean;
  color: string;
  flipX: boolean;
  imageName?: string;
  value?: string;
  size?: number;
};

type ListValue = {
  __kind: "List";
  itemType: string;
  items: RuntimeValue[];
};

type BuiltinRef = { __kind: "builtin"; name: string };

type RuntimeValue = number | string | boolean | null | RuntimeEntity | ListValue | BuiltinRef;

export type RuntimeHost = {
  width: number;
  height: number;
  createBox(x: number, y: number, width: number, height: number): RuntimeEntity;
  createCircle(x: number, y: number, radius: number): RuntimeEntity;
  createSprite(name: string, x: number, y: number, width: number, height: number): RuntimeEntity;
  createText(value: string, x: number, y: number, size?: number): RuntimeEntity;
  touch(a: RuntimeEntity, b: RuntimeEntity): boolean;
  keyDown(key: string): boolean;
  keyPressed(key: string): boolean;
  playSound(name: string, volume?: number): void;
  follow(entity: RuntimeEntity): void;
  requestReset(): void;
  getTime(): { time: number; deltaTime: number; frameCount: number };
};

export type CompiledProgram = {
  createInstance(host: RuntimeHost): DslInstance;
  diagnostics: DslDiagnostic[];
};

export class DslError extends Error {
  constructor(public diagnostic: DslDiagnostic) {
    super(diagnostic.message);
  }
}

export function analyzeDsl(source: string): DslDiagnostic[] {
  const surfaceDiagnostics = collectSurfaceDiagnostics(source);
  try {
    const ast = parseSource(source);
    return uniqueDiagnostics([...surfaceDiagnostics, ...new StaticAnalyzer(ast).analyze()]);
  } catch (error) {
    if (error instanceof DslError) return uniqueDiagnostics([...surfaceDiagnostics, error.diagnostic]);
    return uniqueDiagnostics([
      ...surfaceDiagnostics,
      {
        severity: "error",
        line: 1,
        column: 1,
        message: "静的解析中に予期しないエラーが起きました。"
      }
    ]);
  }
}

export function compileDsl(source: string): CompiledProgram {
  const diagnostics: DslDiagnostic[] = collectSurfaceDiagnostics(source);
  if (diagnostics.length > 0) {
    return {
      diagnostics,
      createInstance(host) {
        return new DslInstance({ fields: [], start: emptyBlock(), update: emptyBlock(), methods: new Map() }, host);
      }
    };
  }
  try {
    const ast = parseSource(source);
    const staticDiagnostics = new StaticAnalyzer(ast).analyze();
    if (staticDiagnostics.some((item) => item.severity === "error")) {
      return {
        diagnostics: uniqueDiagnostics(staticDiagnostics),
        createInstance(host) {
          return new DslInstance({ fields: [], start: emptyBlock(), update: emptyBlock(), methods: new Map() }, host);
        }
      };
    }
    return {
      diagnostics: uniqueDiagnostics(staticDiagnostics),
      createInstance(host) {
        return new DslInstance(ast, host);
      }
    };
  } catch (error) {
    if (error instanceof DslError) diagnostics.push(error.diagnostic);
    else {
      diagnostics.push({
        severity: "error",
        line: 1,
        column: 1,
        message: "コードの解析中に予期しないエラーが起きました。"
      });
    }
    return {
      diagnostics,
      createInstance(host) {
        return new DslInstance({ fields: [], start: emptyBlock(), update: emptyBlock(), methods: new Map() }, host);
      }
    };
  }
}

function parseSource(source: string): ProgramAst {
  const tokens = lex(source);
  return new Parser(tokens).parseProgram();
}

function emptyBlock(): BlockStmt {
  return { kind: "block", statements: [], token: { kind: "eof", value: "", line: 1, column: 1 } };
}

type StaticType =
  | "int"
  | "float"
  | "bool"
  | "string"
  | "GameObject"
  | "Text"
  | "Create"
  | "Time"
  | "Random"
  | "Math"
  | "key"
  | "game"
  | "sound"
  | "camera"
  | `List<${string}>`
  | "unknown"
  | "void";

type StaticSymbol = {
  type: StaticType;
  token: Token;
  assigned: boolean;
  field: boolean;
};

class StaticScope {
  private readonly symbols = new Map<string, StaticSymbol>();

  constructor(private readonly parent?: StaticScope) {}

  define(name: string, symbol: StaticSymbol): boolean {
    if (this.symbols.has(name)) return false;
    this.symbols.set(name, symbol);
    return true;
  }

  resolve(name: string): StaticSymbol | undefined {
    return this.symbols.get(name) ?? this.parent?.resolve(name);
  }

  assign(name: string): boolean {
    const symbol = this.symbols.get(name);
    if (symbol) {
      symbol.assigned = true;
      return true;
    }
    return this.parent?.assign(name) ?? false;
  }
}

class StaticAnalyzer {
  private diagnostics: DslDiagnostic[] = [];
  private root = new StaticScope();
  private startAssigned = new Set<string>();
  private fields = new Map<string, StaticSymbol>();
  private methods = new Map<string, MethodDecl>();
  private phase: "field" | "Start" | "Update" = "field";

  constructor(private readonly ast: ProgramAst) {}

  analyze(): DslDiagnostic[] {
    this.defineBuiltins();
    this.defineFields();
    this.defineMethods();
    this.phase = "Start";
    this.analyzeBlock(this.ast.start, new StaticScope(this.root));
    this.phase = "Update";
    this.analyzeBlock(this.ast.update, new StaticScope(this.root));
    for (const method of this.methods.values()) {
      this.analyzeUserMethod(method);
    }
    return this.diagnostics;
  }

  private defineBuiltins() {
    for (const name of ["Create", "Time", "Random", "Math", "key", "game", "sound", "camera"] as const) {
      this.root.define(name, { type: name, token: this.ast.start.token, assigned: true, field: false });
    }
  }

  private defineFields() {
    for (const field of this.ast.fields) {
      const symbol: StaticSymbol = {
        type: field.typeName,
        token: field.token,
        assigned: field.initializer !== undefined || !["GameObject", "Text"].includes(field.typeName),
        field: true
      };
      if (!this.root.define(field.name, symbol)) {
        this.add(field.token, `${field.name} はすでに宣言されています。別の名前にしてください。`);
      }
      this.fields.set(field.name, symbol);
    }
    for (const field of this.ast.fields) {
      if (!field.initializer) continue;
      const valueType = this.typeOf(field.initializer, this.root);
      this.expectAssignable(field.typeName, valueType, field.token);
      if (isObjectType(field.typeName)) {
        this.add(field.token, "GameObject や Text の作成は Start() の中で Create を使ってください。", "warning");
      }
    }
  }

  private defineMethods() {
    for (const method of this.ast.methods.values()) {
      if (["Start", "Update"].includes(method.name)) continue;
      this.methods.set(method.name, method);
    }
  }

  private analyzeUserMethod(method: MethodDecl) {
    const scope = new StaticScope(this.root);
    for (const param of method.params) {
      if (!scope.define(param.name, { type: param.typeName, token: param.token, assigned: true, field: false })) {
        this.add(param.token, `${param.name} はこの関数の引数としてすでに使われています。`);
      }
    }
    this.analyzeBlock(method.body, scope);
  }

  private analyzeBlock(block: BlockStmt, scope: StaticScope) {
    for (const stmt of block.statements) this.analyzeStmt(stmt, scope);
  }

  private analyzeStmt(stmt: Stmt, scope: StaticScope) {
    switch (stmt.kind) {
      case "block":
        this.analyzeBlock(stmt, new StaticScope(scope));
        return;
      case "var": {
        if (!scope.define(stmt.name, { type: stmt.typeName, token: stmt.token, assigned: stmt.initializer !== undefined, field: false })) {
          this.add(stmt.token, `${stmt.name} はこの場所ですでに宣言されています。`);
        }
        if (stmt.initializer) this.expectAssignable(stmt.typeName, this.typeOf(stmt.initializer, scope), stmt.token);
        return;
      }
      case "expr":
        this.typeOf(stmt.expr, scope);
        return;
      case "if":
        this.expectAssignable("bool", this.typeOf(stmt.condition, scope), stmt.token);
        this.analyzeStmt(stmt.thenBranch, new StaticScope(scope));
        if (stmt.elseBranch) this.analyzeStmt(stmt.elseBranch, new StaticScope(scope));
        return;
      case "for": {
        const loop = new StaticScope(scope);
        if (stmt.initializer) this.analyzeStmt(stmt.initializer, loop);
        if (stmt.condition) this.expectAssignable("bool", this.typeOf(stmt.condition, loop), stmt.token);
        if (stmt.increment) this.typeOf(stmt.increment, loop);
        this.analyzeStmt(stmt.body, loop);
        return;
      }
      case "foreach": {
        const listType = this.typeOf(stmt.list, scope);
        if (!isListType(listType)) this.add(stmt.token, "foreach で使えるのは List<T> だけです。");
        const itemType = isListType(listType) ? (listType.slice(5, -1) as StaticType) : stmt.typeName;
        this.expectAssignable(stmt.typeName, itemType, stmt.token);
        const child = new StaticScope(scope);
        child.define(stmt.name, { type: stmt.typeName, token: stmt.token, assigned: true, field: false });
        this.analyzeStmt(stmt.body, child);
      }
    }
  }

  private typeOf(expr: Expr, scope: StaticScope): StaticType {
    switch (expr.kind) {
      case "literal":
        if (typeof expr.value === "number") {
          if (/[fF]$/.test(expr.token.value)) return "float";
          if (expr.token.value.includes(".")) {
            this.add(expr.token, `小数は ${expr.token.value}f のように末尾に f を付けてください。`);
            return "float";
          }
          return Number.isInteger(expr.value) ? "int" : "float";
        }
        if (typeof expr.value === "boolean") return "bool";
        if (typeof expr.value === "string") return "string";
        return "unknown";
      case "identifier": {
        const symbol = scope.resolve(expr.name);
        if (!symbol) {
          this.add(expr.token, `${expr.name} は宣言されていません。`);
          return "unknown";
        }
        if (!symbol.assigned && isObjectType(symbol.type)) {
          this.add(expr.token, `${expr.name} はまだ作られていません。Start() で Create.Box(...) や Create.Text(...) を代入してください。`);
        }
        if (this.phase === "Update" && symbol.field && isObjectType(symbol.type) && !this.startAssigned.has(expr.name)) {
          this.add(expr.token, `${expr.name} は Start() で作られていない可能性があります。`);
        }
        return symbol.type;
      }
      case "newList":
        return `List<${expr.itemType}>`;
      case "unary": {
        const right = this.typeOf(expr.right, scope);
        if (expr.op === "-") {
          if (!isNumberType(right)) this.add(expr.token, "- は数値にだけ使えます。");
          return right === "int" ? "int" : "float";
        }
        if (expr.op === "!") {
          this.expectAssignable("bool", right, expr.token);
          return "bool";
        }
        return "unknown";
      }
      case "binary":
        return this.binaryType(expr, scope);
      case "assign": {
        const valueType = this.typeOf(expr.value, scope);
        this.assignTargetType(expr.target, valueType, scope, expr.token);
        return valueType;
      }
      case "member": {
        const ownerType = this.typeOf(expr.object, scope);
        return this.memberType(ownerType, expr.property, expr.token);
      }
      case "index": {
        const ownerType = this.typeOf(expr.object, scope);
        this.expectAssignable("int", this.typeOf(expr.index, scope), expr.token);
        if (!isListType(ownerType)) {
          this.add(expr.token, "[] で取り出せるのは List<T> だけです。");
          return "unknown";
        }
        return ownerType.slice(5, -1) as StaticType;
      }
      case "call":
        return this.callType(expr, scope);
    }
  }

  private binaryType(expr: BinaryExpr, scope: StaticScope): StaticType {
    const left = this.typeOf(expr.left, scope);
    const right = this.typeOf(expr.right, scope);
    if (["&&", "||"].includes(expr.op)) {
      this.expectAssignable("bool", left, expr.token);
      this.expectAssignable("bool", right, expr.token);
      return "bool";
    }
    if (expr.op === "+") {
      if (left === "string" || right === "string") return "string";
      if (!isNumberType(left) || !isNumberType(right)) this.add(expr.token, "+ は数値同士、または文字列連結に使えます。");
      return left === "float" || right === "float" ? "float" : "int";
    }
    if (["-", "*", "/", "%"].includes(expr.op)) {
      if (!isNumberType(left) || !isNumberType(right)) this.add(expr.token, `${expr.op} は数値にだけ使えます。`);
      return expr.op === "/" || left === "float" || right === "float" ? "float" : "int";
    }
    if (["<", "<=", ">", ">="].includes(expr.op)) {
      if (!isNumberType(left) || !isNumberType(right)) this.add(expr.token, `${expr.op} は数値の比較にだけ使えます。`);
      return "bool";
    }
    if (["==", "!="].includes(expr.op)) {
      if (left !== right && !(isNumberType(left) && isNumberType(right))) {
        this.add(expr.token, `${expr.op} では ${left} と ${right} は比較できません。型をそろえてください。`);
      }
      return "bool";
    }
    return "unknown";
  }

  private assignTargetType(target: Expr, valueType: StaticType, scope: StaticScope, token: Token) {
    if (target.kind === "identifier") {
      const symbol = scope.resolve(target.name);
      if (!symbol) {
        this.add(target.token, `${target.name} は宣言されていません。`);
        return;
      }
      this.expectAssignable(symbol.type, valueType, token);
      scope.assign(target.name);
      if (this.phase === "Start" && symbol.field) this.startAssigned.add(target.name);
      return;
    }
    if (target.kind === "member") {
      const ownerType = this.typeOf(target.object, scope);
      const propertyType = this.memberType(ownerType, target.property, target.token, true);
      this.expectAssignable(propertyType, valueType, token);
      return;
    }
    if (target.kind === "index") {
      const ownerType = this.typeOf(target.object, scope);
      if (!isListType(ownerType)) {
        this.add(target.token, "[] で代入できるのは List<T> だけです。");
        return;
      }
      this.expectAssignable(ownerType.slice(5, -1) as StaticType, valueType, token);
      return;
    }
    this.add(token, "代入できるのは変数、プロパティ、リストの要素だけです。");
  }

  private memberType(ownerType: StaticType, property: string, token: Token, forWrite = false): StaticType {
    if (ownerType === "GameObject") {
      const props: Record<string, StaticType> = { x: "float", y: "float", vx: "float", vy: "float", width: "float", height: "float", visible: "bool", color: "string", flipX: "bool" };
      if (property in props) return props[property];
      if (["Touch", "TouchWall", "Hide", "Show", "Move", "Destroy", "SetSprite"].includes(property)) return "unknown";
      this.add(token, `GameObject に ${property} という${forWrite ? "代入できるプロパティ" : "プロパティ"}はありません。`);
      return "unknown";
    }
    if (ownerType === "Text") {
      const props: Record<string, StaticType> = { x: "float", y: "float", value: "string", size: "float", color: "string", visible: "bool" };
      if (property in props) return props[property];
      if (["Hide", "Show", "Move", "Destroy"].includes(property)) return "unknown";
      this.add(token, `Text に ${property} という${forWrite ? "代入できるプロパティ" : "プロパティ"}はありません。`);
      return "unknown";
    }
    if (isListType(ownerType)) {
      if (property === "Count") return "int";
      if (["Add", "Remove", "Clear"].includes(property)) return "unknown";
      this.add(token, `List に ${property} というプロパティ/メソッドはありません。`);
      return "unknown";
    }
    if (isNumberType(ownerType)) {
      if (property === "ToString") return "unknown";
      this.add(token, `${ownerType} に ${property} というプロパティ/メソッドはありません。`);
      return "unknown";
    }
    if (ownerType === "Time") {
      if (["time", "deltaTime"].includes(property)) return "float";
      if (property === "frameCount") return "int";
      this.add(token, `Time.${property} は存在しません。`);
      return "unknown";
    }
    return "unknown";
  }

  private callType(expr: CallExpr, scope: StaticScope): StaticType {
    if (expr.callee.kind === "identifier") {
      const method = this.methods.get(expr.callee.name);
      if (!method) {
        this.add(expr.callee.token, `${expr.callee.name} という関数は定義されていません。`);
        return "unknown";
      }
      const args = expr.args.map((arg) => this.typeOf(arg, scope));
      if (args.length !== method.params.length) {
        this.add(expr.token, `${method.name} の引数は ${method.params.length} 個です。現在は ${args.length} 個あります。`);
      }
      method.params.forEach((param, index) => this.expectAssignable(param.typeName, args[index] ?? "unknown", expr.token));
      return "void";
    }
    if (expr.callee.kind !== "member") {
      this.add(expr.token, "呼び出せるのは Function(...) または obj.Method(...) 形式だけです。");
      return "unknown";
    }
    const ownerType = this.typeOf(expr.callee.object, scope);
    const args = expr.args.map((arg) => this.typeOf(arg, scope));
    const method = expr.callee.property;
    return this.methodType(ownerType, method, args, expr.token);
  }

  private methodType(ownerType: StaticType, method: string, args: StaticType[], token: Token): StaticType {
    if (ownerType === "Create") {
      if (method === "Box") return this.expectArgs(method, args, ["float", "float", "float", "float"], token) ? "GameObject" : "unknown";
      if (method === "Circle") return this.expectArgs(method, args, ["float", "float", "float"], token) ? "GameObject" : "unknown";
      if (method === "Sprite") return this.expectArgs(method, args, ["string", "float", "float", "float", "float"], token) ? "GameObject" : "unknown";
      if (method === "Text") {
        if (args.length !== 3 && args.length !== 4) this.add(token, "Create.Text は value, x, y または value, x, y, size で呼び出してください。");
        this.expectAssignable("string", args[0] ?? "unknown", token);
        this.expectAssignable("float", args[1] ?? "unknown", token);
        this.expectAssignable("float", args[2] ?? "unknown", token);
        if (args[3]) this.expectAssignable("float", args[3], token);
        return "Text";
      }
      this.add(token, `Create.${method} は存在しません。`);
      return "unknown";
    }
    if (ownerType === "GameObject") {
      if (method === "Touch") return this.expectArgs(method, args, ["GameObject"], token, true) ? "bool" : "bool";
      if (method === "TouchWall") return this.expectArgs(method, args, [], token) ? "bool" : "bool";
      if (["Hide", "Show", "Destroy"].includes(method)) return this.expectArgs(method, args, [], token) ? "void" : "void";
      if (method === "Move") return this.expectArgs(method, args, ["float", "float"], token) ? "void" : "void";
      if (method === "SetSprite") return this.expectArgs(method, args, ["string"], token) ? "void" : "void";
      this.add(token, `GameObject に ${method} というメソッドはありません。`);
      return "unknown";
    }
    if (ownerType === "Text") {
      if (["Hide", "Show", "Destroy"].includes(method)) return this.expectArgs(method, args, [], token) ? "void" : "void";
      if (method === "Move") return this.expectArgs(method, args, ["float", "float"], token) ? "void" : "void";
      this.add(token, `Text に ${method} というメソッドはありません。`);
      return "unknown";
    }
    if (isNumberType(ownerType)) {
      if (method === "ToString") {
        if (args.length === 0) return "string";
        return this.expectArgs(method, args, ["string"], token) ? "string" : "string";
      }
      this.add(token, `${ownerType} に ${method} というメソッドはありません。`);
      return "unknown";
    }
    if (isListType(ownerType)) {
      const itemType = ownerType.slice(5, -1) as StaticType;
      if (method === "Add") return this.expectArgs(method, args, [itemType], token) ? "void" : "void";
      if (method === "Remove") return this.expectArgs(method, args, [itemType], token) ? "void" : "void";
      if (method === "Clear") return this.expectArgs(method, args, [], token) ? "void" : "void";
      this.add(token, `List に ${method} というメソッドはありません。`);
      return "unknown";
    }
    if (ownerType === "Random") {
      if (method === "Range") return this.expectArgs(method, args, ["float", "float"], token) ? "float" : "float";
      if (method === "Chance") return this.expectArgs(method, args, ["float"], token) ? "bool" : "bool";
      this.add(token, `Random.${method} は存在しません。`);
      return "unknown";
    }
    if (ownerType === "Math") {
      if (method === "Round") return this.expectArgs(method, args, ["float", "int"], token) ? "float" : "float";
      if (method === "Fixed") return this.expectArgs(method, args, ["float", "int"], token) ? "string" : "string";
      if (method === "Floor" || method === "Ceil") return this.expectArgs(method, args, ["float"], token) ? "float" : "float";
      this.add(token, `Math.${method} は存在しません。`);
      return "unknown";
    }
    if (ownerType === "key") {
      if (method === "Down" || method === "Pressed") return this.expectArgs(method, args, ["string"], token) ? "bool" : "bool";
      this.add(token, `key.${method} は存在しません。`);
      return "unknown";
    }
    if (ownerType === "game") {
      if (method === "Reset") return this.expectArgs(method, args, [], token) ? "void" : "void";
      this.add(token, `game.${method} は存在しません。`);
      return "unknown";
    }
    if (ownerType === "sound") {
      if (method === "Play") {
        if (args.length !== 1 && args.length !== 2) {
          this.add(token, `Play の引数は 1 個または 2 個です。現在は ${args.length} 個あります。`);
          return "void";
        }
        this.expectAssignable("string", args[0] ?? "unknown", token);
        if (args[1]) this.expectAssignable("float", args[1], token);
        return "void";
      }
      this.add(token, `sound.${method} は存在しません。`);
      return "unknown";
    }
    if (ownerType === "camera") {
      if (method === "Follow") return this.expectArgs(method, args, ["GameObject"], token, true) ? "void" : "void";
      this.add(token, `camera.${method} は存在しません。`);
      return "unknown";
    }
    if (ownerType !== "unknown") this.add(token, `${ownerType} では ${method} を呼び出せません。`);
    return "unknown";
  }

  private expectArgs(method: string, actual: StaticType[], expected: StaticType[], token: Token, allowTextAsObject = false): boolean {
    if (actual.length !== expected.length) {
      this.add(token, `${method} の引数は ${expected.length} 個です。現在は ${actual.length} 個あります。`);
      return false;
    }
    expected.forEach((type, index) => {
      if (allowTextAsObject && type === "GameObject" && actual[index] === "Text") return;
      this.expectAssignable(type, actual[index], token);
    });
    return true;
  }

  private expectAssignable(target: StaticType, actual: StaticType, token: Token) {
    if (target === "unknown" || actual === "unknown") return;
    if (target === actual) return;
    if (target === "float" && actual === "int") return;
    this.add(token, `${target} に ${actual} は入れられません。`);
  }

  private add(token: Token, message: string, severity: Severity = "error") {
    this.diagnostics.push({ severity, line: token.line, column: token.column, message });
  }
}

function isNumberType(type: StaticType): boolean {
  return type === "int" || type === "float";
}

function isObjectType(type: StaticType): boolean {
  return type === "GameObject" || type === "Text";
}

function isListType(type: StaticType): type is `List<${string}>` {
  return type.startsWith("List<");
}

function diagnostic(token: Token, message: string): DslError {
  return new DslError({ severity: "error", line: token.line, column: token.column, message });
}

function collectSurfaceDiagnostics(source: string): DslDiagnostic[] {
  const diagnostics: DslDiagnostic[] = [];
  const lines = source.split(/\r?\n/);
  let parenDepth = 0;
  const braceStack: { line: number; column: number }[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const code = stripLineComment(line);
    const trimmed = code.trim();
    if (!trimmed) return;

    let stringOpen = false;
    let lineParenDelta = 0;
    for (let i = 0; i < code.length; i += 1) {
      const char = code[i];
      if (char === "\"" && code[i - 1] !== "\\") stringOpen = !stringOpen;
      if (stringOpen) continue;
      if (char === "{") braceStack.push({ line: lineNumber, column: i + 1 });
      if (char === "}") {
        if (braceStack.length === 0) {
          diagnostics.push({ severity: "error", line: lineNumber, column: i + 1, message: "} が多すぎます。対応する { を確認してください。" });
        } else {
          braceStack.pop();
        }
      }
      if (char === "(") {
        parenDepth += 1;
        lineParenDelta += 1;
      }
      if (char === ")") {
        parenDepth -= 1;
        lineParenDelta -= 1;
        if (parenDepth < 0) {
          diagnostics.push({ severity: "error", line: lineNumber, column: i + 1, message: ") が多すぎます。対応する ( を確認してください。" });
          parenDepth = 0;
        }
      }
    }

    if (stringOpen) {
      diagnostics.push({ severity: "error", line: lineNumber, column: Math.max(1, code.indexOf("\"") + 1), message: "文字列が閉じられていません。末尾に \" を追加してください。" });
    }

    if (lineParenDelta > 0 && shouldEndThisLine(trimmed)) {
      diagnostics.push({ severity: "error", line: lineNumber, column: code.length + 1, message: ") が足りません。メソッド呼び出しや条件式を閉じてください。" });
    }

    if (needsSemicolon(trimmed)) {
      diagnostics.push({ severity: "error", line: lineNumber, column: code.length + 1, message: "文の最後に ; が必要です。" });
    }
  });

  for (const item of braceStack) {
    diagnostics.push({ severity: "error", line: item.line, column: item.column, message: "{ に対応する } が足りません。" });
  }

  return uniqueDiagnostics(diagnostics);
}

function stripLineComment(line: string): string {
  let stringOpen = false;
  for (let i = 0; i < line.length - 1; i += 1) {
    if (line[i] === "\"" && line[i - 1] !== "\\") stringOpen = !stringOpen;
    if (!stringOpen && line[i] === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

function shouldEndThisLine(trimmed: string): boolean {
  if (trimmed.endsWith("{")) return false;
  if (/^(if|else if|for|foreach|while)\b/.test(trimmed)) return false;
  return true;
}

function needsSemicolon(trimmed: string): boolean {
  if (trimmed.endsWith(";") || trimmed.endsWith("{") || trimmed.endsWith("}") || trimmed === "else") return false;
  if (/^(class|void|if|else if|else|for|foreach)\b/.test(trimmed)) return false;
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*:\s*$/.test(trimmed)) return false;
  return /^(int|float|bool|string|GameObject|Text|List\s*<.+>)\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(trimmed) || /=/.test(trimmed) || /\w+\s*\(.*\)/.test(trimmed);
}

function uniqueDiagnostics(items: DslDiagnostic[]): DslDiagnostic[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.severity}:${item.line}:${item.column}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;
  const keywords = new Set([
    "class",
    "void",
    "if",
    "else",
    "for",
    "foreach",
    "in",
    "new",
    "true",
    "false",
    "int",
    "float",
    "bool",
    "string",
    "GameObject",
    "Text",
    "List"
  ]);

  const push = (kind: TokenKind, value: string, startLine = line, startColumn = column) => {
    tokens.push({ kind, value, line: startLine, column: startColumn });
  };

  const advance = () => {
    const char = source[i++];
    if (char === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return char;
  };

  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      advance();
      continue;
    }

    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") advance();
      continue;
    }

    const startLine = line;
    const startColumn = column;

    if (/[A-Za-z_]/.test(char)) {
      let value = "";
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) value += advance();
      push(keywords.has(value) ? "keyword" : "identifier", value, startLine, startColumn);
      continue;
    }

    if (/[0-9]/.test(char)) {
      let value = "";
      while (i < source.length && /[0-9]/.test(source[i])) value += advance();
      if (source[i] === ".") {
        value += advance();
        while (i < source.length && /[0-9]/.test(source[i])) value += advance();
      }
      if (source[i] === "f" || source[i] === "F") value += advance();
      push("number", value, startLine, startColumn);
      continue;
    }

    if (char === "\"") {
      advance();
      let value = "";
      while (i < source.length && source[i] !== "\"") {
        if (source[i] === "\n") throw diagnostic({ kind: "string", value, line: startLine, column: startColumn }, "文字列が閉じられていません。末尾に \" を追加してください。");
        value += advance();
      }
      if (source[i] !== "\"") throw diagnostic({ kind: "string", value, line: startLine, column: startColumn }, "文字列が閉じられていません。末尾に \" を追加してください。");
      advance();
      push("string", value, startLine, startColumn);
      continue;
    }

    const two = source.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||", "+=", "-=", "*=", "/="].includes(two)) {
      advance();
      advance();
      push("operator", two, startLine, startColumn);
      continue;
    }

    if ("+-*/%=!<>".includes(char)) {
      push("operator", advance(), startLine, startColumn);
      continue;
    }

    if ("{}()[];,. ".includes(char)) {
      if (char !== " ") push("symbol", advance(), startLine, startColumn);
      else advance();
      continue;
    }

    throw diagnostic({ kind: "symbol", value: char, line: startLine, column: startColumn }, `${char} は使えない文字です。`);
  }

  tokens.push({ kind: "eof", value: "", line, column });
  return tokens;
}

class Parser {
  private current = 0;

  constructor(private readonly tokens: Token[]) {}

  parseProgram(): ProgramAst {
    this.consume("keyword", "class", "最初に class Main を書いてください。");
    this.consume("identifier", "Main", "クラス名は Main にしてください。");
    this.consume("symbol", "{", "class Main の後に { が必要です。");

    const fields: FieldDecl[] = [];
    const methods = new Map<string, MethodDecl>();
    let start: BlockStmt | undefined;
    let update: BlockStmt | undefined;

    while (!this.check("symbol", "}") && !this.isAtEnd()) {
      if (this.match("keyword", "void")) {
        const token = this.previous();
        const name = this.consumeIdentifier("メソッド名が必要です。Start, Update, または自分で作る関数名を書いてください。");
        this.consume("symbol", "(", `${name.value} の後に ( が必要です。`);
        const params = this.parseParams();
        this.consume("symbol", ")", `${name.value} の引数の後に ) が必要です。`);
        const block = this.parseBlock();
        if (name.value === "Start") start = block;
        else if (name.value === "Update") update = block;
        else {
          if (methods.has(name.value)) throw diagnostic(name, `${name.value} はすでに定義されています。`);
          methods.set(name.value, { name: name.value, params, body: block, token });
        }
      } else {
        fields.push(this.parseField());
      }
    }

    this.consume("symbol", "}", "class Main の最後に } が必要です。");
    if (!start) throw diagnostic(this.peek(), "void Start() が必要です。ゲーム開始時の作成処理を書いてください。");
    if (!update) throw diagnostic(this.peek(), "void Update() が必要です。毎フレームの処理を書いてください。");
    return { fields, start, update, methods };
  }

  private parseParams(): ParamDecl[] {
    const params: ParamDecl[] = [];
    if (this.check("symbol", ")")) return params;
    do {
      const token = this.peek();
      const typeName = this.parseType();
      const name = this.consumeIdentifier("引数名が必要です。例: float speed");
      params.push({ typeName, name: name.value, token });
    } while (this.match("symbol", ","));
    return params;
  }

  private parseField(): FieldDecl {
    const typeToken = this.peek();
    const typeName = this.parseType();
    const name = this.consumeIdentifier("フィールド名が必要です。例: GameObject player;");
    let initializer: Expr | undefined;
    if (this.match("operator", "=")) initializer = this.parseExpression();
    this.consume("symbol", ";", "フィールド宣言の最後に ; が必要です。");
    return { kind: "field", typeName, name: name.value, initializer, token: typeToken };
  }

  private parseType(): TypeName {
    const token = this.advance();
    if (!["int", "float", "bool", "string", "GameObject", "Text", "List"].includes(token.value)) {
      throw diagnostic(token, "型名が必要です。int, float, bool, string, GameObject, Text, List<T> が使えます。");
    }
    if (token.value !== "List") return token.value as TypeName;
    this.consume("operator", "<", "List の型は List<GameObject> のように書いてください。");
    const item = this.advance();
    if (!["int", "float", "bool", "string", "GameObject", "Text"].includes(item.value)) {
      throw diagnostic(item, "List<T> の T には int, float, bool, string, GameObject, Text が使えます。");
    }
    this.consume("operator", ">", "List<T> の最後に > が必要です。");
    return `List<${item.value}>`;
  }

  private parseBlock(): BlockStmt {
    const token = this.consume("symbol", "{", "ここには { が必要です。");
    const statements: Stmt[] = [];
    while (!this.check("symbol", "}") && !this.isAtEnd()) statements.push(this.parseStatement());
    this.consume("symbol", "}", "ブロックの最後に } が必要です。");
    return { kind: "block", statements, token };
  }

  private parseStatement(): Stmt {
    if (this.check("symbol", "{")) return this.parseBlock();
    if (this.match("keyword", "if")) return this.parseIf(this.previous());
    if (this.match("keyword", "for")) return this.parseFor(this.previous());
    if (this.match("keyword", "foreach")) return this.parseForeach(this.previous());
    if (this.isTypeStart()) return this.parseVarDecl(true);
    const token = this.peek();
    const expr = this.parseExpression();
    this.consume("symbol", ";", "文の最後に ; が必要です。");
    return { kind: "expr", expr, token };
  }

  private parseVarDecl(needsSemicolon: boolean): VarDeclStmt {
    const token = this.peek();
    const typeName = this.parseType();
    const name = this.consumeIdentifier("変数名が必要です。");
    let initializer: Expr | undefined;
    if (this.match("operator", "=")) initializer = this.parseExpression();
    if (needsSemicolon) this.consume("symbol", ";", "変数宣言の最後に ; が必要です。");
    return { kind: "var", typeName, name: name.value, initializer, token };
  }

  private parseIf(token: Token): IfStmt {
    this.consume("symbol", "(", "if の後に ( が必要です。");
    const condition = this.parseExpression();
    this.consume("symbol", ")", "if の条件の後に ) が必要です。");
    const thenBranch = this.parseStatement();
    const elseBranch = this.match("keyword", "else") ? this.parseStatement() : undefined;
    return { kind: "if", condition, thenBranch, elseBranch, token };
  }

  private parseFor(token: Token): ForStmt {
    this.consume("symbol", "(", "for の後に ( が必要です。");
    let initializer: VarDeclStmt | ExprStmt | undefined;
    if (!this.check("symbol", ";")) {
      if (this.isTypeStart()) initializer = this.parseVarDecl(false);
      else {
        const exprToken = this.peek();
        initializer = { kind: "expr", expr: this.parseExpression(), token: exprToken };
      }
    }
    this.consume("symbol", ";", "for の初期化の後に ; が必要です。");
    const condition = this.check("symbol", ";") ? undefined : this.parseExpression();
    this.consume("symbol", ";", "for の条件の後に ; が必要です。");
    const increment = this.check("symbol", ")") ? undefined : this.parseExpression();
    this.consume("symbol", ")", "for の最後に ) が必要です。");
    return { kind: "for", initializer, condition, increment, body: this.parseStatement(), token };
  }

  private parseForeach(token: Token): ForeachStmt {
    this.consume("symbol", "(", "foreach の後に ( が必要です。");
    const typeName = this.parseType();
    const name = this.consumeIdentifier("foreach の変数名が必要です。");
    this.consume("keyword", "in", "foreach では in が必要です。例: foreach (GameObject enemy in enemies)");
    const list = this.parseExpression();
    this.consume("symbol", ")", "foreach の最後に ) が必要です。");
    return { kind: "foreach", typeName, name: name.value, list, body: this.parseStatement(), token };
  }

  private parseExpression(): Expr {
    return this.parseAssignment();
  }

  private parseAssignment(): Expr {
    const expr = this.parseOr();
    if (this.match("operator", "=")) return { kind: "assign", target: expr, value: this.parseAssignment(), token: this.previous() };
    if (this.match("operator", "+=")) {
      return {
        kind: "assign",
        target: expr,
        value: { kind: "binary", left: expr, op: "+", right: this.parseAssignment(), token: this.previous() },
        token: this.previous()
      };
    }
    return expr;
  }

  private parseOr(): Expr {
    let expr = this.parseAnd();
    while (this.match("operator", "||")) expr = { kind: "binary", left: expr, op: "||", right: this.parseAnd(), token: this.previous() };
    return expr;
  }

  private parseAnd(): Expr {
    let expr = this.parseEquality();
    while (this.match("operator", "&&")) expr = { kind: "binary", left: expr, op: "&&", right: this.parseEquality(), token: this.previous() };
    return expr;
  }

  private parseEquality(): Expr {
    let expr = this.parseComparison();
    while (this.match("operator", "==") || this.match("operator", "!=")) {
      expr = { kind: "binary", left: expr, op: this.previous().value, right: this.parseComparison(), token: this.previous() };
    }
    return expr;
  }

  private parseComparison(): Expr {
    let expr = this.parseTerm();
    while (["<", "<=", ">", ">="].some((op) => this.match("operator", op))) {
      expr = { kind: "binary", left: expr, op: this.previous().value, right: this.parseTerm(), token: this.previous() };
    }
    return expr;
  }

  private parseTerm(): Expr {
    let expr = this.parseFactor();
    while (this.match("operator", "+") || this.match("operator", "-")) {
      expr = { kind: "binary", left: expr, op: this.previous().value, right: this.parseFactor(), token: this.previous() };
    }
    return expr;
  }

  private parseFactor(): Expr {
    let expr = this.parseUnary();
    while (this.match("operator", "*") || this.match("operator", "/") || this.match("operator", "%")) {
      expr = { kind: "binary", left: expr, op: this.previous().value, right: this.parseUnary(), token: this.previous() };
    }
    return expr;
  }

  private parseUnary(): Expr {
    if (this.match("operator", "!") || this.match("operator", "-")) {
      return { kind: "unary", op: this.previous().value, right: this.parseUnary(), token: this.previous() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    while (true) {
      if (this.match("symbol", ".")) {
        const property = this.consumeName("プロパティ名またはメソッド名が必要です。");
        expr = { kind: "member", object: expr, property: property.value, token: property };
      } else if (this.match("symbol", "(")) {
        const args: Expr[] = [];
        if (!this.check("symbol", ")")) {
          do args.push(this.parseExpression());
          while (this.match("symbol", ","));
        }
        const paren = this.consume("symbol", ")", "呼び出しの最後に ) が必要です。");
        expr = { kind: "call", callee: expr, args, token: paren };
      } else if (this.match("symbol", "[")) {
        const index = this.parseExpression();
        const bracket = this.consume("symbol", "]", "インデックス参照の最後に ] が必要です。");
        expr = { kind: "index", object: expr, index, token: bracket };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): Expr {
    if (this.match("number")) return { kind: "literal", value: Number(this.previous().value.replace(/[fF]$/, "")), token: this.previous() };
    if (this.match("string")) return { kind: "literal", value: this.previous().value, token: this.previous() };
    if (this.match("keyword", "true")) return { kind: "literal", value: true, token: this.previous() };
    if (this.match("keyword", "false")) return { kind: "literal", value: false, token: this.previous() };
    if (this.match("keyword", "new")) {
      const list = this.consume("keyword", "List", "初期版で new できるのは new List<T>() だけです。");
      this.consume("operator", "<", "List の型は new List<GameObject>() のように書いてください。");
      const item = this.advance();
      if (!["int", "float", "bool", "string", "GameObject", "Text"].includes(item.value)) {
        throw diagnostic(item, "List<T> の T には int, float, bool, string, GameObject, Text が使えます。");
      }
      this.consume("operator", ">", "List<T> の最後に > が必要です。");
      this.consume("symbol", "(", "new List<T> の後に () が必要です。");
      this.consume("symbol", ")", "new List<T> の後に () が必要です。");
      return { kind: "newList", itemType: item.value, token: list };
    }
    if (this.match("identifier") || this.match("keyword", "Create") || this.match("keyword", "Time") || this.match("keyword", "Random")) {
      return { kind: "identifier", name: this.previous().value, token: this.previous() };
    }
    if (this.match("symbol", "(")) {
      const expr = this.parseExpression();
      this.consume("symbol", ")", "式の最後に ) が必要です。");
      return expr;
    }
    throw diagnostic(this.peek(), "式が必要です。");
  }

  private isTypeStart() {
    return ["int", "float", "bool", "string", "GameObject", "Text", "List"].includes(this.peek().value);
  }

  private match(kind: TokenKind, value?: string) {
    if (!this.check(kind, value)) return false;
    this.advance();
    return true;
  }

  private consume(kind: TokenKind, value: string, message: string) {
    if (this.check(kind, value)) return this.advance();
    if (kind === "symbol" && value === ";" && this.current > 0) {
      const previous = this.previous();
      const current = this.peek();
      if (current.line > previous.line || current.kind === "eof") {
        throw diagnostic({ ...previous, column: previous.column + Math.max(previous.value.length, 1) }, message);
      }
    }
    throw diagnostic(this.peek(), message);
  }

  private consumeIdentifier(message: string) {
    if (this.check("identifier")) return this.advance();
    throw diagnostic(this.peek(), message);
  }

  private consumeName(message: string) {
    if (this.check("identifier") || this.check("keyword")) return this.advance();
    throw diagnostic(this.peek(), message);
  }

  private check(kind: TokenKind, value?: string) {
    if (this.isAtEnd()) return kind === "eof";
    const token = this.peek();
    return token.kind === kind && (value === undefined || token.value === value);
  }

  private advance() {
    if (!this.isAtEnd()) this.current += 1;
    return this.previous();
  }

  private isAtEnd() {
    return this.peek().kind === "eof";
  }

  private peek() {
    return this.tokens[this.current];
  }

  private previous() {
    return this.tokens[this.current - 1];
  }
}

class Scope {
  private readonly values = new Map<string, RuntimeValue>();

  constructor(private readonly parent?: Scope) {}

  define(name: string, value: RuntimeValue) {
    this.values.set(name, value);
  }

  assign(name: string, value: RuntimeValue, token: Token) {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value, token);
      return;
    }
    throw diagnostic(token, `${name} は宣言されていません。先にフィールドまたは変数として宣言してください。`);
  }

  get(name: string, token: Token): RuntimeValue {
    if (this.values.has(name)) return this.values.get(name) ?? null;
    if (this.parent) return this.parent.get(name, token);
    throw diagnostic(token, `${name} は宣言されていません。`);
  }
}

export class DslInstance {
  private fields = new Scope();
  private started = false;
  private callDepth = 0;

  constructor(private readonly ast: ProgramAst, private readonly host: RuntimeHost) {
    this.resetFields();
  }

  start() {
    if (this.started) return;
    this.executeBlock(this.ast.start, new Scope(this.fields));
    this.started = true;
  }

  update() {
    if (!this.started) this.start();
    this.executeBlock(this.ast.update, new Scope(this.fields));
  }

  reset() {
    this.resetFields();
    this.started = false;
    this.start();
  }

  private resetFields() {
    this.fields = new Scope();
    for (const name of ["Create", "Time", "Random", "Math", "key", "game", "sound", "camera"] as const) {
      this.fields.define(name, { __kind: "builtin", name });
    }
    for (const field of this.ast.fields) {
      this.fields.define(field.name, defaultValue(field.typeName));
    }
    for (const field of this.ast.fields) {
      if (field.initializer) this.fields.assign(field.name, this.evaluate(field.initializer, new Scope(this.fields)), field.token);
    }
  }

  private executeBlock(block: BlockStmt, scope: Scope) {
    for (const stmt of block.statements) this.execute(stmt, scope);
  }

  private execute(stmt: Stmt, scope: Scope): void {
    switch (stmt.kind) {
      case "block":
        this.executeBlock(stmt, new Scope(scope));
        return;
      case "var":
        scope.define(stmt.name, stmt.initializer ? this.evaluate(stmt.initializer, scope) : defaultValue(stmt.typeName));
        return;
      case "expr":
        this.evaluate(stmt.expr, scope);
        return;
      case "if":
        if (toBool(this.evaluate(stmt.condition, scope))) this.execute(stmt.thenBranch, scope);
        else if (stmt.elseBranch) this.execute(stmt.elseBranch, scope);
        return;
      case "for": {
        const loop = new Scope(scope);
        if (stmt.initializer) this.execute(stmt.initializer, loop);
        let guard = 0;
        while (!stmt.condition || toBool(this.evaluate(stmt.condition, loop))) {
          if (guard++ > 5000) throw diagnostic(stmt.token, "for文の回数が多すぎます。条件が終わるか確認してください。");
          this.execute(stmt.body, loop);
          if (stmt.increment) this.evaluate(stmt.increment, loop);
        }
        return;
      }
      case "foreach": {
        const list = this.expectList(this.evaluate(stmt.list, scope), stmt.token);
        for (const item of [...list.items]) {
          const child = new Scope(scope);
          child.define(stmt.name, item);
          this.execute(stmt.body, child);
        }
      }
    }
  }

  private evaluate(expr: Expr, scope: Scope): RuntimeValue {
    switch (expr.kind) {
      case "literal":
        return expr.value;
      case "identifier":
        return scope.get(expr.name, expr.token);
      case "newList":
        return { __kind: "List", itemType: expr.itemType, items: [] };
      case "unary": {
        const right = this.evaluate(expr.right, scope);
        if (expr.op === "-") return -toNumber(right, expr.token);
        if (expr.op === "!") return !toBool(right);
        throw diagnostic(expr.token, `${expr.op} は使えない演算子です。`);
      }
      case "binary":
        return this.evaluateBinary(expr, scope);
      case "assign": {
        const value = this.evaluate(expr.value, scope);
        this.assignTarget(expr.target, value, scope, expr.token);
        return value;
      }
      case "member":
        return this.getMember(this.evaluate(expr.object, scope), expr.property, expr.token);
      case "index": {
        const list = this.expectList(this.evaluate(expr.object, scope), expr.token);
        const index = toNumber(this.evaluate(expr.index, scope), expr.token);
        if (!Number.isInteger(index) || index < 0 || index >= list.items.length) {
          throw diagnostic(expr.token, `リストの ${index} 番目は存在しません。Count は ${list.items.length} です。`);
        }
        return list.items[index];
      }
      case "call":
        return this.call(expr, scope);
    }
  }

  private evaluateBinary(expr: BinaryExpr, scope: Scope): RuntimeValue {
    if (expr.op === "&&") return toBool(this.evaluate(expr.left, scope)) && toBool(this.evaluate(expr.right, scope));
    if (expr.op === "||") return toBool(this.evaluate(expr.left, scope)) || toBool(this.evaluate(expr.right, scope));
    const left = this.evaluate(expr.left, scope);
    const right = this.evaluate(expr.right, scope);
    if (expr.op === "+") {
      if (typeof left === "string" || typeof right === "string") return `${stringify(left)}${stringify(right)}`;
      return toNumber(left, expr.token) + toNumber(right, expr.token);
    }
    if (expr.op === "-") return toNumber(left, expr.token) - toNumber(right, expr.token);
    if (expr.op === "*") return toNumber(left, expr.token) * toNumber(right, expr.token);
    if (expr.op === "/") return toNumber(left, expr.token) / toNumber(right, expr.token);
    if (expr.op === "%") return toNumber(left, expr.token) % toNumber(right, expr.token);
    if (expr.op === "==") return left === right;
    if (expr.op === "!=") return left !== right;
    if (expr.op === "<") return toNumber(left, expr.token) < toNumber(right, expr.token);
    if (expr.op === "<=") return toNumber(left, expr.token) <= toNumber(right, expr.token);
    if (expr.op === ">") return toNumber(left, expr.token) > toNumber(right, expr.token);
    if (expr.op === ">=") return toNumber(left, expr.token) >= toNumber(right, expr.token);
    throw diagnostic(expr.token, `${expr.op} は使えない演算子です。`);
  }

  private assignTarget(target: Expr, value: RuntimeValue, scope: Scope, token: Token) {
    if (target.kind === "identifier") {
      scope.assign(target.name, value, target.token);
      return;
    }
    if (target.kind === "member") {
      this.setMember(this.evaluate(target.object, scope), target.property, value, target.token);
      return;
    }
    if (target.kind === "index") {
      const list = this.expectList(this.evaluate(target.object, scope), target.token);
      const index = toNumber(this.evaluate(target.index, scope), target.token);
      if (!Number.isInteger(index) || index < 0 || index >= list.items.length) {
        throw diagnostic(target.token, `リストの ${index} 番目は存在しません。`);
      }
      list.items[index] = value;
      return;
    }
    throw diagnostic(token, "代入できるのは変数、プロパティ、リストの要素だけです。");
  }

  private getMember(value: RuntimeValue, property: string, token: Token): RuntimeValue {
    if (isEntity(value)) {
      assertAlive(value, token);
      if (property in value) return (value as unknown as Record<string, RuntimeValue>)[property];
      throw diagnostic(token, `${value.kind} に ${property} というプロパティはありません。`);
    }
    if (isList(value)) {
      if (property === "Count") return value.items.length;
      return { __kind: "builtin", name: property as never };
    }
    if (isBuiltin(value)) {
      if (value.name === "Time") {
        const time = this.host.getTime();
        if (property === "time") return time.time;
        if (property === "deltaTime") return time.deltaTime;
        if (property === "frameCount") return time.frameCount;
      }
      return { __kind: "builtin", name: `${value.name}.${property}` };
    }
    throw diagnostic(token, `${stringify(value)} には ${property} というプロパティはありません。`);
  }

  private setMember(value: RuntimeValue, property: string, assigned: RuntimeValue, token: Token) {
    if (!isEntity(value)) throw diagnostic(token, "プロパティを代入できるのは GameObject または Text だけです。");
    assertAlive(value, token);
    const numeric = new Set(["x", "y", "vx", "vy", "width", "height", "size"]);
    if (numeric.has(property)) {
      (value as unknown as Record<string, number>)[property] = toNumber(assigned, token);
      return;
    }
    if (property === "visible" || property === "flipX") {
      (value as unknown as Record<string, boolean>)[property] = toBool(assigned);
      return;
    }
    if (property === "color" || property === "value") {
      (value as unknown as Record<string, string>)[property] = stringify(assigned);
      return;
    }
    throw diagnostic(token, `${value.kind} の ${property} には代入できません。`);
  }

  private call(expr: CallExpr, scope: Scope): RuntimeValue {
    if (expr.callee.kind === "identifier") return this.callUserMethod(expr.callee.name, expr.args, scope, expr.token);
    if (expr.callee.kind !== "member") throw diagnostic(expr.token, "呼び出せるのは Function(...) または obj.Method(...) 形式のメソッドだけです。");
    const owner = this.evaluate(expr.callee.object, scope);
    const method = expr.callee.property;
    const args = expr.args.map((arg) => this.evaluate(arg, scope));

    if (isBuiltin(owner)) return this.callBuiltin(owner.name, method, args, expr.token);
    if (isList(owner)) return this.callList(owner, method, args, expr.token);
    if (isEntity(owner)) return this.callEntity(owner, method, args, expr.token);
    if (typeof owner === "number") return this.callNumber(owner, method, args, expr.token);
    throw diagnostic(expr.token, `${stringify(owner)} の ${method} は呼び出せません。`);
  }

  private callUserMethod(name: string, argExprs: Expr[], scope: Scope, token: Token): RuntimeValue {
    const method = this.ast.methods.get(name);
    if (!method) throw diagnostic(token, `${name} という関数は定義されていません。`);
    if (method.params.length !== argExprs.length) {
      throw diagnostic(token, `${name} の引数は ${method.params.length} 個です。現在は ${argExprs.length} 個あります。`);
    }
    if (this.callDepth > 50) throw diagnostic(token, "関数呼び出しが深すぎます。自分自身を呼び続けていないか確認してください。");
    const methodScope = new Scope(this.fields);
    method.params.forEach((param, index) => methodScope.define(param.name, this.evaluate(argExprs[index], scope)));
    this.callDepth += 1;
    try {
      this.executeBlock(method.body, methodScope);
    } finally {
      this.callDepth -= 1;
    }
    return null;
  }

  private callBuiltin(name: string, method: string, args: RuntimeValue[], token: Token): RuntimeValue {
    if (name === "Create" && method === "Box") return this.host.createBox(numArg(args, 0, token), numArg(args, 1, token), numArg(args, 2, token), numArg(args, 3, token));
    if (name === "Create" && method === "Circle") return this.host.createCircle(numArg(args, 0, token), numArg(args, 1, token), numArg(args, 2, token));
    if (name === "Create" && method === "Sprite") return this.host.createSprite(stringArg(args, 0, token), numArg(args, 1, token), numArg(args, 2, token), numArg(args, 3, token), numArg(args, 4, token));
    if (name === "Create" && method === "Text") return this.host.createText(stringify(args[0] ?? ""), numArg(args, 1, token), numArg(args, 2, token), args[3] === undefined ? undefined : numArg(args, 3, token));
    if (name === "Random" && method === "Range") return numArg(args, 0, token) + Math.random() * (numArg(args, 1, token) - numArg(args, 0, token));
    if (name === "Random" && method === "Chance") return Math.random() < numArg(args, 0, token);
    if (name === "Math" && method === "Round") {
      const digits = digitsArg(args, 1, token);
      const scale = 10 ** digits;
      return Math.round(numArg(args, 0, token) * scale) / scale;
    }
    if (name === "Math" && method === "Fixed") return numArg(args, 0, token).toFixed(digitsArg(args, 1, token));
    if (name === "Math" && method === "Floor") return Math.floor(numArg(args, 0, token));
    if (name === "Math" && method === "Ceil") return Math.ceil(numArg(args, 0, token));
    if (name === "key" && method === "Down") return this.host.keyDown(stringify(args[0] ?? ""));
    if (name === "key" && method === "Pressed") return this.host.keyPressed(stringify(args[0] ?? ""));
    if (name === "game" && method === "Reset") {
      this.host.requestReset();
      return null;
    }
    if (name === "sound" && method === "Play") {
      this.host.playSound(stringify(args[0] ?? ""), args[1] === undefined ? undefined : numArg(args, 1, token));
      return null;
    }
    if (name === "camera" && method === "Follow") {
      const target = this.expectEntity(args[0], token);
      this.host.follow(target);
      return null;
    }
    throw diagnostic(token, `${name}.${method} は存在しないメソッドです。`);
  }

  private callList(list: ListValue, method: string, args: RuntimeValue[], token: Token): RuntimeValue {
    if (method === "Add") {
      list.items.push(args[0] ?? null);
      return null;
    }
    if (method === "Remove") {
      const index = list.items.indexOf(args[0] ?? null);
      if (index >= 0) list.items.splice(index, 1);
      return null;
    }
    if (method === "Clear") {
      list.items.length = 0;
      return null;
    }
    throw diagnostic(token, `List に ${method} というメソッドはありません。`);
  }

  private callNumber(value: number, method: string, args: RuntimeValue[], token: Token): RuntimeValue {
    if (method === "ToString") {
      if (args.length === 0) return String(value);
      const format = stringify(args[0] ?? "");
      const fixed = format.match(/^F(\d+)$/i);
      if (fixed) return value.toFixed(digitsFromText(fixed[1], token));
      throw diagnostic(token, `数値の ToString で使える形式は "F2" のような固定小数形式です。`);
    }
    throw diagnostic(token, `数値に ${method} というメソッドはありません。`);
  }

  private callEntity(entity: RuntimeEntity, method: string, args: RuntimeValue[], token: Token): RuntimeValue {
    assertAlive(entity, token);
    if (method === "Touch") return this.host.touch(entity, this.expectEntity(args[0], token));
    if (method === "TouchWall") return entity.x <= 0 || entity.y <= 0 || entity.x + entity.width >= this.host.width || entity.y + entity.height >= this.host.height;
    if (method === "Hide") {
      entity.visible = false;
      return null;
    }
    if (method === "Show") {
      entity.visible = true;
      return null;
    }
    if (method === "Move") {
      entity.x = numArg(args, 0, token);
      entity.y = numArg(args, 1, token);
      return null;
    }
    if (method === "SetSprite") {
      if (entity.kind !== "GameObject") throw diagnostic(token, "SetSprite は GameObject だけで使えます。");
      entity.shape = "sprite";
      entity.imageName = stringArg(args, 0, token);
      return null;
    }
    if (method === "Destroy") {
      entity.destroyed = true;
      entity.visible = false;
      return null;
    }
    throw diagnostic(token, `${entity.kind} に ${method} というメソッドはありません。`);
  }

  private expectList(value: RuntimeValue, token: Token): ListValue {
    if (isList(value)) return value;
    throw diagnostic(token, "ここには List<T> が必要です。");
  }

  private expectEntity(value: RuntimeValue, token: Token): RuntimeEntity {
    if (isEntity(value)) return value;
    throw diagnostic(token, "ここには GameObject または Text が必要です。");
  }
}

function defaultValue(typeName: TypeName): RuntimeValue {
  if (typeName === "int" || typeName === "float") return 0;
  if (typeName === "bool") return false;
  if (typeName === "string") return "";
  if (typeName.startsWith("List<")) return { __kind: "List", itemType: typeName.slice(5, -1), items: [] };
  return null;
}

function isEntity(value: RuntimeValue): value is RuntimeEntity {
  return typeof value === "object" && value !== null && "kind" in value && (value.kind === "GameObject" || value.kind === "Text");
}

function isList(value: RuntimeValue): value is ListValue {
  return typeof value === "object" && value !== null && "__kind" in value && value.__kind === "List";
}

function isBuiltin(value: RuntimeValue): value is BuiltinRef {
  return typeof value === "object" && value !== null && "__kind" in value && value.__kind === "builtin";
}

function assertAlive(entity: RuntimeEntity, token: Token) {
  if (entity.destroyed) throw diagnostic(token, "Destroy() されたオブジェクトにはアクセスできません。リストから Remove するか、新しく作り直してください。");
}

function toNumber(value: RuntimeValue, token: Token): number {
  if (typeof value === "number") return value;
  throw diagnostic(token, `${stringify(value)} は数値として使えません。`);
}

function toBool(value: RuntimeValue): boolean {
  return Boolean(value);
}

function stringify(value: RuntimeValue): string {
  if (value === null) return "null";
  if (isEntity(value)) return `${value.kind}#${value.id}`;
  if (isList(value)) return `List<${value.itemType}>`;
  if (isBuiltin(value)) return value.name;
  return String(value);
}

function numArg(args: RuntimeValue[], index: number, token: Token): number {
  return toNumber(args[index] ?? null, token);
}

function stringArg(args: RuntimeValue[], index: number, token: Token): string {
  const value = args[index] ?? null;
  if (typeof value === "string") return value;
  throw diagnostic(token, `${stringify(value)} は文字列として使えません。`);
}

function digitsArg(args: RuntimeValue[], index: number, token: Token): number {
  const value = numArg(args, index, token);
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw diagnostic(token, "小数の桁数は 0 から 10 の整数にしてください。");
  }
  return value;
}

function digitsFromText(value: string, token: Token): number {
  const digits = Number(value);
  if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
    throw diagnostic(token, "小数の桁数は 0 から 10 の整数にしてください。");
  }
  return digits;
}
