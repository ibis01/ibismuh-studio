// S94 (ROADMAP #13, P3) — the 3D scene contract + the deterministic
// scaffold. The S76 §5 P5 deferral ("until the Universal Timeline is
// stable") is met; the governing rule (§8) shapes the build exactly as it
// shaped the character rig (S93): the 3D engine is a PEER ENGINE on the
// shared contracts — its output is a video clip the composition plan reads,
// its doc follows the house doc laws, its job is crash-resumable. No
// isolated pipeline.
//
// THE RENDERER'S LAW: the frames come from a REAL 3D rasterizer —
// three.js WebGL 2.0 under the sandbox's SwiftShader headless chromium
// (the S94 probe receipt, recorded in the smoke) — through the SAME
// chromium pipeline the Whiteboard engine proves (launch args, the
// route-abort security line, per-frame screenshots). Blender stays the
// recorded tail: an offline Blender headless exporter would emit THIS
// SAME contract — that is what "adapter" means here.
//
// THE HOUSE DOC LAWS (S88's, verbatim): versioned (an unknown version
// reads as absent and is never overwritten), tolerant parse (null on
// unreadable — junk fields fall back honestly), strict write (exactly the
// declared fields, version first), byte-stable round-trip.
//
// S160 — the reference motion-and-light pass (the animated-shorts style
// study, SKILL.md + references/reports): the ADDITIVE SEAM LAW as the
// graphics lane proved it (S129–S132, no version bump):
//   • per-key `ease` on the camera and object keyframes — the house
//     destination-key convention (the segment ARRIVING at a key is eased
//     by THAT key's ease; absent ⇒ linear — one vocabulary with
//     graphics/camera.ts). Old docs carry no ease ⇒ they still evaluate
//     byte-identically (the seam's backward law).
//   • the look seam: optional `sky` (a two-stop gradient dome — top /
//     horizon, the measured day sky compressed), `fog` (colour + near/far
//     — the reference's fog-equals-horizon law), `shadows` (real sun
//     shadows). Absent fields keep the flat pre-S160 look; the renderer
//     gates every pass on the field's presence.
//   • the renderer's global look upgrade (tone mapping) is DELIBERATE and
//     un-gated: this lane is demo-grade, manual, and not compositor-wired
//     — the upgrade IS the point, and no golden hash rides its frames.

import { evalEase, isEaseName, type EaseName } from "./anim/easing";

export const SCENE3D_VERSION = 1;

export const SCENE3D_OBJECT_KINDS = ["box", "sphere", "plane"] as const;
export type Scene3DObjectKind = (typeof SCENE3D_OBJECT_KINDS)[number];

export const SCENE3D_LIGHT_KINDS = ["ambient", "directional"] as const;
export type Scene3DLightKind = (typeof SCENE3D_LIGHT_KINDS)[number];

export const SCENE3D_ASPECTS = ["16:9", "9:16", "1:1"] as const;
export type Scene3DAspect = (typeof SCENE3D_ASPECTS)[number];

export interface Scene3DObject {
  id: string;
  kind: Scene3DObjectKind;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  material: {
    color: string; // #rrggbb
    metalness?: number; // 0..1
    roughness?: number; // 0..1
    opacity?: number; // 0..1
  };
  /** S134 (PAE-6) — the object's keyframes on the NORMALIZED scene clock
   *  (t ∈ [0,1] — the lane's own convention, cameraAt-consistent; the
   *  scene's fps × durationSec maps t to delivered frames). Each key may
   *  carry ANY subset of the three channels; a channel is driven ONLY by
   *  the keys that carry it (clamped holds outside — the motion clamp
   *  law, object form), and the static field above is the fallback when
   *  NO key carries the channel. An object with no keyframes renders
   *  byte-identically to the pre-S134 lane (the additive-seam law). */
  keyframes?: Scene3DObjectKeyframe[];
}

/** One object keyframe: normalized time + any subset of the channels it
 *  drives at that moment (absent channels hold — strict optionality, the
 *  byte-stable round-trip law). S160: the destination-key ease (absent ⇒
 *  linear — the shared convention). */
export interface Scene3DObjectKeyframe {
  t: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  ease?: EaseName;
}

/** The keyframe cap per object — mirrors the graphics lane's
 *  cameraKeysMax; beyond it the tolerant read keeps the first sixteen
 *  (decoration-class overflow, the tolerance law). */
export const SCENE3D_OBJECT_KEYFRAMES_MAX = 16;

