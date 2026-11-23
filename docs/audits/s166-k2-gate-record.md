# S166 K2 gate record — the IK decision, deferred

This record is the S166 acceptance item the six-engine audit names
("K2 decision recorded in this doc's successor"). It records a DECISION;
it does not implement the gate's subject.

## What the audit staged (verbatim intent)

> K2 gate record: chain-reduction + DLS IK behind an authored-contact
> contract (OT pattern), results written back as keyframes — IMPLEMENT
> ONLY after the K2 design slice.

## The decision: DEFERRED — and why that is the honest reading

The audit's own staging puts the K2 IK behind a gate: implement ONLY
after a K2 design slice exists. No such design slice exists today — the
roadmap's staged slices (S163–S167) describe the ADOPTIONS, not the K2
contract design. Implementing chain-reduction + DLS now would be exactly
the silent-approval-of-future-work the master roadmap's first law
forbids: the gate would open itself.

S166 therefore ships the mouth classes, the art variants, and the pose
schema v-next — and RECORDS this gate. The IK stays where it is today:

- `src/lib/ibismuh/anim/ik.ts` — the existing two-bone planar solver
  (cosine law; refuse-not-clamp; pole continuity; S64 purity laws). It
  is called where the rig already calls it; S166 changed nothing there.

## What the future K2 design slice must own (the contract sketch)

1. **Chain reduction** — mapping the rig's multi-segment limbs onto
   solver-ready chains (which joints collapse, which lengths are
   authoritative), deterministically derived from the rig doc, never
   hand-tuned per character.
2. **DLS (damped least squares)** — the solver beyond two bones, with
   the damping parameter as a MEASURED prior (provenance-pinned in the
   S163 Phase A style), not a magic constant.
3. **The authored-contact contract (the OT pattern)** — IK runs ONLY
   where the director AUTHORED a contact (a hand on a surface, a foot
   plant): the contact defines the target and the window; the solver
   serves the contact, never fights the pose. Free-space motion stays
   FK.
4. **Results written back as keyframes** — the solve is bake-only: the
   solver's output lands in the pose timeline as ordinary keyframes the
   same clock laws govern; no runtime solver in the frame path (the
   frame-truth purity laws hold).

## What must be true before the gate opens

- A file-level K2 design slice in the roadmap (PROPOSED-first, per the
  master roadmap's own law) with its acceptance pins named.
- The FK byte-identity law demonstrably extendable: baked IK keyframes
  for untouched docs must round-trip byte-identically (the same pin the
  pose schema v-next carries).

Recorded 2026-11-17, S166 landing day. The successor record flips this
from DEFERRED to DESIGNED only through a roadmap milestone, never
silently.
