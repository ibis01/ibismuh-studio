#!/usr/bin/env python3
# Phase 7 — the graphics advance-width table generator.
#
#   python3 scripts/phase7-generate-graphics-advances.py            # writes the TS table
#   python3 scripts/phase7-generate-graphics-advances.py --verify   # byte-verify only
#
# The law (the W4 glyph-table precedent, scripts/w4-generate-glyphs.py):
# the graphics layout seam measures text through a COMMITTED advance-width
# table — the runtime (font-metrics.ts) never parses fonts, never touches a
# DOM canvas, so every layout solve on every machine produces byte-identical
# boxes (the determinism pin). The generator is the only place fontTools
# exists; it is not an npm dependency.
#
# WHICH FACE: the graphics composer draws every <text> with the CSS stack
# `Arial,Helvetica,sans-serif` (compose.ts, one source). The render farm
# installs `fonts-liberation` (Dockerfile) and fontconfig maps Arial onto
# Liberation Sans — the metrics-compatible Arial substitute. The committed
# faces ARE the faces the farm rasterizes with: Liberation Sans Regular
# (weight class 400 — the chart labels' drawn weight) and Bold (700 — the
# compose default text weight). Both ship under the SIL OFL 1.1
# (public/fonts/liberation/OFL.txt), attribution preserved.
#
# Inputs are PINNED: font file sha256s (recorded in the table + the
# baseline receipt), charset (ASCII 0x20-0x7E), upem. Re-running with the
# same inputs is byte-identical (checked by --verify and by the battery
# through the table's own hash constant).

import argparse
import hashlib
import io
import json
import os
import sys
from hashlib import sha256

from fontTools.ttLib import TTFont

# --- pinned inputs -----------------------------------------------------------
FONT_DIR = "public/fonts/liberation"
FACES = [
    # (weight class, file name) — the two faces the CSS stack resolves to
    (400, "LiberationSans-Regular.ttf"),
    (700, "LiberationSans-Bold.ttf"),
]
FAMILY = "Liberation Sans"
CSS_STACK = "Arial,Helvetica,sans-serif"
FONT_ID = "liberation-sans-w400-w700"
# ASCII printable — the table's coverage contract (the graphics grammar's
# authoring surface is ASCII; uncovered chars fall back per-char honestly).
CHARSET = [chr(c) for c in range(0x20, 0x7F)]
OUT_REL = "src/lib/ibismuh/graphics/font-advances.ts"
RECEIPT_REL = "docs/baselines/phase7-graphics-advance-table-receipt.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    args = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(root, OUT_REL)
    receipt_path = os.path.join(root, RECEIPT_REL)

    face_rows = []
    upem_ref = None
    for weight_class, file_name in FACES:
        font_path = os.path.join(root, FONT_DIR, file_name)
        raw = open(font_path, "rb").read()
        font_sha = sha256(raw).hexdigest()
        f = TTFont(io.BytesIO(raw))
        upem = f["head"].unitsPerEm
        if upem_ref is None:
            upem_ref = upem
        elif upem != upem_ref:
            print(f"FAIL: {file_name} upem {upem} differs from the family's {upem_ref}", file=sys.stderr)
            return 1
        cmap = f.getBestCmap()
        hmtx = f["hmtx"]
        advances = {}
        for ch in CHARSET:
            code = ord(ch)
            gname = cmap.get(code)
            if gname is None:
                print(f"FAIL: charset char {ch!r} (U+{code:04X}) missing from {file_name}", file=sys.stderr)
                return 1
            advances[ch] = int(hmtx[gname][0])
        face_rows.append({
            "weightClass": weight_class,
            "fontFile": f"{FONT_DIR}/{file_name}",
            "fontSha256": font_sha,
            "advances": advances,
        })

    payload = {
        "fontId": FONT_ID,
        "family": FAMILY,
        "cssStack": CSS_STACK,
        "upem": upem_ref,
        "charset": "ASCII 0x20-0x7E",
        "faces": face_rows,
    }
    body = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=False)
    table_sha = sha256(body.encode()).hexdigest()

    header = (
        "// font-advances.ts — the GRAPHICS ADVANCE-WIDTH TABLE (GENERATED FILE).\n"
        "// Source: Liberation Sans (SIL OFL 1.1) — the metrics-compatible Arial\n"
        "// substitute fontconfig maps the compose CSS stack onto (see\n"
        "// scripts/phase7-generate-graphics-advances.py for the full provenance).\n"
        f"// Generator: {os.path.basename(sys.argv[0])} — DO NOT EDIT BY HAND.\n"
        "// face sha256s: see the faces' fontSha256 rows (pinned in the baseline receipt).\n"
        f"// family: {FAMILY} · upem: {upem_ref} · charset: ASCII 0x20–0x7E\n"
        "// The runtime reads THIS table (no font parsing, no DOM canvas) — the\n"
        "// determinism pin's whole point: same commit, same advances, every machine.\n"
    )
    ts = header + "\nexport interface GraphicsAdvanceFace {\n  weightClass: number;\n  fontFile: string;\n  fontSha256: string;\n  /** Advance width in font units per ASCII char. */\n  advances: Record<string, number>;\n}\n\n"
    ts += "export const GRAPHICS_ADVANCE_TABLE_JSON =\n"
    # chunk the JSON into quoted lines for a stable, reviewable diff
    for i in range(0, len(body), 100):
        ts += f"  {json.dumps(body[i:i+100])} +\n"
    ts = ts.rstrip(" +\n") + ";\n\n"
    ts += (
        "export const GRAPHICS_ADVANCE_TABLE: {\n"
        "  fontId: string;\n"
        "  family: string;\n"
        "  cssStack: string;\n"
        "  upem: number;\n"
        "  charset: string;\n"
        "  faces: GraphicsAdvanceFace[];\n"
        "} = JSON.parse(GRAPHICS_ADVANCE_TABLE_JSON) as {\n"
        "  fontId: string;\n"
        "  family: string;\n"
        "  cssStack: string;\n"
        "  upem: number;\n"
        "  charset: string;\n"
        "  faces: GraphicsAdvanceFace[];\n"
        "};\n"
    )
    ts += (
        "\n/** The table's own content hash — the battery pins it so an\n"
        " *  accidental regeneration (different face, charset, upem) cannot\n"
        " *  land silently. Regenerate deliberately, update the pin, review the diff. */\n"
        f"export const GRAPHICS_ADVANCE_TABLE_SHA256 = {json.dumps(table_sha)};\n"
    )

    if args.verify:
        current = open(out_path, "r", encoding="utf-8").read()
        print("VERIFY:", "byte-identical" if current == ts else "DRIFTED")
        return 0 if current == ts else 1

    open(out_path, "w", encoding="utf-8").write(ts)
    receipt = {
        "fontId": FONT_ID,
        "family": FAMILY,
        "cssStack": CSS_STACK,
        "upem": upem_ref,
        "charset": "ASCII 0x20-0x7E",
        "faces": [
            {
                "weightClass": fr["weightClass"],
                "fontFile": fr["fontFile"],
                "fontSha256": fr["fontSha256"],
                "advanceCount": len(fr["advances"]),
            }
            for fr in face_rows
        ],
        "tableSha256": table_sha,
    }
    open(receipt_path, "w", encoding="utf-8").write(json.dumps(receipt, indent=2) + "\n")
    print(f"wrote {OUT_REL} ({sum(len(fr['advances']) for fr in face_rows)} advances across {len(face_rows)} faces, table sha256 {table_sha[:12]}…)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
