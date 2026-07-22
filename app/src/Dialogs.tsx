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
