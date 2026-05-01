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
  const body = await request.json().catch(() => ({})) as { file?: unknown; folder?: unknown };
  const filePath = typeof body.file === "string" ? sanitizeAssetPath(body.file) : "";
  const folderPath = typeof body.folder === "string" ? sanitizeRelativePath(body.folder) : "";

  if (folderPath) return deleteFolder(root, folderPath);
  if (filePath) return deleteFile(root, filePath);

  return jsonNoStore({ error: "削除する素材またはフォルダが必要です。" }, { status: 400 });
}

async function deleteFolder(root: string, folderPath: string) {
  try {
    await fs.rm(safeJoin(root, folderPath), { recursive: true });
    return jsonNoStore({ deletedFolder: folderPath });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : "";
    if (code === "ENOENT") return jsonNoStore({ error: "フォルダが見つかりません。" }, { status: 404 });
    return jsonNoStore({ error: "フォルダを削除できませんでした。" }, { status: 500 });
  }
}

async function deleteFile(root: string, filePath: string) {
  if (!assetExtensions.has(path.extname(filePath).toLowerCase())) {
    return jsonNoStore({ error: "削除する素材ファイルが必要です。" }, { status: 400 });
  }

  try {
    await fs.unlink(safeJoin(root, filePath));
    return jsonNoStore({ deleted: filePath });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : "";
    if (code === "ENOENT") return jsonNoStore({ error: "ファイルが見つかりません。" }, { status: 404 });
    return jsonNoStore({ error: "ファイルを削除できませんでした。" }, { status: 500 });
  }
}

function scopeFromRequest(request: Request) {
  const url = new URL(request.url);
  return sanitizeSegment(url.searchParams.get("scope") || "");
}

function scopedAssetsDir(scope: string) {
  return scope ? path.join(assetsDir, scope) : assetsDir;
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

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
