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

  createText(value: string, x: number, y: number, size = 20): RuntimeEntity {
    return this.add({ kind: "Text", x, y, width: 100, height: size, value, size, color: "black" });
  }

  touch(a: RuntimeEntity, b: RuntimeEntity): boolean {
    return a.visible && b.visible && !a.destroyed && !b.destroyed && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  keyDown(): boolean {
    return false;
  }

  keyPressed(): boolean {
    return false;
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

  it("requires class Main with Start and Update", () => {
    const compiled = compileDsl("void Update() {}");
    expect(compiled.diagnostics[0]?.message).toContain("class Main");
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
    Text scoreText
    int score = 0;

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        scoreText = Create.Text("Score: 0", 20, 24, 22
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

  it("supports Math rounding helpers and float suffix literals", () => {
    const code = `class Main
{
    Text label;
    float value = 2f;

    void Start()
    {
        label = Create.Text("", 10, 10);
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
    Text label;
    float value = 3.14159f;

    void Start()
    {
        label = Create.Text("", 10, 10);
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

  it("requires explicit string conversion for Text.value", () => {
    const diagnostics = analyzeDsl(`class Main
{
    Text label;

    void Start()
    {
        label = Create.Text("", 10, 10);
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

  it("plays sounds with optional volume", () => {
    const code = `class Main
{
    void Start()
    {
        sound.Play("coin");
        sound.Play("jump", 0.25f);
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

  it("requires f suffix for decimal float literals", () => {
    const diagnostics = analyzeDsl(`class Main
{
    float value = 1.0;

    void Start()
    {
        sound.Play("jump", 0.5);
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
        sound.Play("jump", 0.5f);
    }

    void Update()
    {
    }
}`).diagnostics).toEqual([]);
  });
});
