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

export async function POST(request: Request) {
  const scope = scopeFromRequest(request);
  const root = scopedAssetsDir(scope);
  const body = (await request.json().catch(() => ({}))) as { file?: unknown; folder?: unknown; name?: unknown };
  const filePath = typeof body.file === "string" ? sanitizeAssetPath(body.file) : "";
  const folderPath = typeof body.folder === "string" ? sanitizeRelativePath(body.folder) : "";
  const requestedName = typeof body.name === "string" ? body.name : "";

  if (!requestedName.trim()) return jsonNoStore({ error: "新しい名前が必要です。" }, { status: 400 });
  if (filePath) return renameFile(root, filePath, requestedName, scope);
  if (folderPath) return renameFolder(root, folderPath, requestedName);

  return jsonNoStore({ error: "名前を変更する素材またはフォルダが必要です。" }, { status: 400 });
}

async function renameFile(root: string, filePath: string, requestedName: string, scope: string) {
  const oldExtension = path.extname(filePath).toLowerCase();
  if (!assetExtensions.has(oldExtension)) return jsonNoStore({ error: "名前を変更する素材ファイルが必要です。" }, { status: 400 });

  const requestedExtension = path.extname(requestedName).toLowerCase();
  if (requestedExtension && !assetExtensions.has(requestedExtension)) {
    return jsonNoStore({ error: "素材ファイルの拡張子は png, jpg, jpeg, gif, webp, mp3, wav, ogg, m4a が使えます。" }, { status: 400 });
  }

  const extension = requestedExtension || oldExtension;
  const baseNameSource = requestedExtension ? path.basename(requestedName, requestedExtension) : requestedName;
  const baseName = sanitizeSegment(baseNameSource) || "asset";
  const newFileName = `${baseName}${extension}`;
  const folder = parentFolder(filePath);
  const newPath = joinAssetPath(folder, newFileName);

  if (newPath === filePath) return jsonNoStore({ path: newPath, unchanged: true });

  try {
    await ensureMissing(root, newPath);
    await fs.rename(safeJoin(root, filePath), safeJoin(root, newPath));
    const stats = await fs.stat(safeJoin(root, newPath));
    return jsonNoStore({
      fileName: newFileName,
      name: baseName,
      folder,
      path: newPath,
      url: assetUrl(scope, newPath),
      size: stats.size,
      updatedAt: stats.mtimeMs,
      kind: audioExtensions.has(extension) ? "audio" : "image"
    });
  } catch (error) {
    return renameError(error, "ファイル名を変更できませんでした。");
  }
}

async function renameFolder(root: string, folderPath: string, requestedName: string) {
  const folderName = sanitizeSegment(requestedName);
  if (!folderName) return jsonNoStore({ error: "新しいフォルダ名が必要です。" }, { status: 400 });

  const parent = parentFolder(folderPath);
  const newPath = joinAssetPath(parent, folderName);
  if (newPath === folderPath) return jsonNoStore({ folder: newPath, unchanged: true });

  try {
    await ensureMissing(root, newPath);
    await fs.rename(safeJoin(root, folderPath), safeJoin(root, newPath));
    return jsonNoStore({ folder: newPath, oldFolder: folderPath });
  } catch (error) {
    return renameError(error, "フォルダ名を変更できませんでした。");
  }
}

async function ensureMissing(root: string, relativePath: string) {
  try {
    await fs.access(safeJoin(root, relativePath));
    throw new Error("exists");
  } catch (error) {
    if (error instanceof Error && error.message === "exists") throw error;
    const code = typeof error === "object" && error && "code" in error ? error.code : "";
    if (code && code !== "ENOENT") throw error;
  }
}

function renameError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "exists") return jsonNoStore({ error: "同じ名前の素材またはフォルダがすでにあります。" }, { status: 409 });
  const code = typeof error === "object" && error && "code" in error ? error.code : "";
  if (code === "ENOENT") return jsonNoStore({ error: "対象が見つかりません。" }, { status: 404 });
  return jsonNoStore({ error: fallback }, { status: 500 });
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

function sanitizeAssetPath(value: string) {
  return value
    .split(/[\\/]+/)
    .map((segment) => segment.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64))
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function sanitizeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
}

function parentFolder(value: string) {
  const parts = value.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function joinAssetPath(folder: string, name: string) {
  return folder ? `${folder}/${name}` : name;
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
