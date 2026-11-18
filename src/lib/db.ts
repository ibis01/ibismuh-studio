import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// `query` logging emits every SQL statement (with bound parameters — emails,
// token hashes, video topics…) into the logs and bloats log volume. Keep it
// for development only; production logs errors and can opt back in with
// IBISMUH_STUDIO_LOG_QUERIES=1 when a narrowly-scoped diagnostic is actually
// needed (pair it with the deployment's redaction/retention policy).
const logQueries =
  process.env.NODE_ENV !== 'production' || process.env.IBISMUH_STUDIO_LOG_QUERIES === '1'

// S136 — the SQLite contention floor (the Stabilisation Gate's data-
// integrity findings): S135 gave the interactive transactions explicit 60s
// budgets, but the ENGINE-level default stayed a 5-second writer lock — a
// second writer after it still failed the whole write. `busy_timeout` makes
// the wait polite at the engine level (verified live: the URL param is
// honored by the Prisma 6 SQLite connector); WAL lets readers proceed
// during a writer's commit and is a PERSISTENT property of the database
// file, so a one-shot bootstrap PRAGMA upgrades every future connection.
// Postgres datasources run MVCC and need neither.
const isSqlite = process.env.DATABASE_URL?.startsWith('file:') ?? false
const datasourceUrl = isSqlite
  ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL?.includes('?') ? '&' : '?'}busy_timeout=10000`
  : undefined

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logQueries ? ['query', 'error'] : ['error'],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  })

if (isSqlite && !globalForPrisma.prisma) {
  // Fire-and-forget: a transient writer conflict (SQLITE_BUSY) retries once
  // after 250ms; any other failure degrades honestly to the old delete mode.
  db
    .$queryRawUnsafe('PRAGMA journal_mode=WAL')
    .catch(() =>
      new Promise((r) => setTimeout(r, 250)).then(() =>
        db.$queryRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {})
      )
    )
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db