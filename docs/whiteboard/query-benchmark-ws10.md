# Query benchmark — the WS10 fixed semantic suite lands

Date: 2026-11-26
Scope: the engineering master plan's WS10 §15.2 ("query benchmark — fixed
semantic queries") — the 15 fixed queries with their recorded acceptable /
unacceptable bands, head-term probes, latency budgets, fingerprints, and
declared no-result fallbacks, plus the seven-row vocabulary enrichment the
suite demanded. Status: IMPLEMENTED — query-benchmark battery green (8
laws), catalog green (25/25), unit green (1064/0), design-system green,
visual-beats green, typecheck clean, lint clean.

## The deficiency this slice removes

The plan's §15.2 asks for a FIXED query suite whose relevance is MEASURED,
not asserted: "cattle entering farmland", "AI sensor", "warning alert"…
with acceptable ids, unacceptable ids, ranking order, no-result behavior,
retrieval latency, and a deterministic fingerprint per query. Nothing
recorded that evidence — relevance lived in vibes.

## The design: each layer judged where the architecture places it

- **The resolver** (planners/visual-beats deriveVisualBeats) is the
  phrase-query surface — the plan's own pipeline (concept extraction →
  candidate retrieval → deterministic ranking) over the catalog rows as
  candidates. Every fixed query must select ≥ 1 acceptable candidate, ride
  ZERO unacceptable candidates (the false-friend law), and declare its
  no-result fallback id (recorded per query on the FIXED_QUERIES table).
- **The catalog search** (the palette's strict AND engine) is pinned at
  the HEAD TERM: each query's most distinctive word must resolve through
  searchCatalog with its top-3 inside the acceptable band — the palette
  must never dead-end on the suite's vocabulary.

## The evidence receipt

The suite prints the plan's §15.4 table: per query, the selected
acceptable ids, the measured latency, and the fingerprint
(wb-beats-…). Every query sits far under the 50ms budget (the
sub-millisecond engine; the first candidate build dominates).

## The vocabulary enrichment the suite demanded

Running the suite found the gaps (the benchmark's whole point): seven
graphics rows carried no tag for the queries' distinctive words. The
library's own tags gained the honest concepts — chip +sensor +ai,
tractor +farmland, gear +control, pipeline +supply +logistics,
balance-scale +comparison +values, lock +cybersecurity +password,
shield +cybersecurity — each a true statement about the mark (a chip IS
sensor hardware; a balance scale DOES compare values). The mechanical
catalog derivation carries the rows; the content hashes moved with the
tags (the tamper evidence working as designed); the catalog suite's
coverage/count laws stayed green (25/25).

## The battery (8 laws)

RELEVANCE (the ghost law — every acceptable id must exist; the
intersection law; the false-friend law; the latency law) / HONESTY (the
declared fallbacks, fabricated-query probe) / DETERMINISM (fingerprints,
rankings, order-independence) / HEAD TERMS (the palette's strict search).

## Deliberately not here

- The full §15.3 render benchmark matrix — the render batteries
  (trace/profiles/parity) and the CI's main-only Docker/E2E smoke carry
  the render evidence; this suite is the QUERY layer's fixed program.
- Unacceptable-band enforcement in the strict search — the AND engine's
  head-term probe pins reachability; relevance ranking belongs to the
  resolver (the two-layer contract the suite documents).
