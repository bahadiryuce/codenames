import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Identity } from '../../shared/types';
import { STRINGS } from '../i18n';
import { dismissToast, setUiLang, useApp } from '../store';

export function useStrings() {
  return STRINGS[useApp().uiLang];
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'red' | 'blue' | 'gold' | 'success';

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  icon,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean; icon?: IconName }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`btn btn--${variant} btn--${size} ${className}`}
    >
      {busy ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} /> : null}
      {children !== undefined ? <span>{children}</span> : null}
    </button>
  );
}

// ---------- Icons (original line icons, 20×20 grid) ----------

const ICONS = {
  eye: 'M1.5 10S5 3.8 10 3.8 18.5 10 18.5 10 15 16.2 10 16.2 1.5 10 1.5 10Zm8.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l14 14M8.2 4.1A8.6 8.6 0 0 1 10 3.8c5 0 8.5 6.2 8.5 6.2a15 15 0 0 1-2.4 3M5.4 5.6C3 7.2 1.5 10 1.5 10S5 16.2 10 16.2c1.4 0 2.7-.5 3.8-1.2M8 8a3 3 0 0 0 4 4',
  copy: 'M7 7h9v10H7zM4 13V3h9',
  pencil: 'M12.5 3.5l4 4L7 17H3v-4zM10.5 5.5l4 4',
  users: 'M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1.5 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M13.5 3.3a3 3 0 0 1 0 5.4M15.5 11.8c1.9.7 3 2.6 3 5.2',
  zoom: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4',
  exit: 'M8 3H3.5v14H8M12.5 6.5 16 10l-3.5 3.5M16 10H7',
  bulb: 'M7 15h6M8 18h4M10 2a5.5 5.5 0 0 0-3.3 9.9c.6.5 1 1.3 1 2.1h4.6c0-.8.4-1.6 1-2.1A5.5 5.5 0 0 0 10 2Z',
  check: 'M4 10.5l4 4 8-9',
  clock: 'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM10 6v4.5l3 2',
  crown: 'M3 15h14M3.5 14 2.5 6l4.5 3.5L10 4l3 5.5L17.5 6l-1 8Z',
  chat: 'M3 4h14v9H8l-4 3.5V13H3z',
  log: 'M5 4h11M5 10h11M5 16h11M2 4h.5M2 10h.5M2 16h.5',
  play: 'M6 3.5 16 10 6 16.5Z',
  thumbUp: 'M6 9v8H3V9zM6 9l3.5-6c1.2 0 2 .9 1.8 2.1L10.8 8H16a1.6 1.6 0 0 1 1.6 1.9l-1.2 5.8A1.6 1.6 0 0 1 14.8 17H6',
  thumbDown: 'M6 11V3H3v8zM6 11l3.5 6c1.2 0 2-.9 1.8-2.1l-.5-2.9H16a1.6 1.6 0 0 0 1.6-1.9l-1.2-5.8A1.6 1.6 0 0 0 14.8 3H6',
  send: 'M2.5 9.5 17.5 3l-6.5 15-2.2-6.3z',
  minus: 'M4 10h12',
  plus: 'M10 4v12M4 10h12',
  arrowLeft: 'M8 4 2 10l6 6M2 10h16',
  arrowRight: 'M12 4l6 6-6 6M18 10H2',
  shuffle: 'M2 6h3.5c3 0 4 8 7 8H17M14.5 11.5 17 14l-2.5 2.5M2 14h3.5c1.1 0 1.9-1 2.6-2.3M11 8.3c.7-1.3 1.5-2.3 2.6-2.3H17M14.5 3.5 17 6l-2.5 2.5',
  book: 'M3 4c2.5-1 5-1 7 .5 2-1.5 4.5-1.5 7-.5v12c-2.5-1-5-1-7 .5-2-1.5-4.5-1.5-7-.5zM10 4.5v12',
  link: 'M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1',
  star: 'M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z',
  menu: 'M3 5h14M3 10h14M3 15h14',
  flag: 'M4 18V3M4 3h10l-2 3.5L14 10H4',
  sparkle: 'M10 2l1.6 5.4L17 9l-5.4 1.6L10 16l-1.6-5.4L3 9l5.4-1.6z',
  close: 'M4 4l12 12M16 4 4 16',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  const filled = name === 'play' || name === 'star' || name === 'sparkle';
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className={`icon ${className}`}>
      <path
        d={ICONS[name]}
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

/** Original mark: a fedora-wearing agent inside a keyhole badge. */
export function AgentMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className={`agent-mark ${className}`}>
      <path d="M7 17.5c0-1.4 1-2.4 2.6-2.8L12 8.6c.4-1.2 1.6-1.8 2.8-1.5L20 8.4l5.2-1.3c1.2-.3 2.4.3 2.8 1.5l2.4 6.1c1.6.4 2.6 1.4 2.6 2.8 0 2.2-5.8 3.6-13 3.6S7 19.7 7 17.5Z" fill="currentColor" />
      <path d="M12.5 22.5c1.3 4.6 4.2 7 7.5 7s6.2-2.4 7.5-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13.2 23.4h5.3M21.5 23.4h5.3" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9 37c1.8-3.6 6-5.6 11-5.6s9.2 2 11 5.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <span className={`wordmark ${large ? 'wordmark--large' : ''}`}>
      <span className="wordmark__badge">
        <AgentMark size={large ? 54 : 22} />
      </span>
      <span className="wordmark__text">PAROLA</span>
    </span>
  );
}

export function Avatar({ name, team, gold = false, size = 'md' }: { name: string; team: 'red' | 'blue' | null; gold?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const ch = [...name.trim()][0] ?? '?';
  const letter = ch === 'i' ? 'İ' : ch === 'ı' ? 'I' : ch.toLocaleUpperCase('tr');
  return (
    <span className={`avatar avatar--${team ?? 'none'} avatar--${size} ${gold ? 'avatar--gold' : ''}`} aria-hidden>
      {letter}
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

/** Full-screen "connecting" state, like the reference's server-connection card. */
export function ConnectionScreen() {
  const { conn, everConnected } = useApp();
  const s = useStrings();
  if (conn === 'online') return null;
  return (
    <div className="conn-screen" role="alert">
      {everConnected ? (
        <div className="conn-screen__toast">
          <strong>{s.errorTitle}</strong>
          <span>{s.connectionError}</span>
        </div>
      ) : null}
      <div className="conn-screen__card">
        <span className="spinner spinner--lg" aria-hidden />
        <strong>{s.connecting}</strong>
        <span className="muted">{s.connectingBody}</span>
        {everConnected ? <span className="conn-screen__err">{s.connectionError}</span> : null}
      </div>
    </div>
  );
}

export function LangToggle() {
  const { uiLang } = useApp();
  return (
    <div className="lang-toggle" role="group" aria-label="Language / Dil">
      {(['tr', 'en'] as const).map((l) => (
        <button key={l} type="button" className={uiLang === l ? 'is-active' : ''} aria-pressed={uiLang === l} onClick={() => setUiLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Fixed page backdrop: team-tinted gradient, repeating spy-icon pattern and watermark. */
export function Backdrop({ tone }: { tone: 'red' | 'blue' | 'night' }) {
  return (
    <div className={`backdrop backdrop--${tone}`} aria-hidden>
      <div className="backdrop__pattern" />
      <div className="backdrop__mark">PAROLA</div>
    </div>
  );
}
