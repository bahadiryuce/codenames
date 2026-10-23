import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { RoomView } from '../../shared/types';
import { act } from '../store';
import { Icon, useStrings } from './ui';

function time(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatPanel({ room, compact = false }: { room: RoomView; compact?: boolean }) {
  const s = useStrings();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight; // scroll only the list, never the page
  }, [room.chat.length]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await act('chat:send', { text });
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <div className={`chat ${compact ? 'chat--compact' : ''}`}>
      <ol className="chat__list" ref={list} aria-live="polite">
        {room.chat.length === 0 ? <li className="chat__empty">{s.chatEmpty}</li> : null}
        {room.chat.map((m) => {
          const mine = m.playerId === room.youId;
          return (
            <li key={m.id} className={`bubble ${mine ? 'bubble--mine' : ''}`}>
              <span className={`bubble__name bubble__name--${m.team ?? 'none'}`}>{m.name}</span>
              <span className="bubble__text">{m.text}</span>
              <span className="bubble__time">{time(m.at)}</span>
            </li>
          );
        })}
      </ol>
      <form className="chat__form" onSubmit={send}>
        <input
          className="input input--chat"
          value={text}
          maxLength={300}
          placeholder={s.chatPlaceholder}
          aria-label={s.chatPlaceholder}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="icon-btn icon-btn--send" disabled={!text.trim() || busy} aria-label={s.send}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
