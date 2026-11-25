// ui-events.ts — THE BROWSER UI EVENT CATALOG.
//
// Cross-component browser CustomEvents used by the studio UI. Before this
// module the event names were string literals scattered across components —
// and two of them still carried the pre-rebrand "tf-" prefix (the music
// preview event and the auth-gate event). THE LAW: every cross-component
// browser event name is declared here exactly once; components import the
// constant, never a literal; and scripts/test-ui-events.mts scans the
// component tree so the legacy "tf-" event class can never come back
// silently — the legacy spellings themselves are banned under src/, even
// in comments, so a text search stays a trustworthy enforcement tool.

/** Music track preview singleton state changed (play / stop / ended). */
export const MUSIC_PREVIEW_CHANGE_EVENT = "ibismuh-preview-change";

/** Studio access gate state changed (auth-gate broadcasts; sidebar + security card listen). */
export const AUTH_GATE_EVENT = "ibismuh-gate";

/** Every browser event name this UI is allowed to broadcast. */
export const UI_EVENT_NAMES = [MUSIC_PREVIEW_CHANGE_EVENT, AUTH_GATE_EVENT] as const;