export interface Scene3DLight {
  kind: Scene3DLightKind;
  intensity: number; // 0..10 clamped
  color?: string;
  /** directional only — the direction the light points, unit-ish vector. */
  direction?: [number, number, number];
}

export interface Scene3DCameraKeyframe {
  /** 0..1 normalized time across the scene. */
  t: number;
  position: [number, number, number];
  lookAt: [number, number, number];
  /** S160 — the glide arriving at THIS key (the destination-key
   *  convention; absent ⇒ linear, the historical evaluation). */
  ease?: EaseName;
}

export interface Scene3D {
  version: number;
  aspect: Scene3DAspect;
  width: number;
  height: number;
  fps: 24 | 30 | 60;
  durationSec: number;
  background: string; // #rrggbb
  /** S160 — the additive look seam. The gradient sky dome (top / horizon
   *  stops); absent ⇒ the flat background colour (the pre-S160 look). */
  sky?: { top: string; horizon: string };
  /** S160 — depth fog (the reference law: fog IS the horizon colour).
   *  Absent ⇒ no fog pass. */
  fog?: { color: string; near: number; far: number };
  /** S160 — real sun shadows off the directional lights. Absent/false ⇒
 *  the shadow pass stays off (the SwiftShader budget holds either way). */
  shadows?: boolean;
  camera: {
    fov: number; // degrees, clamped 20..110
    keyframes: Scene3DCameraKeyframe[];
  };
  objects: Scene3DObject[];
  lights: Scene3DLight[];
}

// ---------- tolerant parsing ----------

const vec3 = (raw: unknown, fallback: [number, number, number]): [number, number, number] => {
  if (!Array.isArray(raw) || raw.length !== 3) return fallback;
  const [x, y, z] = raw.map(Number);
  return [x, y, z].every(Number.isFinite) ? [x, y, z] : fallback;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const hex = (raw: unknown, fallback: string): string =>
  typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : fallback;

const UNIT: [number, number, number] = [0, 1, 0];

function parseObject(raw: unknown): Scene3DObject | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!SCENE3D_OBJECT_KINDS.includes(o.kind as Scene3DObjectKind)) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 64) : null;
  if (!id) return null;
  const mat = (o.material ?? {}) as Record<string, unknown>;
  // S134 — the tolerant keyframes read: junk keys drop individually, a key
  // that drives NO channel is junk (it animates nothing), t clamps to the
  // normalized clock, and the overflow past the cap warn-slices (the
  // tolerant lane never refuses — the S88 law).
  const rawKeys = Array.isArray(o.keyframes) ? o.keyframes : [];
  const keyframes = rawKeys
    .map((k) => {
      const kk = (k ?? {}) as Record<string, unknown>;
      const t = Number(kk.t);
      if (!Number.isFinite(t)) return null;
      const key: Scene3DObjectKeyframe = { t: clamp(t, 0, 1) };
      // Strict optionality per channel: only a field that SHIPPED a vec3
      // keeps one (the byte-stable round-trip law).
      if (Array.isArray(kk.position)) key.position = vec3(kk.position, [0, 0, 0]);
      if (Array.isArray(kk.rotation)) key.rotation = vec3(kk.rotation, [0, 0, 0]);
      if (Array.isArray(kk.scale)) key.scale = vec3(kk.scale, [1, 1, 1]);
      // S160 — the destination-key ease (junk ⇒ absent ⇒ linear).
      if (typeof kk.ease === "string" && isEaseName(kk.ease)) key.ease = kk.ease;
      if (key.position === undefined && key.rotation === undefined && key.scale === undefined) return null;
      return key;
    })
    .filter((k): k is Scene3DObjectKeyframe => k != null)
    .sort((a, b) => a.t - b.t)
    .slice(0, SCENE3D_OBJECT_KEYFRAMES_MAX);
  return {
    id,
    kind: o.kind as Scene3DObjectKind,
    position: vec3(o.position, [0, 0, 0]),
    // Strict optionality: absent fields stay absent (the byte-stable
    // round-trip law — parse must not invent what serialize omits).
    rotation: Array.isArray(o.rotation) ? vec3(o.rotation, [0, 0, 0]) : undefined,
    scale: Array.isArray(o.scale) ? vec3(o.scale, [1, 1, 1]) : undefined,
    material: {
      color: hex(mat.color, "#888888"),
      metalness: Number.isFinite(Number(mat.metalness)) ? clamp(Number(mat.metalness), 0, 1) : 0,
      roughness: Number.isFinite(Number(mat.roughness)) ? clamp(Number(mat.roughness), 0, 1) : 0.6,
      opacity: Number.isFinite(Number(mat.opacity)) ? clamp(Number(mat.opacity), 0.05, 1) : 1,
    },
    ...(keyframes.length > 0 ? { keyframes } : {}),
  };
}

