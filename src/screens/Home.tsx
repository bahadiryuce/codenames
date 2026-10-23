import { useState, type FormEvent } from 'react';
import { cleanName } from '../../shared/text';
import type { Language } from '../../shared/types';
import { RulesDialog } from '../components/RulesDialog';
import { Backdrop, Button, Glyph, LangToggle, useStrings, Wordmark } from '../components/ui';
import { createRoom, joinRoom, rememberedSession, resumeSession, savedName, useApp, type ClientError } from '../store';

const CODE_RE = /^[A-Z2-9]{6}$/;

export function Home({ inviteCode }: { inviteCode: string | null }) {
  const s = useStrings();
  const { conn, uiLang } = useApp();
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(inviteCode ?? '');
  const [language, setLanguage] = useState<Language>(uiLang);
  const [busy, setBusy] = useState<'create' | 'join' | 'resume' | null>(null);
  const [error, setError] = useState<{ where: 'name' | 'code' | 'form'; text: string } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const remembered = inviteCode ? rememberedSession(inviteCode) : null;
  const offline = conn !== 'online';

  const showError = (e: ClientError) => {
    const where = e === 'NAME_INVALID' || e === 'NAME_TAKEN' ? 'name' : e === 'ROOM_NOT_FOUND' ? 'code' : 'form';
    setError({ where, text: s.errors[e] ?? s.errors.SERVER_ERROR });
  };

  const validName = (): string | null => {
    const n = cleanName(name);
    if (!n) setError({ where: 'name', text: s.errors.NAME_INVALID });
    return n;
  };

  const onCreate = async () => {
    setError(null);
    const n = validName();
    if (!n) return;
    setBusy('create');
    const e = await createRoom(n, language);
    setBusy(null);
    if (e) showError(e);
  };

  const onJoin = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setError(null);
    const n = validName();
    if (!n) return;
    const c = code.trim().toUpperCase();
    if (!CODE_RE.test(c)) {
      setError({ where: 'code', text: s.errors.ROOM_NOT_FOUND });
      return;
    }
    setBusy('join');
    const e = await joinRoom(c, n);
    setBusy(null);
    if (e) showError(e);
  };

  const onResume = async () => {
    if (!remembered) return;
    setError(null);
    setBusy('resume');
    const e = await resumeSession(remembered);
    setBusy(null);
    if (e) showError(e);
  };

  return (
    <div className="home">
      <Backdrop tone="red" />
      <header className="home__top">
        <Button variant="ghost" size="sm" onClick={() => setRulesOpen(true)}>
          {s.howToPlay}
        </Button>
        <LangToggle />
      </header>

      <main className="home__main">
        <section className="home__hero">
          <Wordmark large />
          <p className="home__tagline">{s.tagline}</p>
          <p className="home__intro">{s.intro}</p>
          <ol className="home__steps">
            {[s.step1, s.step2, s.step3].map((step, i) => (
              <li key={i}>
                <span className="home__step-n">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <div className="home__legend" aria-hidden>
            {(['red', 'blue', 'neutral', 'assassin'] as const).map((id) => (
              <span key={id} className={`legend-chip legend-chip--${id}`}>
                <Glyph identity={id} size={14} />
                {s.identity[id]}
              </span>
            ))}
          </div>
        </section>

        <section className="home__panel card" aria-label={inviteCode ? s.joinRoom : s.createRoom}>
          {remembered ? (
            <div className="resume-box">
              <p>{s.resumeAs(remembered.name)}</p>
              <Button variant="primary" size="lg" busy={busy === 'resume'} disabled={offline} onClick={onResume}>
                {s.resume}
              </Button>
              <div className="divider">
                <span>{s.joinAsNew}</span>
              </div>
            </div>
          ) : null}

          <label className="field">
            <span className="field__label">{s.yourName}</span>
            <input
              className={`input ${error?.where === 'name' ? 'input--error' : ''}`}
              value={name}
              maxLength={20}
              autoComplete="nickname"
              placeholder={s.namePlaceholder}
              aria-invalid={error?.where === 'name'}
              aria-describedby={error?.where === 'name' ? 'home-error' : undefined}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void (inviteCode ? onJoin() : onCreate());
              }}
            />
          </label>

          {!inviteCode ? (
            <div className="home__create">
              <div className="field">
                <span className="field__label" id="lang-label">
                  {s.wordLanguage}
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="lang-label">
                  {(['tr', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={language === l}
                      className={language === l ? 'is-active' : ''}
                      onClick={() => setLanguage(l)}
                    >
                      {l === 'tr' ? s.langTr : s.langEn}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="primary" size="lg" busy={busy === 'create'} disabled={offline} onClick={onCreate}>
                {s.createRoom}
              </Button>
              <div className="divider">
                <span>{s.joinRoom}</span>
              </div>
            </div>
          ) : null}

          <form className="home__join" onSubmit={onJoin}>
            <label className="field">
              <span className="field__label">{s.roomCode}</span>
              <input
                className={`input input--code ${error?.where === 'code' ? 'input--error' : ''}`}
                value={code}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder={s.codePlaceholder}
                aria-invalid={error?.where === 'code'}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
            </label>
            <Button type="submit" variant={inviteCode ? 'primary' : 'secondary'} size="lg" busy={busy === 'join'} disabled={offline}>
              {s.join}
            </Button>
          </form>

          {error ? (
            <p className="form-error" id="home-error" role="alert">
              {error.text}
            </p>
          ) : null}
          <p className="home__note">{s.minPlayers}</p>
        </section>
      </main>

      <footer className="home__footer">
        <span>{s.footer}</span>
      </footer>
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
