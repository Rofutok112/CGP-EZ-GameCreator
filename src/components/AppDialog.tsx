"use client";

import { AlertTriangle, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  hideCloseButton?: boolean;
  onConfirm(): void;
  onCancel(): void;
};

type TextInputDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm(value: string): void;
  onCancel(): void;
};

export function ConfirmDialog({ open, title, message, confirmLabel = "OK", cancelLabel = "キャンセル", danger = false, hideCloseButton = false, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="app-dialog-header">
          <span className={danger ? "app-dialog-icon danger" : "app-dialog-icon"}>
            <AlertTriangle size={18} />
          </span>
          <div>
            <h2 id="confirm-dialog-title">{title}</h2>
            <p>{message}</p>
          </div>
          {hideCloseButton ? null : (
            <button className="icon-button" onClick={onCancel} aria-label="閉じる">
              <X size={16} />
            </button>
          )}
        </header>
        <footer className="app-dialog-actions">
          <button onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? "state-stop-active" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function TextInputDialog({ open, title, message, label, initialValue = "", confirmLabel = "変更", cancelLabel = "キャンセル", onConfirm, onCancel }: TextInputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [initialValue, open]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <form className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="input-dialog-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header className="app-dialog-header">
          <div>
            <h2 id="input-dialog-title">{title}</h2>
            {message ? <p>{message}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="閉じる">
            <X size={16} />
          </button>
        </header>
        <label className="app-dialog-field">
          {label}
          <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <footer className="app-dialog-actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="primary" type="submit" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
