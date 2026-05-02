"use client";

import { useEffect, useRef } from "react";
import { compileDsl, DslError, DslInstance, RuntimeEntity, RuntimeHost, type DslDiagnostic } from "@/lib/dsl";

type GameCanvasProps = {
  code: string;
  control: "stopped" | "running" | "paused";
  sessionId: number;
  assetScope?: string;
  onDiagnostics(diagnostics: DslDiagnostic[]): void;
  onStop?(): void;
};

const WIDTH = 640;
const HEIGHT = 360;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

class CanvasHost implements RuntimeHost {
  width = WIDTH;
  height = HEIGHT;
  entities: RuntimeEntity[] = [];
  keys = new Set<string>();
  pressed = new Set<string>();
  resetRequested = false;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly soundBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly readySounds = new Set<string>();
  private readonly pendingSoundStarts = new Set<string>();
  private readonly activeSoundSources = new Set<AudioScheduledSourceNode>();
  private audioContext: AudioContext | null = null;
  private soundGeneration = 0;
  private id = 1;
  private startedAt = performance.now();
  private lastAt = performance.now();
  private frame = 0;
  private cameraTarget: RuntimeEntity | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly assetScope = "") {}

  bindKeys() {
    const down = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const key = normalizeKey(event);
      if (!this.keys.has(key)) this.pressed.add(key);
      this.keys.add(key);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      this.keys.delete(normalizeKey(event));
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }

  clear() {
    this.stopAllSounds();
    this.entities = [];
    this.id = 1;
    this.resetRequested = false;
    this.startedAt = performance.now();
    this.lastAt = this.startedAt;
    this.frame = 0;
    this.cameraTarget = null;
  }

  createBox(x: number, y: number, width: number, height: number): RuntimeEntity {
    return this.add({ kind: "GameObject", shape: "box", x, y, width, height, color: "#2563eb" });
  }

  createCircle(x: number, y: number, radius: number): RuntimeEntity {
    return this.add({ kind: "GameObject", shape: "circle", x, y, width: radius * 2, height: radius * 2, radius, color: "#f59e0b" });
  }

  createSprite(name: string, x: number, y: number, width: number, height: number): RuntimeEntity {
    this.loadImage(name);
    return this.add({ kind: "GameObject", shape: "sprite", imageName: name, x, y, width, height, color: "#94a3b8" });
  }

  createText(value: string, x: number, y: number, size = 20): RuntimeEntity {
    return this.add({ kind: "Text", x, y, width: value.length * size * 0.6, height: size, value, size, color: "#111827" });
  }

  touch(a: RuntimeEntity, b: RuntimeEntity): boolean {
    if (!a.visible || !b.visible || a.destroyed || b.destroyed) return false;
    return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
  }

  keyDown(key: string): boolean {
    return this.keys.has(key);
  }

  keyPressed(key: string): boolean {
    return this.pressed.has(key);
  }

  playSound(name: string, volume = 0.75) {
    const safeVolume = clampVolume(volume);
    const generation = this.soundGeneration;
    const bufferPromise = this.loadSoundBuffer(name);
    if (!this.readySounds.has(name)) {
      if (this.pendingSoundStarts.has(name)) return;
      this.pendingSoundStarts.add(name);
    }
    bufferPromise.then((buffer) => {
      this.pendingSoundStarts.delete(name);
      if (generation !== this.soundGeneration) return;
      if (buffer) {
        this.playSoundBuffer(buffer, safeVolume);
        return;
      }
      this.playFallbackSound(name, safeVolume);
    });
  }

  private playFallbackSound(name: string, volume = 0.75) {
    const context = this.getAudioContext();
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = name === "coin" ? 880 : 440;
    gain.gain.value = 0.04 * clampVolume(volume);
    osc.connect(gain);
    gain.connect(context.destination);
    this.trackSoundSource(osc);
    osc.start();
    osc.stop(context.currentTime + 0.07);
  }

  follow(entity: RuntimeEntity) {
    this.cameraTarget = entity;
  }

  requestReset() {
    this.resetRequested = true;
  }

  getTime() {
    const now = performance.now();
    return {
      time: (now - this.startedAt) / 1000,
      deltaTime: (now - this.lastAt) / 1000,
      frameCount: this.frame
    };
  }

  step() {
    this.entities.forEach((entity) => {
      if (entity.destroyed) return;
      entity.x += entity.vx;
      entity.y += entity.vy;
    });
    this.pressed.clear();
    this.lastAt = performance.now();
    this.frame += 1;
  }

  render() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = "#d0d5dd";
    ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);

    const offsetX = this.cameraTarget ? Math.max(0, this.cameraTarget.x - WIDTH / 2) : 0;
    ctx.save();
    ctx.translate(-offsetX, 0);
    for (const entity of this.entities) {
      if (!entity.visible || entity.destroyed) continue;
      ctx.fillStyle = entity.color || "#2563eb";
      if (entity.kind === "Text") continue;
      if (entity.shape === "sprite") {
        this.drawSprite(ctx, entity);
      } else if (entity.shape === "circle") {
        ctx.beginPath();
        ctx.arc(entity.x + entity.width / 2, entity.y + entity.height / 2, entity.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
      }
    }
    ctx.restore();

    for (const entity of this.entities) {
      if (!entity.visible || entity.destroyed || entity.kind !== "Text") continue;
      ctx.fillStyle = entity.color || "#111827";
      ctx.font = `${entity.size ?? 20}px Arial, sans-serif`;
      ctx.fillText(entity.value ?? "", entity.x, entity.y);
      entity.width = (entity.value ?? "").length * (entity.size ?? 20) * 0.6;
      entity.height = entity.size ?? 20;
    }
  }

  renderIdle(message = "Ready") {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = "#d0d5dd";
    ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);
    ctx.fillStyle = "#667085";
    ctx.font = "20px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, WIDTH / 2, HEIGHT / 2);
    ctx.textAlign = "left";
  }

  private add(base: Omit<RuntimeEntity, "id" | "vx" | "vy" | "visible" | "destroyed" | "flipX">): RuntimeEntity {
    const entity: RuntimeEntity = { id: this.id++, vx: 0, vy: 0, visible: true, destroyed: false, flipX: false, ...base };
    this.entities.push(entity);
    return entity;
  }

  private loadImage(name: string) {
    if (this.images.has(name)) return;
    const image = new Image();
    const candidates = spriteUrls(name, this.assetScope);
    let index = 0;
    image.src = candidates[index] ?? "";
    image.onerror = () => {
      index += 1;
      if (index >= candidates.length) return;
      image.src = candidates[index];
    };
    image.onload = () => this.render();
    this.images.set(name, image);
  }

  private loadSoundBuffer(name: string) {
    const cached = this.soundBuffers.get(name);
    if (cached) return cached;
    const promise = this.resolveSoundBuffer(soundUrls(name, this.assetScope)).then((buffer) => {
      if (buffer) this.readySounds.add(name);
      return buffer;
    });
    this.soundBuffers.set(name, promise);
    return promise;
  }

  private async resolveSoundBuffer(candidates: string[]): Promise<AudioBuffer | null> {
    const context = this.getAudioContext();
    if (!context) return null;
    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) continue;
        const bytes = await response.arrayBuffer();
        return await context.decodeAudioData(bytes);
      } catch {
        continue;
      }
    }
    return null;
  }

  private playSoundBuffer(buffer: AudioBuffer, volume: number) {
    const context = this.getAudioContext();
    if (!context) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(context.destination);
    this.trackSoundSource(source);
    source.start();
  }

  private getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    this.audioContext ??= new AudioContextClass();
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => undefined);
    }
    return this.audioContext;
  }

  private trackSoundSource(source: AudioScheduledSourceNode) {
    this.activeSoundSources.add(source);
    source.addEventListener("ended", () => this.activeSoundSources.delete(source), { once: true });
  }

  private stopAllSounds() {
    this.soundGeneration += 1;
    this.pendingSoundStarts.clear();
    for (const source of this.activeSoundSources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    }
    this.activeSoundSources.clear();
  }

  private drawSprite(ctx: CanvasRenderingContext2D, entity: RuntimeEntity) {
    if (entity.imageName && !this.images.has(entity.imageName)) this.loadImage(entity.imageName);
    const image = entity.imageName ? this.images.get(entity.imageName) : undefined;
    if (image?.complete && image.naturalWidth > 0) {
      if (entity.flipX) {
        ctx.save();
        ctx.translate(entity.x + entity.width, entity.y);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, 0, entity.width, entity.height);
        ctx.restore();
      } else {
        ctx.drawImage(image, entity.x, entity.y, entity.width, entity.height);
      }
      return;
    }
    ctx.fillStyle = entity.color || "#94a3b8";
    ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
    ctx.strokeStyle = "#475467";
    ctx.strokeRect(entity.x + 0.5, entity.y + 0.5, entity.width - 1, entity.height - 1);
    ctx.fillStyle = "#344054";
    ctx.font = "10px Arial, sans-serif";
    ctx.fillText(entity.imageName ?? "sprite", entity.x + 4, entity.y + Math.min(entity.height - 4, 14));
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function normalizeKey(event: KeyboardEvent) {
  if (event.code === "Space") return "Space";
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 0.75;
  return Math.max(0, Math.min(1, value));
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".cm-editor")) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

