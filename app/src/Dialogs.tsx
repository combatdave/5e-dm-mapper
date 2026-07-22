/* In-app confirm / prompt dialogs. Native confirm() and prompt()
 * are silently blocked inside sandboxed iframes (the hosted preview
 * runs in one, so ✕ delete looked dead there) — and they clashed
 * with the design anyway.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  return createPortal(
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <b>{title}</b>
        {body && <p>{body}</p>}
        <div className="dlgrow">
          <button className="btn" onClick={onCancel}>cancel</button>
          <button className={"btn " + (danger ? "danger" : "pri")} autoFocus onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* last-resort export path when no download mechanism exists in this
   environment: show the file contents to copy out by hand */
export function TextDialog({ title, hint, text, onClose }: {
  title: string;
  hint?: string;
  text: string;
  onClose: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const copy = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1400); };
    const manual = () => {
      try {
        const ta = taRef.current!;
        ta.focus(); ta.select();
        if (document.execCommand && document.execCommand("copy")) done();
      } catch { /* text stays selected for a manual ctrl-C */ }
    };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done, manual);
        return;
      }
    } catch { /* fall through */ }
    manual();
  };

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="dialog wide" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <b>{title}</b>
        {hint && <p>{hint}</p>}
        <textarea ref={taRef} readOnly value={text} onFocus={e => e.currentTarget.select()} />
        <div className="dlgrow">
          <button className="btn" onClick={onClose}>close</button>
          <button className="btn pri" onClick={copy}>{copied ? "copied ✓" : "copy"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PromptDialog({ title, initial, confirmLabel, onSubmit, onCancel }: {
  title: string;
  initial: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const submit = () => { const t = v.trim(); if (t) onSubmit(t); };
  return createPortal(
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <b>{title}</b>
        <input
          ref={ref}
          value={v}
          onChange={e => setV(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
          }}
        />
        <div className="dlgrow">
          <button className="btn" onClick={onCancel}>cancel</button>
          <button className="btn pri" disabled={!v.trim()} onClick={submit}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
