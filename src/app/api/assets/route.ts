import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const audioExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a"]);
const assetExtensions = new Set([...imageExtensions, ...audioExtensions]);
const assetsDir = path.join("public", "assets");

type AssetFile = {
  fileName: string;
  name: string;
  folder: string;
  path: string;
  url: string;
  size: number;
  updatedAt: number;
  kind: "image" | "audio";
};

export async function GET(request: Request) {
  const scope = scopeFromRequest(request);
  const root = scopedAssetsDir(scope);

  try {
    const { folders, files } = await readAssets(root, scope);
    return jsonNoStore({ root: scope ? `assets/${scope}` : "assets", scope, folders, files });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : "";
    if (code === "ENOENT") return jsonNoStore({ root: scope ? `assets/${scope}` : "assets", scope, folders: [], files: [] });
    return jsonNoStore({ error: "ファイル一覧を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const scope = scopeFromRequest(request);
  const root = scopedAssetsDir(scope);
  const form = await request.formData();
  const folder = sanitizeRelativePath(String(form.get("folder") || ""));
  const folderName = sanitizeSegment(String(form.get("folderName") || ""));

  if (folderName) {
    await fs.mkdir(safeJoin(root, path.join(folder, folderName)), { recursive: true });
    return jsonNoStore({ folder: joinAssetPath(folder, folderName) }, { status: 201 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonNoStore({ error: "素材ファイルが必要です。" }, { status: 400 });
  }

  const extension = path.extname(file.name).toLowerCase();
  if (!assetExtensions.has(extension)) {
    return jsonNoStore({ error: "png, jpg, jpeg, gif, webp, mp3, wav, ogg, m4a の素材だけ追加できます。" }, { status: 400 });
  }

  const baseName = sanitizeSegment(path.basename(file.name, extension)) || "asset";
  const fileName = `${baseName}${extension}`;
  const targetDir = safeJoin(root, folder);
  await fs.mkdir(targetDir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(targetDir, fileName), bytes);

  return jsonNoStore({
    fileName,
    name: baseName,
    folder,
    path: joinAssetPath(folder, fileName),
    url: assetUrl(scope, joinAssetPath(folder, fileName)),
    size: bytes.length,
    updatedAt: Date.now(),
    kind: assetKind(extension)
  });
}

async function readAssets(root: string, scope: string) {
  const folders = new Set<string>();
  const files: AssetFile[] = [];

  async function walk(current: string, relative: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = joinAssetPath(relative, entry.name);
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        folders.add(relativePath);
        await walk(absolutePath, relativePath);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!entry.isFile() || !assetExtensions.has(extension)) continue;
      const stats = await fs.stat(absolutePath);
      files.push({
        fileName: entry.name,
        name: path.basename(entry.name, extension),
        folder: relative,
        path: relativePath,
        url: assetUrl(scope, relativePath),
        size: stats.size,
        updatedAt: stats.mtimeMs,
        kind: assetKind(extension)
      });
    }
  }

  await walk(root, "");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { folders: [...folders].sort(), files };
}

function scopeFromRequest(request: Request) {
  const url = new URL(request.url);
  return sanitizeSegment(url.searchParams.get("scope") || "");
}

function scopedAssetsDir(scope: string) {
  return scope ? path.join(assetsDir, scope) : assetsDir;
}

function assetUrl(scope: string, relativePath: string) {
  const parts = relativePath.split("/").map(encodeURIComponent).join("/");
  return scope ? `/assets/${encodeURIComponent(scope)}/${parts}` : `/assets/${parts}`;
}

function safeJoin(root: string, relativePath: string) {
  const rootPath = path.resolve(root);
  const target = path.resolve(rootPath, relativePath);
  if (target !== rootPath && !target.startsWith(rootPath + path.sep)) {
    throw new Error("invalid path");
  }
  return target;
}

function sanitizeRelativePath(value: string) {
  return value
    .split(/[\\/]+/)
    .map(sanitizeSegment)
    .filter(Boolean)
    .join("/");
}

function sanitizeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
}

function joinAssetPath(folder: string, name: string) {
  return folder ? `${folder}/${name}` : name;
}

function assetKind(extension: string) {
  return audioExtensions.has(extension) ? "audio" : "image";
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
