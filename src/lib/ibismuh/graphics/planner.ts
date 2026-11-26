// G1.4 — the motion-graphics native scaffold planner (S120 §5 / Part B).
//
// The ZERO-AI starter, the whiteboard-planner's shape applied to the
// GraphicsDoc grammar: builds a valid GraphicsDoc from the video's story
// scenes — narration copied per scene, element structure from a
// deterministic keyword→archetype rule table (stat / chart / list /
// headline scenes), placements from a per-archetype grid, and motions
// from the PER-KIND defaults below (every enter kind drawn from the
// MOTION_KINDS_BY_ELEMENT compatibility table — a planner never proposes
// an illegal motion; the validator would refuse the doc at write).
//
// All on-screen TEXT is extracted from the story (title / narration /
// topic) — the scaffold invents no facts; it only LAYS OUT what the story
// says. The user edits from there.
//
// The graphics module stays a leaf: this planner imports the grammar
// (types.ts), the whiteboard sentence splitter (beat-plan — ONE sentence
// model, never a second) and the whiteboard timing estimator (timing.ts —
// ONE clock model, never a second) — nothing else. Pure and
// deterministic: same input → the same doc, byte for byte (the
// determinism law extends to the planner). $0 work — no AI call anywhere
// (design law 5).
import { splitSentences } from "../whiteboard/beat-plan";
import { estimateNarrationMs } from "../whiteboard/timing";
import type { Placement } from "../whiteboard/svg";
import { GRAPHICS_ICON_LIBRARY } from "./icons";

// Phase C — the native defaults seam (ONE source; the re-export below
// keeps every legacy import path resolving). The planner's own builders
// consume the same table through this import.
import {
  DEFAULT_PLACEMENT_169,
  capLine,
  nativeCameraFor,
  nativeEnterFor,
  nativeExitFor,
  remapPlacement,
  textPayload,
} from "./native-defaults";
import { expandComponent } from "./components";

// G1.5 — the icon vocabulary moved to ./icons.ts (the audit's Priority 1:
// 4 starter icons → the production vocabulary). planner.ts RE-EXPORTS the
// same object so every legacy import path (llm-planner.ts, the unit suite,
// stored catalogs) keeps resolving to the ONE icon source — never a second
// table.
import {
  GRAPHICS_BUDGETS,
  GRAPHICS_SURFACES,
  GRAPHICS_VERSION,
  type BarDatum,
  type GraphicsDoc,
  type GraphicsElement,
  type GraphicsElementKind,
  type GraphicsScene,
} from "./types";

// G1.5 — the icon vocabulary moved to ./icons.ts (the audit's Priority 1:
// 4 starter icons → the production vocabulary). planner.ts RE-EXPORTS the
// same object so every legacy import path (llm-planner.ts, the unit suite,
// stored catalogs) keeps resolving to the ONE icon source — never a second
// table.
export { GRAPHICS_ICON_LIBRARY };

/** The minimal story-scene shape the planner consumes (the whiteboard
 *  scaffold's input, structurally identical — one call site feeds both
 *  engines). */
export interface GraphicsSceneInput {
  index: number;
  title: string;
  narration: string;
}

// ---------------------------------------------------------------------------
// The icon table lives in ./icons.ts (ONE source). This module owns the
// DETERMINISTIC SELECTION: the ordered keyword → icon rule table below
// (first hit wins — the whiteboard planner's KEYWORD_PICKS pattern) plus
// the no-cue fallback cycle. The table is intentionally ordered: general
// concepts first, domain-specific later, so a "grow your savings" scene
// picks the finance icon over the plant icon — the order IS the policy.
// ---------------------------------------------------------------------------

/** Exported for the catalog integrity suite: every pick must name a
 *  library icon (the dead-end law). */
