import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Room } from './rooms';

// Snapshot persistence: the whole room table is written to one JSON file (atomically,
// via a temp file + rename), debounced after changes, and read back at startup so a
// routine restart does not end running matches.
//
// What is stored: room settings, players (id, name, seat, SHA-256 hash of their
// session token, never the token itself) and the match, including the key card. The
// file lives on the server only and is never served. Chat is not persisted.

const FORMAT_VERSION = 1;

interface Snapshot {
  version: number;
  savedAt: number;
  rooms: Room[];
}

export class SnapshotStore {
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;

  constructor(dir: string, private readonly delayMs = 1000) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'rooms.json');
  }

  load(): Room[] {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch {
      return [];
    }
    try {
      const snap = JSON.parse(raw) as Snapshot;
      if (snap.version !== FORMAT_VERSION || !Array.isArray(snap.rooms)) return [];
      return snap.rooms
        .filter((r) => typeof r?.code === 'string' && Array.isArray(r.players))
        .map((r) => ({
          ...r,
          chat: [],
          chatSeq: r.chatSeq ?? 0,
          players: r.players.map((p) => ({ ...p, connected: false })),
        }));
    } catch (e) {
      console.error('[persistence] snapshot unreadable, starting empty:', (e as Error).message);
      return [];
    }
  }

  schedule(getRooms: () => Iterable<Room>): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.write(getRooms());
    }, this.delayMs);
  }

  flush(rooms: Iterable<Room>): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.write(rooms);
  }

  private write(rooms: Iterable<Room>): void {
    const snap: Snapshot = {
      version: FORMAT_VERSION,
      savedAt: Date.now(),
      rooms: [...rooms].map((r) => ({ ...r, chat: [] })),
    };
    const tmp = `${this.file}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(snap), 'utf8');
      renameSync(tmp, this.file);
    } catch (e) {
      // Persistence is best-effort; the live game keeps running from memory.
      console.error('[persistence] write failed:', (e as Error).message);
    }
  }
}