function parseLight(raw: unknown): Scene3DLight | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  if (!SCENE3D_LIGHT_KINDS.includes(l.kind as Scene3DLightKind)) return null;
  const intensity = Number(l.intensity);
  return {
    kind: l.kind as Scene3DLightKind,
    intensity: Number.isFinite(intensity) ? clamp(intensity, 0, 10) : 1,
    color: hex(l.color, "#ffffff"),
    // Strict optionality (the byte-stable round-trip law): only a
    // directional light that SHIPPED a direction keeps one.
    direction:
      l.kind === "directional" && Array.isArray(l.direction) ? vec3(l.direction, UNIT) : undefined,
  };
}

/**
 * Tolerant parse — null on unreadable input (the S88 law): a build that
 * meets an unknown version or junk reads the doc as absent and never
 * overwrites it. Every field falls back honestly; invalid objects/lights
 * drop individually.
 */
export function parseScene3D(json: string | null | undefined): Scene3D | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (raw.version !== SCENE3D_VERSION) return null;
    const aspect = SCENE3D_ASPECTS.includes(raw.aspect as Scene3DAspect)
      ? (raw.aspect as Scene3DAspect)
      : "16:9";
    const fps = raw.fps === 24 || raw.fps === 60 ? raw.fps : 30;
    const duration = Number(raw.durationSec);
    const camera = (raw.camera ?? {}) as Record<string, unknown>;
    const rawKeys = Array.isArray(camera.keyframes) ? camera.keyframes : [];
    const keyframes = rawKeys
      .map((k) => {
        const kk = (k ?? {}) as Record<string, unknown>;
        const t = Number(kk.t);
        if (!Number.isFinite(t)) return null;
        return {
          t: clamp(t, 0, 1),
          position: vec3(kk.position, [0, 0, 6]),
          lookAt: vec3(kk.lookAt, [0, 0, 0]),
          // S160 — the destination-key ease (junk ⇒ absent ⇒ linear).
          ...(typeof kk.ease === "string" && isEaseName(kk.ease) ? { ease: kk.ease } : {}),
        } as Scene3DCameraKeyframe;
      })
      .filter((k): k is Scene3DCameraKeyframe => k != null);
    const objects = (Array.isArray(raw.objects) ? raw.objects : [])
      .map(parseObject)
      .filter((o): o is Scene3DObject => o != null);
    if (keyframes.length === 0 || objects.length === 0) return null;
    const lights = (Array.isArray(raw.lights) ? raw.lights : [])
      .map(parseLight)
      .filter((l): l is Scene3DLight => l != null);
    // S160 — the look seam (decoration-class): a seam field reads ONLY
    // when it ships as a plain object — junk reads as absent (the
    // byte-stable round-trip law); honest fallbacks fill the values
    // inside the object.
    const isPlainObj = (v: unknown): v is Record<string, unknown> =>
      v !== null && typeof v === "object" && !Array.isArray(v);
    const skyRaw = isPlainObj(raw.sky) ? raw.sky : null;
    const fogRaw = isPlainObj(raw.fog) ? raw.fog : null;
    const fogNear = Number(fogRaw?.near);
    const fogFarRaw = Number(fogRaw?.far);
    const fogFar = Number.isFinite(fogFarRaw) ? clamp(fogFarRaw, 2, 1000) : 58;
    return {
      version: SCENE3D_VERSION,
      aspect,
      width: aspect === "16:9" ? 1280 : aspect === "9:16" ? 720 : 960,
      height: aspect === "16:9" ? 720 : aspect === "9:16" ? 1280 : 960,
      fps,
      durationSec: Number.isFinite(duration) ? clamp(duration, 1, 60) : 5,
      background: hex(raw.background, "#101418"),
      ...(skyRaw ? { sky: { top: hex(skyRaw.top, "#3e7fd2"), horizon: hex(skyRaw.horizon, "#b8d0ec") } } : {}),
      ...(fogRaw
        ? {
            fog: {
              color: hex(fogRaw.color, "#b8d0ec"),
              near: Number.isFinite(fogNear) ? clamp(fogNear, 1, 500) : 14,
              far: Math.max(fogFar, Number.isFinite(fogNear) ? clamp(fogNear, 1, 500) + 1 : 15),
            },
          }
        : {}),
      ...(typeof raw.shadows === "boolean" ? { shadows: raw.shadows } : {}),
      camera: {
        fov: Number.isFinite(Number(camera.fov)) ? clamp(Number(camera.fov), 20, 110) : 50,
        keyframes: keyframes.sort((a, b) => a.t - b.t),
      },
      objects,
      lights: lights.length > 0 ? lights : [{ kind: "ambient", intensity: 1.2, color: "#ffffff" }],
    };
  } catch {
    return null;
  }
}

