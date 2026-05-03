import { describe, expect, it } from "vitest";
import { analyzeDsl, compileDsl, DslError, RuntimeEntity, RuntimeHost } from "./dsl";
import { sampleCode } from "./sample";

class MockHost implements RuntimeHost {
  width = 640;
  height = 360;
  entities: RuntimeEntity[] = [];
  resetRequested = false;
  playedSounds: { name: string; volume?: number }[] = [];
  private id = 1;

  createBox(x: number, y: number, width: number, height: number): RuntimeEntity {
    return this.add({ kind: "GameObject", shape: "box", x, y, width, height, color: "blue" });
  }

  createCircle(x: number, y: number, radius: number): RuntimeEntity {
    return this.add({ kind: "GameObject", shape: "circle", x, y, width: radius * 2, height: radius * 2, radius, color: "yellow" });
  }

  createSprite(name: string, x: number, y: number, width: number, height: number): RuntimeEntity {
    return this.add({ kind: "GameObject", shape: "sprite", imageName: name, x, y, width, height, color: "gray" });
  }

  createUIText(value: string, x: number, y: number, size = 20): RuntimeEntity {
    return this.add({ kind: "UIText", x, y, width: 100, height: size, value, size, color: "black" });
  }

  createUIBox(x: number, y: number, width: number, height: number): RuntimeEntity {
    return this.add({ kind: "UIBox", shape: "box", x, y, width, height, color: "gray" });
  }

  createUICircle(x: number, y: number, radius: number): RuntimeEntity {
    return this.add({ kind: "UICircle", shape: "circle", x, y, width: radius * 2, height: radius * 2, radius, color: "gray" });
  }

  createUIButton(value: string, x: number, y: number, width: number, height: number): RuntimeEntity {
    return this.add({ kind: "UIButton", shape: "button", x, y, width, height, value, size: 16, color: "teal", textColor: "white" });
  }

  touch(a: RuntimeEntity, b: RuntimeEntity): boolean {
    const ab = bounds(a);
    const bb = bounds(b);
    return a.visible && b.visible && !a.destroyed && !b.destroyed && ab.left < bb.right && ab.right > bb.left && ab.top < bb.bottom && ab.bottom > bb.top;
  }

  keyDown(): boolean {
    return false;
  }

  keyPressed(): boolean {
    return false;
  }

  buttonDown(): boolean {
    return false;
  }

  buttonClicked(): boolean {
    return true;
  }

  getMouse() {
    return { x: 123, y: 45 };
  }

  playSound(name: string, volume?: number): void {
    this.playedSounds.push({ name, volume });
  }

  follow(): void {}

  requestReset(): void {
    this.resetRequested = true;
  }

  getTime() {
    return { time: 1, deltaTime: 1 / 60, frameCount: 1 };
  }

  private add(base: Omit<RuntimeEntity, "id" | "vx" | "vy" | "visible" | "destroyed" | "flipX">): RuntimeEntity {
    const entity: RuntimeEntity = { id: this.id++, vx: 0, vy: 0, visible: true, destroyed: false, flipX: false, ...base };
    this.entities.push(entity);
    return entity;
  }
}

function bounds(entity: RuntimeEntity) {
  if (entity.kind === "UIText" || entity.kind === "UIBox" || entity.kind === "UICircle" || entity.kind === "UIButton") {
    return { left: entity.x, top: entity.y, right: entity.x + entity.width, bottom: entity.y + entity.height };
  }
  return { left: entity.x - entity.width / 2, top: entity.y - entity.height / 2, right: entity.x + entity.width / 2, bottom: entity.y + entity.height / 2 };
}

