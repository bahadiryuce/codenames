import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Identity } from '../../shared/types';
import { STRINGS } from '../i18n';
import { dismissToast, setUiLang, useApp } from '../store';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'red' | 'blue';

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`btn btn--${variant} btn--${size} ${className}`}
    >
      {busy ? <span className="spinner" aria-hidden /> : null}
      <span>{children}</span>
    </button>
  );
}

/** Modal built on the native <dialog> element (focus trap, Esc to close, inert background). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className = '',
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      aria-labelledby={labelledBy}
    >
      {open ? (
        <div className="dialog__body">
          {title ? (
            <h2 className="dialog__title" id={labelledBy}>
              {title}
            </h2>
          ) : null}
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  danger,
}: {
  open: boolean;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="dialog--small">
      <p className="confirm__text">{text}</p>
      <div className="dialog__actions">
        <Button variant="ghost" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
          autoFocus
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/** Shape + colour marker so identities never rely on colour alone. */
export function Glyph({ identity, size = 18 }: { identity: Identity; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 20 20', 'aria-hidden': true } as const;
  switch (identity) {
    case 'red':
      return (
        <svg {...common} className="glyph glyph--red">
          <path d="M10 1.5 18.5 10 10 18.5 1.5 10Z" fill="currentColor" />
        </svg>
      );
    case 'blue':
      return (
        <svg {...common} className="glyph glyph--blue">
          <circle cx="10" cy="10" r="8.2" fill="currentColor" />
        </svg>
      );
    case 'neutral':
      return (
        <svg {...common} className="glyph glyph--neutral">
          <rect x="3" y="8" width="14" height="4" rx="2" fill="currentColor" />
        </svg>
      );
    case 'assassin':
      return (
        <svg {...common} className="glyph glyph--assassin">
          <path d="M4.2 2.8 10 8.6l5.8-5.8 1.4 1.4L11.4 10l5.8 5.8-1.4 1.4L10 11.4l-5.8 5.8-1.4-1.4L8.6 10 2.8 4.2Z" fill="currentColor" />
        </svg>
      );
  }
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="logo-mark">
      <rect x="4" y="9" width="27" height="33" rx="4" transform="rotate(-8 17 25)" fill="var(--red)" />
      <rect x="17" y="6" width="27" height="33" rx="4" transform="rotate(7 30 22)" fill="var(--blue)" />
      <rect x="21.5" y="13" width="18" height="5" rx="2.5" transform="rotate(7 30 22)" fill="var(--card)" />
      <rect x="21.5" y="22" width="12" height="3.2" rx="1.6" transform="rotate(7 30 22)" fill="var(--card)" opacity=".7" />
    </svg>
  );
}

export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <span className={`wordmark ${large ? 'wordmark--large' : ''}`}>
      <Logo size={large ? 64 : 30} />
      <span className="wordmark__text">PAROLA</span>
    </span>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast toast--${t.tone}`} onClick={() => dismissToast(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function ConnectionBanner() {
  const { conn, everConnected } = useApp();
  const s = useStrings();
  if (conn === 'online') return null;
  return (
    <div className={`conn-banner ${everConnected ? 'conn-banner--lost' : ''}`} role="alert">
      <span className="spinner spinner--light" aria-hidden />
      {everConnected ? s.reconnecting : s.connecting}
    </div>
  );
}

export function useStrings() {
  return STRINGS[useApp().uiLang];
}

export function LangToggle() {
  const { uiLang } = useApp();
  return (
    <div className="lang-toggle" role="group" aria-label="Language / Dil">
      {(['tr', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={uiLang === l ? 'is-active' : ''}
          aria-pressed={uiLang === l}
          onClick={() => setUiLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
