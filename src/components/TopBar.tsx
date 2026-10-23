import { useState } from 'react';
import type { PlayerView, RoomView } from '../../shared/types';
import { leaveRoom, toast } from '../store';
import { RulesDialog } from './RulesDialog';
import { Button, ConfirmDialog, Dialog, LangToggle, useStrings, Wordmark } from './ui';

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

export function RoleChip({ me }: { me: PlayerView | undefined }) {
  const s = useStrings();
  if (!me) return null;
  const label = me.team ? `${s.team[me.team]} · ${me.role === 'spymaster' ? s.spymaster : s.operative}` : s.spectator;
  return (
    <span className={`role-chip role-chip--${me.team ?? 'none'}`} title={s.yourRole}>
      <span className="role-chip__dot" aria-hidden />
      {label}
    </span>
  );
}

export function TopBar({ room, extra }: { room: RoomView; extra?: React.ReactNode }) {
  const s = useStrings();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const me = room.players.find((p) => p.id === room.youId);
  return (
    <header className="topbar">
      <div className="topbar__left">
        <Wordmark />
        <button type="button" className="code-chip" onClick={() => void copyInvite(room.code, s)} title={s.copyLink}>
          <span className="code-chip__label">{s.roomCode}</span>
          <span className="code-chip__code">{room.code}</span>
          <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden>
            <rect x="6" y="6" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13 3H5a2 2 0 0 0-2 2v8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>
      <div className="topbar__right">
        <RoleChip me={me} />
        <div className="topbar__actions">
          {extra}
          <Button variant="ghost" size="sm" onClick={() => setRulesOpen(true)}>
            {s.rules}
          </Button>
          <LangToggle />
          <Button variant="ghost" size="sm" onClick={() => setLeaveOpen(true)}>
            {s.leaveRoom}
          </Button>
        </div>
        <button type="button" className="player__menu-btn topbar__menu-btn" aria-label={s.menu} onClick={() => setMenuOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={s.menu} labelledBy="topbar-menu" className="dialog--small">
        <div className="topbar-menu" onClick={(e) => (e.target as HTMLElement).closest('button.btn') && setMenuOpen(false)}>
          <Button onClick={() => void copyInvite(room.code, s)}>{s.copyLink}</Button>
          <Button onClick={() => setRulesOpen(true)}>{s.rules}</Button>
          {extra}
          <Button variant="danger" onClick={() => setLeaveOpen(true)}>
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