function spriteUrls(name: string, scope: string) {
  return assetUrls(name, scope, ["png", "jpg", "jpeg", "gif", "webp"]);
}

function soundUrls(name: string, scope: string) {
  return assetUrls(name, scope, ["mp3", "wav", "ogg", "m4a"]);
}

function assetUrls(name: string, scope: string, extensions: string[]) {
  const hasExtension = /\.[A-Za-z0-9]+$/.test(name);
  const fileNames = hasExtension ? [name] : extensions.map((extension) => `${name}.${extension}`);
  const urls: string[] = [];
  for (const fileName of fileNames) {
    if (scope) urls.push(assetUrl(fileName, scope));
  }
  for (const fileName of fileNames) {
    urls.push(assetUrl(fileName, ""));
  }
  return urls;
}

function assetUrl(fileName: string, scope: string) {
  const encoded = fileName.split("/").map(encodeURIComponent).join("/");
  return scope ? `${basePath}/assets/${encodeURIComponent(scope)}/${encoded}` : `${basePath}/assets/${encoded}`;
}

export function GameCanvas({ code, control, sessionId, assetScope = "", onDiagnostics, onStop }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onDiagnosticsRef = useRef(onDiagnostics);
  const onStopRef = useRef(onStop);
  const hostRef = useRef<CanvasHost | null>(null);
  const instanceRef = useRef<DslInstance | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    onDiagnosticsRef.current = onDiagnostics;
  }, [onDiagnostics]);

  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const host = new CanvasHost(canvas, assetScope);
    hostRef.current = host;
    const unbind = host.bindKeys();
    host.renderIdle();

    return () => {
      cancelAnimationFrame(frameRef.current);
      unbind();
      hostRef.current = null;
      instanceRef.current = null;
    };
  }, [assetScope]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    cancelAnimationFrame(frameRef.current);

    if (control === "stopped") {
      host.clear();
      instanceRef.current = null;
      host.renderIdle("Stopped");
      return;
    }

    if (!instanceRef.current) {
      const compiled = compileDsl(code);
      if (compiled.diagnostics.length > 0) {
        onDiagnosticsRef.current(compiled.diagnostics);
        if (compiled.diagnostics.some((item) => item.severity === "error")) {
          host.renderIdle("Error");
          onStopRef.current?.();
          return;
        }
      }
      try {
        host.clear();
        instanceRef.current = compiled.createInstance(host);
        instanceRef.current.start();
        onDiagnosticsRef.current([]);
        host.render();
      } catch (error) {
        onDiagnosticsRef.current(error instanceof DslError ? [error.diagnostic] : [{ severity: "error", line: 1, column: 1, message: "実行開始エラー" }]);
        host.renderIdle("Failed");
        onStopRef.current?.();
        return;
      }
    }

    if (control === "paused") {
      host.render();
      return;
    }

    const loop = () => {
      const instance = instanceRef.current;
      if (!instance) return;
      try {
        instance.update();
        host.step();
        if (host.resetRequested) {
          host.clear();
          instance.reset();
        }
        host.render();
      } catch (error) {
        onDiagnosticsRef.current(error instanceof DslError ? [error.diagnostic] : [{ severity: "error", line: 1, column: 1, message: "実行時エラー" }]);
        host.render();
        onStopRef.current?.();
        return;
      }
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frameRef.current);
  }, [code, control, sessionId]);

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
