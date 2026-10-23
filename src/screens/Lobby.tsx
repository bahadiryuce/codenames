import { useEffect, useState, type FormEvent } from 'react';
import { INTRO_STYLES, TAGLINE_MAX, TEAM_NAME_MAX, type IntroStyle, type RoomView, type StartingTeamSetting, type Team } from '../../shared/types';
import { ChatPanel } from '../components/Chat';
import { PlayerTile } from '../components/PlayerRow';
import { RulesDialog } from '../components/RulesDialog';
import { copyInvite, RoomBar } from '../components/TopBar';
import { Avatar, Backdrop, Button, Dialog, Icon, useStrings } from '../components/ui';
import { act } from '../store';
import { teamName } from '../teams';

function TeamNameDialog({ room, team, onClose }: { room: RoomView; team: Team; onClose: () => void }) {
  const s = useStrings();
  const [name, setName] = useState(room.teamNames[team] ?? '');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act('team:rename', { team, name });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onClose={onClose} title={s.teamNameEdit} labelledBy="team-name-title" className={`dialog--small dialog--${team}`}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">{s.teamNameHint}</p>
        <input
          className="input"
          value={name}
          maxLength={TEAM_NAME_MAX}
          placeholder={s.defaultTeamName[team]}
          aria-label={s.teamNamePlaceholder}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <div className="dialog__actions">
          <Button variant="ghost" onClick={onClose}>
            {s.cancel}
          </Button>
          <Button type="submit" variant={team} busy={busy}>
            {s.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function TeamBox({ room, team }: { room: RoomView; team: Team }) {
  const s = useStrings();
  const [editing, setEditing] = useState(false);
  const me = room.players.find((p) => p.id === room.youId)!;
  const members = room.players.filter((p) => p.team === team);
  const spy = members.find((p) => p.role === 'spymaster');
  const ops = members.filter((p) => p.role === 'operative');
  const mine = me.team === team;
  return (
    <section className={`teambox teambox--${team}`} aria-label={teamName(room, team, s)}>
      <header className="teambox__head">
        <span className="teambox__dot" aria-hidden />
        <h2 className="teambox__name">{teamName(room, team, s)}</h2>
        {mine ? (
          <button type="button" className="icon-btn" aria-label={s.teamNameEdit} title={s.teamNameEdit} onClick={() => setEditing(true)}>
            <Icon name="pencil" />
          </button>
        ) : null}
        <span className="teambox__count">{s.teamPlayers(members.length)}</span>
        {!(mine && me.role === 'operative') ? (
          <Button size="sm" variant={team} className="teambox__join" onClick={() => void act('lobby:choose', { team, role: 'operative' })}>
            {s.joinTeam}
          </Button>
        ) : null}
      </header>
      <ul className="tiles">
        {spy ? (
          <PlayerTile player={spy} room={room} />
        ) : (
          <li>
            <button type="button" className="tile tile--empty" onClick={() => void act('lobby:choose', { team, role: 'spymaster' })}>
              <Icon name="crown" />
              <span>{s.becomeSpymaster}</span>
            </button>
          </li>
        )}
        {ops.map((p) => (
          <PlayerTile key={p.id} player={p} room={room} />
        ))}
      </ul>
      {editing ? <TeamNameDialog room={room} team={team} onClose={() => setEditing(false)} /> : null}
    </section>
  );
}

function StatusCard({ room }: { room: RoomView }) {
  const s = useStrings();
  const iAmHost = room.hostId === room.youId;
  const [busy, setBusy] = useState<'intro' | 'start' | null>(null);
  const seated = room.players.filter((p) => p.team !== null);
  const checks: [string, boolean][] = [];
  for (const t of ['red', 'blue'] as Team[]) {
    const n = teamName(room, t, s);
    checks.push([s.checkSpymaster(n), room.players.filter((p) => p.team === t && p.role === 'spymaster').length === 1]);
    checks.push([s.checkOperative(n), room.players.some((p) => p.team === t && p.role === 'operative')]);
  }
  checks.push([`${s.checkPlayers} · ${seated.length}/4`, seated.length >= 4]);
  const ready = room.startCheck.ok;
  const useIntro = room.settings.intro;

  const run = async (kind: 'intro' | 'start') => {
    setBusy(kind);
    await act(kind === 'intro' ? 'intro:begin' : 'game:start');
    setBusy(null);
  };

  return (
    <section className="card card--status">
      <header className="card__head">
        <h2 className="card__title">{s.gameStatus}</h2>
        <span className={`chip ${ready ? 'chip--ready' : 'chip--waiting'}`}>{ready ? s.ready : s.waiting}</span>
      </header>
      <ul className="checklist">
        {checks.map(([label, ok]) => (
          <li key={label} className={ok ? 'is-ok' : ''}>
            <span className="checklist__mark" aria-hidden>
              {ok ? <Icon name="check" size={12} /> : null}
            </span>
            <span>{label}</span>
            <span className="sr-only">{ok ? '✓' : '✗'}</span>
          </li>
        ))}
      </ul>
      {iAmHost ? (
        <div className="stack">
          {useIntro ? (
            <Button variant="primary" size="lg" icon="sparkle" busy={busy === 'intro'} onClick={() => void run('intro')}>
              {s.startIntro}
            </Button>
          ) : null}
          <Button variant={useIntro ? 'secondary' : 'primary'} size="lg" icon="play" busy={busy === 'start'} disabled={!ready} onClick={() => void run('start')}>
            {s.startGame}
          </Button>
        </div>
      ) : (
        <p className="waiting">
          <span className="spinner" aria-hidden /> {s.waitingForHost}
        </p>
      )}
      {!ready ? <p className="start-reason">{s.errors[room.startCheck.reason]}</p> : null}
    </section>
  );
}

function IntroCard({ room }: { room: RoomView }) {
  const s = useStrings();
  const me = room.players.find((p) => p.id === room.youId)!;
  const iAmHost = room.hostId === room.youId;
  const [tagline, setTagline] = useState(me.tagline);
  useEffect(() => setTagline(me.tagline), [me.tagline]);
  const saveTagline = () => {
    if (tagline.trim() !== me.tagline) void act('player:profile', { tagline });
  };
  return (
    <section className="card card--intro">
      <header className="card__head">
        <span className="pill pill--purple">
          <Icon name="sparkle" size={12} />
        </span>
        <h2 className="card__title">{s.introSetting}</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={room.settings.intro}
            disabled={!iAmHost}
            onChange={(e) => void act('host:settings', { intro: e.target.checked })}
          />
          <span className="switch__track" aria-hidden />
          <span className="sr-only">{s.introSetting}</span>
        </label>
      </header>
      <p className="muted small">{s.introSettingBody}</p>
      <label className="field">
        <span className="field__label">{s.yourIntroStyle}</span>
        <select
          className="input select"
          value={me.introStyle}
          onChange={(e) => void act('player:profile', { introStyle: e.target.value as IntroStyle })}
        >
          {INTRO_STYLES.map((st) => (
            <option key={st} value={st}>
              {s.introStyles[st].label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">{s.yourTagline}</span>
        <input
          className="input"
          value={tagline}
          maxLength={TAGLINE_MAX}
          placeholder={s.taglinePlaceholder}
          onChange={(e) => setTagline(e.target.value)}
          onBlur={saveTagline}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </label>
      <ul className="style-list" aria-label={s.players}>
        {room.players.map((p) => (
          <li key={p.id}>
            <span className="style-list__name">{p.name}</span>
            <span className={`chip chip--style chip--${p.introStyle}`}>{s.introStyles[p.introStyle].label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SettingsCard({ room }: { room: RoomView }) {
  const s = useStrings();
  const iAmHost = room.hostId === room.youId;
  return (
    <section className="card">
      <header className="card__head">
        <h2 className="card__title">{s.settings}</h2>
      </header>
      <fieldset className="setting" disabled={!iAmHost}>
        <legend>{s.wordLanguage}</legend>
        <div className="segmented">
          {(['tr', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={room.settings.language === l}
              className={room.settings.language === l ? 'is-active' : ''}
              onClick={() => void act('host:settings', { language: l })}
            >
              {l === 'tr' ? s.langTr : s.langEn}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="setting" disabled={!iAmHost}>
        <legend>{s.startingTeam}</legend>
        <div className="segmented">
          {(['random', 'red', 'blue'] as StartingTeamSetting[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={room.settings.startingTeam === v}
              className={room.settings.startingTeam === v ? 'is-active' : ''}
              onClick={() => void act('host:settings', { startingTeam: v })}
            >
              {v === 'random' ? s.random : teamName(room, v, s)}
            </button>
          ))}
        </div>
      </fieldset>
      {iAmHost ? (
        <Button variant="ghost" icon="shuffle" disabled={room.players.length < 4} onClick={() => void act('host:shuffle')}>
          {s.shuffleTeams}
        </Button>
      ) : (
        <p className="muted small">{s.hostOnly}</p>
      )}
    </section>
  );
}

export function Lobby({ room }: { room: RoomView }) {
  const s = useStrings();
  const [rulesOpen, setRulesOpen] = useState(false);
  const me = room.players.find((p) => p.id === room.youId)!;
  const spectators = room.players.filter((p) => p.team === null);
  return (
    <div className="screen screen--lobby">
      <Backdrop tone="red" />
      <RoomBar room={room} mode="lobby" />
      <main className="lobby">
        <section className="lobby__main">
          <div className="lobby__cards">
            <button type="button" className="infocard infocard--orange" onClick={() => void copyInvite(room.code, s)}>
              <span className="infocard__icon">
                <Icon name="link" />
              </span>
              <span>
                <strong>{s.inviteTitle}</strong>
                <span className="muted small">{s.inviteBody}</span>
              </span>
            </button>
            <button type="button" className="infocard infocard--purple" onClick={() => setRulesOpen(true)}>
              <span className="infocard__icon">
                <Icon name="book" />
              </span>
              <span>
                <strong>{s.rulesCardTitle}</strong>
                <span className="muted small">{s.rulesCardBody}</span>
              </span>
            </button>
          </div>
          <p className="eyebrow">
            <Icon name="users" size={13} /> {s.players} ({room.players.length})
          </p>
          <div className="lobby__teams">
            <TeamBox room={room} team="red" />
            <TeamBox room={room} team="blue" />
          </div>
          <section className="teambox teambox--none">
            <header className="teambox__head">
              <span className="teambox__dot" aria-hidden />
              <h2 className="teambox__name">{s.unassigned}</h2>
              <span className="teambox__count">{s.teamPlayers(spectators.length)}</span>
              {me.team !== null ? (
                <Button size="sm" variant="ghost" className="teambox__join" onClick={() => void act('lobby:choose', { team: null, role: null })}>
                  {s.watch}
                </Button>
              ) : null}
            </header>
            {spectators.length ? (
              <ul className="tiles">
                {spectators.map((p) => (
                  <PlayerTile key={p.id} player={p} room={room} />
                ))}
              </ul>
            ) : (
              <p className="muted small">{s.noSpectators}</p>
            )}
          </section>
        </section>

        <section className="lobby__mid">
          <StatusCard room={room} />
          <IntroCard room={room} />
          <SettingsCard room={room} />
        </section>

        <aside className="lobby__side">
          <section className="card card--profile">
            <Avatar name={me.name} team={me.team} gold={me.role === 'spymaster'} size="lg" />
            <span className="stack-tight">
              <strong className="profile__name">{me.name}</strong>
              <span className="muted small">
                {me.team ? `${teamName(room, me.team, s)} · ${me.role === 'spymaster' ? s.spymaster : s.operative}` : s.spectator}
                {me.isHost ? ` · ${s.host}` : ''}
              </span>
            </span>
          </section>
          <section className="card card--chat">
            <header className="card__head">
              <span className="pill pill--purple">
                <Icon name="chat" size={12} />
              </span>
              <h2 className="card__title">{s.lobbyChat}</h2>
            </header>
            <ChatPanel room={room} />
          </section>
        </aside>
      </main>
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
