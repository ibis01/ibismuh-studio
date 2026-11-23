#!/usr/bin/env node
// Hot-copy fallback for scripts/backup.sh when the sqlite3 CLI is not
// installed on the host (slim CI containers, minimal VMs). Performs the
// same `VACUUM INTO` hot copy through better-sqlite3 — already a project
// dependency via the Prisma driver adapter — so `npm run backup` works
// everywhere the app runs. Same safety property as the CLI path: safe to
// run while the app is up (VACUUM INTO reads a snapshot, writes a NEW file).
import Database from 'better-sqlite3';

const out = process.env.BACKUP_OUT;
const src = process.env.BACKUP_SRC;
if (!src || !out) {
  console.error('[backup] ERROR: BACKUP_SRC / BACKUP_OUT not set (caller: scripts/backup.sh)');
  process.exit(1);
}

const db = new Database(src);
try {
  // Escape single quotes for the SQL literal; VACUUM INTO targets a path
  // that must not already exist (SQLite enforces this itself).
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
} finally {
  db.close();
}
console.log(`[backup] database hot-copied (VACUUM INTO via node): ${src} -> ${out}`);
