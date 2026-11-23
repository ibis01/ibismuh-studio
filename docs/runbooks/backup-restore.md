# Runbook — Production database backup & restore drill

**Scope:** production Postgres. (SQLite, the development database, is covered
by `npm run backup` + `scripts/test-backup.mts` — a tested roundtrip.)
**Introduced:** S33 (improvement roadmap §4.6, 2026-11-05).
**Rule:** a backup that has never been restored is a hypothesis, not a
control. The drill below runs **quarterly**, and after any change to the
backup script, the schema, or the database provider.

---

## 1. What backs up the database

Three layers, in order of preference when restoring:

| Layer | Mechanism | Cadence | Covers |
| --- | --- | --- | --- |
| Point-in-time restore | Enabled on the managed Postgres provider (Neon PITR / restore-to-branch) | continuous | Any moment inside the provider's retention window |
| Nightly logical dump | `npm run db:backup:pg` (`scripts/backup-postgres.sh`) | nightly | An **independent, off-provider copy** — survives provider account loss, region failure, or a bad migration the provider happily replicated |
| Pre-migration snapshot | `neon branch create` (or provider equivalent) before every `prisma migrate deploy` that touches data | per deploy | The "undo" for a migration that went wrong |

The nightly dump is the layer this runbook drills. It writes a
`pg_dump --format=custom` archive (compressed, `pg_restore`-compatible),
verifies it by listing it back (`pg_restore --list`), writes a `.sha256`
sidecar, and — when `BACKUP_S3_URI` is set — uploads both to object storage
(Cloudflare R2 / any S3-compatible bucket) via the `aws` CLI or `rclone`.

## 2. Scheduling the nightly dump

The dump must run on a machine that is always on and holds the production
`DATABASE_URL`. The Fly **worker** machine qualifies (it is the always-on
process group). Two workable options:

**Option A — cron on the worker machine (recommended, fewest moving parts):**

```bash
# from a machine with the fly CLI, authenticated:
fly ssh console -a ibismuh --select \
  --command 'grep -q db:backup:pg /etc/cron.d/ibismuh 2>/dev/null || \
    echo "17 3 * * * root cd /app && BACKUP_S3_URI=s3://<bucket>/ibismuh-backups npm run db:backup:pg >> /app/backups/backup-cron.log 2>&1" > /etc/cron.d/ibismuh'
```

(Cron inside a Fly machine resets on redeploy — re-check after each deploy,
or bake the crontab into the Dockerfile when the schedule is proven.)

**Option B — scheduled GitHub Action** calling
`fly ssh console -a ibismuh --command 'cd /app && BACKUP_S3_URI=… npm run db:backup:pg'`
with the Fly API token stored as a repository secret.

**Success criterion:** a new `ibismuh-YYYY-MM-DD_HHMMSS.dump` +
`.sha256` pair appears in the bucket every day, and `backup-cron.log` ends
with `done`.

## 3. The restore drill (quarterly)

Time it. The measured time is the RTO (recovery time objective) — write it
into the drill log in §4.

1. **Pick the artifact.** Take the most recent dump from the bucket (or
   `backups/pg/`). Verify it against its sidecar:
   `sha256sum -c ibismuh-<stamp>.dump.sha256`.
2. **Create a scratch database.** With Neon, the cheapest drill target is a
   branch: `neonctl branches create --name restore-drill-$(date +%Y%m%d)`,
   then copy its connection string. (Any scratch Postgres works — even
   `docker run -e POSTGRES_PASSWORD=drill -p 5433:5432 postgres:16-alpine`.)
3. **Restore into it:**
   ```bash
   pg_restore --dbname "$SCRATCH_URL" --no-owner --no-privileges --clean --if-exists ibismuh-<stamp>.dump
   ```
   Any error here is a finding: the backup is not restorable as-is. Record
   it and fix the cause before continuing.
4. **Boot the app against the scratch database** (never production secrets):
   ```bash
   DATABASE_URL="$SCRATCH_URL" \
   IBISMUH_STUDIO_AUTH_SECRET=$(openssl rand -hex 32) \
   IBISMUH_STUDIO_ENCRYPTION_KEY=<the PRODUCTION encryption key — needed to read stored credentials> \
   npm run dev
   ```
   Note: with the production `IBISMUH_STUDIO_AUTH_SECRET`, restored sessions and
   API tokens are valid — for a drill, a fresh random secret is safer
   (restored sessions simply fail, which is fine for the checks below).
   The **encryption key must be the production one** if you want to verify
   stored provider credentials decrypt; for a data-shape drill, a random key
   also works.
5. **Smoke checks** (each one exercises a different table family):
   - `GET /login` returns 200 (app boots, schema loads).
   - Register a throwaway account, log in, log out (User, Org, Session).
   - The dashboard lists videos with counts (Video, Scene, Job).
   - Open Settings → AI Providers (Setting, encrypted credentials path).
   - `GET /api/billing/plan` returns a plan (Plan, Subscription, CreditGrant,
     CreditLedger, SpendReservation).
