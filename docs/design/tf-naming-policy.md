# The tf-\* naming policy (declared)

Two different things used to share the `tf-` prefix: **CSS utility classes**
(`tf-card`, `tf-panel`, `tf-kicker`, …) and **browser event names**
(`tf-preview-change`, `tf-gate`). They have opposite verdicts.

## 1. Event names — the legacy spelling is BANNED

Every cross-component browser event name is declared exactly once in
`src/lib/ibismuh/ui-events.ts` as a neutral `ibismuh-*` constant:

| Declared constant            | Event name               | Broadcast by   | Consumed by                    |
| ---------------------------- | ------------------------ | -------------- | ------------------------------ |
| `MUSIC_PREVIEW_CHANGE_EVENT` | `ibismuh-preview-change` | music-controls | track preview buttons          |
| `AUTH_GATE_EVENT`            | `ibismuh-gate`           | auth-gate      | app-sidebar, security-card     |

Components import the constant — never a literal. The legacy `tf-` event
spellings are banned under `src/` (even in comments), enforced by
`npm run test:ui-events`, which is a CI step.

## 2. CSS utility classes — the `tf-` prefix is CANONICAL

The `tf-*` Tailwind utility classes are the studio's design-system layer
(cards, panels, kickers, elevation steps). They are retained as-is: they are
visual vocabulary, not identifiers, and both the premium-UI review and the
whiteboard baseline treat them as the system to keep. No rename, no migration.

## 3. The enforcement surface

- `npm run test:ui-events` — the event-name law (catalog-only names; no
  legacy literal anywhere under `src/`).
- `npm run test:typography-scale` — the 12px floor law (no sub-12px
  arbitrary font-size utility under `src/`; the 714-instance debt is paid).
