// font-advances.ts — the GRAPHICS ADVANCE-WIDTH TABLE (GENERATED FILE).
// Source: Liberation Sans (SIL OFL 1.1) — the metrics-compatible Arial
// substitute fontconfig maps the compose CSS stack onto (see
// scripts/phase7-generate-graphics-advances.py for the full provenance).
// Generator: phase7-generate-graphics-advances.py — DO NOT EDIT BY HAND.
// face sha256s: see the faces' fontSha256 rows (pinned in the baseline receipt).
// family: Liberation Sans · upem: 2048 · charset: ASCII 0x20–0x7E
// The runtime reads THIS table (no font parsing, no DOM canvas) — the
// determinism pin's whole point: same commit, same advances, every machine.

export interface GraphicsAdvanceFace {
  weightClass: number;
  fontFile: string;
  fontSha256: string;
  /** Advance width in font units per ASCII char. */
  advances: Record<string, number>;
}

export const GRAPHICS_ADVANCE_TABLE_JSON =
  "{\"fontId\":\"liberation-sans-w400-w700\",\"family\":\"Liberation Sans\",\"cssStack\":\"Arial,Helvetica,sans-se" +
  "rif\",\"upem\":2048,\"charset\":\"ASCII 0x20-0x7E\",\"faces\":[{\"weightClass\":400,\"fontFile\":\"public/fonts/li" +
  "beration/LiberationSans-Regular.ttf\",\"fontSha256\":\"bade59d822652f76e6941aa87b40a87c13d1cc70db98ededb" +
  "5011127efafd1d3\",\"advances\":{\" \":569,\"!\":569,\"\\\"\":727,\"#\":1139,\"$\":1139,\"%\":1821,\"&\":1366,\"'\":391,\"(" +
  "\":682,\")\":682,\"*\":797,\"+\":1196,\",\":569,\"-\":682,\".\":569,\"/\":569,\"0\":1139,\"1\":1139,\"2\":1139,\"3\":1139,\"" +
  "4\":1139,\"5\":1139,\"6\":1139,\"7\":1139,\"8\":1139,\"9\":1139,\":\":569,\";\":569,\"<\":1196,\"=\":1196,\">\":1196,\"?\":" +
  "1139,\"@\":2079,\"A\":1366,\"B\":1366,\"C\":1479,\"D\":1479,\"E\":1366,\"F\":1251,\"G\":1593,\"H\":1479,\"I\":569,\"J\":10" +
  "24,\"K\":1366,\"L\":1139,\"M\":1706,\"N\":1479,\"O\":1593,\"P\":1366,\"Q\":1593,\"R\":1479,\"S\":1366,\"T\":1251,\"U\":147" +
  "9,\"V\":1366,\"W\":1933,\"X\":1366,\"Y\":1366,\"Z\":1251,\"[\":569,\"\\\\\":569,\"]\":569,\"^\":961,\"_\":1139,\"`\":682,\"a\"" +
  ":1139,\"b\":1139,\"c\":1024,\"d\":1139,\"e\":1139,\"f\":569,\"g\":1139,\"h\":1139,\"i\":455,\"j\":455,\"k\":1024,\"l\":455" +
  ",\"m\":1706,\"n\":1139,\"o\":1139,\"p\":1139,\"q\":1139,\"r\":682,\"s\":1024,\"t\":569,\"u\":1139,\"v\":1024,\"w\":1479,\"x" +
  "\":1024,\"y\":1024,\"z\":1024,\"{\":684,\"|\":532,\"}\":684,\"~\":1196}},{\"weightClass\":700,\"fontFile\":\"public/fo" +
  "nts/liberation/LiberationSans-Bold.ttf\",\"fontSha256\":\"1b5f2da6f4cadce4c05b9ecebe3a6fcd374eb95ae44360" +
  "5e799f4c3287978939\",\"advances\":{\" \":569,\"!\":682,\"\\\"\":971,\"#\":1139,\"$\":1139,\"%\":1821,\"&\":1479,\"'\":487" +
  ",\"(\":682,\")\":682,\"*\":797,\"+\":1196,\",\":569,\"-\":682,\".\":569,\"/\":569,\"0\":1139,\"1\":1139,\"2\":1139,\"3\":113" +
  "9,\"4\":1139,\"5\":1139,\"6\":1139,\"7\":1139,\"8\":1139,\"9\":1139,\":\":682,\";\":682,\"<\":1196,\"=\":1196,\">\":1196,\"" +
  "?\":1251,\"@\":1997,\"A\":1479,\"B\":1479,\"C\":1479,\"D\":1479,\"E\":1366,\"F\":1251,\"G\":1593,\"H\":1479,\"I\":569,\"J\"" +
  ":1139,\"K\":1479,\"L\":1251,\"M\":1706,\"N\":1479,\"O\":1593,\"P\":1366,\"Q\":1593,\"R\":1479,\"S\":1366,\"T\":1251,\"U\":" +
  "1479,\"V\":1366,\"W\":1933,\"X\":1366,\"Y\":1366,\"Z\":1251,\"[\":682,\"\\\\\":569,\"]\":682,\"^\":1196,\"_\":1139,\"`\":682" +
  ",\"a\":1139,\"b\":1251,\"c\":1139,\"d\":1251,\"e\":1139,\"f\":682,\"g\":1251,\"h\":1251,\"i\":569,\"j\":569,\"k\":1139,\"l\"" +
  ":569,\"m\":1821,\"n\":1251,\"o\":1251,\"p\":1251,\"q\":1251,\"r\":797,\"s\":1139,\"t\":682,\"u\":1251,\"v\":1139,\"w\":159" +
  "3,\"x\":1139,\"y\":1139,\"z\":1024,\"{\":797,\"|\":573,\"}\":797,\"~\":1196}}]}";

export const GRAPHICS_ADVANCE_TABLE: {
  fontId: string;
  family: string;
  cssStack: string;
  upem: number;
  charset: string;
  faces: GraphicsAdvanceFace[];
} = JSON.parse(GRAPHICS_ADVANCE_TABLE_JSON) as {
  fontId: string;
  family: string;
  cssStack: string;
  upem: number;
  charset: string;
  faces: GraphicsAdvanceFace[];
};

/** The table's own content hash — the battery pins it so an
 *  accidental regeneration (different face, charset, upem) cannot
 *  land silently. Regenerate deliberately, update the pin, review the diff. */
export const GRAPHICS_ADVANCE_TABLE_SHA256 = "1546ae0c3ba27a4987edf5c7ce549de44793e92828a818f0c3a40d38f993de51";