export const ICON_KEYWORD_PICKS: { re: RegExp; iconId: string }[] = [
  { re: /\b(check|verify|correct|right|proven|safe|quality|benefit|advantage|done)\b/i, iconId: "check" },
  { re: /\b(myth|wrong|never|avoid|stop|mistake|fail|failed|error|invalid)\b/i, iconId: "xmark" },
  { re: /\b(grow|growth|increase|rise|trend|boost|scale|higher|improve|improvement)\b/i, iconId: "arrow-up" },
  { re: /\b(fast|quick|instant|energy|power|speed|faster|electric)\b/i, iconId: "bolt" },
  { re: /\b(money|cash|price|pricing|payment|paid|wallet|purchase|spend|budget)\b/i, iconId: "dollar" },
  { re: /\b(coin|coins|savings|save|thrift|wealth|rich)\b/i, iconId: "coins" },
  { re: /\b(revenue|profit|sales|sell|earn|income|monetize)\b/i, iconId: "chart-up" },
  { re: /\b(loss|decline|decrease|drop|shrink|downfall|fall)\b/i, iconId: "chart-down" },
  { re: /\b(bank|loan|mortgage|credit|interest)\b/i, iconId: "bank" },
  { re: /\b(invoice|billing|receipt|accounting|order)\b/i, iconId: "invoice" },
  { re: /\b(data|chart|graph|stats|statistics|analytics|metrics|percent|percentage)\b/i, iconId: "pie-chart" },
  { re: /\b(goal|target|aim|objective|focus|bullseye)\b/i, iconId: "target" },
  { re: /\b(business|company|startup|enterprise|corporate|firm|agency)\b/i, iconId: "briefcase" },
  { re: /\b(office|workplace|work job|career|profession)\b/i, iconId: "office-building" },
  { re: /\b(meeting|deal|agreement|partnership|negotiat|contract|terms|sign)\b/i, iconId: "handshake" },
  { re: /\b(compare|comparison|versus|fair|justice|equal|balance|weigh|law|legal)\b/i, iconId: "balance-scale" },
  { re: /\b(team|group|community|together|staff|employees|members|collective)\b/i, iconId: "person-group" },
  { re: /\b(crowd|audience|public|society|population|customers|users|followers)\b/i, iconId: "crowd" },
  { re: /\b(person|people|human|individual|user|customer|someone)\b/i, iconId: "person" },
  { re: /\b(like|approve|recommend|positive|good|great|awesome|best)\b/i, iconId: "thumbs-up" },
  { re: /\b(hello|welcome|greeting|hi |greet)\b/i, iconId: "waving" },
  { re: /\b(fit|fitness|exercise|workout|sport|run|running|active|sprint)\b/i, iconId: "runner" },
  { re: /\b(worker|labor|builder|construction|crew|engineer)\b/i, iconId: "worker" },
  { re: /\b(farm|farmer|agriculture|rural|crops|field|fields)\b/i, iconId: "farmer" },
  { re: /\b(tractor|machinery|harvest equipment)\b/i, iconId: "tractor" },
  { re: /\b(cow|cattle|livestock|dairy|milk|beef)\b/i, iconId: "cow" },
  { re: /\b(chicken|poultry|hen|eggs)\b/i, iconId: "chicken" },
  { re: /\b(seed|seedling|sprout|planting|sow)\b/i, iconId: "seedling" },
  { re: /\b(wheat|grain|corn|cereal|crop|harvest|yield)\b/i, iconId: "wheat" },
  { re: /\b(greenhouse|nursery|garden|gardening)\b/i, iconId: "greenhouse" },
  { re: /\b(plant|plants|pot|flower)\b/i, iconId: "plant" },
  { re: /\b(tree|trees|forest|woods|woodland)\b/i, iconId: "tree" },
  { re: /\b(leaf|leaves|organic|eco|natural|green)\b/i, iconId: "leaf" },
  { re: /\b(water|irrigation|rainfall|liquid|hydration|raindrop)\b/i, iconId: "water-drop" },
  { re: /\b(rain|rainy|storm|weather|climate|forecast)\b/i, iconId: "rain-cloud" },
  { re: /\b(sun|sunny|sunlight|solar|daylight|shine)\b/i, iconId: "sun" },
  { re: /\b(wind|turbine|renewable|sustainable|clean energy)\b/i, iconId: "wind-turbine" },
  { re: /\b(recycle|recycling|reuse|waste|circular|sustainability)\b/i, iconId: "recycle" },
  { re: /\b(world|global|earth|planet|international|worldwide)\b/i, iconId: "earth" },
  { re: /\b(mountain|summit|peak|climb|challenge)\b/i, iconId: "mountain" },
  { re: /\b(book|read|reading|textbook|literature|chapter)\b/i, iconId: "book" },
  { re: /\b(study|studies|lesson|learn|learning|research|student|school)\b/i, iconId: "book-open" },
  { re: /\b(graduat|degree|diploma|certificate|college|university|academic)\b/i, iconId: "graduation-cap" },
  { re: /\b(write|writing|note|notes|journal|record|log)\b/i, iconId: "notebook" },
  { re: /\b(experiment|chemistry|chemical|lab|laboratory|test tube|science)\b/i, iconId: "flask" },
  { re: /\b(biology|microscope|cells|organisms|discovery|analysis)\b/i, iconId: "microscope" },
  { re: /\b(physics|atom|nuclear|particle|quantum|molecule)\b/i, iconId: "atom" },
  { re: /\b(math|mathematics|calculate|arithmetic|numbers|sum|count)\b/i, iconId: "calculator" },
  { re: /\b(classroom|teaching|chalkboard|class|instructor)\b/i, iconId: "blackboard" },
  { re: /\b(dna|genetic|gene|heredity|biotech|genome)\b/i, iconId: "dna" },
  { re: /\b(doctor|physician|medical|clinic|health|healthcare|treatment|patient)\b/i, iconId: "doctor" },
  { re: /\b(hospital|emergency|first-aid|first aid|ambulance)\b/i, iconId: "hospital-cross" },
  { re: /\b(medicine|medication|drug|pill|dose|pharmacy|tablet)\b/i, iconId: "pill" },
  { re: /\b(vaccine|vaccination|injection|syringe|immunization|shot)\b/i, iconId: "syringe" },
  { re: /\b(heart|cardio|pulse|heartbeat|blood|vitals)\b/i, iconId: "heart-pulse" },
  { re: /\b(brain|mind|thinking|memory|psychology|mental|neuro|smart)\b/i, iconId: "brain" },
  { re: /\b(tooth|teeth|dental|dentist|oral|smile)\b/i, iconId: "tooth" },
  { re: /\b(eye|vision|see|sight|watch|observe|visual|inspection)\b/i, iconId: "eye" },
  { re: /\b(temperature|fever|thermometer|heat|cold)\b/i, iconId: "thermometer" },
  { re: /\b(wrench|fix|repair|maintenance|tool|tools|settings)\b/i, iconId: "wrench" },
  { re: /\b(hammer|build|building|construction site|strike)\b/i, iconId: "hammer" },
  { re: /\b(gear|cog|process|system|configuration|machinery|engine|mechanism)\b/i, iconId: "gear" },
  { re: /\b(robot|automation|ai|artificial intelligence|machine learning|bot)\b/i, iconId: "robot" },
  { re: /\b(chip|processor|cpu|semiconductor|hardware|compute)\b/i, iconId: "chip" },
  { re: /\b(laptop|computer|pc|desktop|coding|programming|software)\b/i, iconId: "laptop" },
  { re: /\b(code|developer|script|syntax|program|api)\b/i, iconId: "code" },
  { re: /\b(database|storage|records|archive|sql|dataset)\b/i, iconId: "database" },
  { re: /\b(server|hosting|infrastructure|datacenter|cloud|saas|remote)\b/i, iconId: "server" },
  { re: /\b(wifi|wireless|internet|online|network|connection|connectivity)\b/i, iconId: "wifi" },
  { re: /\b(signal|broadcast|transmit|antenna|telecom|tower)\b/i, iconId: "signal-tower" },
  { re: /\b(battery|charge|charging|capacity|drain)\b/i, iconId: "battery" },
  { re: /\b(terminal|console|command|shell|dev ops|devops)\b/i, iconId: "terminal" },
  { re: /\b(camera|photo|photography|picture|image|capture|video)\b/i, iconId: "camera" },
  { re: /\b(smartphone|mobile|cellphone|phone|app)\b/i, iconId: "smartphone" },
  { re: /\b(tablet|ipad|screen|display|monitor|desktop)\b/i, iconId: "tablet" },
  { re: /\b(headphones|listen|audio|music|sound|voiceover|podcast)\b/i, iconId: "headphones" },
  { re: /\b(microphone|record|voice|narration|speaking)\b/i, iconId: "microphone" },
  { re: /\b(lock|locked|secure|security|private|protected|encryption|password|confidential)\b/i, iconId: "lock" },
  { re: /\b(unlock|open access|public|available|free)\b/i, iconId: "unlock" },
  { re: /\b(shield|protect|protection|defense|guard|firewall|safety)\b/i, iconId: "shield" },
  { re: /\b(verified|trusted|audited|certified|compliance)\b/i, iconId: "shield-check" },
  { re: /\b(key|credential|api key|access token|secret)\b/i, iconId: "key" },
  { re: /\b(fingerprint|identity|biometric|authenticate|verification)\b/i, iconId: "fingerprint" },
  { re: /\b(bug|defect|debug|malware|virus|vulnerability|exploit)\b/i, iconId: "bug" },
  { re: /\b(chat|message|comment|feedback|reply|conversation|talk|discuss)\b/i, iconId: "chat-bubble" },
  { re: /\b(email|mail|letter|inbox|contact|send|newsletter)\b/i, iconId: "mail" },
  { re: /\b(announce|announcement|marketing|promote|promotion|campaign|launch|loud)\b/i, iconId: "megaphone" },
  { re: /\b(call|phone call|support|hotline|ring)\b/i, iconId: "phone-call" },
  { re: /\b(share|social|distribute|spread|forward|viral|referral)\b/i, iconId: "share" },
  { re: /\b(link|url|reference|hyperlink|website|attach)\b/i, iconId: "link" },
  { re: /\b(question|ask|help|faq|support|unclear|curious|wonder)\b/i, iconId: "question" },
  { re: /\b(info|information|about|detail|explain|notice|tip)\b/i, iconId: "info" },
  { re: /\b(notification|notify|reminder|alert|alarm|attention)\b/i, iconId: "bell" },
  { re: /\b(warning|caution|danger|risk|risky|careful|hazard)\b/i, iconId: "warning-triangle" },
  { re: /\b(success|successful|complete|completed|passed|valid|approved|achieve|achievement)\b/i, iconId: "check-circle" },
  { re: /\b(ban|forbidden|blocked|denied|restricted|prohibited)\b/i, iconId: "ban" },
  { re: /\b(star|favorite|rating|featured|important|excellent)\b/i, iconId: "star" },
  { re: /\b(flag|milestone|priority|finish|mark)\b/i, iconId: "flag" },
  { re: /\b(location|place|address|destination|where|map|region)\b/i, iconId: "map-pin" },
  { re: /\b(time|timing|duration|deadline|schedule|when|minutes|hours|seconds)\b/i, iconId: "clock" },
  { re: /\b(wait|waiting|loading|processing|delay|patience)\b/i, iconId: "hourglass" },
  { re: /\b(calendar|date|month|event|deadline day|planning)\b/i, iconId: "calendar" },
  { re: /\b(idea|ideas|innovate|innovation|invent|insight|creative|creativity|solution|brainstorm)\b/i, iconId: "lightbulb" },
  { re: /\b(house|home|residence|property|real estate|living|family)\b/i, iconId: "house" },
  { re: /\b(store|shop|retail|market|commerce|shopping|sell products)\b/i, iconId: "store" },
  { re: /\b(warehouse|inventory|stock|logistics|distribution)\b/i, iconId: "warehouse" },
  { re: /\b(barn|farmhouse|rural home|homestead)\b/i, iconId: "farm-house" },
  { re: /\b(school|academy|campus|education building)\b/i, iconId: "school-building" },
  { re: /\b(factory|industry|manufacturing|production|industrial)\b/i, iconId: "factory" },
  { re: /\b(crane|construction site|hoist|lifting)\b/i, iconId: "crane" },
  { re: /\b(blueprint|design|plan|architecture|draft|schema|layout)\b/i, iconId: "blueprint" },
  { re: /\b(measure|measurement|ruler|dimension|precision|scale|size)\b/i, iconId: "ruler" },
  { re: /\b(pipeline|flow|sequence|steps|workflow|stages)\b/i, iconId: "pipeline" },
  { re: /\b(assembly|robot arm|manufacturing arm|automation line)\b/i, iconId: "robot-arm" },
  { re: /\b(bridge|connect|infrastructure|crossing|link between)\b/i, iconId: "bridge" },
  { re: /\b(car|vehicle|drive|driving|automobile|road)\b/i, iconId: "car" },
  { re: /\b(truck|delivery|shipping|logistics transport|freight|cargo)\b/i, iconId: "truck" },
  { re: /\b(bus|transit|public transport|commute)\b/i, iconId: "bus" },
  { re: /\b(bicycle|bike|cycling|ride)\b/i, iconId: "bicycle" },
  { re: /\b(plane|airplane|flight|fly|air travel|aviation)\b/i, iconId: "airplane" },
  { re: /\b(train|rail|metro|subway|journey)\b/i, iconId: "train" },
  { re: /\b(ship|boat|vessel|marine|export goods|sea)\b/i, iconId: "ship" },
  { re: /\b(rocket|launch|liftoff|spaceship|blast off|ship it)\b/i, iconId: "rocket" },
  { re: /\b(solar panel|photovoltaic|solar energy)\b/i, iconId: "solar-panel" },
  { re: /\b(trash|delete|remove|discard|garbage|litter)\b/i, iconId: "trash-bin" },
  { re: /\b(tv|television|watch video|streaming|video content)\b/i, iconId: "tv" },
  { re: /\b(print|printer|paper|report|document output)\b/i, iconId: "printer" },
  { re: /\b(watch|wristwatch|wearable|smartwatch)\b/i, iconId: "watch" },
  { re: /\b(plug|power outlet|electricity|electrical|socket)\b/i, iconId: "plug" },
  { re: /\b(speaker|present|presentation|talk|voice out|amplify)\b/i, iconId: "speaker" },
  { re: /\b(teacher|teach|educator|instructor|professor|mentor)\b/i, iconId: "teacher" },
  { re: /\b(clinic visit|stethoscope|checkup|diagnosis|examine)\b/i, iconId: "stethoscope" },
  { re: /\b(bandage|injury|wound|heal|healing|recover|recovery)\b/i, iconId: "bandage" },
  { re: /\b(backpack|bag|school bag|carry|travel pack)\b/i, iconId: "backpack" },
  { re: /\b(diploma|credential|qualification|award|certificate award)\b/i, iconId: "diploma" },
  { re: /\b(warehouse shelf|pallet|boxes)\b/i, iconId: "warehouse" },

  // ------------------------------------------------------------------
  // Phase C slice 2 — the icon wave's mention rules, APPENDED after the
  // tables above: first-hit-wins keeps every existing pick identical,
  // and every word here was mechanically audited against every earlier
  // rule (nothing already claimed — "rain" belongs to the rain-cloud,
  // "music" to the headphones, "first aid" to the hospital-cross, so the
  // new rules claim thunder/lightning, melody/song, lifesaver/rescue).
  // ------------------------------------------------------------------
  { re: /\b(snow|snowy|winter|freeze|frost|blizzard|ice)\b/i, iconId: "snowflake" },
  { re: /\b(fog|mist|haze|blur)\b/i, iconId: "fog" },
  { re: /\b(thunder|lightning|thunderstorm|tempest)\b/i, iconId: "storm-cloud" },
  { re: /\b(moon|lunar|night|midnight|overnight)\b/i, iconId: "moon" },
  { re: /\b(rainbow)\b/i, iconId: "rainbow" },
  { re: /\b(umbrella|brolly|canopy)\b/i, iconId: "umbrella" },
  { re: /\b(bread|bakery|loaf|toast|bake)\b/i, iconId: "bread" },
  { re: /\b(apple|fruit|orchard)\b/i, iconId: "apple" },
  { re: /\b(cheese|cheddar|parmesan)\b/i, iconId: "cheese" },
  { re: /\b(coffee|tea|mug|cup|espresso)\b/i, iconId: "cup" },
  { re: /\b(bowl|soup|salad|porridge)\b/i, iconId: "bowl" },
  { re: /\b(bottle|bottled)\b/i, iconId: "bottle" },
  { re: /\b(plate|dish|dinner)\b/i, iconId: "plate" },
  { re: /\b(cutlery|fork|knife|spoon|restaurant|dining)\b/i, iconId: "cutlery" },
  { re: /\b(cat|kitten|feline)\b/i, iconId: "cat" },
  { re: /\b(dog|puppy|canine)\b/i, iconId: "dog" },
  { re: /\b(bird|sparrow|pigeon)\b/i, iconId: "bird" },
  { re: /\b(fish|fishing|goldfish)\b/i, iconId: "fish" },
  { re: /\b(butterfly|insect|caterpillar)\b/i, iconId: "butterfly" },
  { re: /\b(soccer|football)\b/i, iconId: "soccer-ball" },
  { re: /\b(basketball|hoop|dribble)\b/i, iconId: "basketball" },
  { re: /\b(medal|winner|prize|honor)\b/i, iconId: "medal" },
  { re: /\b(trophy|champion|victory)\b/i, iconId: "trophy" },
  { re: /\b(melody|song|tune|hum)\b/i, iconId: "music-note" },
  { re: /\b(drum|beat|rhythm|percussion)\b/i, iconId: "drum" },
  { re: /\b(guitar|acoustic|banjo)\b/i, iconId: "guitar" },
  { re: /\b(debit|checkout)\b/i, iconId: "credit-card" },
  { re: /\b(fortune|windfall|jackpot)\b/i, iconId: "money-bag" },
  { re: /\b(nest egg|pile|stacked)\b/i, iconId: "coins-stack" },
  { re: /\b(handsaw|carpentry)\b/i, iconId: "saw" },
  { re: /\b(shovel|spade|digging|excavate|excavating)\b/i, iconId: "shovel" },
  { re: /\b(wheelbarrow|barrow|cart)\b/i, iconId: "wheelbarrow" },
  { re: /\b(ladder|step ladder)\b/i, iconId: "ladder" },
  { re: /\b(stopwatch|countdown)\b/i, iconId: "stopwatch" },
  { re: /\b(wake|morning)\b/i, iconId: "alarm-clock" },
  { re: /\b(bloom|blossom|tulip|bouquet|petal|rose)\b/i, iconId: "flower" },
  { re: /\b(mushroom|fungi|toadstool)\b/i, iconId: "mushroom" },
  { re: /\b(cactus|desert|succulent)\b/i, iconId: "cactus" },
  { re: /\b(origami)\b/i, iconId: "paper-plane" },
  { re: /\b(lifesaver|rescue|overboard)\b/i, iconId: "life-ring" },
  { re: /\b(helmet|hard hat)\b/i, iconId: "helmet" },
  { re: /\b(chair|seat|sit|sitting)\b/i, iconId: "chair" },
  { re: /\b(bed|sleep|bedroom|bedtime|nap)\b/i, iconId: "bed" },
  { re: /\b(door|doorway|entrance|gate)\b/i, iconId: "door" },
  { re: /\b(stairs|staircase|escalator)\b/i, iconId: "stairs" },
  { re: /\b(keyboard|typing)\b/i, iconId: "keyboard" },
  { re: /\b(satellite|orbit|spacecraft)\b/i, iconId: "satellite" },
  { re: /\b(transmitter|radio|mast|aerial)\b/i, iconId: "antenna" },
  { re: /\b(windmill|mill|grind)\b/i, iconId: "windmill" },
];

