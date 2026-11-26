// G1.5 + Phase C — the graphics ICON VOCABULARY (the audit's Priority 1,
// motion-graphics half): the planner's whole concept vocabulary, expanded
// from the 4-icon starter through 150 to 200 tagged icons across the
// production domains (people,
// education, agriculture, tools, technology, healthcare, business, finance,
// engineering, communication, cybersecurity, environment, transport,
// buildings, devices, warning and status symbols).
//
// THE ONE-SOURCE LAW (unchanged): this module is the ONLY icon table.
// planner.ts re-exports it (the legacy import path keeps working — the unit
// suite imports the library THROUGH planner), the LLM planner's catalog is
// exactly these ids, and `iconForScene` matches keywords against the
// per-icon tags. A second table anywhere is a defect.
//
// Geometry law: every icon lives on the 24-unit grid, 1–5 stroke paths,
// 2–6 commands per path (far under the 512-command iconPathCommandBudget
// wall). Paths render fill="none", round caps/joins (compose.ts's
// iconInner) and ride the dash-draw animation — so every path is ONE
// drawable stroke: no mid-path M, no multi-subpath paths. Circles are two
// half-arcs (adjacent segments share endpoints — legal, and one continuous
// stroke for the hand).
//
// Determinism law: the table is a frozen literal; same import → the same
// record, byte for byte. Pure data — no fs, no clock, no randomness.

export interface GraphicsIcon {
  paths: string[];
  tags: string[];
}

