import { useState, type FormEvent, type ReactNode } from 'react';
import type { RoomView } from '../../shared/types';
import { act, leaveRoom, toast } from '../store';
import { teamName } from '../teams';
import { RulesDialog } from './RulesDialog';
import { Button, ConfirmDialog, Dialog, Icon, LangToggle, useStrings, Wordmark } from './ui';

export function inviteUrl(code: string): string {
  return `${location.origin}/r/${code}`;
}

export async function copyInvite(code: string, s: ReturnType<typeof useStrings>): Promise<void> {
  try {
    await navigator.clipboard.writeText(inviteUrl(code));
    toast(s.copied, 'success', 2000);
  } catch {
    toast(s.copyFailed, 'error');
  }
}

/** Room code, masked by default (streamer-friendly), with reveal and copy-link actions. */
export function CodeChip({ code, label }: { code: string; label: string }) {
  const s = useStrings();
  const [show, setShow] = useState(false);
  return (
    <span className="code-chip">
      <span className="code-chip__label">{label}</span>
      <span className="code-chip__code" aria-label={show ? code : s.roomCode}>
        {show ? code : '••••••'}
      </span>
      <button type="button" className="icon-btn" aria-label={show ? s.hideCode : s.showCode} aria-pressed={show} onClick={() => setShow((v) => !v)}>
        <Icon name={show ? 'eyeOff' : 'eye'} />
      </button>
      <button type="button" className="icon-btn" aria-label={s.copyLink} title={s.copyLink} onClick={() => void copyInvite(code, s)}>
        <Icon name="copy" />
      </button>
    </span>
  );
}

function RenameDialog({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const s = useStrings();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act('player:profile', { name });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title={s.renameTitle} labelledBy="rename-title" className="dialog--small">
      <form className="stack" onSubmit={submit}>
        <input className="input" value={name} maxLength={20} autoFocus onChange={(e) => setName(e.target.value)} aria-label={s.yourName} />
        <div className="dialog__actions">
          <Button variant="ghost" onClick={onClose}>
            {s.cancel}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {s.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RoomBar({ room, mode, center, onZoom }: { room: RoomView; mode: 'lobby' | 'intro' | 'game'; center?: ReactNode; onZoom?: () => void }) {
  const s = useStrings();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const me = room.players.find((p) => p.id === room.youId);
  const match = room.match;
  const status = mode === 'lobby' ? s.inLobby : mode === 'intro' ? s.inIntro : s.inGame;

  const actions = (
    <>
      <Button variant="ghost" size="sm" icon="pencil" onClick={() => setRenameOpen(true)}>
        {s.rename}
      </Button>
      <Button variant="ghost" size="sm" icon="book" onClick={() => setRulesOpen(true)}>
        {s.rules}
      </Button>
    </>
  );

  return (
    <header className={`roombar roombar--${mode}`}>
      <div className="roombar__left">
        <Wordmark />
        {mode === 'game' ? (
          <CodeChip code={room.code} label={s.roomCode} />
        ) : (
          <>
            <span className="status-pill">
              <span className="status-pill__dot" aria-hidden />
              {status}
            </span>
            <span className="roombar__count">
              <Icon name="users" /> {s.playersCount(room.players.length)}
            </span>
          </>
        )}
      </div>

      <div className="roombar__center">
        {mode === 'game' ? (
          <div className="glassbar">
            {actions}
            <span className="glassbar__item">
              <Icon name="users" /> {room.players.length}
            </span>
            {onZoom ? (
              <Button variant="ghost" size="sm" icon="zoom" onClick={onZoom} className="hide-sm">
                {s.zoom}
              </Button>
            ) : null}
            {match && match.phase !== 'finished' ? (
              <span className={`glassbar__item next-team next-team--${match.turn}`}>
                <span className="next-team__dot" aria-hidden />
                <span className="muted hide-sm">{s.nextTeam}:</span> <strong>{teamName(room, match.turn, s)}</strong>
              </span>
            ) : null}
            {center}
          </div>
        ) : (
          <CodeChip code={room.code} label={s.roomCodeShort} />
        )}
      </div>

      <div className="roombar__right">
        {mode !== 'game' ? <span className="roombar__actions">{actions}</span> : null}
        <LangToggle />
        <Button variant={mode === 'game' ? 'ghost' : 'danger'} size="sm" icon="exit" onClick={() => setLeaveOpen(true)} className="roombar__leave">
          {mode === 'game' ? s.exit : s.leaveRoom}
        </Button>
        <button type="button" className="icon-btn roombar__menu" aria-label={s.menu} onClick={() => setMenuOpen(true)}>
          <Icon name="menu" size={20} />
        </button>
      </div>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={s.menu} labelledBy="roombar-menu" className="dialog--small">
        <div className="menu-list" onClick={(e) => (e.target as HTMLElement).closest('button.btn') && setMenuOpen(false)}>
          <Button icon="link" onClick={() => void copyInvite(room.code, s)}>
            {s.copyLink}
          </Button>
          <Button icon="pencil" onClick={() => setRenameOpen(true)}>
            {s.renameTitle}
          </Button>
          <Button icon="book" onClick={() => setRulesOpen(true)}>
            {s.rules}
          </Button>
          {center}
          <Button variant="danger" icon="exit" onClick={() => setLeaveOpen(true)}>
            {s.leaveRoom}
          </Button>
        </div>
        <div className="dialog__actions">
          <LangToggle />
          <Button variant="ghost" onClick={() => setMenuOpen(false)}>
            {s.close}
          </Button>
        </div>
      </Dialog>
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {renameOpen ? <RenameDialog open onClose={() => setRenameOpen(false)} current={me?.name ?? ''} /> : null}
      <ConfirmDialog
        open={leaveOpen}
        text={s.leaveConfirm}
        confirmLabel={s.leaveRoom}
        cancelLabel={s.cancel}
        danger
        onConfirm={() => void leaveRoom()}
        onClose={() => setLeaveOpen(false)}
      />
    </header>
  );
}