6. **Record the result** in the drill log (§4): date, dump stamp, bytes,
   restore time, boot time, anomalies.
7. **Destroy the scratch database / branch.** Leave nothing behind.

## 4. Drill log

| Date | Dump stamp | Size | Restore time | Boot + smoke time | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | _first quarterly drill pending — production Postgres lane, scheduled with the real-PostgreSQL migration drill (M2); the SQLite-lane machinery below is drilled on every push_ | — |

### 4.1 The automated companion drill (S103 / P1.1, 2026-11-13)

`scripts/restore-drill.mts` (`npm run test:drill`, CI check job) runs the
full drill against the live SQLite lane on EVERY push: VACUUM INTO hot
snapshot → destroy a scratch casualty with random bytes (the lost-database
scenario) → restore the artifact bytes → verify integrity_check, row counts
vs the live DB, a real query, and the S100 column projections → print the
measured RTO. First measured run (2026-11-13, live sandbox DB): **RTO 58 ms**
(backup + destroy + restore + verify, 7/7 assertions). The quarterly manual
Postgres drill above stays the production-control drill; the automated one
proves the backup machinery never rots between drills.

`scripts/alert-probe.mts` (`npm run alert:probe`) is the always-on companion
monitor from §5's "alert on absence" note: DB reachability, column reality
(the S60 P2022 class), pending-backlog age, stale-lease count (S100),
migration-chain stuckness, fail-closed secrets, disk headroom, and — opt-in
via `IBISMUH_STUDIO_ALERT_BACKUPS_DIR` — backup artifact freshness. Every failure
prints one actionable `[ALERT] <check> — <what to do>` line and the final
`HEALTH <n> failed` is machine-scrapable; exit code 1 wakes the monitor.
Point a cron/uptime monitor at it in production.

### 4.2 Object-storage leg added (M1 infrastructure milestone, 2026-11-23)

The M1 review demanded restore evidence for the object store, not just the
database. `scripts/restore-drill.mts` now runs **two legs** in one pass:

- **Storage leg** — seeds four objects in the real `uploads/` layout
  (`<videoId>/final.mp4`, `<videoId>/preview.mp4`,
  `<videoId>/thumbnail.jpg`, `_music/track-128.mp3`), byte-copies them into
  the drill backup, destroys the live copies with random bytes, restores
  from the backup, and asserts sha256 checksums **and** full manifest
  parity (every seeded path present, nothing missing, nothing extra).
- **Database leg** — unchanged (VACUUM INTO snapshot → noise-destroy →
  restore → integrity_check + row-count parity against seeded
  org/user/video/jobs data).

First two-leg run (2026-11-23): **12/12 assertions PASS** — DB RTO 449 ms
(restore + verify incl. seeded parity), storage RTO 35 ms (byte-exact).
A real `npm run backup` bundle was produced the same day
(`backups/ibismuh-2026-11-23_193854/`, gitignored per `/backups/` —
VACUUM INTO hot copy, 668 KB, `integrity_check: ok`, 39 tables, uploads
manifest of 40 files, MANIFEST.txt).

**Finding fixed the same day:** the operational backup path
(`scripts/backup.sh`) hard-required the `sqlite3` CLI and exited 1 on hosts
without it — i.e. `npm run backup` was broken on exactly the slim
containers it is meant to run on (first observed live here, exit 1, 2026-11-23).
It now falls back to the same `VACUUM INTO` hot copy through
`better-sqlite3` (`scripts/backup-vacuum.mjs`), which ships with the Prisma
driver adapter, so `npm run backup` works wherever the app runs.

**Operational gotcha recorded during the drill:** a shell-exported ambient
`DATABASE_URL` silently outranks `.env` for every Node/Prisma process —
drill/setup invocations landed on the wrong database file
(`/home/z/my-project/db/custom.db`) until the URL was pinned explicitly.
**All backup/drill/restore commands must pin the URL**
(`DATABASE_URL="file:<abs-path>" npm run …`). This is the live instance of
the wrong-target failure class §5 warns about.

## 5. Failure modes and responses

| Symptom | Likely cause | Response |
| --- | --- | --- |
| `pg_restore: error: could not execute query` mid-restore | Dump taken with a newer schema than the scratch DB expects | Re-create the scratch DB empty (no `--clean`), or use a matching Postgres major version |
| Nightly dump missing from the bucket | Worker machine redeployed (cron wiped), or aws credentials expired | Re-install the crontab (§2A); check `backup-cron.log`; alert on absence (the uptime monitor's companion check — see S33+ backlog, observability) |
| `sha256sum -c` fails after download | Truncated/corrupted transfer | Re-download; if it fails at the source, the dump was bad at write time — investigate disk health immediately |
| Dump size drops sharply day-over-day | A table stopped being written, or a silent schema change | Compare `pg_restore --list` table-data counts against the previous day before assuming |
