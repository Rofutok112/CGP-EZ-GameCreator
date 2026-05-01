import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { liveSessions, submissions } from "./schema";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "submissions.sqlite");

let cached: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (cached) return cached;

  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      title TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS live_sessions (
      client_id TEXT PRIMARY KEY,
      classroom_id TEXT NOT NULL DEFAULT 'default',
      student_name TEXT NOT NULL,
      title TEXT NOT NULL,
      code TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      client_updated_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER
    );
  `);
  ensureColumn(sqlite, "live_sessions", "classroom_id", "TEXT NOT NULL DEFAULT 'default'");
  ensureColumn(sqlite, "live_sessions", "revision", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(sqlite, "live_sessions", "client_updated_at", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(sqlite, "live_sessions", "archived_at", "INTEGER");

  cached = drizzle(sqlite, { schema: { liveSessions, submissions } });
  return cached;
}

function ensureColumn(sqlite: Database.Database, table: string, column: string, definition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((item) => item.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