function serializeObject(o: Scene3DObject): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: o.id,
    kind: o.kind,
    position: [...o.position],
    material: {
      color: o.material.color,
      metalness: o.material.metalness ?? 0,
      roughness: o.material.roughness ?? 0.6,
      opacity: o.material.opacity ?? 1,
    },
  };
  if (o.rotation) out.rotation = [...o.rotation];
  if (o.scale) out.scale = [...o.scale];
  // S134 — strict keyframes write: only the channels a key SHIPPED (the
  // byte-stable round-trip law — parse must not invent, serialize must not
  // fill).
  if (o.keyframes) {
    out.keyframes = o.keyframes.map((k) => ({
      t: k.t,
      ...(k.position ? { position: [...k.position] } : {}),
      ...(k.rotation ? { rotation: [...k.rotation] } : {}),
      ...(k.scale ? { scale: [...k.scale] } : {}),
      ...(k.ease ? { ease: k.ease } : {}),
    }));
  }
  return out;
}

/** Strict serialize — exactly the declared fields, version first. */
export function serializeScene3D(doc: Scene3D): string {
  return JSON.stringify({
    version: SCENE3D_VERSION,
    aspect: doc.aspect,
    width: doc.width,
    height: doc.height,
    fps: doc.fps,
    durationSec: doc.durationSec,
    background: doc.background,
    ...(doc.sky ? { sky: { top: doc.sky.top, horizon: doc.sky.horizon } } : {}),
    ...(doc.fog ? { fog: { color: doc.fog.color, near: doc.fog.near, far: doc.fog.far } } : {}),
    ...(doc.shadows !== undefined ? { shadows: doc.shadows } : {}),
    camera: {
      fov: doc.camera.fov,
      keyframes: doc.camera.keyframes.map((k) => ({
        t: k.t,
        position: [...k.position],
        lookAt: [...k.lookAt],
        ...(k.ease ? { ease: k.ease } : {}),
      })),
    },
    objects: doc.objects.map(serializeObject),
    lights: doc.lights.map((l) => ({
      kind: l.kind,
      intensity: l.intensity,
      color: l.color ?? "#ffffff",
      ...(l.kind === "directional" && l.direction ? { direction: [...l.direction] } : {}),
    })),
  });
}

