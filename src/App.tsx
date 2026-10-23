import { useEffect, useState } from 'react';
import { Backdrop, Button, ConnectionScreen, Toasts, useStrings, Wordmark } from './components/ui';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { Intro } from './screens/Intro';
import { Lobby } from './screens/Lobby';
import { clearSession, takeOverSession, useApp } from './store';

function inviteCodeFromPath(): string | null {
  const m = /^\/r\/([A-Za-z0-9]{6})\/?$/.exec(location.pathname);
  return m ? m[1].toUpperCase() : null;
}

function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="center-message">
      <Backdrop tone="night" />
      <Wordmark large />
      <div className="center-message__body card">{children}</div>
    </div>
  );
}

export function App() {
  const s = useStrings();
  const { session, room, ended, resuming, conn } = useApp();
  usePath();
  const inviteCode = inviteCodeFromPath();

  let content: React.ReactNode;
  if (ended) {
    const text = ended === 'kicked' ? s.sessionKicked : ended === 'replaced' ? s.sessionReplaced : s.sessionClosed;
    content = (
      <CenterMessage>
        <p>{text}</p>
        <div className="row">
          {ended === 'replaced' ? (
            <Button variant="primary" onClick={takeOverSession}>
              {s.takeOver}
            </Button>
          ) : null}
          <Button
            onClick={() => {
              clearSession();
              location.assign('/');
            }}
          >
            {s.goHome}
          </Button>
        </div>
      </CenterMessage>
    );
  } else if (session && room && room.code === session.code) {
    content = room.match ? <Game room={room} /> : room.intro ? <Intro room={room} /> : <Lobby room={room} />;
  } else if (session && (resuming || conn !== 'online')) {
    content = (
      <CenterMessage>
        <p className="waiting">
          <span className="spinner" aria-hidden /> {s.loading}
        </p>
      </CenterMessage>
    );
  } else {
    content = <Home key={inviteCode ?? 'home'} inviteCode={inviteCode} />;
  }

  return (
    <>
      {content}
      <ConnectionScreen />
      <Toasts />
    </>
  );
}