/** The no-cue fallback cycle (deterministic by scene position): a diverse
 *  rotation across the vocabulary so consecutive iconless scenes don't
 *  stamp the same mark. Every id must exist in GRAPHICS_ICON_LIBRARY — the
 *  catalog contract suite pins that. */
/** Exported for the catalog integrity suite (the dead-end law). */
export const FALLBACK_ICON_CYCLE = [
  "lightbulb",
  "chart-up",
  "rocket",
  "target",
  "book-open",
  "clock",
  "person-group",
  "check-circle",
  "seedling",
  "gear",
  "chart-down",
  "star",
] as const;

// ---------------------------------------------------------------------------
// The rule tables — deterministic keyword → archetype matching
// ---------------------------------------------------------------------------

/** Enumeration cues → the bullet-list archetype. */
const ENUM_RE =
  /\b(first|second|third|next|then|finally|step|steps|reasons|ways|tips|rules|principles|one|two|three)\b/i;

/** Data cues + ≥2 numbers → the chart archetype (the bar grammar is
 *  data-driven; a chart without numbers in the story would be an
 *  invention). */
const DATA_CUE_RE =
  /\b(chart|graph|data|compare|comparison|comparing|versus|vs\.?|than|rank|ranking|leaderboard|market share|share|percentages?)\b/i;