// ---------- the deterministic scaffold ----------

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The v1 scaffold — a deterministic arrangement (the LLM scene planner is
 * the recorded tail): a ground plane, a centerpiece box (the topic's hue,
 * seeded), two satellite spheres, three-point lighting, and a camera
 * ORBIT keyframed across the scene — the "establishing flyover" every
 * explainer opens with.
 *
 * S160 — the scaffold rides the reference's day look and motion grammar
 * (the animated-shorts style bible): a two-stop sky with fog riding the
 * horizon colour, real sun shadows, a warm lit ground (the flat demo
 * look was the lane's biggest tell), camera keys on the measured GLIDE
 * (the symmetric smootherstep the motion report proved), and a gently
 * ALIVE world — the satellites arc and bob, the centerpiece turns. Same
 * input → byte-identical doc (pinned).
 */
export function scaffoldScene3D(
  topic: string,
  opts: { aspect?: Scene3DAspect; fps?: 24 | 30 | 60; durationSec?: number } = {}
): Scene3D {
  const aspect = opts.aspect ?? "16:9";
  const h = hash32(topic || "tubeforge");
  const hue = h % 360;
  const hexOf = (v: number) => `#${(v & 0xffffff).toString(16).padStart(6, "0")}`;
  const centerpiece = hexOf((hue << 16) | (0x60 << 8) | 0x55);
  const satelliteA = hexOf(((hue + 40) << 16) | (0x50 << 8) | 0x50);
  const satelliteB = hexOf(((hue + 200) << 16) | (0x45 << 8) | 0x5a);
  const width = aspect === "16:9" ? 1280 : aspect === "9:16" ? 720 : 960;
  const height = aspect === "16:9" ? 720 : aspect === "9:16" ? 1280 : 960;
  const duration = clamp(opts.durationSec ?? 5, 1, 60);
  const fps = opts.fps ?? 30;
  const rot0 = (h % 90) * (Math.PI / 180);

  const doc: Scene3D = {
    version: SCENE3D_VERSION,
    aspect,
    width,
    height,
    fps,
    durationSec: duration,
    // The reference's fog-equals-horizon law: the flat backdrop joins the
    // sky at the horizon, so the dome's horizon stop IS the backdrop.
    background: "#b8d0ec",
    sky: { top: "#3e7fd2", horizon: "#b8d0ec" },
    fog: { color: "#b8d0ec", near: 14, far: 58 },
    shadows: true,
    camera: {
      fov: 50,
      keyframes: [
        { t: 0, position: [-4.2, 3.2, 6.4], lookAt: [0, 0.6, 0], ease: "glide" },
        { t: 0.5, position: [0, 2.6, 7.2], lookAt: [0, 0.6, 0], ease: "glide" },
        { t: 1, position: [4.2, 3.4, 6.2], lookAt: [0, 0.7, 0], ease: "glide" },
      ],
    },
    objects: [
      { id: "ground", kind: "plane", position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0], scale: [18, 18, 1], material: { color: "#a3947d", roughness: 0.9 } },
      {
        id: "centerpiece", kind: "box", position: [0, 0.75, 0], rotation: [0, rot0, 0], scale: [1.5, 1.5, 1.5], material: { color: centerpiece, metalness: 0.55, roughness: 0.35 },
        // The slow majestic quarter-turn — eased, seeded.
        keyframes: [
          { t: 0, rotation: [0, rot0, 0] },
          { t: 1, rotation: [0, rot0 + 0.9, 0], ease: "glide" },
        ],
      },
      {
        id: "sat-a", kind: "sphere", position: [-2.6, 0.8, 0.9], scale: [0.8, 0.8, 0.8], material: { color: satelliteA, metalness: 0.2, roughness: 0.5 },
        // The arc: drift toward the camera-side while climbing, then settle.
        keyframes: [
          { t: 0, position: [-2.6, 0.8, 0.9] },
          { t: 0.5, position: [-2.9, 1.15, 1.5], ease: "glide" },
          { t: 1, position: [-2.2, 1.0, 1.9], ease: "glide" },
        ],
      },
      {
        id: "sat-b", kind: "sphere", position: [2.4, 1.05, -0.8], scale: [1.05, 1.05, 1.05], material: { color: satelliteB, metalness: 0.2, roughness: 0.5 },
        // The bob: up and back down on the same eased S.
        keyframes: [
          { t: 0, position: [2.4, 1.05, -0.8] },
          { t: 0.5, position: [2.4, 1.45, -0.8], ease: "glide" },
          { t: 1, position: [2.4, 1.05, -0.8], ease: "glide" },
        ],
      },
    ],
    lights: [
      { kind: "ambient", intensity: 1.0, color: "#cfe0f0" },
      { kind: "directional", intensity: 2.8, color: "#ffe9c4", direction: [-4, 6, 3] },
    ],
  };
  return doc;
}

// ---------- the camera path (pure, pinned) ----------

const lerp3 = (a: [number, number, number], b: [number, number, number], f: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];

/**
 * The camera at normalized time t (0..1): interpolation between the
 * bracketing keyframes, the segment ARRIVING at a key eased by THAT key's
 * ease (S160 — absent ⇒ linear, the historical evaluation and the shared
 * destination-key convention). Deterministic, pure — the pins hold it and
 * the renderer evaluates exactly this.
 */
export function cameraAt(
  keyframes: Scene3DCameraKeyframe[],
  t: number
): { position: [number, number, number]; lookAt: [number, number, number] } {
  const keys = keyframes.length > 0 ? keyframes : [{ t: 0, position: [0, 0, 6], lookAt: [0, 0, 0] } as Scene3DCameraKeyframe];
  const clamped = clamp(t, 0, 1);
  if (clamped <= keys[0].t) return { position: [...keys[0].position], lookAt: [...keys[0].lookAt] };
  const last = keys[keys.length - 1];
  if (clamped >= last.t) return { position: [...last.position], lookAt: [...last.lookAt] };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (clamped >= a.t && clamped <= b.t) {
      const f = evalEase(b.ease ?? "linear", (clamped - a.t) / Math.max(b.t - a.t, 1e-9));
      return { position: lerp3(a.position, b.position, f), lookAt: lerp3(a.lookAt, b.lookAt, f) };
    }
  }
  return { position: [...last.position], lookAt: [...last.lookAt] };
}

