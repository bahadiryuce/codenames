# PAROLA

A real-time multiplayer word-association spy game for the browser, built on the core rules of the
Codenames tabletop game. Two teams, a 5 × 5 board of words, one-word clues. Turkish is the primary
language (754-word pack, Turkish UI); English is supported as a separate word pack and UI language.

> *Kelimelerle casusluk.* Oda kur, bağlantıyı arkadaşlarına gönder, takımlara ayrılın ve oynayın.
> Arayüz Türkçe ve İngilizce; kelime paketi her odada ayrı seçilir.

PAROLA is an independent fan implementation. It uses original names, typography, colours and
graphics, and no official Codenames artwork or logos.

---

## Contents

1. [Quick start](#quick-start)
2. [Playing with friends locally](#playing-with-friends-locally)
3. [Scripts](#scripts)
4. [Configuration](#configuration)
5. [Architecture](#architecture)
6. [Game rules as implemented](#game-rules-as-implemented)
7. [Clue validation](#clue-validation)
8. [Word packs](#word-packs)
9. [Security model](#security-model)
10. [Tests](#tests)
11. [Deployment](#deployment)
12. [Known limitations](#known-limitations)
13. [Troubleshooting](#troubleshooting)

---

## Quick start

Requirements: **Node.js 20 or newer** (developed on Node 24) and npm. No database, account or paid
service is needed.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. `npm run dev` starts two processes:

| Process | Port | What it does |
| --- | --- | --- |
| Vite dev server | 5173 | Serves the React client with hot reload, proxies `/socket.io` to the game server |
| Game server (`tsx watch`) | 3001 (`SERVER_PORT`) | Authoritative game state, Socket.IO, persistence |

Production build and run:

```bash
npm run build     # client → dist/client, server bundle → dist/server/index.js
npm start         # serves client + WebSockets on PORT (default 3001)
```

Then open <http://localhost:3001>.

## Playing with friends locally

- **Several players in one browser:** every browser *tab* is a separate player (the session lives in
  `sessionStorage`). Create a room in one tab, then open the invite link in other tabs and choose
  **Join as a new player**. A full match needs at least four tabs or devices.
- **Phones and laptops on the same Wi-Fi:** `npm run dev` prints a `Network:` URL such as
  `http://192.168.1.39:5173`. Other devices on the same network can open it (allow Node through
  the firewall if prompted). With a production build, use `http://<your-LAN-IP>:3001`.
- **Over the internet:** deploy (see [Deployment](#deployment)) and share the room link.

Reloading a tab, closing the laptop lid or briefly losing Wi-Fi does not cost you your seat: the
client reconnects automatically and the server sends a fresh snapshot. If you close a tab, opening
the room link again offers **Continue where you left off**.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Client + server in watch mode |
| `npm run build` | Production build of client and server |
| `npm start` | Run the production build |
| `npm test` | Run all automated tests once (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript check of client, server, shared code and tests |
| `npm run words:check` | Word pack statistics and quality report (fails on errors) |

## Configuration

All settings are environment variables; none are required. See [`.env.example`](.env.example).
The server reads the process environment directly; to load a file, run
`node --env-file=.env dist/server/index.js`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | Port in production (`npm start`). Most hosts set this for you. |
| `SERVER_PORT` | `3001` | Game server port in `npm run dev` (Vite proxies to it). |
| `HOST` | all interfaces | Interface to bind. |
| `DATA_DIR` | `./data` | Where the room snapshot `rooms.json` is written. |
| `PERSISTENCE` | `on` | `off` keeps rooms in memory only. |
| `ALLOWED_ORIGINS` | empty | Extra browser origins allowed to open WebSockets (comma-separated). Same-origin is always allowed. |
| `TRUST_PROXY` | `0` | Set `1` behind a reverse proxy so rate limiting uses `X-Forwarded-For`. |

There are no secrets in this project. Nothing in the client bundle comes from the environment.

## Architecture

```
 Browser (React)                         Node.js server
 ───────────────                         ─────────────────────────────────────────────
 Home / Lobby / Game screens             server/app.ts      HTTP (static files, /healthz)
   │  renders RoomView only                                 + Socket.IO, rate limits, auth binding
   │                                     server/rooms.ts    RoomStore: rooms, players, seats,
 src/store.ts ── Socket.IO ──────────►                      host rights, authorization
   ack-based actions  ◄── room:state ──  shared/engine.ts   pure rule engine (board, clue, guess,
   (game:clue, game:guess …)   (per-player                  end turn, win conditions)
                                projection)  server/views.ts   per-viewer projection (public vs key)
                                         server/persistence.ts  JSON snapshot (debounced, atomic)
```

**Why this stack.** The game needs one authoritative process that holds hidden state and pushes
different data to different players. A single Node.js server with Socket.IO does that with no
external services, runs on free tiers and on a laptop, and keeps the rules in one TypeScript module
shared with the client (which reuses the clue validator for instant feedback). React + Vite gives
a fast, typed UI. Supabase or a database would add accounts, setup and row-level-security
complexity without improving a game whose state is small and short-lived.

**Source layout**

```
shared/          code used by both sides
  types.ts       domain types, wire types, PublicMatchView / KeyMatchView, error codes
  engine.ts      board generation and the turn state machine (pure, no I/O)
  clue.ts        clue validation
  text.ts        Turkish-aware case mapping, normalisation, folding
  words/         word packs (tr.ts, en.ts) and the pack builder
server/          authoritative game server
src/             React client (screens/, components/, store.ts, i18n.ts, styles.css)
tests/           Vitest unit and multi-client integration tests
scripts/         word pack checker
```

**State machine.** A match is in one of three phases: `clue` → `guess` → (`clue` of the other team
| `finished`). Every action validates completely before it mutates anything, and Node runs each
socket handler synchronously to completion, so an action is atomic: two operatives clicking the
same card at the same moment produce exactly one reveal; the second gets `CARD_REVEALED`.
Guesses and "end turn" carry the current clue id, so a click made against an old turn is rejected
with `STALE_ACTION` instead of being applied to the new one. Each room has a revision number that
increases on every change; clients drop snapshots older than the one they have.

**Synchronisation.** After every successful action the server sends each connected player a
complete, freshly projected `RoomView` (it is small: 25 cards, a player list, the log). Short
`room:notice` events drive toasts. On (re)connect the client re-authenticates with its token and
receives a new snapshot; it never replays local state.

**Persistence.** Rooms are written to `DATA_DIR/rooms.json` one second after a change (temp file +
rename) and on shutdown, and loaded at startup, so a restart or deploy does not end running
matches. Finished matches stay in the room until the host starts a rematch or returns to the lobby;
there is no long-term match history. Chat is kept in memory only (last 100 messages) and is not
persisted. Rooms are deleted after 6 hours with nobody connected, or 48 hours after creation.

## Game rules as implemented

Standard two-team rules; there are no house rules.

- 25 distinct words, drawn without replacement from the room's word pack, avoiding the room's
  previous ~100 words when possible.
- Key: 9 agents for the starting team, 8 for the other, 7 bystanders, 1 assassin. The starting
  team is random or chosen by the host.
- Each team has exactly one spymaster and at least one operative; at least four players total.
  A player cannot be on both teams or hold both roles.
- The active spymaster gives one word and a number from 0 to 9, or unlimited (∞). Clues are final.
- Operatives may guess up to number + 1 times. With 0 or unlimited there is no cap. At least one
  guess is required before ending the turn voluntarily.
- The turn ends immediately on a bystander or an opposing agent (which counts for that team), when
  the guess limit is reached, or when operatives end it.
- Revealing the assassin ends the match: the other team wins.
- A team wins as soon as all of its agents are revealed, including when the opponents reveal its
  last agent by mistake.

**Seats during a match.** Spymasters are locked in place once the match starts (they have seen the
key). Nobody can switch teams mid-match. Spectators may join a team as operatives. If a spymaster
leaves, only the host can fill the vacant seat. Settings are locked while a match is running.

## Clue validation

Implemented in [`shared/clue.ts`](shared/clue.ts), run on the server for every clue and in the
client for instant feedback. Deterministic rules:

1. After Unicode NFC normalisation the clue must be a single run of Latin-script letters, at most
   24 letters. Spaces, digits, hyphens, apostrophes, punctuation and symbols are rejected, which
   also blocks "two words joined by punctuation".
2. It may not equal any face-down board word. Comparison uses a *folded* form (Turkish lowercase,
   diacritics removed, ı → i), so `KÖPEK`, `köpek` and `kopek` are the same word.
3. It may not look like a form of a face-down board word:
   - one starts with the other and the shorter is at least 3 letters (`kale` → `kaleci`,
     `kitap` → `kitaplık`, `horse` → `horses`);
   - one contains the other and the shorter is at least 4 letters (`horseshoe` ↔ `shoe`);
   - Turkish final-consonant softening is applied first (`kitap` → `kitabı`, `ağaç` → `ağacı`,
     `renk` → `rengi`).

Limitations (deliberate trade-offs, not bugs): vowel-dropping stems such as `ağız → ağzı` and
`burun → burnu` are not detected; stems of two letters or fewer (`su`, `ay`) are not checked for
derivations; and unrelated words sharing a 3+ letter prefix with a board word are rejected
(`kar` on the board blocks `karpuz`). A rejected clue names the conflicting board word, so the
spymaster can pick another. Rules about tone of voice, gestures and extra hints cannot be enforced
by software and are left to the players.

## Word packs

| Pack | Words | Tags |
| --- | --- | --- |
| Turkish (`shared/words/tr.ts`) | 754 | animals, nature, places, food, objects, transport, science/body, people, culture, abstract |
| English (`shared/words/en.ts`) | 665 | same categories |

Counts are produced by `npm run words:check` and asserted in the tests (Turkish ≥ 500). Each entry
keeps a display form, a normalised form and a folded form plus language and tags. The builder
rejects malformed entries, words over 11 letters and folded collisions (for example `çam` and
`cam` cannot both be in a pack, because they would be indistinguishable for clue checking).
Obvious derived duplicates (`balık`/`balıkçı`, `dans`/`dansçı`) were removed; the checker prints
the remaining prefix pairs for review. Many words are intentionally ambiguous (yüz, dil, kale, yaz,
çay, gül, at, yay, koç, akrep, ocak, pazar, boğaz…).

To add words, append them to the right tag block and run `npm run words:check`. To add a pack for
a new language, add a file under `shared/words/`, register it in `WORD_PACKS`, add the language to
the `Language` type, and give `toLower`/`toUpper` its casing rules if they differ from the default.

Turkish text handling ([`shared/text.ts`](shared/text.ts)) maps I↔ı and İ↔i explicitly before
delegating to the default case mapping, so results never depend on the runtime's locale data. The
board shows words uppercased with these rules (İSTANBUL, ILIK).

## Security model

- **Server-authoritative.** Clients send intents (`game:guess {index, clueId}`), never state. The
  acting player is taken from the authenticated socket, never from the payload; extra payload
  fields are ignored.
- **Hidden information.** The full key exists only in server memory and the server-side snapshot
  file. [`server/views.ts`](server/views.ts) builds each player's view field by field:
  `PublicMatchView` cards carry `identity: null` until revealed; only players currently seated as
  spymaster get `KeyMatchView`. After the server marks the match finished, everyone gets the key.
  The key never reaches operatives through HTML, CSS classes, local storage, logs or error
  messages; this is covered by unit and multi-client tests and was checked in the browser DOM.
- **Guest sessions.** Creating or joining a room returns a random 256-bit token
  (`crypto.randomBytes`). The server stores only its SHA-256 hash and compares in constant time.
  The token is bound to one player in one room; a new connection with the same token replaces the
  old one. The browser keeps the token in `sessionStorage` (per tab) and, so a closed tab can
  resume, in `localStorage` keyed by room code. Anyone holding a player's token can act as that
  player, as with any bearer-token guest system. There are no accounts or passwords.
- **Room codes** are 6 characters from a 31-letter unambiguous alphabet (~887 million combinations),
  drawn with `crypto.randomInt`. A room code lets someone join as a new player (that is how invites
  work) but grants no access to existing seats. Rooms cannot be listed.
- **Authorization checks** on every action: membership, host rights, seat rules, phase, turn, role,
  clue validity, card validity, stale clue ids.
- **Abuse limits:** per-socket token bucket (burst 20, 4 actions/s), per-IP limits on
  create/join/resume, 16 KB maximum message size, 16 players per room, input length limits.
- **HTTP:** strict Content-Security-Policy, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`
  (room codes are in URLs), `nosniff`; static file serving is confined to `dist/client`.
  WebSocket connections from foreign origins are refused unless listed in `ALLOWED_ORIGINS`.
- **Logs** contain room codes and error messages only, never key cards, clues or tokens.
  Unexpected server errors return `SERVER_ERROR` without details.

## Tests

`npm test` runs 48 tests in 4 files (all passing at the time of writing):

| File | Covers |
| --- | --- |
| `tests/engine.test.ts` | 9/8/7/1 key across 200 seeds for each starting team; 25 unique words; invalid boards rejected; word picking without replacement; valid/invalid clues; correct guess continues; bystander, opponent and assassin outcomes; voluntary end only after a guess; count + 1 limit; 0/unlimited; win on last own agent; win for the opponent when their last agent is revealed by mistake; turn switching; duplicate, out-of-range, stale and out-of-turn guesses leave state untouched |
| `tests/text-and-clue.test.ts` | Turkish I/ı/İ/i, NFC, folding, name cleaning, every clue rule above, count validation, word pack integrity (≥ 500 Turkish words, no folded duplicates) |
| `tests/views.test.ts` | Projection: operatives, spectators and outsiders get no unrevealed identity and no server-only fields; both spymasters get the key; revealed cards only; everyone sees the key after the end |
| `tests/multiplayer.test.ts` | A real server with 5 independent Socket.IO clients: joining, invalid codes, duplicate names, full rooms, one spymaster per team, host-only controls, start conditions, actions from non-members, malformed payloads, hidden information in every payload received, a complete match to victory, assassin ending, out-of-turn/out-of-role rejections, locked seats, ignored forged fields, concurrent guesses on one card, disconnect/reconnect with fresh snapshots, session replacement, rematch with fresh words, return to lobby, chat, kick, host hand-over, restart with persisted rooms and no raw tokens on disk |

The UI was also tested by hand in a browser with four independent tabs: creating and joining
rooms, seating through the lobby, a match ended by the assassin, a rematch won by finding all nine
agents, refresh mid-match, server restart mid-match, take-over from another tab, return to lobby,
English UI, and the mobile (375 px) and desktop layouts. The production build was smoke-tested in
the browser (no console errors, no CSP violations). There is no automated browser (Playwright)
suite.

## Deployment

The app is one Node process that serves the built client and the WebSocket endpoint on one port.
It needs a host that runs a **long-lived Node process with WebSocket support**. Serverless
platforms (Vercel functions, Netlify functions) are not suitable.

Run **one instance**: game state lives in that process, so horizontal scaling would need a shared
store and sticky sessions, which this project does not implement.

### Render (free plan)

1. Push the project to a GitHub repository.
2. In Render, choose **New → Blueprint**, select the repository; [`render.yaml`](render.yaml)
   defines a free web service (`npm ci --include=dev && npm run build`, `npm start`, health check
   `/healthz`, `TRUST_PROXY=1`). Or create a **Web Service** by hand with the same commands.
3. Open the `onrender.com` URL Render gives you and share room links from there.

Free-plan behaviour (check Render's current documentation; terms change): the service sleeps
after a period without traffic and takes a while to wake up; the filesystem is ephemeral, so
`rooms.json` is lost when the instance restarts or redeploys, which ends running matches. A
persistent disk requires a paid plan; with one, set `DATA_DIR` to its mount path.

### Docker (any VPS or home server)

```bash
docker build -t parola .
docker run -d -p 3001:3001 -v parola-data:/data --name parola parola
```

The image stores snapshots in the `/data` volume. Put it behind a reverse proxy with TLS (Caddy,
Nginx, Traefik) that forwards WebSocket upgrades, and set `-e TRUST_PROXY=1` when you do. The
Dockerfile was written for this project but has not been built in the development environment
(Docker was not available there).

### Plain Node on a server

```bash
npm ci && npm run build
PORT=3001 DATA_DIR=/var/lib/parola npm start
```

Keep it running with systemd, pm2 or similar.

## Known limitations

- **Single process, single instance.** No horizontal scaling. Up to 16 players per room; capacity
  per instance depends on the host.
- **Persistence is a snapshot file.** It survives restarts on hosts with a persistent filesystem; on
  ephemeral free tiers, running matches end when the instance restarts.
- **Clue validation** is a baseline (see [Clue validation](#clue-validation)); it can reject some
  legitimate words and miss some irregular Turkish forms.
- **Honour rules.** Software cannot stop a spymaster from hinting by voice or chat, or a former
  spymaster from rejoining under a new name with knowledge of the key.
- **Guest identity only.** No accounts, no match history beyond the current room, no
  spectator-only invite links.
- **Not implemented:** turn timers, team-only chat, operatives marking cards for teammates,
  sound effects, dark theme, an automated browser test suite.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Page stuck on "Connecting…" in development | The game server is not running or not on `SERVER_PORT`. Check the `[server]` lines in the `npm run dev` output. |
| `EADDRINUSE` on start | Another process uses the port. Change `PORT` / `SERVER_PORT`, or stop the other process. |
| Phone on the same Wi-Fi cannot connect | Use the `Network:` URL, not `localhost`; allow Node through the OS firewall; some guest networks isolate devices. |
| "Client build not found" at `localhost:3001` | Run `npm run build` before `npm start`, or use `npm run dev` and port 5173. |
| "This player was opened in another tab or device" | The same seat was resumed elsewhere. Click **Continue in this tab** to take it back. |
| "No room with that code" after a deploy | The host restarted with an empty filesystem (ephemeral disk). Create a new room. |
| A clue is rejected unexpectedly | The message names the conflicting board word; see [Clue validation](#clue-validation). |
| Tests fail with port errors | Tests bind random free ports; make sure nothing blocks local sockets (VPN/firewall tools). |