/** A REAL quoted span — the quote archetype's cue. The law is TIGHT on
 *  purpose: only an actual quotation (straight or curly quotes, ≥ 3
 *  chars of content) counts. Words like "said" alone never fire — the
 *  pinned narrations must not move, and a paraphrase is not a quote. */
const QUOTED_SPAN_RE = /["“«]([^"”»]{3,})["”»]/;

/** The quote scene's story-derived content: the FIRST quoted span (capped
 *  — the ONE capLine law) plus the attribution tail AFTER the original
 *  match (searching the capped string would miss — the cap collapses
 *  whitespace). Null when the story quotes nothing (the archetype falls
 *  through); the attribution is undefined when the closing quote ends the
 *  narration (the part omits itself — no invented source). */
function extractQuoteContent(text: string): { quote: string; attribution?: string } | null {
  const m = QUOTED_SPAN_RE.exec(text);
  const inner = (m?.[1] ?? "").trim();
  if (inner.length < 3 || m === null) return null;
  const tail = text.slice(m.index + m[0].length);
  const cleaned = tail.replace(/^[\s—–\-:,.;"”»]+/, "").replace(/["“].*$/, "").trim();
  return {
    quote: capLine(inner, 120),
    ...(cleaned.split(/\s+/).filter(Boolean).length >= 1 ? { attribution: capLine(cleaned, 120) } : {}),
  };
}

/** Numbers (with their raw text and an optional unit) — the stat/chart
 *  detector's unit of account. Commas inside values are out of scope v1
 *  (a "1,200" reads as two numbers — an honest scaffold limitation the
 *  user edits from). */
const NUMBER_RE = /(\d+(?:\.\d+)?)\s*(%|percent|percentage|×|x)?/gi;

interface NumberMatch {
  raw: string;
  value: number;
  decimals: number;
  unit?: string;
}

function scanNumbers(text: string): NumberMatch[] {
  const out: NumberMatch[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = (m[0] ?? "").trim();
    if (raw === "") continue;
    const value = Number.parseFloat(m[1] ?? "");
    if (!Number.isFinite(value)) continue;
    const frac = (m[1] ?? "").split(".")[1] ?? "";
    const unitRaw = (m[2] ?? "").toLowerCase();
    const unit = unitRaw === "%" || unitRaw === "percent" || unitRaw === "percentage"
      ? "%"
      : unitRaw === "x" || unitRaw === "×"
        ? "×"
        : undefined;
    out.push({ raw, value, decimals: Math.min(frac.length, 2), unit });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase C — the native defaults moved to ./native-defaults.ts (the ONE
// source of the placement table, the enter/exit/camera choreography, and
// the two text helpers). planner.ts RE-EXPORTS every name so every legacy
// import path (llm-planner.ts, the unit suite, stored catalogs) keeps
// resolving — never a second table (the icon move's law, G1.5). The seam
// breaks the adoption cycle: the design-system modules (recipes.ts,
// components.ts) ride the defaults without importing the planner, while
// the planner adopts their registries below.
// ---------------------------------------------------------------------------

export {
  DEFAULT_PLACEMENT_169,
  DEFAULT_SIZE_PX,
  GRAPHICS_CAMERA_PUSH_ZOOM,
  GRAPHICS_EXIT_STAGGER_MS,
  capLine,
  nativeCameraFor,
  nativeEnterFor,
  nativeExitFor,
  nativePlacementFor,
  remapPlacement,
  textPayload,
} from "./native-defaults";


// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/** Snap caller geometry onto the house surface table (the validator only
 *  accepts the three native sizes) — nearest by aspect-ratio distance,
 *  ties break toward the earlier (wider) surface. Junk/absent → 16:9. */
function snapSurface(width?: number, height?: number): readonly [number, number] {
  if (
    typeof width !== "number" || !Number.isFinite(width) || width <= 0 ||
    typeof height !== "number" || !Number.isFinite(height) || height <= 0
  ) {
    return GRAPHICS_SURFACES[0] ?? [1920, 1080];
  }
  const ratio = width / height;
  let best: readonly [number, number] = GRAPHICS_SURFACES[0] ?? [1920, 1080];
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of GRAPHICS_SURFACES) {
    const d = Math.abs(Math.log(ratio) - Math.log(s[0] / s[1]));
    if (d < bestD - 1e-9) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function element(
  id: string,
  kind: GraphicsElementKind,
  at: Placement,
  order: number,
  extra: Partial<GraphicsElement>,
): GraphicsElement {
  return { id, kind, at, enter: nativeEnterFor(kind, order), ...extra };
}

/** The deterministic selection: the ordered rule table, first hit wins,
 *  then the no-cue fallback cycle by scene position. Exported for the
 *  batteries (ONE selection law, testable where it lives). */
export function iconForScene(text: string, position: number): string {
  for (const pick of ICON_KEYWORD_PICKS) {
    if (pick.re.test(text)) return pick.iconId;
  }
  return FALLBACK_ICON_CYCLE[position % FALLBACK_ICON_CYCLE.length] ?? "lightbulb";
}

function bulletElements(narration: string, maxBullets: number, width: number, height: number): GraphicsElement[] {
  const sentences = splitSentences(narration).filter((s) => s.trim() !== "");
  const out: GraphicsElement[] = [];
  for (let i = 0; i < Math.min(sentences.length, maxBullets); i++) {
    const s = sentences[i];
    if (s === undefined) continue;
    out.push(
      element(
        `bullet-${i + 1}`,
        "bullet",
        remapPlacement({ x: 960, y: 590 + 150 * i, scale: 1, rotateDeg: 0 }, width, height),
        i,
        { text: textPayload("bullet", capLine(s)) },
      ),
    );
  }
  return out;
}

function headlineAt(width: number, height: number, text: string, y: number, sizePx: number): GraphicsElement {
  return element("headline", "headline", remapPlacement({ x: 960, y, scale: 1, rotateDeg: 0 }, width, height), 0, {
    text: { text, sizePx },
  });
}

/**
 * Build the starter GraphicsDoc. PURE and DETERMINISTIC: same scenes →
 * the same doc JSON byte-for-byte. The caller has already enforced the
 * scene-count wall — this function refuses beyond it rather than
 * silently truncating, and refuses an empty story (a doc without scenes
 * is not an empty state, it is a bug).
 *
 * Geometry is OPTIONAL and snaps onto the house surface table (the
 * validator accepts exactly the three native sizes — the planner never
 * produces a doc the validator would refuse on surface grounds).
 */
export function scaffoldGraphicsDoc(input: {
  scenes: GraphicsSceneInput[];
  topic: string;
  width?: number;
  height?: number;
  fps?: number;
}): GraphicsDoc {
  if (input.scenes.length === 0) {
    throw new Error("graphics scaffold needs at least one story scene");
  }
  if (input.scenes.length > GRAPHICS_BUDGETS.scenesPerProject) {
    throw new Error(
      `graphics scaffold: ${input.scenes.length} scenes exceeds the ${GRAPHICS_BUDGETS.scenesPerProject}-scene project budget — trim the story first`,
    );
  }

  const [width, height] = snapSurface(input.width, input.height);
  const fps = input.fps === 30 ? 30 : 24;
  const topic = capLine(input.topic, 120);

  const draft: GraphicsScene[] = input.scenes.map((s, i) => {
    const isFirst = i === 0;
    const isLast = i === input.scenes.length - 1 && input.scenes.length > 1;
    const narrationText = `${s.title} ${s.narration}`;
    const numbers = scanNumbers(s.narration);
    const elements: GraphicsElement[] = [];

    if (isFirst || isLast) {
      // The opener / closer: the structural cards — title + topic kicker,
      // the opener with a keyword-picked icon accent.
      elements.push(
        element("title", "headline", remapPlacement({ x: 960, y: isFirst ? 480 : 460, scale: 1, rotateDeg: 0 }, width, height), 0, {
          text: { ...textPayload("headline", capLine(s.title || s.narration, 80)), ...(isLast ? { sizePx: 72 } : { sizePx: 76 }) },
        }),
      );
      elements.push(
        element("kicker", "subhead", remapPlacement({ x: 960, y: isFirst ? 620 : 610, scale: 1, rotateDeg: 0 }, width, height), 0, {
          text: textPayload("subhead", topic),
        }),
      );
      if (isFirst) {
        const iconId = iconForScene(narrationText, i);
        const icon = GRAPHICS_ICON_LIBRARY[iconId];
        if (icon !== undefined) {
          elements.push(
            element("accent", "icon", remapPlacement(DEFAULT_PLACEMENT_169.icon, width, height), 0, {
              icon: { paths: [...icon.paths] },
            }),
          );
        }
      }
      return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
    }

    // The chart archetype: a data cue + ≥2 numbers → the numbers BECOME
    // the chart (label = the number's own rendered form — honest until
    // the user renames; all-zero data degrades to the default scene).
    const chartRows: BarDatum[] = numbers
      .slice(0, GRAPHICS_BUDGETS.barDataMax)
      .map((n) => ({ label: n.raw, value: n.value }));
    if (DATA_CUE_RE.test(s.narration) && numbers.length >= 2 && chartRows.some((r) => r.value > 0)) {
      elements.push(headlineAt(width, height, capLine(s.title || s.narration, 80), 200, 64));
      elements.push(
        element("chart", "barChart", remapPlacement(DEFAULT_PLACEMENT_169.barChart, width, height), 0, {
          bar: { data: chartRows },
        }),
      );
      return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
    }

    // The stat archetype: exactly one number → a counter counting UP to
    // it (the v1 count-up law: from 0 < to; a non-positive or degenerate
    // number degrades to the default scene).
    if (numbers.length === 1 && numbers[0] !== undefined) {
      const n = numbers[0];
      if (n.value > 0) {
        elements.push(
          element("stat", "counter", remapPlacement(DEFAULT_PLACEMENT_169.counter, width, height), 0, {
            counter: { from: 0, to: n.value, ...(n.unit !== undefined ? { unit: n.unit } : {}), ...(n.decimals > 0 ? { decimals: n.decimals as 0 | 1 | 2 } : {}) },
          }),
        );
        const context = splitSentences(s.narration)[0] ?? s.title;
        elements.push(
          element("context", "subhead", remapPlacement(DEFAULT_PLACEMENT_169.subhead, width, height), 0, {
            text: textPayload("subhead", capLine(context, 120)),
          }),
        );
        return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
      }
    }

    // The quote archetype (Phase C — the design system's first adoption):
    // a REAL quoted span in the story → the big-quote component (the
    // registry expansion — named, addressable parts, no new grammar).
    // Ordered AFTER chart/stat so data scenes stay data scenes; a quoted
    // span is testimony, and testimony that carries numbers is still
    // testimony — but a narration WITH a data cue and ≥2 numbers reads as
    // a chart first (the archetype order IS the policy, first-hit-wins).
    // The content law: the quote text is the story's own quoted span; the
    // attribution is the story's text after the closing quote — the
    // expansion invents nothing.
    const quoteContent = extractQuoteContent(s.narration);
    if (quoteContent !== null) {
      elements.push(...expandComponent("big-quote", {
        text: quoteContent.quote,
        ...(quoteContent.attribution !== undefined ? { sub: quoteContent.attribution } : {}),
      }, { width, height }));
      return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
    }

    // The list archetype: enumeration cues or a sentence-rich scene →
    // headline + up to three bullets.
    if (ENUM_RE.test(s.narration) || splitSentences(s.narration).length >= 3) {
      elements.push(headlineAt(width, height, capLine(s.title || s.narration, 80), 230, 64));
      elements.push(...bulletElements(s.narration, 3, width, height));
      return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
    }

    // The default archetype: kinetic headline + up to two bullets.
    elements.push(headlineAt(width, height, capLine(s.title || s.narration, 80), 400, 64));
    elements.push(...bulletElements(s.narration, 2, width, height));
    return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
  });

  // S162 part 2 — the staged exit + the camera breathe. Every element
  // leaves as deliberately as it entered (nativeExitFor), and every scene
  // carries the push (nativeCameraFor). ONE clock per scene:
  // estimateNarrationMs of the SAME narration the frame engine resolves —
  // with no VO the plan IS the delivered clock (the exit windows land on
  // the real tail). The additive-seam law holds both ways: a doc WITHOUT
  // these fields renders byte-identically (the appliers no-op); THIS
  // scaffold now emits them, which is the deliberate visual change the
  // golden harness re-baselines on purpose.
  const staged: GraphicsScene[] = draft.map((scene) => {
    const sceneMs = estimateNarrationMs(scene.narration);
    const counts = new Map<string, number>();
    for (const el of scene.elements) counts.set(el.kind, (counts.get(el.kind) ?? 0) + 1);
    const seen = new Map<string, number>();
    const elements = scene.elements.map((el) => {
      const order = seen.get(el.kind) ?? 0;
      seen.set(el.kind, order + 1);
      const count = counts.get(el.kind) ?? 1;
      return { ...el, exit: nativeExitFor(el.kind, order, sceneMs, count) };
    });
    return { ...scene, elements, camera: nativeCameraFor(sceneMs) };
  });

  return {
    version: GRAPHICS_VERSION,
    title: input.topic ? `Graphics — ${topic}`.slice(0, 120) : "Graphics",
    width,
    height,
    fps,
    scenes: staged,
  };
}