describe("DSL", () => {
  it("compiles and runs the starter sample", () => {
    const compiled = compileDsl(sampleCode);
    expect(compiled.diagnostics).toEqual([]);

    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    instance.update();

    expect(host.entities).toEqual([]);
  });

  it("requires a class with Start and Update", () => {
    const compiled = compileDsl("void Update() {}");
    expect(compiled.diagnostics[0]?.message).toContain("class");
  });

  it("allows a custom class name", () => {
    const compiled = compileDsl(`class Player
{
    void Start()
    {
    }

    void Update()
    {
    }
}`);
    expect(compiled.diagnostics).toEqual([]);
  });

  it("destroys objects and rejects later access", () => {
    const code = `class Main
{
    GameObject box;

    void Start()
    {
        box = Create.Box(10, 10, 20, 20);
        box.Destroy();
    }

    void Update()
    {
        box.x = 30;
    }
}`;
    const compiled = compileDsl(code);
    const instance = compiled.createInstance(new MockHost());
    instance.start();
    expect(() => instance.update()).toThrow(DslError);
  });

  it("supports List<GameObject> and backward removal", () => {
    const code = `class Main
{
    GameObject player;
    List<GameObject> enemies = new List<GameObject>();
    int score = 0;

    void Start()
    {
        player = Create.Box(10, 10, 20, 20);
        enemies.Add(Create.Box(10, 10, 20, 20));
    }

    void Update()
    {
        for (int i = enemies.Count - 1; i >= 0; i = i - 1) {
            if (player.Touch(enemies[i])) {
                enemies[i].Destroy();
                enemies.Remove(enemies[i]);
                score = score + 1;
            }
        }
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    instance.update();
    expect(host.entities.filter((entity) => entity.destroyed).length).toBe(1);
  });

  it("statically reports unknown names and methods", () => {
    const diagnostics = analyzeDsl(`class Main
{
    GameObject player;

    void Start()
    {
    }

    void Update()
    {
        player.Fly();
        missing = 1;
    }
}`);
    expect(diagnostics.some((item) => item.message.includes("Start() で作られていない"))).toBe(true);
    expect(diagnostics.some((item) => item.message.includes("Fly"))).toBe(true);
    expect(diagnostics.some((item) => item.message.includes("missing"))).toBe(true);
  });

  it("collects multiple syntax-like diagnostics at once", () => {
    const diagnostics = analyzeDsl(`class Main
{
    GameObject player
    UIText scoreText
    int score = 0;

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        scoreText = Create.UIText("Score: 0", 20, 24, 22
        scoreText.color = "black";
    }

    void Update()
    {
    }
}`);

    expect(diagnostics.filter((item) => item.message.includes(";")).length).toBeGreaterThanOrEqual(3);
    expect(diagnostics.some((item) => item.message.includes(") が足りません"))).toBe(true);
  });

  it("supports user-defined void functions with parameters", () => {
    const code = `class Main
{
    GameObject player;
    float speed = 5;

    void Start()
    {
        player = Create.Box(10, 10, 20, 20);
    }

    void Update()
    {
        MovePlayer(speed);
    }

    void MovePlayer(float moveSpeed)
    {
        player.vx = moveSpeed;
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    expect(analyzeDsl(code)).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    instance.update();
    expect(host.entities[0].vx).toBe(5);
  });

  it("supports typed user-defined functions for primitives, objects, UI, and lists", () => {
    const code = `class Main
{
    UIText label;
    UIBox panel;
    GameObject player;
    List<GameObject> enemies = new List<GameObject>();

    void Start()
    {
        label = Create.UIText(MakeLabel(2), 20, 20, 20);
        panel = MakePanel();
        player = MakePlayer();
        enemies = MakeEnemies();
    }

    void Update()
    {
        if (IsReady() && enemies.Count == 1)
        {
            player.x = player.x + Speed();
        }
    }

    int Add(int a, int b)
    {
        return a + b;
    }

    float Speed()
    {
        return 2.5f;
    }

    bool IsReady()
    {
        return true;
    }

    string MakeLabel(int value)
    {
        return "Score: " + Add(value, 3);
    }

    GameObject MakePlayer()
    {
        return Create.Box(100, 100, 20, 20);
    }

    UIBox MakePanel()
    {
        return Create.UIBox(10, 10, 120, 40);
    }

    List<GameObject> MakeEnemies()
    {
        List<GameObject> result = new List<GameObject>();
        result.Add(Create.Box(200, 100, 20, 20));
        return result;
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    instance.update();
    expect(host.entities[0]).toMatchObject({ kind: "UIText", value: "Score: 5" });
    expect(host.entities[1]).toMatchObject({ kind: "UIBox" });
    expect(host.entities[2]).toMatchObject({ kind: "GameObject", x: 102.5 });
    expect(host.entities[3]).toMatchObject({ kind: "GameObject" });
  });

  it("reports return type mistakes", () => {
    const diagnostics = analyzeDsl(`class Main
{
    void Start()
    {
        int value = MissingReturn();
        BadVoid();
    }

    void Update()
    {
    }

    int MissingReturn()
    {
        if (false)
        {
            return 1;
        }
    }

    bool WrongType()
    {
        return 1;
    }

    void BadVoid()
    {
        return 1;
    }
}`);
    expect(diagnostics.some((item) => item.message.includes("すべての流れで return"))).toBe(true);
    expect(diagnostics.some((item) => item.message.includes("bool に int"))).toBe(true);
    expect(diagnostics.some((item) => item.message.includes("void 関数では値を返せません"))).toBe(true);
  });

  it("supports Math rounding helpers and float suffix literals", () => {
    const code = `class Main
{
    UIText label;
    float value = 2f;

    void Start()
    {
        label = Create.UIText("", 10, 10);
    }

    void Update()
    {
        value = Math.Round(1.2345f, 2);
        label.value = Math.Fixed(value, 2);
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    instance.update();
    expect(host.entities[0].value).toBe("1.23");
  });

  it("supports C#-style number ToString fixed format", () => {
    const code = `class Main
{
    UIText label;
    float value = 3.14159f;

    void Start()
    {
        label = Create.UIText("", 10, 10);
    }

    void Update()
    {
        label.value = value.ToString("F2");
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    instance.update();
    expect(host.entities[0].value).toBe("3.14");
  });

  it("requires explicit string conversion for UIText.value", () => {
    const diagnostics = analyzeDsl(`class Main
{
    UIText label;

    void Start()
    {
        label = Create.UIText("", 10, 10);
    }

    void Update()
    {
        label.value = Time.time;
    }
}`);
    expect(diagnostics.some((item) => item.message.includes("string に float"))).toBe(true);
  });

  it("requires compatible types for equality comparisons", () => {
    const diagnostics = analyzeDsl(`class Main
{
    bool same = false;

    void Start()
    {
    }

    void Update()
    {
        same = Time.time == "1";
    }
}`);
    expect(diagnostics.some((item) => item.message.includes("float と string"))).toBe(true);
  });

  it("creates sprites using explicit box-sized bounds", () => {
    const code = `class Main
{
    GameObject hero;

    void Start()
    {
        hero = Create.Sprite("hero", 10, 20, 48, 32);
    }

    void Update()
    {
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    expect(host.entities[0]).toMatchObject({ shape: "sprite", imageName: "hero", width: 48, height: 32 });
  });

  it("can set sprites later and flip them horizontally", () => {
    const code = `class Main
{
    GameObject hero;

    void Start()
    {
        hero = Create.Box(10, 20, 48, 32);
        hero.SetSprite("hero");
        hero.flipX = true;
    }

    void Update()
    {
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    expect(host.entities[0]).toMatchObject({ shape: "sprite", imageName: "hero", width: 48, height: 32, flipX: true });
  });

  it("treats GameObject x/y as center for wall checks", () => {
    const code = `class Main
{
    GameObject box;

    void Start()
    {
        box = Create.Box(10, 100, 20, 20);
        if (box.TouchWall())
        {
            Game.Reset();
        }
    }

    void Update()
    {
    }
}`;
    const host = new MockHost();
    compileDsl(code).createInstance(host).start();
    expect(host.resetRequested).toBe(true);
  });

  it("plays sounds with optional volume", () => {
    const code = `class Main
{
    void Start()
    {
        Sound.Play("coin");
        Sound.Play("jump", 0.25f);
    }

    void Update()
    {
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    expect(host.playedSounds).toEqual([
      { name: "coin", volume: undefined },
      { name: "jump", volume: 0.25 }
    ]);
  });

  it("creates screen UI objects and handles button clicks", () => {
    const code = `class Main
{
    UIText label;
    UIBox panel;
    UICircle icon;
    UIButton retry;
    int count = 0;

    void Start()
    {
        panel = Create.UIBox(20, 20, 180, 80);
        icon = Create.UICircle(32, 32, 12);
        label = Create.UIText("Ready", 52, 32, 20);
        retry = Create.UIButton("Retry", 220, 20, 90, 36);
    }

    void Update()
    {
        if (retry.Clicked())
        {
            count++;
            label.value = "Clicked: " + count;
        }
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    instance.update();
    expect(host.entities.map((entity) => entity.kind)).toEqual(["UIBox", "UICircle", "UIText", "UIButton"]);
    expect(host.entities[2].value).toBe("Clicked: 1");
  });

  it("uses Unity-style Input methods and rejects old implicit variables", () => {
    const code = `class Main
{
    UIText label;

    void Start()
    {
        label = Create.UIText("", 20, 20, 20);
    }

    void Update()
    {
        if (Input.GetKey("A"))
        {
            label.value = "hold";
        }
        if (Input.GetKeyDown("Space"))
        {
            label.value = "down";
        }
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);

    const oldDiagnostics = analyzeDsl(`class Main
{
    void Start()
    {
        key.Down("A");
        game.Reset();
        sound.Play("coin");
        camera.Follow(Create.Box(100, 100, 20, 20));
    }

    void Update()
    {
    }
}`);
    expect(oldDiagnostics.some((item) => item.message.includes("key は宣言されていません"))).toBe(true);
    expect(oldDiagnostics.some((item) => item.message.includes("game は宣言されていません"))).toBe(true);
    expect(oldDiagnostics.some((item) => item.message.includes("sound は宣言されていません"))).toBe(true);
    expect(oldDiagnostics.some((item) => item.message.includes("camera は宣言されていません"))).toBe(true);
  });

  it("exposes mouse position through Input", () => {
    const code = `class Main
{
    UIBox cursor;

    void Start()
    {
        cursor = Create.UIBox(0, 0, 8, 8);
    }

    void Update()
    {
        cursor.Move(Input.mouseX, Input.mouseY);
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    const instance = compiled.createInstance(host);
    instance.start();
    instance.update();
    expect(host.entities[0]).toMatchObject({ x: 123, y: 45 });
  });

  it("rejects the removed Text type and Create.Text", () => {
    const typeDiagnostics = analyzeDsl(`class Main
{
    Text label;

    void Start()
    {
        label = Create.Text("", 20, 20, 20);
    }

    void Update()
    {
    }
}`);
    expect(typeDiagnostics.some((item) => item.message.includes("型名が必要"))).toBe(true);

    const createDiagnostics = analyzeDsl(`class Main
{
    UIText label;

    void Start()
    {
        label = Create.Text("", 20, 20, 20);
    }

    void Update()
    {
    }
}`);
    expect(createDiagnostics.some((item) => item.message.includes("Create.Text は存在しません"))).toBe(true);
  });

  it("supports ++ and -- in loops", () => {
    const code = `class Main
{
    UIText label;
    int count = 0;

    void Start()
    {
        label = Create.UIText("", 20, 20, 20);
        for (int i = 0; i < 3; i++)
        {
            count++;
        }
        count--;
        label.value = "" + count;
    }

    void Update()
    {
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    compiled.createInstance(host).start();
    expect(host.entities[0].value).toBe("2");
  });

  it("allows string Length and index access", () => {
    const code = `class Main
{
    UIText label;
    string text = "abc";
    string result = "";

    void Start()
    {
        label = Create.UIText("", 20, 20, 20);
        for (int i = 0; i < text.Length; i++)
        {
            result = result + text[i];
        }
        label.value = result;
    }

    void Update()
    {
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    compiled.createInstance(host).start();
    expect(host.entities[0].value).toBe("abc");
  });

  it("allows foreach over strings", () => {
    const code = `class Main
{
    UIText label;
    string text = "abc";
    string result = "";

    void Start()
    {
        label = Create.UIText("", 20, 20, 20);
        foreach (string ch in text)
        {
            result = result + ch;
        }
        label.value = result;
    }

    void Update()
    {
    }
}`;
    const compiled = compileDsl(code);
    expect(compiled.diagnostics).toEqual([]);
    const host = new MockHost();
    compiled.createInstance(host).start();
    expect(host.entities[0].value).toBe("abc");
  });

  it("requires f suffix for decimal float literals", () => {
    const diagnostics = analyzeDsl(`class Main
{
    float value = 1.0;

    void Start()
    {
        Sound.Play("jump", 0.5);
    }

    void Update()
    {
    }
}`);

    expect(diagnostics.filter((item) => item.message.includes("末尾に f")).length).toBe(2);
    expect(compileDsl(`class Main
{
    float value = 1.0f;

    void Start()
    {
        Sound.Play("jump", 0.5f);
    }

    void Update()
    {
    }
}`).diagnostics).toEqual([]);
  });
});