/** Two half-arcs = one clean circle stroke on the 24 grid. */
const circle = (cx: number, cy: number, r: number): string =>
  `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;

export const GRAPHICS_ICON_LIBRARY: Readonly<Record<string, GraphicsIcon>> = {
  // ------------------------------------------------------------------
  // The starter four (verbatim from the G1.4 scaffold — ids and tags
  // are contract: stored docs reference them).
  // ------------------------------------------------------------------
  check: { paths: ["M 3 13 L 9 19 L 21 5"], tags: ["check", "verify", "done", "proven"] },
  "arrow-up": { paths: ["M 12 21 L 12 5", "M 5 12 L 12 5 L 19 12"], tags: ["growth", "rise", "trend", "more"] },
  bolt: { paths: ["M 13 2 L 5 14 L 11 14 L 10 22 L 19 9 L 13 9 Z"], tags: ["fast", "energy", "power", "instant"] },
  xmark: { paths: ["M 5 5 L 19 19", "M 19 5 L 5 19"], tags: ["no", "wrong", "avoid", "myth"] },

  // ------------------------------------------------------------------
  // people
  // ------------------------------------------------------------------
  person: {
    paths: [circle(12, 6, 3.2), "M 5 21 C 5 14.9, 8.1 11.5, 12 11.5 C 15.9 11.5, 19 14.9, 19 21"],
    tags: ["person", "people", "human", "user", "someone", "individual"],
  },
  "person-group": {
    paths: [
      circle(9, 7, 2.8),
      "M 3 20 C 3 14.8, 5.8 12, 9 12 C 12.2 12, 15 14.8, 15 20",
      circle(16.5, 8.5, 2.4),
      "M 16 13 C 19 13.4, 21 16, 21 20",
    ],
    tags: ["team", "group", "people", "community", "together", "audience", "staff"],
  },
  crowd: {
    paths: [
      circle(5, 9, 2.2),
      circle(12, 7.5, 2.6),
      circle(19, 9, 2.2),
      "M 2 20 C 2 15.5, 3.6 13.5, 5 13.5 C 6.4 13.5, 7.6 15.2, 7.8 18",
      "M 8.6 20 C 8.6 14.6, 10.4 12.4, 12 12.4 C 13.6 12.4, 15.4 14.6, 15.4 20",
      "M 16.2 18 C 16.4 15.2, 17.6 13.5, 19 13.5 C 20.4 13.5, 22 15.5, 22 20",
    ],
    tags: ["crowd", "audience", "many", "society", "population", "public"],
  },
  farmer: {
    paths: [
      "M 5 9 L 12 5 L 19 9",
      "M 7 9 L 7 12 L 17 12 L 17 9",
      circle(12, 15.5, 2.6),
      "M 6 22 C 6 18.6, 8.6 16.4, 12 16.4 C 15.4 16.4, 18 18.6, 18 22",
    ],
    tags: ["farmer", "farm", "agriculture", "grower", "rural", "fields"],
  },
  doctor: {
    paths: [
      circle(12, 5.5, 3),
      "M 5 21 C 5 15, 8 12, 12 12 C 16 12, 19 15, 19 21",
      "M 10.5 16 L 13.5 16",
      "M 12 14.5 L 12 17.5",
    ],
    tags: ["doctor", "health", "medical", "care", "clinic", "physician", "treatment"],
  },
  worker: {
    paths: [
      "M 4.5 9.5 C 4.5 6, 8 4.5, 12 4.5 C 16 4.5, 19.5 6, 19.5 9.5",
      "M 4.5 9.5 L 19.5 9.5",
      circle(12, 14.5, 2.6),
      "M 6 22 C 6 18.6, 8.6 16.6, 12 16.6 C 15.4 16.6, 18 18.6, 18 22",
    ],
    tags: ["worker", "labor", "builder", "engineer", "crew", "construction", "safety"],
  },
  teacher: {
    paths: [
      circle(12, 6, 3),
      "M 5 21 C 5 15, 8 12, 12 12 C 16 12, 19 15, 19 21",
      "M 3 4 L 21 4",
      "M 8 4 L 8 2.5",
    ],
    tags: ["teacher", "education", "school", "lesson", "instructor", "class", "explain"],
  },
  speaker: {
    paths: [
      "M 5 4 L 5 20",
      circle(12, 12, 3),
      "M 17 8 C 19 10, 19 14, 17 16",
      "M 19.5 5.5 C 22.5 9, 22.5 15, 19.5 18.5",
    ],
    tags: ["speaker", "talk", "present", "voice", "announce", "podcast", "sound"],
  },
  handshake: {
    paths: [
      "M 2 12 L 6 8 L 10 11",
      "M 22 12 L 18 8 L 14 11",
      "M 10 11 L 13 14 C 13.8 14.8, 13.8 16, 12.8 16.6 C 12 17.1, 11 16.9, 10.4 16.2 L 7 12.5",
      "M 13 14 L 15.5 11.5",
    ],
    tags: ["handshake", "deal", "agreement", "partnership", "trust", "meeting", "welcome"],
  },
  "thumbs-up": {
    paths: [
      "M 7 11 L 7 21",
      "M 7 21 L 18 21 C 19.5 21, 20.5 20, 20.7 18.6 L 21.6 13.6 C 21.8 12.2, 20.8 11, 19.4 11 L 14 11 L 14.8 6.6 C 15 5.2, 14 4, 12.7 4 C 12 4, 11.5 4.4, 11.2 5 L 7 11",
      "M 3 11 L 7 11 L 7 21 L 3 21 Z",
    ],
    tags: ["thumbs-up", "like", "approve", "good", "yes", "positive", "recommend"],
  },
  waving: {
    paths: [
      "M 7 12 C 7 8, 9 3.5, 11 3.5 C 12.5 3.5, 12.5 6, 12 9",
      "M 12 9 C 12 6, 13 3, 15 3 C 16.6 3, 16.5 6.5, 15.5 10",
      "M 15.5 10 C 16 7.5, 17.5 5.5, 19 6.2 C 20.5 7, 19.5 11, 18 14.5 C 16.6 18, 13.5 21, 10.5 21 C 7 21, 4.5 17.5, 4.5 13.5",
    ],
    tags: ["waving", "hello", "greeting", "welcome", "bye", "friendly"],
  },
  runner: {
    paths: [
      circle(14.5, 4.5, 2.2),
      "M 12.5 8 L 9 12 L 12 15 L 10 21",
      "M 12.5 8 L 16.5 10 L 19 14",
      "M 9 12 L 5 14 L 3 12",
      "M 12 15 L 16.5 18 L 21 18",
    ],
    tags: ["runner", "run", "fast", "sport", "fitness", "sprint", "active", "moving"],
  },

  // ------------------------------------------------------------------
  // education
  // ------------------------------------------------------------------
  book: {
    paths: [
      "M 4 5 C 7 3.5, 10 3.5, 12 5 C 14 3.5, 17 3.5, 20 5 L 20 19 C 17 17.5, 14 17.5, 12 19 C 10 17.5, 7 17.5, 4 19 Z",
      "M 12 5 L 12 19",
    ],
    tags: ["book", "read", "knowledge", "study", "learn", "textbook"],
  },
  "book-open": {
    paths: [
      "M 12 6 C 9.5 4, 5.5 4, 3 5.5 L 3 19 C 5.5 17.5, 9.5 17.5, 12 19.5",
      "M 12 6 C 14.5 4, 18.5 4, 21 5.5 L 21 19 C 18.5 17.5, 14.5 17.5, 12 19.5",
      "M 12 6 L 12 19.5",
    ],
    tags: ["reading", "open-book", "literature", "lesson", "story", "study"],
  },
  "graduation-cap": {
    paths: ["M 12 4 L 22 9 L 12 14 L 2 9 Z", "M 6 11.5 L 6 16 C 6 18, 9 19.5, 12 19.5 C 15 19.5, 18 18, 18 16 L 18 11.5", "M 22 9 L 22 14"],
    tags: ["graduation", "degree", "school", "student", "learn", "education", "achieve"],
  },
  pencil: {
    paths: ["M 4 20 L 5.5 15.5 L 16 5 C 17 4, 18.6 4, 19.6 5 C 20.6 6, 20.6 7.6, 19.6 8.6 L 9 19 L 4 20 Z", "M 14.5 6.5 L 17.5 9.5"],
    tags: ["pencil", "write", "edit", "draw", "note", "author", "draft"],
  },
  notebook: {
    paths: [
      "M 5 3 L 19 3 L 19 21 L 5 21 Z",
      "M 8 3 L 8 21",
      "M 11 7 L 17 7",
      "M 11 11 L 17 11",
      "M 11 15 L 15 15",
    ],
    tags: ["notebook", "notes", "journal", "record", "log", "planning"],
  },
  backpack: {
    paths: [
      "M 5 10 C 5 6, 8 3, 12 3 C 16 3, 19 6, 19 10 L 19 20 C 19 21, 18 22, 17 22 L 7 22 C 6 22, 5 21, 5 20 Z",
      "M 9 10 L 15 10",
      "M 5 14 L 19 14",
    ],
    tags: ["backpack", "school", "student", "bag", "travel", "carry"],
  },
  microscope: {
    paths: [
      "M 8 21 L 18 21",
      "M 10 21 C 10 16, 11 14, 13.5 11.5",
      "M 10.5 4.5 L 16 10 L 13.5 12.5 L 8 7 Z",
      "M 6 12 C 5 15, 7 18.5, 10.5 19.5",
      "M 4 21 L 8 21",
    ],
    tags: ["microscope", "science", "research", "lab", "biology", "discover", "analysis"],
  },
  flask: {
    paths: [
      "M 9 3 L 9 9 L 4 19 C 3.2 20.7, 4.4 22, 6 22 L 18 22 C 19.6 22, 20.8 20.7, 20 19 L 15 9 L 15 3",
      "M 8 3 L 16 3",
      "M 7 15 L 17 15",
    ],
    tags: ["flask", "chemistry", "experiment", "science", "lab", "test", "research"],
  },
  atom: {
    paths: [
      circle(12, 12, 2),
      "M 12 10 C 7 6.5, 3 8, 4.5 11 C 5.6 13.2, 9.5 13.8, 12 14 C 9.5 14.2, 5.6 14.8, 4.5 17 C 3 20, 7 21.5, 12 18",
      "M 12 10 C 17 6.5, 21 8, 19.5 11 C 18.4 13.2, 14.5 13.8, 12 14 C 14.5 14.2, 18.4 14.8, 19.5 17 C 21 20, 17 21.5, 12 18",
    ],
    tags: ["atom", "physics", "science", "nuclear", "particle", "energy"],
  },
  calculator: {
    paths: [
      "M 5 2 L 19 2 L 19 22 L 5 22 Z",
      "M 8 5 L 16 5 L 16 8 L 8 8 Z",
      "M 8 12 L 8 12.01",
      "M 12 12 L 12 12.01",
      "M 16 12 L 16 12.01",
      "M 8 16 L 8 16.01",
      "M 12 16 L 12 16.01",
      "M 16 16 L 16 19",
      "M 8 19 L 8 19.01",
      "M 12 19 L 12 19.01",
    ],
    tags: ["calculator", "math", "count", "arithmetic", "numbers", "finance", "sum"],
  },
  blackboard: {
    paths: [
      "M 3 4 L 21 4 L 21 17 L 3 17 Z",
      "M 6 8 L 13 8",
      "M 6 11 L 16 11",
      "M 6 14 L 11 14",
      "M 12 21 L 12 17",
      "M 8 21 L 16 21",
    ],
    tags: ["blackboard", "chalkboard", "teaching", "classroom", "school", "lesson"],
  },
  diploma: {
    paths: [
      "M 4 4 L 20 4 L 20 16 L 4 16 Z",
      "M 7 8 L 17 8",
      "M 7 11 L 13 11",
      circle(16, 19, 2.2),
      "M 14.6 20.8 L 14 23 L 16 22 L 18 23 L 17.4 20.8",
    ],
    tags: ["diploma", "certificate", "award", "graduate", "credential", "qualification"],
  },

  // ------------------------------------------------------------------
  // agriculture
  // ------------------------------------------------------------------
  seedling: {
    paths: [
      "M 12 21 L 12 12",
      "M 12 12 C 12 8, 9 5, 4.5 5 C 4.5 9.5, 8 12, 12 12 Z",
      "M 12 12 C 12 9.5, 14.5 7.5, 19 7.5 C 19 11, 16 12.8, 12 12.5",
    ],
    tags: ["seedling", "sprout", "grow", "plant", "agriculture", "new", "begin", "eco"],
  },
  plant: {
    paths: [
      "M 6 21 C 6 17, 8 14, 12 13 C 16 14, 18 17, 18 21 Z",
      "M 12 13 L 12 9",
      "M 12 9 C 12 6, 10 4, 7 4 C 7 7, 9 9, 12 9 Z",
      "M 12 9 C 12 6.5, 14 4.5, 17 4.5 C 17 7.5, 15 9.2, 12 9 Z",
    ],
    tags: ["plant", "pot", "grow", "garden", "nature", "care", "eco"],
  },
  leaf: {
    paths: ["M 20 4 C 10 4, 4 10, 4 18 C 4 19.5, 4.5 20, 6 20 C 14 20, 20 14, 20 4 Z", "M 6 19 C 9 14, 13 9.5, 18 6"],
    tags: ["leaf", "nature", "eco", "green", "environment", "plant", "organic"],
  },
  tree: {
    paths: [circle(12, 9, 6), "M 12 21 L 12 13", "M 12 17 L 8.5 14.5", "M 12 15 L 15.5 12.5"],
    tags: ["tree", "forest", "nature", "wood", "environment", "park", "eco"],
  },
  wheat: {
    paths: [
      "M 12 22 L 12 8",
      "M 12 8 C 12 5, 10 3, 7.5 2.5 C 7.5 5.5, 9 7.8, 12 8 Z",
      "M 12 8 C 12 5, 14 3, 16.5 2.5 C 16.5 5.5, 15 7.8, 12 8 Z",
      "M 12 13 C 12 10.8, 10.4 9.4, 8.2 9 C 8.2 11.2, 9.8 12.8, 12 13 Z",
      "M 12 13 C 12 10.8, 13.6 9.4, 15.8 9 C 15.8 11.2, 14.2 12.8, 12 13 Z",
      "M 12 18 C 12 15.8, 10.4 14.4, 8.2 14 C 8.2 16.2, 9.8 17.8, 12 18 Z",
      "M 12 18 C 12 15.8, 13.6 14.4, 15.8 14 C 15.8 16.2, 14.2 17.8, 12 18 Z",
    ],
    tags: ["wheat", "grain", "crop", "harvest", "farm", "agriculture", "food"],
  },
  tractor: {
    paths: [
      "M 3 16 L 3 11 L 10 11 L 13 6 L 17 6 L 17 11 L 21 11",
      circle(7, 17, 3.2),
      circle(17.5, 18, 2.4),
      "M 10.2 17 L 15.1 18",
      "M 3 16 L 3.8 17",
    ],
    tags: ["tractor", "farm", "agriculture", "machinery", "field", "equipment", "rural"],
  },
  cow: {
    paths: [
      "M 5 4 C 5 7, 6.5 8.5, 8.5 8.5",
      "M 19 4 C 19 7, 17.5 8.5, 15.5 8.5",
      "M 8.5 5.5 C 9.5 4.5, 14.5 4.5, 15.5 5.5 C 16.5 7, 16 9.5, 14.5 11 L 9.5 11 C 8 9.5, 7.5 7, 8.5 5.5 Z",
      circle(9.7, 7.5, 0.4),
      circle(14.3, 7.5, 0.4),
      "M 12 11 L 12 19",
      "M 9 19 L 12 16 L 15 19",
    ],
    tags: ["cow", "cattle", "livestock", "farm", "dairy", "milk", "agriculture", "animal"],
  },
  chicken: {
    paths: [
      circle(11, 12, 6),
      circle(8.5, 10.5, 0.4),
      "M 5 9 C 4 8, 4 6, 5.5 5",
      "M 4.8 12.5 L 2.5 12.5",
      "M 11 18 L 11 21",
      "M 8 18 C 6 19, 5 21, 5.5 22",
    ],
    tags: ["chicken", "poultry", "farm", "bird", "livestock", "agriculture", "egg"],
  },
  "water-drop": {
    paths: ["M 12 3 C 12 3, 5.5 10.5, 5.5 15 C 5.5 18.6, 8.4 21.5, 12 21.5 C 15.6 21.5, 18.5 18.6, 18.5 15 C 18.5 10.5, 12 3, 12 3 Z", "M 9 15 C 9 16.8, 10.2 18.2, 12 18.5"],
    tags: ["water", "drop", "irrigation", "rain", "liquid", "hydrate", "resources"],
  },
  sun: {
    paths: [
      circle(12, 12, 4.5),
      "M 12 3 L 12 5",
      "M 12 19 L 12 21",
      "M 3 12 L 5 12",
      "M 19 12 L 21 12",
      "M 5.6 5.6 L 7 7",
      "M 17 17 L 18.4 18.4",
      "M 5.6 18.4 L 7 17",
      "M 17 7 L 18.4 5.6",
    ],
    tags: ["sun", "sunny", "day", "light", "solar", "weather", "bright", "energy"],
  },
  "rain-cloud": {
    paths: [
      "M 7 15 C 4.5 15, 3 13.3, 3 11 C 3 9, 4.4 7.6, 6.3 7.3 C 6.8 4.8, 9 3, 11.7 3 C 14.6 3, 17 5.1, 17.4 8 C 19.5 8.2, 21 9.7, 21 11.5 C 21 13.4, 19.5 15, 17.3 15 Z",
      "M 8 18 L 7 20.5",
      "M 12 18 L 11 20.5",
      "M 16 18 L 15 20.5",
    ],
    tags: ["rain", "cloud", "weather", "storm", "water", "forecast", "climate"],
  },
  greenhouse: {
    paths: [
      "M 3 21 L 3 11 L 12 3 L 21 11 L 21 21 Z",
      "M 9 21 L 9 14 L 15 14 L 15 21",
      "M 3 11 L 21 11",
    ],
    tags: ["greenhouse", "farm", "garden", "nursery", "agriculture", "plants", "grow"],
  },

  // ------------------------------------------------------------------
  // tools
  // ------------------------------------------------------------------
  wrench: {
    paths: [
      "M 14.5 6.5 C 14.5 4, 16.5 2.2, 19 2.4 L 16.8 4.6 C 16.4 5, 16.4 5.6, 16.8 6 L 18 7.2 C 18.4 7.6, 19 7.6, 19.4 7.2 L 21.6 5 C 21.8 7.5, 20 9.5, 17.5 9.5 C 16.9 9.5, 16.4 9.4, 15.9 9.2 L 6.5 18.6 C 5.4 19.7, 3.6 19.7, 2.5 18.6 C 1.4 17.5, 1.4 15.7, 2.5 14.6 L 11.9 5.2 C 11.6 4.7, 11.5 4.1, 11.5 3.5 Z",
    ],
    tags: ["wrench", "tool", "fix", "repair", "maintenance", "settings", "build"],
  },
  hammer: {
    paths: [
      "M 3 21 L 12 12",
      "M 9 8.5 L 15.5 2 L 21 7.5 L 19 9.5 C 17 11.5, 15 11, 13.5 9.5 L 12 8 L 9 8.5 Z",
      "M 15.5 2 L 21 7.5",
    ],
    tags: ["hammer", "tool", "build", "construction", "fix", "work", "strike"],
  },
  screwdriver: {
    paths: ["M 14 3 L 21 10", "M 16.5 1.5 C 17.5 0.5, 19.5 0.5, 20.5 1.5 C 21.5 2.5, 21.5 4.5, 20.5 5.5 L 17 9 L 15 7 Z", "M 14 10 L 10 14", "M 4 20 L 8 16 L 10 18 L 6 22 C 5 22.5, 3.5 22.5, 3 22 C 2.5 21.5, 3.5 21, 4 20 Z"],
    tags: ["screwdriver", "tool", "repair", "fix", "assemble", "adjust", "maintenance"],
  },
  gear: {
    paths: [
      circle(12, 12, 3),
      "M 12 2 L 13.5 5 L 10.5 5 Z",
      "M 12 22 L 10.5 19 L 13.5 19 Z",
      "M 2 12 L 5 10.5 L 5 13.5 Z",
      "M 22 12 L 19 13.5 L 19 10.5 Z",
      "M 4.9 4.9 L 8.3 6.6 L 6.6 8.3 Z",
      "M 19.1 19.1 L 15.7 17.4 L 17.4 15.7 Z",
      "M 4.9 19.1 L 6.6 15.7 L 8.3 17.4 Z",
      "M 19.1 4.9 L 17.4 8.3 L 15.7 6.6 Z",
    ],
    tags: ["gear", "settings", "machine", "process", "system", "configuration", "engine"],
  },
  robot: {
    paths: [
      "M 5 8 L 19 8 C 20 8, 21 9, 21 10 L 21 17 C 21 18, 20 19, 19 19 L 5 19 C 4 19, 3 18, 3 17 L 3 10 C 3 9, 4 8, 5 8 Z",
      circle(9, 13, 1.2),
      circle(15, 13, 1.2),
      "M 10 16 L 14 16",
      "M 12 8 L 12 4",
      circle(12, 3, 1),
      "M 3 13 L 1.5 13",
      "M 21 13 L 22.5 13",
    ],
    tags: ["robot", "automation", "ai", "machine", "technology", "bot", "assistant"],
  },
  chip: {
    paths: [
      "M 7 7 L 17 7 L 17 17 L 7 17 Z",
      "M 10 10 L 14 10 L 14 14 L 10 14 Z",
      "M 9 7 L 9 3",
      "M 12 7 L 12 3",
      "M 15 7 L 15 3",
      "M 9 21 L 9 17",
      "M 12 21 L 12 17",
      "M 15 21 L 15 17",
      "M 7 9 L 3 9",
      "M 7 12 L 3 12",
      "M 7 15 L 3 15",
      "M 21 9 L 17 9",
      "M 21 12 L 17 12",
      "M 21 15 L 17 15",
    ],
    tags: ["chip", "processor", "computer", "hardware", "cpu", "technology", "semiconductor"],
  },
  laptop: {
    paths: ["M 4 5 L 20 5 L 20 16 L 4 16 Z", "M 2 19 L 22 19 L 20 16 L 4 16 Z"],
    tags: ["laptop", "computer", "work", "device", "technology", "office", "coding"],
  },
  camera: {
    paths: [
      "M 3 8 L 8 8 L 10 5 L 14 5 L 16 8 L 21 8 L 21 19 L 3 19 Z",
      circle(12, 13.5, 3.5),
    ],
    tags: ["camera", "photo", "picture", "image", "media", "photography", "capture"],
  },
  code: {
    paths: ["M 8 6 L 2 12 L 8 18", "M 16 6 L 22 12 L 16 18", "M 13.5 4 L 10.5 20"],
    tags: ["code", "programming", "developer", "software", "syntax", "engineer", "script"],
  },
  database: {
    paths: [
      "M 12 3 C 7 3, 3 4.3, 3 6 C 3 7.7, 7 9, 12 9 C 17 9, 21 7.7, 21 6 C 21 4.3, 17 3, 12 3 Z",
      "M 3 6 L 3 18 C 3 19.7, 7 21, 12 21 C 17 21, 21 19.7, 21 18 L 21 6",
      "M 3 12 C 3 13.7, 7 15, 12 15 C 17 15, 21 13.7, 21 12",
    ],
    tags: ["database", "data", "storage", "records", "server", "information", "archive"],
  },
  server: {
    paths: [
      "M 4 3 L 20 3 C 21 3, 22 4, 22 5 L 22 9 C 22 10, 21 11, 20 11 L 4 11 C 3 11, 2 10, 2 9 L 2 5 C 2 4, 3 3, 4 3 Z",
      "M 4 13 L 20 13 C 21 13, 22 14, 22 15 L 22 19 C 22 20, 21 21, 20 21 L 4 21 C 3 21, 2 20, 2 19 L 2 15 C 2 14, 3 13, 4 13 Z",
      "M 6 7 L 6.01 7",
      "M 6 17 L 6.01 17",
      "M 10 7 L 14 7",
      "M 10 17 L 14 17",
    ],
    tags: ["server", "hosting", "infrastructure", "cloud", "datacenter", "network", "compute"],
  },
  cloud: {
    paths: ["M 7 18 C 4.5 18, 3 16.3, 3 14 C 3 12, 4.4 10.6, 6.3 10.3 C 6.8 7.8, 9 6, 11.7 6 C 14.6 6, 17 8.1, 17.4 11 C 19.5 11.2, 21 12.7, 21 14.5 C 21 16.4, 19.5 18, 17.3 18 Z"],
    tags: ["cloud", "saas", "online", "internet", "storage", "remote", "hosting"],
  },
  wifi: {
    paths: [
      "M 2.5 9 C 8 4, 16 4, 21.5 9",
      "M 5.5 12.5 C 9.5 9, 14.5 9, 18.5 12.5",
      "M 8.5 16 C 10.5 14.3, 13.5 14.3, 15.5 16",
      circle(12, 19.5, 0.8),
    ],
    tags: ["wifi", "wireless", "signal", "connect", "internet", "network", "online"],
  },
  "signal-tower": {
    paths: [
      "M 12 9 L 8 22",
      "M 12 9 L 16 22",
      "M 9.5 17 L 14.5 17",
      circle(12, 6, 1.5),
      "M 8.5 3.5 C 6 4.5, 4.5 6.5, 4.5 8.5",
      "M 15.5 3.5 C 18 4.5, 19.5 6.5, 19.5 8.5",
    ],
    tags: ["signal", "tower", "broadcast", "antenna", "communication", "transmit", "telecom"],
  },
  battery: {
    paths: ["M 3 8 L 19 8 C 20 8, 21 9, 21 10 L 21 14 C 21 15, 20 16, 19 16 L 3 16 C 2 16, 1 15, 1 14 L 1 10 C 1 9, 2 8, 3 8 Z", "M 22 10 L 22 14", "M 4 11 L 9 11", "M 6.5 8.5 L 6.5 15.5"],
    tags: ["battery", "power", "charge", "energy", "level", "capacity", "electric"],
  },
  plug: {
    paths: [
      "M 9 3 L 9 8",
      "M 15 3 L 15 8",
      "M 7 8 L 17 8 L 17 12 C 17 14.8, 14.8 17, 12 17 C 9.2 17, 7 14.8, 7 12 Z",
      "M 12 17 L 12 22",
    ],
    tags: ["plug", "power", "electric", "connect", "energy", "charge", "outlet"],
  },
  terminal: {
    paths: ["M 3 4 L 21 4 L 21 20 L 3 20 Z", "M 7 9 L 10 12 L 7 15", "M 12 15 L 16 15"],
    tags: ["terminal", "console", "command", "shell", "dev", "programming", "script"],
  },

  // ------------------------------------------------------------------
  // healthcare
  // ------------------------------------------------------------------
  "heart-pulse": {
    paths: ["M 12 20.5 C 6 16, 2.5 12, 2.5 8.5 C 2.5 5.5, 5 3, 8 3 C 9.7 3, 11.2 4, 12 5.5 C 12.8 4, 14.3 3, 16 3 C 19 3, 21.5 5.5, 21.5 8.5 C 21.5 12, 18 16, 12 20.5 Z", "M 4 11 L 9 11 L 10.5 8.5 L 13 14 L 15 11 L 20 11"],
    tags: ["heart", "pulse", "health", "cardio", "medical", "vitals", "heartbeat", "fitness"],
  },
  stethoscope: {
    paths: [
      "M 5 3 L 5 8 C 5 11, 7 13, 9.5 13 C 12 13, 14 11, 14 8 L 14 3",
      "M 3.5 3 L 6.5 3",
      "M 12.5 3 L 15.5 3",
      "M 9.5 13 L 9.5 16 C 9.5 19, 12 21, 14.5 21 C 17 21, 19 19.5, 19 17",
      circle(19, 15.5, 1.8),
    ],
    tags: ["stethoscope", "doctor", "medical", "health", "diagnosis", "checkup", "clinic"],
  },
  pill: {
    paths: ["M 8.5 3.5 C 11.5 0.9, 16.2 1.2, 18.8 3.8 C 21.4 6.4, 21.7 11.1, 19.1 14.1 C 16.5 17.1, 11.9 17.4, 8.9 14.4 C 5.9 11.4, 5.9 6.1, 8.5 3.5 Z", "M 6.5 13.5 L 13.5 6.5"],
    tags: ["pill", "medicine", "medication", "drug", "tablet", "health", "dose", "pharmacy"],
  },
  "hospital-cross": {
    paths: [
      "M 4 21 L 4 8 L 12 3 L 20 8 L 20 21 Z",
      "M 10 10 L 14 10 L 14 12.5 L 16.5 12.5 L 16.5 16.5 L 14 16.5 L 14 19 L 10 19 L 10 16.5 L 7.5 16.5 L 7.5 12.5 L 10 12.5 Z",
    ],
    tags: ["hospital", "clinic", "medical", "emergency", "health", "care", "first-aid"],
  },
  bandage: {
    paths: ["M 3.9 12 C 3.9 7.5, 7.5 3.9, 12 3.9 C 16.5 3.9, 20.1 7.5, 20.1 12 C 20.1 16.5, 16.5 20.1, 12 20.1 C 7.5 20.1, 3.9 16.5, 3.9 12 Z", "M 8.9 15.1 L 15.1 8.9", "M 9.5 9.5 L 9.51 9.5", "M 14.5 14.5 L 14.51 14.5", "M 12 8.2 L 12.01 8.2", "M 12 15.8 L 12.01 15.8"],
    tags: ["bandage", "first-aid", "injury", "heal", "wound", "medical", "care", "recover"],
  },
  syringe: {
    paths: ["M 21 3 L 16 8", "M 18 5 L 6 17 L 4 20 L 7 18 L 19 6 Z", "M 9 10 L 12 13", "M 6.5 12.5 L 9.5 15.5", "M 3 21 L 4.5 19.5"],
    tags: ["syringe", "injection", "vaccine", "shot", "medical", "immunization", "dose"],
  },
  dna: {
    paths: ["M 8 3 C 8 9, 16 15, 16 21", "M 16 3 C 16 9, 8 15, 8 21", "M 9.5 6 L 14.5 6", "M 10.8 9.5 L 13.2 9.5", "M 9.5 18 L 14.5 18", "M 10.8 14.5 L 13.2 14.5"],
    tags: ["dna", "genetics", "biology", "science", "gene", "heredity", "research", "biotech"],
  },
  brain: {
    paths: [
      "M 12 4 C 10.5 2.8, 8 3, 7 5 C 4.5 5.5, 3.5 8, 4.5 10 C 3 11.5, 3 14, 4.5 15.5 C 4 18, 6 20, 8.5 19.5 C 9.5 21.5, 12 21.8, 12 20 Z",
      "M 12 4 C 13.5 2.8, 16 3, 17 5 C 19.5 5.5, 20.5 8, 19.5 10 C 21 11.5, 21 14, 19.5 15.5 C 20 18, 18 20, 15.5 19.5 C 14.5 21.5, 12 21.8, 12 20 Z",
      "M 12 4 L 12 20",
    ],
    tags: ["brain", "mind", "thinking", "idea", "psychology", "smart", "memory", "neuro"],
  },
  tooth: {
    paths: ["M 12 3 C 9 3, 7 5, 7 8 C 7 10, 7.5 11.5, 8 13.5 C 8.6 16, 8.5 19, 9.5 21 C 10.3 22, 11.2 21.5, 11.5 20 C 11.9 18, 12 16, 12 16 C 12 16, 12.1 18, 12.5 20 C 12.8 21.5, 13.7 22, 14.5 21 C 15.5 19, 15.4 16, 16 13.5 C 16.5 11.5, 17 10, 17 8 C 17 5, 15 3, 12 3 Z"],
    tags: ["tooth", "dental", "dentist", "teeth", "oral", "health", "smile"],
  },
  eye: {
    paths: ["M 2 12 C 5 7, 8.5 5, 12 5 C 15.5 5, 19 7, 22 12 C 19 17, 15.5 19, 12 19 C 8.5 19, 5 17, 2 12 Z", circle(12, 12, 3)],
    tags: ["eye", "vision", "see", "watch", "view", "observe", "inspect", "visual"],
  },
  thermometer: {
    paths: [
      "M 12 4 C 10.9 4, 10 4.9, 10 6 L 10 13.5 C 8.8 14.2, 8 15.5, 8 17 C 8 19.2, 9.8 21, 12 21 C 14.2 21, 16 19.2, 16 17 C 16 15.5, 15.2 14.2, 14 13.5 L 14 6 C 14 4.9, 13.1 4, 12 4 Z",
      "M 12 12 L 12 17",
      "M 16 6 L 18 6",
      "M 16 9 L 17.5 9",
    ],
    tags: ["thermometer", "temperature", "fever", "weather", "measure", "medical", "heat"],
  },

  // ------------------------------------------------------------------
  // business and finance
  // ------------------------------------------------------------------
  briefcase: {
    paths: [
      "M 3 8 L 21 8 C 22 8, 22 9, 22 10 L 22 18 C 22 19, 21 20, 20 20 L 4 20 C 3 20, 2 19, 2 18 L 2 10 C 2 9, 3 8, 4 8 Z",
      "M 9 8 L 9 5 C 9 4, 10 3, 11 3 L 13 3 C 14 3, 15 4, 15 5 L 15 8",
      "M 2 13 L 22 13",
      "M 11 12 L 13 12 L 13 14 L 11 14 Z",
    ],
    tags: ["briefcase", "business", "work", "job", "career", "office", "professional"],
  },
  "chart-up": {
    paths: ["M 3 3 L 21 3 L 21 21 L 3 21 Z", "M 6 16 L 10 11 L 13 14 L 18 6", "M 18 6 L 18 10", "M 18 6 L 14 6"],
    tags: ["chart-up", "growth", "profit", "rise", "success", "trend", "revenue", "improve"],
  },
  "chart-down": {
    paths: ["M 3 3 L 21 3 L 21 21 L 3 21 Z", "M 6 7 L 10 12 L 13 9 L 18 17", "M 18 17 L 18 13", "M 18 17 L 14 17"],
    tags: ["chart-down", "decline", "loss", "drop", "fail", "decrease", "risk", "fall"],
  },
  coins: {
    paths: [
      circle(9, 8.5, 5),
      "M 14 9.5 C 17 9.9, 19 11.4, 19 13 C 19 14.9, 16.3 16.3, 12.8 16.3 C 9.3 16.3, 6.6 14.9, 6.6 13 C 6.6 12.6, 6.8 12.2, 7.1 11.9",
      "M 19 13 L 19 17 C 19 18.9, 16.3 20.3, 12.8 20.3 C 9.3 20.3, 6.6 18.9, 6.6 17 L 6.6 13",
    ],
    tags: ["coins", "money", "cash", "savings", "wealth", "budget", "finance", "cost"],
  },
  wallet: {
    paths: ["M 3 6 C 3 5, 4 4, 5 4 L 18 4 L 18 8", "M 3 6 L 3 18 C 3 19, 4 20, 5 20 L 20 20 C 21 20, 21.5 19.4, 21.5 18.5 L 21.5 9.5 C 21.5 8.6, 21 8, 20 8 L 5 8 C 4 8, 3 7, 3 6 Z", circle(17, 14, 1.2)],
    tags: ["wallet", "money", "payment", "purchase", "finance", "spend", "budget"],
  },
  bank: {
    paths: ["M 3 9 L 12 3 L 21 9", "M 4 9 L 4 18", "M 8 9 L 8 18", "M 12 9 L 12 18", "M 16 9 L 16 18", "M 20 9 L 20 18", "M 2 18 L 22 18", "M 2 21 L 22 21"],
    tags: ["bank", "finance", "institution", "loan", "savings", "money", "account"],
  },
  invoice: {
    paths: ["M 5 2 L 19 2 L 19 22 L 16 20 L 13.7 22 L 11.4 20 L 9 22 L 6.7 20 L 5 22 Z", "M 9 7 L 15 7", "M 9 11 L 15 11", "M 9 15 L 12 15"],
    tags: ["invoice", "billing", "receipt", "payment", "document", "order", "accounting"],
  },
  target: {
    paths: [circle(12, 12, 9), circle(12, 12, 5), circle(12, 12, 1.2)],
    tags: ["target", "goal", "aim", "focus", "objective", "bullseye", "precision", "plan"],
  },
  "pie-chart": {
    paths: ["M 21 12 A 9 9 0 1 1 12 3 L 12 12 Z", "M 12 3 L 12 12 L 21 12 A 9 9 0 0 0 14.7 4.1"],
    tags: ["pie-chart", "share", "percent", "distribution", "data", "proportion", "stats"],
  },
  "balance-scale": {
    paths: ["M 12 3 L 12 21", "M 8 21 L 16 21", "M 4 7 L 20 7", "M 12 3 L 12 7", "M 4 7 L 2 12 C 2 13.7, 3.3 15, 5 15 C 6.7 15, 8 13.7, 8 12 L 6 7", "M 20 7 L 18 12 C 18 13.7, 19.3 15, 21 15 C 22.7 15, 24 13.7, 24 12 L 22 7"],
    tags: ["balance", "compare", "fair", "justice", "equal", "weigh", "decision", "law"],
  },
  contract: {
    paths: ["M 6 2 L 18 2 C 19 2, 20 3, 20 4 L 20 16 L 15 21 L 4 21 C 3 21, 3 20, 3 19 L 3 4 C 3 3, 4 2, 5 2 Z", "M 20 16 L 15 16 L 15 21", "M 7 7 L 14 7", "M 7 11 L 12 11"],
    tags: ["contract", "agreement", "document", "sign", "legal", "terms", "deal"],
  },
  dollar: {
    paths: ["M 16 7 C 16 5, 14.2 4, 12 4 C 9.8 4, 8 5.3, 8 7.5 C 8 10, 11 10.6, 12 11 C 13 11.4, 16 12, 16 14.5 C 16 16.7, 14.2 18, 12 18 C 9.8 18, 8 17, 8 15", "M 12 2 L 12 4", "M 12 18 L 12 22"],
    tags: ["dollar", "money", "price", "cost", "revenue", "usd", "cash", "finance", "paid"],
  },
  "piggy-bank": {
    paths: [
      "M 7 9 C 7 5.7, 9.4 3.5, 13 3.5 C 16.6 3.5, 19 5.7, 19 9 C 19 10.2, 18.7 11.2, 18.2 12 L 20 14 L 20 17 L 18 17 L 17.5 19 L 8.5 19 L 8 17 L 6.8 16.5 C 6 15.5, 5 14.3, 5 12.5",
      "M 5 12.5 C 3.8 12.3, 3 11.4, 3 10.5 C 3 9.8, 3.5 9.2, 4.3 9 C 5 8.8, 6 9, 6.5 9.3",
      circle(15.5, 9, 0.5),
      "M 10 3.9 C 11 3.2, 12.5 3, 13.6 3.2",
      "M 10.5 19 L 10.5 21.5",
      "M 15 19 L 15 21.5",
    ],
    tags: ["piggy-bank", "savings", "save", "budget", "money", "thrift", "fund"],
  },

  // ------------------------------------------------------------------
  // engineering
  // ------------------------------------------------------------------
  blueprint: {
    paths: ["M 3 3 L 21 3 L 21 21 L 3 21 Z", "M 3 8 L 21 8", "M 8 8 L 8 21", "M 12 12 L 17 12 L 17 17 L 12 17 Z", "M 8 13 L 8 16", "M 8 16 L 12 16"],
    tags: ["blueprint", "design", "plan", "architecture", "engineering", "draft", "schema"],
  },
  ruler: {
    paths: ["M 2 9 L 22 9 L 22 15 L 2 15 Z", "M 6 9 L 6 12", "M 10 9 L 10 13", "M 14 9 L 14 12", "M 18 9 L 18 13"],
    tags: ["ruler", "measure", "length", "size", "dimension", "precision", "scale"],
  },
  crane: {
    paths: ["M 4 21 L 4 4 L 18 4", "M 4 4 L 14 10", "M 14 10 L 14 14", "M 12 14 L 16 14 L 16 18 L 12 18 Z", "M 14 4 L 14 7", "M 2 21 L 6 21"],
    tags: ["crane", "construction", "build", "hoist", "lift", "site", "engineering"],
  },
  factory: {
    paths: ["M 3 21 L 3 10 L 8 13 L 8 10 L 13 13 L 13 10 L 18 13 L 18 6 L 21 6 L 21 21 Z", "M 6 17 L 8 17", "M 11 17 L 13 17", "M 16 17 L 18 17", "M 19 6 L 19 3 L 20.5 3"],
    tags: ["factory", "industry", "manufacturing", "production", "plant", "workshop", "plant"],
  },
  pipeline: {
    paths: ["M 3 8 L 10 8 C 12 8, 12 6, 14 6 L 21 6", "M 3 16 L 10 16 C 12 16, 12 18, 14 18 L 21 18", "M 10 5 L 10 11", "M 17 6 L 17 3", "M 17 18 L 17 21", "M 21 4 L 21 8", "M 21 16 L 21 20"],
    tags: ["pipeline", "flow", "process", "sequence", "steps", "transport", "engineering", "ci"],
  },
  "robot-arm": {
    paths: [
      "M 4 21 L 8 21",
      "M 6 21 L 6 15",
      "M 6 15 L 12 10",
      "M 12 10 L 16 12",
      "M 16 12 L 19 9",
      circle(12, 10, 1.3),
      circle(19, 9, 1.3),
      "M 19 9 L 21 6",
    ],
    tags: ["robot-arm", "automation", "manufacturing", "assembly", "industrial", "precision"],
  },
  bridge: {
    paths: ["M 2 18 L 22 18", "M 2 14 L 22 14", "M 4 14 L 4 18", "M 8 14 L 8 18", "M 12 14 L 12 18", "M 16 14 L 16 18", "M 20 14 L 20 18", "M 4 14 C 7 9, 17 9, 20 14", "M 8 12.2 L 8 14", "M 12 10.5 L 12 14", "M 16 12.2 L 16 14"],
    tags: ["bridge", "connect", "infrastructure", "cross", "engineering", "link", "overcome"],
  },

  // ------------------------------------------------------------------
  // communication
  // ------------------------------------------------------------------
  "chat-bubble": {
    paths: ["M 4 4 L 20 4 C 21 4, 22 5, 22 6 L 22 15 C 22 16, 21 17, 20 17 L 9 17 L 4 21 L 4 6 C 4 5, 4 4, 5 4 Z", "M 8 9 L 16 9", "M 8 12.5 L 13 12.5"],
    tags: ["chat", "message", "comment", "feedback", "conversation", "talk", "reply"],
  },
  "chat-group": {
    paths: ["M 3 3 L 15 3 C 16 3, 16 4, 16 5 L 16 12 C 16 13, 15 14, 14 14 L 8 14 L 4 18 L 4 14 L 4 5 C 4 4, 4 3, 5 3 Z", "M 18 8 L 20 8 C 21 8, 21.5 8.6, 21.5 9.5 L 21.5 19 L 18.5 16.5 L 12 16.5"],
    tags: ["chat-group", "discussion", "forum", "community", "dialogue", "team-chat"],
  },
  mail: {
    paths: ["M 3 5 L 21 5 C 22 5, 22 6, 22 7 L 22 17 C 22 18, 21 19, 20 19 L 4 19 C 3 19, 2 18, 2 17 L 2 7 C 2 6, 2 5, 3 5 Z", "M 3 7 L 12 13 L 21 7"],
    tags: ["mail", "email", "letter", "message", "contact", "inbox", "send", "notify"],
  },
  megaphone: {
    paths: ["M 3 11 L 3 13 C 3 13.6, 3.4 14, 4 14 L 6 14 L 15 19 L 15 5 L 6 10 L 4 10 C 3.4 10, 3 10.4, 3 11 Z", "M 18 9 C 19.5 10, 19.5 14, 18 15", "M 7 14 L 8 21"],
    tags: ["megaphone", "announce", "marketing", "promote", "loud", "campaign", "broadcast", "launch"],
  },
  "phone-call": {
    paths: ["M 5 3 C 4 3, 3 4, 3 5.5 C 3 14, 10 21, 18.5 21 C 20 21, 21 20, 21 19 L 21 16.5 C 21 15.7, 20.5 15, 19.7 14.8 L 16.4 14 C 15.7 13.8, 15 14.1, 14.6 14.7 L 13.5 16.3 C 10.8 15, 9 13.2, 7.7 10.5 L 9.3 9.4 C 9.9 9, 10.2 8.3, 10 7.6 L 9.2 4.3 C 9 3.5, 8.3 3, 7.5 3 Z"],
    tags: ["phone", "call", "contact", "talk", "support", "ring", "communication"],
  },
  share: {
    paths: [circle(6, 12, 2.5), circle(18, 5.5, 2.5), circle(18, 18.5, 2.5), "M 8.3 10.8 L 15.7 6.7", "M 8.3 13.2 L 15.7 17.3"],
    tags: ["share", "social", "distribute", "spread", "network", "forward", "viral"],
  },
  link: {
    paths: ["M 10 14 C 8 16, 6.5 16.5, 5 15 C 3.5 13.5, 3.5 11.5, 5 10 L 8 7 C 9.5 5.5, 11.5 5.5, 13 7 C 14.5 8.5, 14 10, 13 11", "M 14 10 C 16 8, 17.5 7.5, 19 9 C 20.5 10.5, 20.5 12.5, 19 14 L 16 17 C 14.5 18.5, 12.5 18.5, 11 17 C 9.5 15.5, 10 14, 11 13"],
    tags: ["link", "url", "connect", "reference", "chain", "hyperlink", "attach"],
  },
  "at-sign": {
    paths: [circle(12, 12, 4), "M 16 12 L 16 13.5 C 16 15.4, 17.1 16.5, 18.5 16.5 C 20 16.5, 21 15.2, 21 12 C 21 7, 17 3, 12 3 C 7 3, 3 7, 3 12 C 3 17, 7 21, 12 21 C 13.8 21, 15 20.6, 16 20"],
    tags: ["at-sign", "email", "mention", "handle", "account", "contact", "social"],
  },
  question: {
    paths: [circle(12, 12, 9), "M 9.2 9.2 C 9.4 7.8, 10.5 7, 12 7 C 13.6 7, 14.8 8, 14.8 9.5 C 14.8 11.2, 13 11.6, 12 12.8 C 11.7 13.2, 12 14, 12 14.5", "M 12 17.5 L 12.01 17.5"],
    tags: ["question", "help", "support", "faq", "ask", "unclear", "curious", "unknown"],
  },
  info: {
    paths: [circle(12, 12, 9), "M 12 11 L 12 16.5", "M 12 7.5 L 12.01 7.5"],
    tags: ["info", "information", "about", "detail", "explain", "learn", "notice"],
  },
  bell: {
    paths: ["M 12 3 C 8.7 3, 6.5 5.4, 6.5 9 L 6.5 13 L 5 16 L 19 16 L 17.5 13 L 17.5 9 C 17.5 5.4, 15.3 3, 12 3 Z", "M 10 19 C 10 20.1, 10.9 21, 12 21 C 13.1 21, 14 20.1, 14 19"],
    tags: ["bell", "notification", "alert", "reminder", "notify", "alarm", "attention"],
  },

  // ------------------------------------------------------------------
  // cybersecurity
  // ------------------------------------------------------------------
  lock: {
    paths: ["M 5 11 L 19 11 C 20 11, 20.5 11.5, 20.5 12.5 L 20.5 19 C 20.5 20, 20 20.5, 19 20.5 L 5 20.5 C 4 20.5, 3.5 20, 3.5 19 L 3.5 12.5 C 3.5 11.5, 4 11, 5 11 Z", "M 8 11 L 8 7 C 8 4.8, 9.8 3, 12 3 C 14.2 3, 16 4.8, 16 7 L 16 11", "M 12 14.5 L 12 17"],
    tags: ["lock", "secure", "security", "private", "protected", "encryption", "access"],
  },
  unlock: {
    paths: ["M 5 11 L 19 11 C 20 11, 20.5 11.5, 20.5 12.5 L 20.5 19 C 20.5 20, 20 20.5, 19 20.5 L 5 20.5 C 4 20.5, 3.5 20, 3.5 19 L 3.5 12.5 C 3.5 11.5, 4 11, 5 11 Z", "M 8 11 L 8 7 C 8 4.8, 9.8 3, 12 3 C 14.2 3, 16 4.8, 16 7"],
    tags: ["unlock", "open", "access", "public", "free", "available"],
  },
  shield: {
    paths: ["M 12 3 L 20 6 L 20 12 C 20 16.5, 16.5 20.3, 12 21.5 C 7.5 20.3, 4 16.5, 4 12 L 4 6 Z"],
    tags: ["shield", "protect", "security", "defense", "safe", "guard", "firewall"],
  },
  "shield-check": {
    paths: ["M 12 3 L 20 6 L 20 12 C 20 16.5, 16.5 20.3, 12 21.5 C 7.5 20.3, 4 16.5, 4 12 L 4 6 Z", "M 8.5 12 L 11 14.5 L 15.5 9.5"],
    tags: ["shield-check", "verified", "secure", "trusted", "protected", "passed", "audit"],
  },
  key: {
    paths: [circle(8, 16, 3.5), "M 10.5 13.5 L 20 4", "M 17 7 L 20 10", "M 14 10 L 16.5 12.5"],
    tags: ["key", "password", "access", "credential", "secret", "unlock", "api"],
  },
  fingerprint: {
    paths: [
      "M 12 3 C 8.5 3, 5.5 5, 4 8",
      "M 20 8 C 18.5 5, 15.5 3, 12 3",
      "M 5.5 11 C 6.5 8.5, 9 7, 12 7 C 15 7, 17.5 8.5, 18.5 11",
      "M 7.5 14 C 8 11.9, 9.8 10.5, 12 10.5 C 14.2 10.5, 16 11.9, 16.5 14 C 16.9 15.7, 16.7 17.4, 16 19",
      "M 9.5 16.5 C 9.3 15, 10 13.5, 12 13.5 C 14 13.5, 14.7 15, 14.5 16.5 C 14.3 17.8, 13.8 19, 13 20",
      "M 7.5 19 C 7 17.5, 6.7 16, 7 14.5",
    ],
    tags: ["fingerprint", "identity", "biometric", "auth", "unique", "verify", "security"],
  },
  bug: {
    paths: [
      "M 8 9 C 8 6.2, 9.8 4.5, 12 4.5 C 14.2 4.5, 16 6.2, 16 9 L 16 14 C 16 17.3, 14.4 19.5, 12 19.5 C 9.6 19.5, 8 17.3, 8 14 Z",
      "M 9.5 4.8 C 9 3.5, 8 2.8, 6.5 2.5",
      "M 14.5 4.8 C 15 3.5, 16 2.8, 17.5 2.5",
      "M 8 11 L 4.5 10",
      "M 8 14 L 4.5 14.5",
      "M 8.3 16.8 L 5 18.5",
      "M 16 11 L 19.5 10",
      "M 16 14 L 19.5 14.5",
      "M 15.7 16.8 L 19 18.5",
      "M 12 7 L 12 19",
    ],
    tags: ["bug", "error", "debug", "defect", "issue", "problem", "virus", "malware"],
  },
  "eye-scan": {
    paths: ["M 2 12 C 5 8.5, 8.5 6.5, 12 6.5 C 15.5 6.5, 19 8.5, 22 12 C 19 15.5, 15.5 17.5, 12 17.5 C 8.5 17.5, 5 15.5, 2 12 Z", circle(12, 12, 2.8), "M 3 3 L 5 3", "M 3 3 L 3 5", "M 21 3 L 19 3", "M 21 3 L 21 5", "M 3 21 L 5 21", "M 3 21 L 3 19", "M 21 21 L 19 21", "M 21 21 L 21 19"],
    tags: ["eye-scan", "biometric", "identity", "verify", "scan", "recognize", "security"],
  },

  // ------------------------------------------------------------------
  // environment
  // ------------------------------------------------------------------
  recycle: {
    paths: [
      "M 9.5 6.5 L 12 2.5 L 14.5 6.5",
      "M 12 2.5 L 12 10",
      "M 7 13 L 4.5 17.5 L 9 17.5",
      "M 4.5 17.5 L 10.5 17.5",
      "M 17 13 L 19.5 17.5 L 15 17.5",
      "M 13.5 10 L 19.5 17.5",
      "M 8 20 L 16 20 C 17 20, 17 21, 16.5 21.5 L 16.2 21.8",
    ],
    tags: ["recycle", "reuse", "sustainable", "green", "waste", "environment", "circular"],
  },
  earth: {
    paths: [
      circle(12, 12, 9),
      "M 5 7.5 C 7 9, 8.5 9, 10 8 C 11.5 7, 13 7, 14 8",
      "M 3.5 13 C 5.5 13, 7 14, 7.5 16 C 8 18, 7 19.5, 5.5 20",
      "M 14.5 19 C 16 18.5, 17.5 19.5, 18.5 21",
      "M 16 5 C 16.5 7, 18 8, 20 8",
    ],
    tags: ["earth", "world", "global", "planet", "environment", "international", "nature"],
  },
  mountain: {
    paths: ["M 2 20 L 8 7 L 12 14 L 15 9 L 22 20 Z", "M 6.5 10.5 L 8 12 L 9.5 10.5"],
    tags: ["mountain", "peak", "summit", "climb", "challenge", "nature", "high", "goal"],
  },
  forest: {
    paths: [
      "M 7 21 L 7 17",
      "M 4 17 L 7 12 L 10 17 Z",
      "M 4.8 14 L 7 10.5 L 9.2 14",
      "M 17 21 L 17 16",
      "M 13.5 16 L 17 10.5 L 20.5 16 Z",
      "M 14.5 13 L 17 9 L 19.5 13",
      "M 12 21 L 12 19",
    ],
    tags: ["forest", "trees", "woods", "nature", "environment", "climate", "carbon"],
  },
  wind: {
    paths: ["M 3 8 L 12.5 8 C 14.4 8, 16 6.9, 16 5.5 C 16 4.1, 14.9 3, 13.5 3 C 12.1 3, 11 4, 11 5", "M 3 12 L 17.5 12 C 19.4 12, 21 13.1, 21 14.5 C 21 15.9, 19.9 17, 18.5 17 C 17.1 17, 16 16, 16 15", "M 3 16 L 9.5 16 C 10.9 16, 12 17, 12 18.5 C 12 19.9, 11 21, 9.5 21"],
    tags: ["wind", "breeze", "air", "blow", "turbine", "renewable", "weather", "flow"],
  },
  "solar-panel": {
    paths: ["M 4 14 L 6 4 L 18 4 L 20 14 Z", "M 4 14 L 4 17 L 20 17 L 20 14", "M 6.5 9 L 17.5 9", "M 12 4 L 12 9", "M 5 8 L 12 8", "M 12 8 L 19 8", "M 9 17 L 9 21", "M 15 17 L 15 21"],
    tags: ["solar", "panel", "energy", "renewable", "sun", "power", "clean", "electric"],
  },
  "wind-turbine": {
    paths: [
      "M 12 12 L 12 21",
      "M 9 21 L 15 21",
      circle(12, 11, 1.2),
      "M 12 9.8 C 12 6, 13 3.5, 14.5 3.5 C 15.8 3.5, 14.8 7.5, 13 10.4",
      "M 13.1 11.6 C 16.4 13.5, 18 15.5, 17.3 16.8 C 12.7 14.4, 12.6 13.6, 12.6 12.3",
      "M 10.9 11.6 C 7.6 13.5, 6 15.5, 6.7 16.8 C 11.3 14.4, 11.4 13.6, 11.4 12.3",
    ],
    tags: ["wind-turbine", "renewable", "energy", "wind", "power", "clean", "sustainable"],
  },
  "trash-bin": {
    paths: ["M 4 6 L 20 6", "M 6 6 L 6 20 C 6 21, 7 22, 8 22 L 16 22 C 17 22, 18 21, 18 20 L 18 6", "M 9 6 L 9 3 C 9 2.4, 9.4 2, 10 2 L 14 2 C 14.6 2, 15 2.4, 15 3 L 15 6", "M 10 10 L 10 18", "M 14 10 L 14 18"],
    tags: ["trash", "bin", "delete", "remove", "waste", "discard", "clean", "garbage"],
  },

  // ------------------------------------------------------------------
  // transport
  // ------------------------------------------------------------------
  car: {
    paths: ["M 4 16 L 4 12 L 6 7 C 6.3 6.3, 7 6, 8 6 L 16 6 C 17 6, 17.7 6.3, 18 7 L 20 12 L 20 16", "M 3 16 L 21 16 L 21 18 C 21 18.6, 20.6 19, 20 19 L 18 19 C 17.4 19, 17 18.6, 17 18 L 17 16", "M 7 16 L 7 18 C 7 18.6, 6.6 19, 6 19 L 4 19 C 3.4 19, 3 18.6, 3 18 L 3 16", "M 6.5 12 L 17.5 12"],
    tags: ["car", "vehicle", "drive", "travel", "auto", "transport", "road", "delivery"],
  },
  truck: {
    paths: ["M 2 6 L 14 6 L 14 17 L 2 17 Z", "M 14 9 L 18 9 L 21 12.5 L 21 17 L 14 17", circle(6, 19, 1.8), circle(17, 19, 1.8)],
    tags: ["truck", "delivery", "shipping", "logistics", "freight", "transport", "cargo"],
  },
  bus: {
    paths: ["M 4 4 L 20 4 C 21 4, 21 5, 21 6 L 21 16 L 21 18 C 21 18.6, 20.6 19, 20 19 L 18.5 19 C 17.9 19, 17.5 18.6, 17.5 18 L 17.5 16 L 6.5 16 L 6.5 18 C 6.5 18.6, 6.1 19, 5.5 19 L 4 19 C 3.4 19, 3 18.6, 3 18 L 3 6 C 3 5, 3 4, 4 4 Z", "M 3 11 L 21 11", "M 6 14 L 7 14", "M 17 14 L 18 14"],
    tags: ["bus", "transit", "public", "transport", "school-bus", "commute", "travel"],
  },
  bicycle: {
    paths: [circle(6, 17, 3.5), circle(18, 17, 3.5), "M 6 17 L 10 10 L 15 10 L 18 17", "M 10 10 L 12 17 L 6 17", "M 12 17 L 18 17", "M 13.5 8 L 16 8", "M 10 10 L 8.5 8 L 10.5 8"],
    tags: ["bicycle", "bike", "cycling", "eco", "transport", "fitness", "green"],
  },
  airplane: {
    paths: ["M 12 2.5 C 12.8 2.5, 13.3 3.2, 13.3 4.2 L 13.3 9.5 L 21.5 14.5 L 21.5 16.5 L 13.3 13.8 L 13.3 18.5 L 15.5 20.2 L 15.5 21.8 L 12 21 L 8.5 21.8 L 8.5 20.2 L 10.7 18.5 L 10.7 13.8 L 2.5 16.5 L 2.5 14.5 L 10.7 9.5 L 10.7 4.2 C 10.7 3.2, 11.2 2.5, 12 2.5 Z"],
    tags: ["airplane", "flight", "travel", "air", "plane", "trip", "transport", "fast"],
  },
  train: {
    paths: ["M 7 3 L 17 3 C 19 3, 20 4, 20 6 L 20 15 C 20 17, 19 18, 17 18 L 7 18 C 5 18, 4 17, 4 15 L 4 6 C 4 4, 5 3, 7 3 Z", "M 4 11 L 20 11", "M 8 14.5 L 9 14.5", "M 15 14.5 L 16 14.5", "M 6 18 L 4 21.5", "M 18 18 L 20 21.5", "M 6.5 21.5 L 10.5 21.5", "M 13.5 21.5 L 17.5 21.5"],
    tags: ["train", "rail", "transport", "commute", "travel", "metro", "journey"],
  },
  ship: {
    paths: ["M 3 14 L 12 10 L 21 14", "M 5 14 L 5 10 L 12 6 L 19 10 L 19 14", "M 12 6 L 12 3.5", "M 3 17 C 5 18.5, 7 18.5, 9 17 C 11 18.5, 13 18.5, 15 17 C 17 18.5, 19 18.5, 21 17", "M 3 17 L 3 19 C 3 20.5, 4.5 22, 6 22 L 18 22 C 19.5 22, 21 20.5, 21 19 L 21 17"],
    tags: ["ship", "boat", "cargo", "sea", "shipping", "export", "transport", "marine"],
  },
  rocket: {
    paths: ["M 12 3 C 15 5.5, 16.5 9.5, 16.5 13.5 L 14.5 17 L 9.5 17 L 7.5 13.5 C 7.5 9.5, 9 5.5, 12 3 Z", circle(12, 10, 1.6), "M 9.5 17 L 7 20.5 L 10 20", "M 14.5 17 L 17 20.5 L 14 20", "M 10.5 19.5 C 10.5 21, 11 22, 12 22 C 13 22, 13.5 21, 13.5 19.5"],
    tags: ["rocket", "launch", "startup", "fast", "space", "growth", "ship", "release", "boost"],
  },

  // ------------------------------------------------------------------
  // buildings
  // ------------------------------------------------------------------
  house: {
    paths: ["M 3 11 L 12 3 L 21 11", "M 5 10 L 5 21 L 19 21 L 19 10", "M 10 21 L 10 14 L 14 14 L 14 21"],
    tags: ["house", "home", "property", "real-estate", "living", "family", "residence"],
  },
  "office-building": {
    paths: ["M 4 21 L 4 4 C 4 3, 5 2, 6 2 L 18 2 C 19 2, 20 3, 20 4 L 20 21 Z", "M 8 6 L 10 6", "M 14 6 L 16 6", "M 8 10 L 10 10", "M 14 10 L 16 10", "M 8 14 L 10 14", "M 14 14 L 16 14", "M 10 21 L 10 17.5 L 14 17.5 L 14 21"],
    tags: ["office", "building", "company", "corporate", "business", "workplace", "tower"],
  },
  store: {
    paths: ["M 3 9 L 4 4 L 20 4 L 21 9", "M 3 9 C 3 10.4, 4.1 11.5, 5.5 11.5 C 6.9 11.5, 8 10.4, 8 9 C 8 10.4, 9.1 11.5, 10.5 11.5 C 11.9 11.5, 13 10.4, 13 9 C 13 10.4, 14.1 11.5, 15.5 11.5 C 16.9 11.5, 18 10.4, 18 9 C 18 10.4, 19.1 11.5, 20.5 11.5 C 21 11.5, 21.4 11.3, 21 10.5", "M 5 11.5 L 5 21 L 19 21 L 19 11.5", "M 9 21 L 9 15 L 15 15 L 15 21"],
    tags: ["store", "shop", "retail", "market", "business", "sell", "commerce"],
  },
  warehouse: {
    paths: ["M 2 21 L 2 8 L 12 3 L 22 8 L 22 21", "M 6 21 L 6 12 L 18 12 L 18 21", "M 6 15 L 18 15", "M 6 18 L 18 18"],
    tags: ["warehouse", "storage", "inventory", "logistics", "stock", "distribution"],
  },
  tower: {
    paths: ["M 8 21 L 9 6 L 12 3 L 15 6 L 16 21 Z", "M 10.5 9 L 13.5 9", "M 10.2 13 L 13.8 13", "M 9.8 17 L 14.2 17", "M 6 21 L 18 21"],
    tags: ["tower", "castle", "landmark", "signal", "historic", "structure"],
  },
  "farm-house": {
    paths: ["M 3 12 L 12 4 L 21 12", "M 5 11 L 5 21 L 19 21 L 19 11", "M 9 21 L 9 16 L 15 16 L 15 21", "M 12 4 L 12 2 L 14 2 L 14 6"],
    tags: ["farm-house", "farm", "rural", "barn", "agriculture", "countryside", "homestead"],
  },
  "school-building": {
    paths: ["M 3 21 L 3 12 L 12 6 L 21 12 L 21 21 Z", "M 9 21 L 9 15 L 15 15 L 15 21", "M 12 6 L 12 3", circle(12, 9.5, 1.2), "M 3 16 L 6 16", "M 18 16 L 21 16"],
    tags: ["school", "education", "learning", "academy", "students", "campus", "college"],
  },

  // ------------------------------------------------------------------
  // devices
  // ------------------------------------------------------------------
  smartphone: {
    paths: ["M 7 2 L 17 2 C 18 2, 19 3, 19 4 L 19 20 C 19 21, 18 22, 17 22 L 7 22 C 6 22, 5 21, 5 20 L 5 4 C 5 3, 6 2, 7 2 Z", "M 10 18.5 L 14 18.5"],
    tags: ["smartphone", "phone", "mobile", "app", "device", "call", "cellphone"],
  },
  tablet: {
    paths: ["M 5 2 L 19 2 C 20 2, 21 3, 21 4 L 21 20 C 21 21, 20 22, 19 22 L 5 22 C 4 22, 3 21, 3 20 L 3 4 C 3 3, 4 2, 5 2 Z", "M 11 18.5 L 13 18.5"],
    tags: ["tablet", "ipad", "device", "screen", "reading", "portable"],
  },
  monitor: {
    paths: ["M 3 4 L 21 4 C 21.5 4, 22 4.5, 22 5 L 22 15 C 22 15.5, 21.5 16, 21 16 L 3 16 C 2.5 16, 2 15.5, 2 15 L 2 5 C 2 4.5, 2.5 4, 3 4 Z", "M 9 20 L 15 20", "M 12 16 L 12 20"],
    tags: ["monitor", "display", "screen", "desktop", "computer", "presentation"],
  },
  tv: {
    paths: ["M 3 7 L 21 7 C 21.5 7, 22 7.5, 22 8 L 22 18 C 22 18.5, 21.5 19, 21 19 L 3 19 C 2.5 19, 2 18.5, 2 18 L 2 8 C 2 7.5, 2.5 7, 3 7 Z", "M 8 3 L 12 7 L 16 3"],
    tags: ["tv", "television", "video", "watch", "media", "stream", "broadcast"],
  },
  watch: {
    paths: ["M 9 6 L 9 3 L 15 3 L 15 6", "M 9 18 L 9 21 L 15 21 L 15 18", "M 9 6 C 7.2 6.8, 6 8.8, 6 12 C 6 15.2, 7.2 17.2, 9 18", "M 15 6 C 16.8 6.8, 18 8.8, 18 12 C 18 15.2, 16.8 17.2, 15 18", "M 12 9.5 L 12 12 L 13.5 13"],
    tags: ["watch", "time", "wearable", "clock", "smartwatch", "schedule"],
  },
  headphones: {
    paths: ["M 4 14 L 4 12 C 4 7.6, 7.6 4, 12 4 C 16.4 4, 20 7.6, 20 12 L 20 14", "M 4 14 C 3.4 14, 3 14.4, 3 15 L 3 18 C 3 18.6, 3.4 19, 4 19 L 6 19 C 6.6 19, 7 18.6, 7 18 L 7 15 C 7 14.4, 6.6 14, 6 14 Z", "M 20 14 C 20.6 14, 21 14.4, 21 15 L 21 18 C 21 18.6, 20.6 19, 20 19 L 18 19 C 17.4 19, 17 18.6, 17 18 L 17 15 C 17 14.4, 17.4 14, 18 14 Z"],
    tags: ["headphones", "audio", "listen", "music", "sound", "podcast", "voiceover"],
  },
  microphone: {
    paths: ["M 12 2 C 10.3 2, 9 3.3, 9 5 L 9 11 C 9 12.7, 10.3 14, 12 14 C 13.7 14, 15 12.7, 15 11 L 15 5 C 15 3.3, 13.7 2, 12 2 Z", "M 5 11 C 5 14.9, 8.1 18, 12 18 C 15.9 18, 19 14.9, 19 11", "M 12 18 L 12 22", "M 9 22 L 15 22"],
    tags: ["microphone", "record", "voice", "audio", "speak", "narration", "podcast"],
  },
  printer: {
    paths: ["M 7 8 L 7 3 L 17 3 L 17 8", "M 7 17 L 4 17 C 3 17, 2 16, 2 15 L 2 10 C 2 9, 3 8, 4 8 L 20 8 C 21 8, 22 9, 22 10 L 22 15 C 22 16, 21 17, 20 17 L 17 17", "M 7 14 L 17 14 L 17 21 L 7 21 Z", "M 17 11 L 18.5 11"],
    tags: ["printer", "print", "document", "paper", "office", "report", "output"],
  },

  // ------------------------------------------------------------------
  // warning and status
  // ------------------------------------------------------------------
  "warning-triangle": {
    paths: ["M 12 3.5 L 22 20 L 2 20 Z", "M 12 9 L 12 14.5", "M 12 17.3 L 12.01 17.3"],
    tags: ["warning", "caution", "alert", "danger", "risk", "careful", "hazard", "exclaim"],
  },
  "info-circle": {
    paths: [circle(12, 12, 9), "M 12 11 L 12 16.5", "M 12 7.5 L 12.01 7.5"],
    tags: ["info-circle", "note", "tip", "informational", "fyi", "hint"],
  },
  "check-circle": {
    paths: [circle(12, 12, 9), "M 7.5 12.5 L 10.5 15.5 L 16.5 9"],
    tags: ["check-circle", "success", "complete", "valid", "passed", "correct", "done", "approved"],
  },
  "x-circle": {
    paths: [circle(12, 12, 9), "M 9 9 L 15 15", "M 15 9 L 9 15"],
    tags: ["x-circle", "error", "failed", "invalid", "wrong", "rejected", "missing"],
  },
  ban: {
    paths: [circle(12, 12, 9), "M 5.7 5.7 L 18.3 18.3"],
    tags: ["ban", "forbidden", "blocked", "denied", "restricted", "prohibited", "stop"],
  },
  star: {
    paths: ["M 12 2.5 L 14.9 8.4 L 21.5 9.4 L 16.75 14 L 17.8 20.6 L 12 17.5 L 6.2 20.6 L 7.25 14 L 2.5 9.4 L 9.1 8.4 Z"],
    tags: ["star", "favorite", "rating", "best", "quality", "featured", "important"],
  },
  flag: {
    paths: ["M 5 21 L 5 4", "M 5 4 C 8 2.5, 10 5.5, 12.5 5 C 15 4.5, 16.5 3.5, 19 4 L 19 12 C 16 13.5, 14 10.5, 11.5 11 C 9 11.5, 8 12.5, 5 12"],
    tags: ["flag", "milestone", "goal", "mark", "report", "priority", "finish"],
  },
  "map-pin": {
    paths: ["M 12 21 C 12 21, 5.5 14.8, 5.5 10 C 5.5 6.4, 8.4 3.5, 12 3.5 C 15.6 3.5, 18.5 6.4, 18.5 10 C 18.5 14.8, 12 21, 12 21 Z", circle(12, 10, 2.6)],
    tags: ["map-pin", "location", "place", "where", "address", "destination", "marker"],
  },
  clock: {
    paths: [circle(12, 12, 9), "M 12 7 L 12 12 L 15.5 14"],
    tags: ["clock", "time", "schedule", "deadline", "duration", "wait", "when", "timing"],
  },
  hourglass: {
    paths: ["M 6 3 L 18 3", "M 6 21 L 18 21", "M 7 3 C 7 8, 12 9, 12 12 C 12 15, 17 16, 17 21", "M 17 3 C 17 8, 12 9, 12 12 C 12 15, 7 16, 7 21"],
    tags: ["hourglass", "waiting", "loading", "time", "processing", "patience", "delay"],
  },
  calendar: {
    paths: ["M 5 5 L 19 5 C 20 5, 21 6, 21 7 L 21 19 C 21 20, 20 21, 19 21 L 5 21 C 4 21, 3 20, 3 19 L 3 7 C 3 6, 4 5, 5 5 Z", "M 3 10 L 21 10", "M 8 3 L 8 7", "M 16 3 L 16 7", "M 7 14 L 9 14", "M 12 14 L 14 14"],
    tags: ["calendar", "date", "schedule", "month", "event", "deadline", "plan", "when"],
  },
  lightbulb: {
    paths: ["M 12 2.5 C 8.7 2.5, 6 5.2, 6 8.5 C 6 10.8, 7.2 12.4, 8.5 13.7 C 9.2 14.4, 9.5 15.1, 9.5 16 L 14.5 16 C 14.5 15.1, 14.8 14.4, 15.5 13.7 C 16.8 12.4, 18 10.8, 18 8.5 C 18 5.2, 15.3 2.5, 12 2.5 Z", "M 9.5 18.5 L 14.5 18.5", "M 10.5 21.5 L 13.5 21.5"],
    tags: ["lightbulb", "idea", "innovation", "insight", "creative", "think", "invent", "solution"],
  },
  // ------------------------------------------------------------------
  // Phase C slice 2 — the vocabulary rides the audit's band top (the
  // catalog route's icon-growth wave): 50 new teachable marks across
  // weather, food, animals, sports, music, money, tools, time, nature,
  // safety and the everyday room. The SAME authoring laws — every path
  // ONE stroke (no mid-path M), 2-6 commands, the 24 grid, circles as
  // two half-arcs — and every id disjoint from the 150 above (pinned by
  // the design-system battery's registration law).
  // ------------------------------------------------------------------
  snowflake: {
    paths: ["M 12 3 L 12 21", "M 5 6 L 19 18", "M 19 6 L 5 18"],
    tags: ["snowflake", "snow", "winter", "freeze", "frost", "cold weather", "ice"],
  },
  fog: {
    paths: ["M 5 10 C 5 7, 8 5, 11 6 C 12 4, 16 4, 17 6 C 19 6, 20 8, 20 10", "M 4 14 L 20 14", "M 6 17 L 18 17", "M 8 20 L 16 20"],
    tags: ["fog", "mist", "haze", "unclear", "blur", "cloudy low"],
  },
  "storm-cloud": {
    paths: ["M 5 15 A 3.5 3.5 0 0 1 6 8 A 4.5 4.5 0 0 1 15 7 A 4 4 0 0 1 19 15", "M 12 11 L 10 16 L 13 16 L 11 20"],
    tags: ["storm", "thunder", "lightning", "thunderstorm", "tempest", "severe weather"],
  },
  moon: {
    paths: ["M 15 3 A 9 9 0 1 0 21 14 A 7 7 0 0 1 15 3"],
    tags: ["moon", "lunar", "night", "midnight", "overnight", "dark", "sleep"],
  },
  rainbow: {
    paths: ["M 3 17 A 9 9 0 0 1 21 17", "M 7 17 A 5 5 0 0 1 17 17", "M 2 20 L 22 20"],
    tags: ["rainbow", "arc", "sky", "hope", "after the rain"],
  },
  umbrella: {
    paths: ["M 3 12 A 9 9 0 0 1 21 12 L 3 12", "M 12 12 L 12 19 A 1.5 1.5 0 0 1 9 19"],
    tags: ["umbrella", "rainy", "shelter", "cover", "protection weather"],
  },
  bread: {
    paths: ["M 4 11 C 4 8, 7 6, 12 6 C 17 6, 20 8, 20 11 L 20 18 L 4 18 Z", "M 9 10 L 11 13", "M 14 10 L 16 13"],
    tags: ["bread", "bakery", "loaf", "toast", "food", "bake"],
  },
  apple: {
    paths: ["M 12 8 C 8 6, 5 9, 5 13 C 5 17, 8 20, 12 20 C 16 20, 19 17, 19 13 C 19 9, 16 6, 12 8", "M 12 8 L 12 5", "M 12 5 C 14 3.5, 16.5 4, 16.5 4 C 16.5 4, 15 6.5, 12 5"],
    tags: ["apple", "fruit", "orchard", "food", "healthy eating"],
  },
  cheese: {
    paths: ["M 3 16 L 21 16 L 21 12 C 15 8, 9 8, 3 12 Z", circle(8, 13.5, 1.2), circle(14, 14, 1)],
    tags: ["cheese", "cheddar", "dairy food", "food", "kitchen"],
  },
  cup: {
    paths: ["M 5 8 L 5 17 C 5 19, 7 20, 9 20 L 13 20 C 15 20, 17 19, 17 17 L 17 8", "M 4 8 L 18 8", "M 17 10 L 18.5 10 A 2.5 2.5 0 0 1 18.5 15 L 17 15"],
    tags: ["cup", "coffee", "tea", "mug", "drink", "break", "espresso"],
  },
  bowl: {
    paths: ["M 4 11 A 8 8 0 0 0 20 11 Z", "M 12 19 L 12 21", "M 8 21 L 16 21"],
    tags: ["bowl", "soup", "salad", "porridge", "meal", "food"],
  },
  bottle: {
    paths: ["M 9 8 L 7 13 L 7 19 L 17 19 L 17 13 L 15 8", "M 9 8 L 9 4 L 15 4 L 15 8"],
    tags: ["bottle", "drink", "water bottle", "container", "hydration"],
  },
  plate: {
    paths: [circle(12, 12, 9), circle(12, 12, 5)],
    tags: ["plate", "dish", "dinner", "meal", "food", "kitchen"],
  },
  cutlery: {
    paths: ["M 4 3 L 4 7 A 2 2 0 0 0 8 7 L 8 3", "M 6 3 L 6 21", "M 17 3 C 19.5 6, 19.5 10, 17 13 L 17 21"],
    tags: ["cutlery", "fork", "knife", "spoon", "restaurant", "dining", "food"],
  },
  cat: {
    paths: [circle(12, 13, 7), "M 6 8 L 5 3.5 L 9.5 6", "M 18 8 L 19 3.5 L 14.5 6"],
    tags: ["cat", "kitten", "feline", "pet", "animal"],
  },
  dog: {
    paths: [circle(12, 13, 6.5), "M 6 10 C 3.5 9, 4 5, 7.5 7", "M 18 10 C 20.5 9, 20 5, 16.5 7", "M 11 14 A 1 1 0 0 0 13 14"],
    tags: ["dog", "puppy", "canine", "pet", "animal", "loyal"],
  },
  bird: {
    paths: ["M 5 17 C 5 11, 9 7, 14 7 C 17 7, 19 9, 19 12 L 19 17", "M 9 12 C 11 10, 14 10, 16 12", "M 19 8 L 22 9.5 L 19 11"],
    tags: ["bird", "sparrow", "pigeon", "wing", "animal", "nature"],
  },
  fish: {
    paths: ["M 3 12 C 6 8, 12 7, 16 10 C 12 17, 6 16, 3 12", "M 16 10 L 21 7 L 20 12 L 21 17 L 16 14", circle(8, 11, 0.9)],
    tags: ["fish", "fishing", "goldfish", "sea", "animal", "swim"],
  },
  butterfly: {
    paths: ["M 12 5 L 12 19", "M 12 8 C 8 4, 3 6, 4 10 C 5 13, 9 13, 12 12", "M 12 8 C 16 4, 21 6, 20 10 C 19 13, 15 13, 12 12"],
    tags: ["butterfly", "insect", "caterpillar", "nature", "spring", "transform"],
  },
  "soccer-ball": {
    paths: [circle(12, 12, 8), "M 12 8 L 16 11 L 14.5 16 L 9.5 16 L 8 11 Z", "M 12 4 L 12 8", "M 20 12 L 16 11", "M 4 12 L 8 11"],
    tags: ["soccer", "football", "ball", "game", "sport", "match"],
  },
  basketball: {
    paths: [circle(12, 12, 8), "M 12 4 L 12 20", "M 4 12 L 20 12", "M 6 6 C 9 9, 9 15, 6 18", "M 18 6 C 15 9, 15 15, 18 18"],
    tags: ["basketball", "hoop", "dribble", "ball", "sport", "game"],
  },
  medal: {
    paths: ["M 8 3 L 11 9", "M 16 3 L 13 9", circle(12, 15, 5), "M 10 15 L 12 13 L 14 15 L 12 17 Z"],
    tags: ["medal", "winner", "award", "prize", "second place", "honor"],
  },
  trophy: {
    paths: ["M 8 4 L 16 4 L 16 10 C 16 13, 14 15, 12 15 C 10 15, 8 13, 8 10 Z", "M 8 6 L 6 6 C 4.5 6, 4.5 9, 7 10", "M 16 6 L 18 6 C 19.5 6, 19.5 9, 17 10", "M 12 15 L 12 18", "M 8 21 L 16 21"],
    tags: ["trophy", "champion", "victory", "first place", "win", "award", "success cup"],
  },
  "music-note": {
    paths: ["M 15 4 L 15 16", "M 15 4 C 18 6, 19 9, 17 12", circle(12.2, 16, 2.8)],
    tags: ["music note", "melody", "song", "tune", "hum", "singing"],
  },
  drum: {
    paths: ["M 6 7 A 6 2.5 0 1 0 18 7 A 6 2.5 0 1 0 6 7", "M 6 7 L 6 17", "M 18 7 L 18 17", "M 6 17 A 6 2.5 0 0 0 18 17"],
    tags: ["drum", "beat", "rhythm", "percussion", "music instrument"],
  },
  guitar: {
    paths: [circle(9, 15, 5.5), "M 12 11.5 L 19 4.5", "M 19 4.5 L 21 3", circle(9, 15, 2)],
    tags: ["guitar", "acoustic", "banjo", "instrument", "music instrument", "band"],
  },
  "credit-card": {
    paths: ["M 3 7 L 21 7 L 21 17 L 3 17 Z", "M 3 10 L 21 10", "M 6 14 L 9 14"],
    tags: ["credit card", "debit", "checkout", "payment card", "buy", "finance"],
  },
  "money-bag": {
    paths: ["M 9 7 C 6 9, 4 13, 4 16 C 4 20, 7 21, 12 21 C 17 21, 20 20, 20 16 C 20 13, 18 9, 15 7", "M 9 7 L 9 5 L 15 5 L 15 7"],
    tags: ["money bag", "fortune", "windfall", "jackpot", "wealth", "cash bag"],
  },
  "coins-stack": {
    paths: ["M 6 9 A 6 2.2 0 1 0 18 9 A 6 2.2 0 1 0 6 9", "M 6 9 L 6 13 A 6 2.2 0 0 0 18 13 L 18 9", "M 6 13 L 6 17 A 6 2.2 0 0 0 18 17 L 18 13"],
    tags: ["coins stack", "savings pile", "nest egg", "pile", "stacked", "wealth"],
  },
  saw: {
    paths: ["M 3 12 L 21 12", "M 3 12 L 5 14 L 7 12 L 9 14 L 11 12 L 13 14", "M 13 14 L 15 12 L 17 14 L 19 12 L 21 12"],
    tags: ["handsaw", "carpentry", "saw tool", "cut wood", "workshop"],
  },
  shovel: {
    paths: ["M 12 3 L 12 12", "M 9 3 L 15 3", "M 12 12 C 9 12, 8 14, 8 16 C 8 19, 10 21, 12 21 C 14 21, 16 19, 16 16 C 16 14, 15 12, 12 12"],
    tags: ["shovel", "dig", "excavate", "scoop", "garden tool", "spade"],
  },
  wheelbarrow: {
    paths: ["M 3 8 L 17 8 L 14 14 L 6 14 Z", "M 17 8 L 21 6", circle(10, 18, 2.5), "M 14 14 L 16 19"],
    tags: ["wheelbarrow", "barrow", "cart", "carry", "garden tool"],
  },
  ladder: {
    paths: ["M 7 3 L 7 21", "M 17 3 L 17 21", "M 7 7 L 17 7", "M 7 12 L 17 12", "M 7 17 L 17 17"],
    tags: ["ladder", "climb", "climbing", "height", "step ladder"],
  },
  stopwatch: {
    paths: [circle(12, 13, 7.5), "M 12 13 L 12 8", "M 10 3 L 14 3", "M 12 3 L 12 5.5"],
    tags: ["stopwatch", "countdown", "split time", "speed", "timing"],
  },
  "alarm-clock": {
    paths: [circle(12, 13, 7.5), "M 6 5 L 8.5 2.5", "M 18 5 L 15.5 2.5", "M 12 13 L 12 9", "M 12 13 L 15 14.5"],
    tags: ["alarm clock", "wake", "morning", "wake up", "bedside"],
  },
  flower: {
    paths: ["M 8 4 L 8 9 C 8 12, 10 14, 12 14 C 14 14, 16 12, 16 9 L 16 4", "M 8 4 C 9 7, 11 7, 12 5 C 13 7, 15 7, 16 4", "M 12 14 L 12 21", "M 12 18 C 10 17, 8.5 18, 8 20 C 9.5 20.5, 11.5 20, 12 18"],
    tags: ["tulip", "bloom", "blossom", "bouquet", "petal", "rose", "spring"],
  },
  mushroom: {
    paths: ["M 4 12 C 4 7, 8 4, 12 4 C 16 4, 20 7, 20 12", "M 4 12 L 20 12", "M 10 12 C 10 16, 9 18, 9 19 C 9 21, 15 21, 15 19 C 15 18, 14 16, 14 12"],
    tags: ["mushroom", "fungi", "toadstool", "nature", "forest food"],
  },
  cactus: {
    paths: ["M 10 16 L 10 5 C 10 3.9, 14 3.9, 14 5 L 14 16", "M 10 11 L 7.5 11 C 6.5 11, 6.5 15, 7.5 15 L 10 15", "M 14 8 L 16.5 8 C 17.5 8, 17.5 12, 16.5 12 L 14 12", "M 8 16 L 16 16 L 15 21 L 9 21 Z"],
    tags: ["cactus", "desert", "succulent", "plant", "dry"],
  },
  "paper-plane": {
    paths: ["M 21 4 L 3 11 L 10 13.5 L 11 21 Z", "M 21 4 L 10 13.5"],
    tags: ["paper plane", "origami", "send", "launch idea", "message out"],
  },
  "life-ring": {
    paths: [circle(12, 12, 8), "M 6.3 6.3 L 9.2 9.2", "M 17.7 6.3 L 14.8 9.2", "M 6.3 17.7 L 9.2 14.8", "M 17.7 17.7 L 14.8 14.8"],
    tags: ["life ring", "lifesaver", "rescue", "overboard", "safety buoy", "help at sea"],
  },
  helmet: {
    paths: ["M 4 15 A 8 8 0 0 1 20 15 L 20 17 L 4 17 Z", "M 12 7 L 12 17"],
    tags: ["helmet", "hard hat", "headgear", "safety gear", "protect head"],
  },
  chair: {
    paths: ["M 7 3 L 13 3", "M 7 3 L 7 13", "M 7 13 L 17 13", "M 8 13 L 8 21", "M 16 13 L 16 21"],
    tags: ["chair", "seat", "sit", "sitting", "furniture", "rest"],
  },
  bed: {
    paths: ["M 3 6 L 3 18", "M 21 11 L 21 18", "M 3 14 L 21 14", "M 5 14 L 5 11.5 L 9 11.5 L 9 14"],
    tags: ["bed", "sleep", "bedroom", "bedtime", "nap", "rest", "hotel"],
  },
  door: {
    paths: ["M 4 21 L 4 4 L 20 4 L 20 21", "M 6 21 L 6 6 L 18 6 L 18 21", circle(15.5, 13, 0.9)],
    tags: ["door", "doorway", "entrance", "gate", "open door", "opportunity"],
  },
  stairs: {
    paths: ["M 4 21 L 4 16 L 10 16 L 10 11", "M 10 16 L 16 16 L 16 11 L 22 11 L 22 6"],
    tags: ["stairs", "staircase", "escalator", "progress", "level up", "ascend"],
  },
  keyboard: {
    paths: ["M 2 8 L 22 8 L 22 16 L 2 16 Z", "M 5 11 L 7 11", "M 10 11 L 12 11", "M 15 11 L 17 11", "M 8 14 L 16 14"],
    tags: ["keyboard", "typing", "type", "input", "computer", "write digital"],
  },
  satellite: {
    paths: ["M 8 10 L 16 10 L 16 14 L 8 14 Z", "M 2 10 L 6 10 L 6 14 L 2 14 Z", "M 18 10 L 22 10 L 22 14 L 18 14 Z", "M 12 10 L 12 6", "M 10.3 5.7 A 2 2 0 0 1 13.7 5.7"],
    tags: ["satellite", "orbit", "spacecraft", "space", "signal space", "gps"],
  },
  antenna: {
    paths: ["M 12 8 L 12 21", "M 9 6 A 4.5 4.5 0 0 0 9 10", "M 15 6 A 4.5 4.5 0 0 1 15 10", "M 6.5 3.5 A 7.5 7.5 0 0 0 6.5 12.5", "M 17.5 3.5 A 7.5 7.5 0 0 1 17.5 12.5"],
    tags: ["transmitter", "radio", "mast", "aerial", "waves", "on air"],
  },
  "first-aid-kit": {
    paths: ["M 4 8 L 20 8 L 20 19 L 4 19 Z", "M 9 8 L 9 5 L 15 5 L 15 8", "M 12 11 L 12 16", "M 9.5 13.5 L 14.5 13.5"],
    tags: ["first aid kit", "aid kit", "medical kit", "safety kit", "prepared"],
  },
  windmill: {
    paths: ["M 12 11 L 9 21 L 15 21 Z", "M 12 11 L 12 3", "M 12 11 L 18.9 7", "M 12 11 L 5.1 7", circle(12, 11, 1.2)],
    tags: ["windmill", "mill", "grind", "farm", "wind energy", "rural"],
  },
};
