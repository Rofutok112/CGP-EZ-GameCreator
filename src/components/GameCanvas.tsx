"use client";

import { useEffect, useRef } from "react";
import { compileDsl, DslError, DslInstance, RuntimeEntity, RuntimeHost, type DslDiagnostic } from "@/lib/dsl";

type GameCanvasProps = {
  code: string;
  control: "stopped" | "running" | "paused";
  sessionId: number;
  assetScope?: string;
  showCoordinates?: boolean;
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
  pointer = { x: 0, y: 0, down: false };
  clicked = false;
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

  constructor(private readonly canvas: HTMLCanvasElement, private readonly assetScope = "", private showCoordinates = false) {}

  setShowCoordinates(value: boolean) {
    this.showCoordinates = value;
    this.render();
  }

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

  bindPointer() {
    const updatePointer = (event: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      this.pointer.y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    };
    const down = (event: PointerEvent) => {
      updatePointer(event);
      this.pointer.down = true;
      this.clicked = true;
      this.canvas.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => updatePointer(event);
    const up = (event: PointerEvent) => {
      updatePointer(event);
      this.pointer.down = false;
      this.canvas.releasePointerCapture?.(event.pointerId);
    };
    const leave = () => {
      this.pointer.down = false;
    };
    this.canvas.addEventListener("pointerdown", down);
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", leave);
    this.canvas.addEventListener("pointerleave", leave);
    return () => {
      this.canvas.removeEventListener("pointerdown", down);
      this.canvas.removeEventListener("pointermove", move);
      this.canvas.removeEventListener("pointerup", up);
      this.canvas.removeEventListener("pointercancel", leave);
      this.canvas.removeEventListener("pointerleave", leave);
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

  createUIText(value: string, x: number, y: number, size = 20): RuntimeEntity {
    return this.add({ kind: "UIText", x, y, width: value.length * size * 0.6, height: size, value, size, color: "#111827" });
  }

  createUIBox(x: number, y: number, width: number, height: number): RuntimeEntity {
    return this.add({ kind: "UIBox", shape: "box", x, y, width, height, color: "#e0f2fe" });
  }

  createUICircle(x: number, y: number, radius: number): RuntimeEntity {
    return this.add({ kind: "UICircle", shape: "circle", x, y, width: radius * 2, height: radius * 2, radius, color: "#fef3c7" });
  }

  createUIButton(value: string, x: number, y: number, width: number, height: number): RuntimeEntity {
    return this.add({ kind: "UIButton", shape: "button", x, y, width, height, value, size: 16, color: "#0f766e", textColor: "#ffffff" });
  }

  touch(a: RuntimeEntity, b: RuntimeEntity): boolean {
    if (!a.visible || !b.visible || a.destroyed || b.destroyed) return false;
    const ab = entityBounds(a);
    const bb = entityBounds(b);
    return ab.left <= bb.right && ab.right >= bb.left && ab.top <= bb.bottom && ab.bottom >= bb.top;
  }

  keyDown(key: string): boolean {
    return this.keys.has(key);
  }

  keyPressed(key: string): boolean {
    return this.pressed.has(key);
  }

  buttonDown(entity: RuntimeEntity): boolean {
    return this.pointer.down && this.hitScreenEntity(entity);
  }

  buttonClicked(entity: RuntimeEntity): boolean {
    return this.clicked && this.hitScreenEntity(entity);
  }

  getMouse() {
    return { x: this.pointer.x, y: this.pointer.y };
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
      if (isScreenEntity(entity)) return;
      entity.x += entity.vx;
      entity.y += entity.vy;
    });
    this.pressed.clear();
    this.clicked = false;
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
    if (this.showCoordinates) this.drawCoordinateOverlay(ctx, 0);

    const offsetX = this.cameraTarget ? Math.max(0, this.cameraTarget.x - WIDTH / 2) : 0;
    ctx.save();
    ctx.translate(-offsetX, 0);
    for (const entity of this.entities) {
      if (!entity.visible || entity.destroyed) continue;
      ctx.fillStyle = entity.color || "#2563eb";
      if (isScreenEntity(entity)) continue;
      if (entity.shape === "sprite") {
        this.drawSprite(ctx, entity);
      } else if (entity.shape === "circle") {
        ctx.beginPath();
        ctx.arc(entity.x, entity.y, entity.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const bounds = entityBounds(entity);
        ctx.fillRect(bounds.left, bounds.top, entity.width, entity.height);
      }
    }
    ctx.restore();
    if (this.showCoordinates && offsetX > 0) this.drawCameraLabel(ctx, offsetX);

    this.drawScreenEntities(ctx);
  }

  private drawScreenEntities(ctx: CanvasRenderingContext2D) {
    for (const entity of this.entities) {
      if (!entity.visible || entity.destroyed || !isScreenEntity(entity)) continue;
      if (entity.kind === "UIText") {
        this.drawUIText(ctx, entity);
      } else if (entity.kind === "UIButton") {
        this.drawUIButton(ctx, entity);
      } else if (entity.kind === "UICircle") {
        ctx.fillStyle = entity.color || "#fef3c7";
        ctx.beginPath();
        ctx.arc(entity.x + entity.width / 2, entity.y + entity.height / 2, entity.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = entity.color || "#e0f2fe";
        ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
      }
    }
  }

  private drawUIText(ctx: CanvasRenderingContext2D, entity: RuntimeEntity) {
    ctx.fillStyle = entity.color || "#111827";
    ctx.font = `${entity.size ?? 20}px Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(entity.value ?? "", entity.x, entity.y);
    entity.width = (entity.value ?? "").length * (entity.size ?? 20) * 0.6;
    entity.height = entity.size ?? 20;
  }

  private drawUIButton(ctx: CanvasRenderingContext2D, entity: RuntimeEntity) {
    const hovering = this.hitScreenEntity(entity);
    ctx.fillStyle = hovering ? "#0d9488" : entity.color || "#0f766e";
    ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
    ctx.strokeRect(entity.x + 0.5, entity.y + 0.5, entity.width - 1, entity.height - 1);
    ctx.fillStyle = entity.textColor || "#ffffff";
    ctx.font = `${entity.size ?? 16}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(entity.value ?? "", entity.x + entity.width / 2, entity.y + entity.height / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  private hitScreenEntity(entity: RuntimeEntity) {
    if (!entity.visible || entity.destroyed) return false;
    const bounds = entityBounds(entity);
    return this.pointer.x >= bounds.left && this.pointer.x <= bounds.right && this.pointer.y >= bounds.top && this.pointer.y <= bounds.bottom;
  }

  private drawCoordinateOverlay(ctx: CanvasRenderingContext2D, offsetX: number) {
    ctx.save();
    const gridLineWidth = 2;
    ctx.fillStyle = "rgba(15, 118, 110, 0.18)";
    for (let x = 0; x <= WIDTH; x += 80) {
      const left = x === 0 ? 0 : x - gridLineWidth / 2;
      ctx.fillRect(left, 0, gridLineWidth, HEIGHT);
    }
    for (let y = 0; y <= HEIGHT; y += 60) {
      const top = y === 0 ? 0 : y - gridLineWidth / 2;
      ctx.fillRect(0, top, WIDTH, gridLineWidth);
    }

    ctx.fillStyle = "rgba(15, 118, 110, 0.72)";
    ctx.font = "12px Arial, sans-serif";
    ctx.textBaseline = "top";

    for (let x = 0; x <= WIDTH; x += 80) {
      ctx.fillText(String(Math.round(x + offsetX)), x + 4, 4);
    }
    for (let y = 0; y <= HEIGHT; y += 60) {
      ctx.fillText(String(y), 4, y + 4);
    }

    ctx.strokeStyle = "rgba(180, 35, 24, 0.85)";
    ctx.fillStyle = "rgba(180, 35, 24, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(44, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 44);
    ctx.stroke();
    ctx.fillText("(0, 0)", 8, 20);
    ctx.restore();
  }

  private drawCameraLabel(ctx: CanvasRenderingContext2D, offsetX: number) {
    ctx.save();
    ctx.fillStyle = "rgba(24, 32, 42, 0.74)";
    ctx.fillRect(WIDTH - 130, 8, 118, 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`camera x: ${Math.round(offsetX)}`, WIDTH - 120, 14);
    ctx.restore();
  }

  renderIdle(message = "Ready") {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = "#d0d5dd";
    ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);
    if (this.showCoordinates) this.drawCoordinateOverlay(ctx, 0);
    ctx.fillStyle = "#667085";
    ctx.font = "20px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, WIDTH / 2, HEIGHT / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
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
    const bounds = entityBounds(entity);
    if (image?.complete && image.naturalWidth > 0) {
      if (entity.flipX) {
        ctx.save();
        ctx.translate(bounds.left + entity.width, bounds.top);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, 0, entity.width, entity.height);
        ctx.restore();
      } else {
        ctx.drawImage(image, bounds.left, bounds.top, entity.width, entity.height);
      }
      return;
    }
    ctx.fillStyle = entity.color || "#94a3b8";
    ctx.fillRect(bounds.left, bounds.top, entity.width, entity.height);
    ctx.strokeStyle = "#475467";
    ctx.strokeRect(bounds.left + 0.5, bounds.top + 0.5, entity.width - 1, entity.height - 1);
    ctx.fillStyle = "#344054";
    ctx.font = "10px Arial, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(entity.imageName ?? "sprite", bounds.left + 4, bounds.top + 4);
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

function entityBounds(entity: RuntimeEntity) {
  if (isScreenEntity(entity)) {
    return {
      left: entity.x,
      top: entity.y,
      right: entity.x + entity.width,
      bottom: entity.y + entity.height
    };
  }
  return {
    left: entity.x - entity.width / 2,
    top: entity.y - entity.height / 2,
    right: entity.x + entity.width / 2,
    bottom: entity.y + entity.height / 2
  };
}

function isScreenEntity(entity: RuntimeEntity) {
  return entity.kind === "UIText" || entity.kind === "UIBox" || entity.kind === "UICircle" || entity.kind === "UIButton";
}

export function GameCanvas({ code, control, sessionId, assetScope = "", showCoordinates = false, onDiagnostics, onStop }: GameCanvasProps) {
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
    const host = new CanvasHost(canvas, assetScope, showCoordinates);
    hostRef.current = host;
    const unbindKeys = host.bindKeys();
    const unbindPointer = host.bindPointer();
    host.renderIdle();

    return () => {
      cancelAnimationFrame(frameRef.current);
      unbindKeys();
      unbindPointer();
      hostRef.current = null;
      instanceRef.current = null;
    };
  }, [assetScope]);

  useEffect(() => {
    hostRef.current?.setShowCoordinates(showCoordinates);
  }, [showCoordinates]);

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
