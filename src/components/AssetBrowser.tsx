"use client";

import { ChevronDown, ChevronRight, FileAudio, FileImage, Folder, FolderPlus, Pencil, RefreshCw, Trash2, Upload, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog, TextInputDialog } from "@/components/AppDialog";

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

type ContextMenu = {
  x: number;
  y: number;
  folder: string;
  file?: AssetFile;
};

type AssetFolderNode = {
  name: string;
  path: string;
  folders: AssetFolderNode[];
  files: AssetFile[];
};

type TreeStyle = CSSProperties & {
  "--tree-depth"?: number;
};

type AssetDialog =
  | { kind: "none" }
  | { kind: "input"; title: string; label: string; message?: string; initialValue?: string; confirmLabel?: string; onConfirm(value: string): void }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm(): void };

export function AssetBrowser({ open, onClose, scope = "", scopeLabel = "共有" }: { open: boolean; onClose(): void; scope?: string; scopeLabel?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const assetBodyRef = useRef<HTMLDivElement | null>(null);
  const uploadFolderRef = useRef("");
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [selectedFile, setSelectedFile] = useState<AssetFile | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([""]));
  const [newFolderName, setNewFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [treeWidth, setTreeWidth] = useState(260);
  const [resizingTree, setResizingTree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<AssetDialog>({ kind: "none" });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/assets?${assetParams({ scope, t: String(Date.now()) })}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { folders: string[]; files: AssetFile[] };
      setFolders(data.folders);
      setFiles(data.files);
      setSelectedFile((selected) => (selected ? data.files.find((file) => file.path === selected.path) ?? null : null));
      setExpandedFolders((current) => new Set(["", ...current, ...data.folders]));
    } catch {
      setError("ファイル一覧を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeContextMenu = () => setContextMenu(null);
    const closeContextMenuWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", closeContextMenu);
    window.addEventListener("contextmenu", closeContextMenu);
    window.addEventListener("keydown", closeContextMenuWithKeyboard);
    return () => {
      window.removeEventListener("pointerdown", closeContextMenu);
      window.removeEventListener("contextmenu", closeContextMenu);
      window.removeEventListener("keydown", closeContextMenuWithKeyboard);
    };
  }, [open]);

  useEffect(() => {
    if (!resizingTree) return;

    const resize = (event: PointerEvent) => {
      const rect = assetBodyRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextWidth = event.clientX - rect.left;
      const maxWidth = Math.max(220, rect.width - 360);
      setTreeWidth(Math.min(Math.max(nextWidth, 180), maxWidth));
    };

    const stopResize = () => setResizingTree(false);
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    };
  }, [resizingTree]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setError("");
    const folder = uploadFolderRef.current;
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    try {
      const response = await fetch(`/api/assets?${assetParams({ scope })}`, { method: "POST", body: form });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "upload failed");
      }
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "ファイルを追加できませんでした。");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
      uploadFolderRef.current = currentFolder;
    }
  };

  const chooseUpload = (folder: string) => {
    uploadFolderRef.current = folder;
    setCurrentFolder(folder);
    setContextMenu(null);
    inputRef.current?.click();
  };

  const createFolder = async (parentFolder = currentFolder, name = newFolderName) => {
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    setContextMenu(null);
    const form = new FormData();
    form.append("folder", parentFolder);
    form.append("folderName", name);
    try {
      const response = await fetch(`/api/assets?${assetParams({ scope })}`, { method: "POST", body: form });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "folder failed");
      }
      const data = (await response.json()) as { folder: string };
      setCurrentFolder(data.folder);
      setExpandedFolders((current) => new Set([...current, parentFolder, data.folder]));
      setNewFolderName("");
      await load();
    } catch (folderError) {
      setError(folderError instanceof Error ? folderError.message : "フォルダを作成できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  const promptFolder = (parentFolder: string) => {
    setContextMenu(null);
    setDialog({
      kind: "input",
      title: "新しいフォルダ",
      label: "フォルダ名",
      confirmLabel: "作成",
      onConfirm: (name) => {
        setDialog({ kind: "none" });
        void createFolder(parentFolder, name);
      }
    });
  };

  const remove = async (file: AssetFile) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/assets/delete?${assetParams({ scope, t: String(Date.now()) })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: file.path }),
        cache: "no-store"
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "delete failed");
      }
      setFiles((current) => current.filter((item) => item.path !== file.path));
      setSelectedFile((selected) => (selected?.path === file.path ? null : selected));
      setContextMenu(null);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "ファイルを削除できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  const confirmRemove = (file: AssetFile) => {
    setContextMenu(null);
    setDialog({
      kind: "confirm",
      title: "素材を削除",
      message: `assets/${file.path} を削除します。この操作は元に戻せません。`,
      confirmLabel: "削除",
      danger: true,
      onConfirm: () => {
        setDialog({ kind: "none" });
        void remove(file);
      }
    });
  };

  const removeFolder = async (folder: string) => {
    if (!folder) return;
    setLoading(true);
    setError("");
    setContextMenu(null);
    try {
      const response = await fetch(`/api/assets/delete?${assetParams({ scope, t: String(Date.now()) })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
        cache: "no-store"
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "delete folder failed");
      }
      setFolders((current) => current.filter((item) => !isPathInside(item, folder)));
      setFiles((current) => current.filter((item) => !isPathInside(item.path, folder)));
      setExpandedFolders((current) => new Set([...current].filter((item) => !isPathInside(item, folder))));
      setSelectedFile((selected) => (selected && isPathInside(selected.path, folder) ? null : selected));
      setCurrentFolder((current) => (isPathInside(current, folder) ? parentFolder(folder) : current));
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "フォルダを削除できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  const confirmRemoveFolder = (folder: string) => {
    setContextMenu(null);
    setDialog({
      kind: "confirm",
      title: "フォルダを削除",
      message: `assets/${folder}/ を中身ごと削除します。この操作は元に戻せません。`,
      confirmLabel: "削除",
      danger: true,
      onConfirm: () => {
        setDialog({ kind: "none" });
        void removeFolder(folder);
      }
    });
  };

  const renameFile = async (file: AssetFile) => {
    setContextMenu(null);
    setDialog({
      kind: "input",
      title: "ファイル名を変更",
      label: "ファイル名",
      initialValue: file.fileName,
      confirmLabel: "変更",
      onConfirm: (nextName) => {
        setDialog({ kind: "none" });
        if (nextName !== file.fileName) void submitRenameFile(file, nextName);
      }
    });
  };

  const submitRenameFile = async (file: AssetFile, nextName: string) => {
    setLoading(true);
    setError("");
    setContextMenu(null);
    try {
      const response = await fetch(`/api/assets/rename?${assetParams({ scope, t: String(Date.now()) })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: file.path, name: nextName }),
        cache: "no-store"
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "rename failed");
      }
      const renamed = (await response.json()) as AssetFile;
      setSelectedFile(renamed.path ? renamed : null);
      setCurrentFolder(renamed.folder ?? file.folder);
      await load();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "ファイル名を変更できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  const renameFolder = async (folder: string) => {
    if (!folder) return;
    const oldName = folder.split("/").filter(Boolean).at(-1) ?? folder;
    setContextMenu(null);
    setDialog({
      kind: "input",
      title: "フォルダ名を変更",
      label: "フォルダ名",
      initialValue: oldName,
      confirmLabel: "変更",
      onConfirm: (nextName) => {
        setDialog({ kind: "none" });
        if (nextName !== oldName) void submitRenameFolder(folder, nextName);
      }
    });
  };

  const submitRenameFolder = async (folder: string, nextName: string) => {
    setLoading(true);
    setError("");
    setContextMenu(null);
    try {
      const response = await fetch(`/api/assets/rename?${assetParams({ scope, t: String(Date.now()) })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, name: nextName }),
        cache: "no-store"
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "rename folder failed");
      }
      const data = (await response.json()) as { folder: string; oldFolder?: string };
      const renamedFolder = data.folder;
      setCurrentFolder((current) => replacePathPrefix(current, folder, renamedFolder));
      setSelectedFile((selected) => (selected && isPathInside(selected.path, folder) ? null : selected));
      setExpandedFolders((current) => new Set([...current].map((item) => replacePathPrefix(item, folder, renamedFolder))));
      await load();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "フォルダ名を変更できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  const openContextMenu = (event: React.MouseEvent, folder: string, file?: AssetFile) => {
    event.preventDefault();
    event.stopPropagation();
    setCurrentFolder(folder);
    if (file) setSelectedFile(file);
    setContextMenu({ x: event.clientX, y: event.clientY, folder, file });
  };

  if (!open) return null;

  const tree = buildAssetTree(folders, files);
  const currentFiles = visibleFiles(files, currentFolder);
  const rootExpanded = expandedFolders.has("");

  const toggleFolder = (folder: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      next.add("");
      return next;
    });
  };

  const chooseFolder = (folder: string) => {
    setCurrentFolder(folder);
    setSelectedFile(null);
  };

  const chooseFile = (file: AssetFile) => {
    setCurrentFolder(file.folder);
    setSelectedFile(file);
  };

  const renderFolderNode = (folder: AssetFolderNode, depth: number) => (
    <div className="asset-tree-group" key={folder.path}>
      <button
        className={!selectedFile && currentFolder === folder.path ? "active asset-folder-node" : "asset-folder-node"}
        onClick={() => chooseFolder(folder.path)}
        onContextMenu={(event) => openContextMenu(event, folder.path)}
        style={treeStyle(depth)}
      >
        <span
          className="asset-tree-chevron"
          onClick={(event) => {
            event.stopPropagation();
            toggleFolder(folder.path);
          }}
        >
          {folder.folders.length > 0 || folder.files.length > 0 ? expandedFolders.has(folder.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
        </span>
        <Folder size={16} /> {folder.name}
      </button>
      {expandedFolders.has(folder.path) ? (
        <>
          {folder.files.map((file) => (
            <button
              className={treeFileClass(file, selectedFile)}
              key={file.path}
              onClick={() => chooseFile(file)}
              onContextMenu={(event) => openContextMenu(event, file.folder, file)}
              style={treeStyle(depth)}
            >
              <span className="asset-tree-spacer" />
              <AssetIcon file={file} /> {file.fileName}
            </button>
          ))}
          {folder.folders.map((child) => renderFolderNode(child, depth + 1))}
        </>
      ) : null}
    </div>
  );

  return (
    <div className="docs-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="docs-dialog asset-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="ファイル"
        onMouseDown={(event) => {
          event.stopPropagation();
          setContextMenu(null);
        }}
      >
        <header className="docs-header">
          <div>
            <h2>ファイル</h2>
            <p>{scopeLabel}のassetsです。Create.Spriteでは拡張子なしのパスを使います。</p>
          </div>
          <div className="toolbar-group">
            <input ref={inputRef} className="hidden-file-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg,audio/mp4" onChange={(event) => upload(event.target.files?.[0])} />
            <button onClick={load} disabled={loading}>
              <RefreshCw size={16} /> 更新
            </button>
            <button onClick={onClose} aria-label="ファイルを閉じる">
              <X size={16} /> 閉じる
            </button>
          </div>
        </header>
        <div className={resizingTree ? "asset-body resizing" : "asset-body"} ref={assetBodyRef} style={{ gridTemplateColumns: `${treeWidth}px 6px minmax(0, 1fr)` }}>
          <aside className="docs-tree asset-tree" onContextMenu={(event) => openContextMenu(event, "")}>
            <button className={!selectedFile && currentFolder === "" ? "active asset-folder-node" : "asset-folder-node"} onClick={() => chooseFolder("")} onContextMenu={(event) => openContextMenu(event, "")} style={treeStyle(0)}>
              <span
                className="asset-tree-chevron"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedFolders((current) => {
                    const next = new Set(current);
                    if (next.has("")) next.delete("");
                    else next.add("");
                    return next;
                  });
                }}
              >
                {rootExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <Folder size={16} /> assets
            </button>
            {rootExpanded ? (
              <>
                {tree.files.map((file) => (
                  <button
                    className={treeFileClass(file, selectedFile)}
                    key={file.path}
                    onClick={() => chooseFile(file)}
                    onContextMenu={(event) => openContextMenu(event, file.folder, file)}
                    style={treeStyle(0)}
                  >
                    <span className="asset-tree-spacer" />
                    <AssetIcon file={file} /> {file.fileName}
                  </button>
                ))}
                {tree.folders.map((folder) => renderFolderNode(folder, 1))}
              </>
            ) : null}
          </aside>
          <div
            className="asset-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="ファイルツリーの幅"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setResizingTree(true);
            }}
          />
          <article className="asset-content" onContextMenu={(event) => openContextMenu(event, currentFolder)}>
            <div className="asset-path-bar">
              <div>
                <strong>{selectedFile ? `assets/${selectedFile.path}` : `assets/${currentFolder ? `${currentFolder}/` : ""}`}</strong>
                <span>{selectedFile ? `${formatBytes(selectedFile.size)} / 素材プレビュー` : "フォルダ"}</span>
              </div>
            </div>
            {error ? <div className="empty-state">{error}</div> : null}
            {!error ? (
              <AssetPreview
                currentFolder={currentFolder}
                file={selectedFile}
                fileCount={currentFiles.length}
                onContextMenu={(event) => openContextMenu(event, selectedFile?.folder ?? currentFolder, selectedFile ?? undefined)}
              />
            ) : null}
          </article>
        </div>
        {contextMenu ? (
          <div
            className="asset-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button onClick={() => chooseUpload(contextMenu.folder)} disabled={loading}>
              <Upload size={15} /> 素材を追加
            </button>
            <button onClick={() => promptFolder(contextMenu.folder)} disabled={loading}>
              <FolderPlus size={15} /> 新規フォルダ
            </button>
            <div className="asset-context-separator" />
            <button onClick={() => setCurrentFolder(contextMenu.folder)} disabled={loading}>
              <Folder size={15} /> 開く
            </button>
            <button onClick={load} disabled={loading}>
              <RefreshCw size={15} /> 更新
            </button>
            {contextMenu.file ? (
              <>
                <div className="asset-context-separator" />
                <button onClick={() => renameFile(contextMenu.file!)} disabled={loading}>
                  <Pencil size={15} /> 名前を変更
                </button>
                <button className="danger" onClick={() => confirmRemove(contextMenu.file!)} disabled={loading}>
                  <Trash2 size={15} /> 削除
                </button>
              </>
            ) : null}
            {!contextMenu.file && contextMenu.folder ? (
              <>
                <div className="asset-context-separator" />
                <button onClick={() => renameFolder(contextMenu.folder)} disabled={loading}>
                  <Pencil size={15} /> 名前を変更
                </button>
                <button className="danger" onClick={() => confirmRemoveFolder(contextMenu.folder)} disabled={loading}>
                  <Trash2 size={15} /> フォルダを削除
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {dialog.kind === "confirm" ? (
          <ConfirmDialog
            open
            title={dialog.title}
            message={dialog.message}
            confirmLabel={dialog.confirmLabel}
            danger={dialog.danger}
            onConfirm={dialog.onConfirm}
            onCancel={() => setDialog({ kind: "none" })}
          />
        ) : null}
        {dialog.kind === "input" ? (
          <TextInputDialog
            open
            title={dialog.title}
            message={dialog.message}
            label={dialog.label}
            initialValue={dialog.initialValue}
            confirmLabel={dialog.confirmLabel}
            onConfirm={dialog.onConfirm}
            onCancel={() => setDialog({ kind: "none" })}
          />
        ) : null}
      </section>
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function visibleFiles(files: AssetFile[], folder: string) {
  return files.filter((file) => file.folder === folder);
}

function parentFolder(folder: string) {
  const parts = folder.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function isPathInside(path: string, folder: string) {
  return path === folder || path.startsWith(`${folder}/`);
}

function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  if (!oldPrefix) return path;
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(`${oldPrefix}/`)) return `${newPrefix}/${path.slice(oldPrefix.length + 1)}`;
  return path;
}

function treeStyle(depth: number): TreeStyle {
  return { "--tree-depth": depth };
}

function treeFileClass(file: AssetFile, selectedFile: AssetFile | null) {
  const classes = ["asset-file-node"];
  if (selectedFile?.path === file.path) classes.push("active");
  return classes.join(" ");
}

function assetParams(values: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return params;
}

function AssetIcon({ file }: { file: AssetFile }) {
  return file.kind === "audio" ? <FileAudio size={15} /> : <FileImage size={15} />;
}

function AssetPreview({
  currentFolder,
  file,
  fileCount,
  onContextMenu
}: {
  currentFolder: string;
  file: AssetFile | null;
  fileCount: number;
  onContextMenu(event: React.MouseEvent): void;
}) {
  if (!file) {
    return (
      <div className="asset-preview-panel" onContextMenu={onContextMenu}>
        <div className="empty-state">
          {fileCount === 0
            ? `assets/${currentFolder ? `${currentFolder}/` : ""} にはまだ素材がありません。右クリックで画像・音声を追加できます。`
            : "左のツリーから素材を選ぶと、ここで確認できます。"}
        </div>
      </div>
    );
  }

  return (
    <div className="asset-preview-panel" onContextMenu={onContextMenu}>
      <div className="asset-preview-stage">
        {file.kind === "audio" ? <audio src={file.url} controls /> : <img src={file.url} alt={file.fileName} />}
      </div>
    </div>
  );
}

function buildAssetTree(folders: string[], files: AssetFile[]): AssetFolderNode {
  const root: AssetFolderNode = { name: "assets", path: "", folders: [], files: [] };
  const nodes = new Map<string, AssetFolderNode>([["", root]]);

  for (const folderPath of folders) {
    const parts = folderPath.split("/").filter(Boolean);
    let parent = root;
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = nodes.get(currentPath);
      if (!node) {
        node = { name: part, path: currentPath, folders: [], files: [] };
        nodes.set(currentPath, node);
        parent.folders.push(node);
      }
      parent = node;
    }
  }

  for (const file of files) {
    const parent = nodes.get(file.folder) ?? root;
    parent.files.push(file);
  }

  for (const node of nodes.values()) {
    node.folders.sort((a, b) => a.name.localeCompare(b.name));
    node.files.sort((a, b) => a.fileName.localeCompare(b.fileName));
  }

  return root;
}
