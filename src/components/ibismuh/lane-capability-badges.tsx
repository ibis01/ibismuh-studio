"use client";

// lane-capability-badges.ts — HONEST CAPABILITY BADGES (master plan §6.5).
//
// The premium-UX law: expose system truth rather than hide limitations
// behind polished cards. Every badge here is DERIVED from the canonical
// lane registry (video-lanes.ts) — capabilities, and where a lane declares
// modes (character: Rig attached / Storyboard fallback), render straight
// from the contract. Nothing in this file carries lane literals; a new
// capability or mode in the registry shows up here automatically, and an
// unknown id renders RAW (fail-visible) instead of silently vanishing.

import { Badge } from "@/components/ui/badge";
import { clsx } from "clsx";
import { LANE_REGISTRY, type VideoType } from "@/lib/ibismuh/video-lanes";

/** Honest labels for the closed capability vocabulary (video-lanes.ts). */
export const CAPABILITY_LABELS: Record<string, { label: string; tone: "positive" | "neutral" }> = {
  "image-provider": { label: "Uses image provider", tone: "neutral" },
  "voice-provider": { label: "Uses voice provider", tone: "neutral" },
  "measured-audio": { label: "Measured timing", tone: "positive" },
  "word-anchors": { label: "Word anchors", tone: "positive" },
  "native-rig": { label: "Rig channel", tone: "positive" },
  "chromium-engine": { label: "Chromium render", tone: "neutral" },
  "ffmpeg-compositor": { label: "FFmpeg compositor", tone: "neutral" },
  "image-free-render": { label: "Image-free render", tone: "positive" },
};

const chipTone = (tone: "positive" | "neutral") =>
  tone === "positive"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : "border-border bg-muted/40 text-muted-foreground";

/** The capability chips for one lane — read straight from the registry. */
export function LaneCapabilityChips({ lane }: { lane: VideoType }) {
  const contract = LANE_REGISTRY[lane];
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {contract.capabilities.map((cap) => {
        const meta = CAPABILITY_LABELS[cap];
        return (
          <Badge
            key={cap}
            variant="outline"
            title={meta ? `${meta.label} — declared capability of the ${contract.type} lane` : `Undeclared capability id: ${cap}`}
            className={clsx(
              "text-xs font-normal px-1.5 py-0 rounded-md",
              meta ? chipTone(meta.tone) : "border-amber-400/40 bg-amber-400/10 text-amber-200",
            )}
          >
            {meta?.label ?? cap}
          </Badge>
        );
      })}
    </div>
  );
}

/** The declared mode chips for one lane (absent modes render nothing —
 *  a lane that runs exactly one way needs no disclosure). */
export function LaneModeChips({ lane }: { lane: VideoType }) {
  const modes = LANE_REGISTRY[lane].modes;
  if (!modes) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {modes.map((mode) => (
        <Badge
          key={mode.id}
          variant="outline"
          title={mode.when}
          className="text-xs font-normal px-1.5 py-0 rounded-md border-primary/30 bg-primary/10 text-foreground"
        >
          {mode.label}
        </Badge>
      ))}
    </div>
  );
}

/** The full capability + mode truth block for one lane (create cards,
 *  detail headers — anywhere the lane identity is shown). */
export function LaneTruthChips({ lane }: { lane: VideoType }) {
  return (
    <>
      <LaneCapabilityChips lane={lane} />
      <LaneModeChips lane={lane} />
    </>
  );
}