// ---------- the object path (S134 — pure, camera-consistent) ----------

/** The object's frame state — what the renderer sets per frame. Strict
 *  optionality mirrors the object: a channel the doc never drives stays
 *  absent (the applier skips it, the byte-identity holds). */
export interface Scene3DObjectState {
  id: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * objectAt — the object at normalized time t (0..1), the cameraAt shape
 * per channel: the keys that CARRY a channel form that channel's track;
 * clamped holds outside (before the first key → the first key's value,
 * after the last → the last — the author controls both edges by writing
 * the edge keys); the static field is only the no-keys fallback. The
 * segment arriving at a key is eased by THAT key's ease (S160 — absent ⇒
 * linear, the historical evaluation). Pure, deterministic — the pins hold
 * it and the renderer evaluates exactly this. Two adapters, one
 * vocabulary: the same clamped-lerp law the S94 camera established, now
 * for objects — the PAE adapter contract.
 */
export function objectAt(obj: Scene3DObject, t: number): Scene3DObjectState {
  const clamped = clamp(t, 0, 1);
  const keys = obj.keyframes ?? [];
  const evalChannel = (
    channel: "position" | "rotation" | "scale",
    fallback: [number, number, number] | undefined,
  ): [number, number, number] | undefined => {
    const ks = keys.filter((k) => k[channel] !== undefined) as Array<Scene3DObjectKeyframe & Record<typeof channel, [number, number, number]>>;
    if (ks.length === 0) return fallback;
    if (clamped <= ks[0].t) return [...ks[0][channel]];
    const last = ks[ks.length - 1];
    if (clamped >= last.t) return [...last[channel]];
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i];
      const b = ks[i + 1];
      if (clamped >= a.t && clamped <= b.t) {
        const f = evalEase(b.ease ?? "linear", (clamped - a.t) / Math.max(b.t - a.t, 1e-9));
        return lerp3(a[channel], b[channel], f);
      }
    }
    return [...last[channel]];
  };
  // The position fallback is the object's MANDATORY field and every key
  // that carries position ships a vec3 — the undefined branch below is
  // unreachable by construction (a tripwire, not a defensive branch).
  const position = evalChannel("position", obj.position);
  if (position === undefined) {
    throw new Error("objectAt: the position channel resolved to nothing — an engine bug");
  }
  const out: Scene3DObjectState = { id: obj.id, position };
  const rotation = evalChannel("rotation", obj.rotation);
  if (rotation !== undefined) out.rotation = rotation;
  const scale = evalChannel("scale", obj.scale);
  if (scale !== undefined) out.scale = scale;
  return out;
}

// ---------- the durable job (the S88 shape) ----------

export const SCENE3D_DIR = "3d";

/** The clip's storage key (the composition plan reads it as a video asset). */
export function scene3dClipKey(videoId: string): string {
  return `${videoId}/${SCENE3D_DIR}/scene-3d.mp4`;
}

/**
 * The crash-resumable 3D render job: the doc lives on the video row (a
 * restart re-renders it whole — the render is deterministic, so a resumed
 * run produces the same clip the crashed one was building).
 */
export async function runScene3DJob(videoId: string): Promise<void> {
  const { db } = await import("./tenant-db");
  const { assertCtx } = await import("./tenant");
  const { setJobProgress } = await import("./jobs");
  const { videoDir } = await import("./ai");
  const ctx = assertCtx("runScene3DJob");

  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return; // deleted while queued — end quietly
  const doc = parseScene3D(video.scene3d);
  if (!doc)
    throw new Error("No 3D scene on this video yet — scaffold one first (POST /api/videos/[id]/scene3d)");

  try {
    const result = await import("./render3d").then((m) =>
      m.renderScene3D(doc, {
        outDir: videoDir(videoId),
        onProgress: (label, frac) => setJobProgress(videoId, "scene3d", Math.round(frac * 100), 100, label),
      })
    );
    await db.video.update({ where: { id: videoId }, data: { error: null } });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "scene3d",
        message: `3D scene rendered — ${result.frames} frames at ${doc.fps}fps (${result.durationSec.toFixed(1)}s), ${doc.objects.length} objects, orbit camera`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.video.update({
      where: { id: videoId },
      data: { error: `3D scene render failed: ${message}` },
    });
    throw err;
  }
}
