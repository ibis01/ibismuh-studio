"use client";

import { useEffect, useState } from "react";
import { useAppStore, type ViewId } from "@/lib/store";
import { IbismuhLogo, IbismuhWordmark } from "@/components/ibismuh/logo";
import {
  House,
  Wand2,
  Clapperboard,
  Library,
  LayoutGrid,
  Brush,
  Film,
  Package,
  Users,
  Globe,
  Mic,
  TrendingUp,
  Radar,
  CalendarDays,
  Tv,
  Settings,
  LogOut,
} from "lucide-react";

/**
 * 2026-11 navigation law — EVERY page is a first-class, visible destination.
 * The previous B1 architecture (four hub destinations + Settings) buried
 * Cast/World/Voice inside "Assets" and Analytics/Topic Radar/Calendar/
 * Channels inside "Insights": pages the operator could not see did not
 * exist for them. The hub tabs still work (the Assets/Insights ViewIds are
 * unchanged and keep their HubTabs strips), but the sidebar now lists all
 * of them DIRECTLY, grouped so the map still reads at a glance.
 *
 * 2026-11 operator ruling — "every feature must have its page, bold and
 * clear, not cramped into another page": the five production-workspace areas
 * (Director, Storyboard, Canvas, Timeline Studio, Inspector) now also sit in
 * the sidebar under Production. Each owns a page with its own hash and
 * header; clicking one with no project open lands the pointed empty state
 * that points at Projects — the map never hides a destination.
 *
 * Nav ids are ViewIds, so the ⌘K palette and every programmatic
 * `setView(...)` keep working unchanged.
 */
export const NAV_ITEMS: {
  id: ViewId;
  label: string;
  icon: typeof House;
  hint: string;
  group: "Studio" | "Production" | "Assets" | "Insights" | "Account";
}[] = [
  {
    id: "dashboard",
    label: "Home",
    icon: House,
    hint: "Recent projects & activity",
    group: "Studio",
  },
  {
    id: "create",
    label: "New Project",
    icon: Wand2,
    hint: "Start a new video project",
    group: "Studio",
  },
  {
    id: "library",
    label: "Projects",
    icon: Library,
    hint: "All projects & the workspace",
    group: "Studio",
  },
  {
    id: "director",
    label: "Director",
    icon: Clapperboard,
    hint: "The story page — brief, script beats, pacing",
    group: "Production",
  },
  {
    id: "storyboard",
    label: "Storyboard",
    icon: LayoutGrid,
    hint: "Every scene's frame — generate & re-roll",
    group: "Production",
  },
  {
    id: "canvas",
    label: "Canvas",
    icon: Brush,
    hint: "Scene-by-scene editing & repainting",
    group: "Production",
  },
  {
    id: "timeline",
    label: "Timeline Studio",
    icon: Film,
    hint: "Lanes, live preview, render & ship",
    group: "Production",
  },
  {
    id: "inspector",
    label: "Inspector",
    icon: Package,
    hint: "QC scorecard, voice, publishing",
    group: "Production",
  },
  {
    id: "cast",
    label: "Cast",
    icon: Users,
    hint: "Characters & their looks",
    group: "Assets",
  },
  {
    id: "world",
    label: "World",
    icon: Globe,
    hint: "Locations & world bible",
    group: "Assets",
  },
  {
    id: "voice",
    label: "Voice Studio",
    icon: Mic,
    hint: "Voices, narration & music",
    group: "Assets",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: TrendingUp,
    hint: "Performance & costs",
    group: "Insights",
  },
  {
    id: "research",
    label: "Topic Radar",
    icon: Radar,
    hint: "Trending topics & ideas",
    group: "Insights",
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    hint: "Publishing schedule",
    group: "Insights",
  },
  {
    id: "channels",
    label: "Channels",
    icon: Tv,
    hint: "Connected channels & brands",
    group: "Insights",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    hint: "Preferences",
    group: "Account",
  },
];

export const MOBILE_NAV_ITEMS = NAV_ITEMS;

/** Which sidebar item the currently active view lights up. Every direct
 *  destination lights ITSELF; the two hub ids (kept for palette/deep-link
 *  compatibility) and the per-project landing view fall back to the
 *  destination that owns them. */
export function activeNavId(view: ViewId): ViewId {
  switch (view) {
    case "assets":
      return "cast";
    case "insights":
      return "analytics";
    case "workspace":
      // The transient landing normalizes to a concrete area page once the
      // project loads — while it lasts, the Director is where it points.
      return "director";
    default:
      return view;
  }
}

export function AppSidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const [gateOn, setGateOn] = useState(false);

  useEffect(() => {
    const onGate = (e: Event) =>
      setGateOn(Boolean((e as CustomEvent).detail?.enabled));
    window.addEventListener("tf-gate", onGate);
    return () => window.removeEventListener("tf-gate", onGate);
  }, []);

  const active = activeNavId(view);

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-white/5 bg-sidebar sticky top-0 h-screen">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/5">
        <IbismuhLogo size={38} />
        <IbismuhWordmark />
      </div>

      {/* Destinations — grouped, every page visible (2026-11 law) */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-4 overflow-y-auto tf-scroll-bar">
        {["Studio", "Production", "Assets", "Insights", "Account"].map((group) => (
          <div key={group} className={group === "Studio" ? "" : "mt-5"}>
            <p className="tf-kicker px-3 pb-2">{group}</p>
            <ul className="space-y-1.5">
              {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                const isActive = active === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setView(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      title={item.hint}
                      className={`tf-focusable relative w-full group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                        isActive
                          ? "bg-primary/15 text-primary font-medium shadow-[inset_0_0_0_1px_rgb(34_211_238/20%)]"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      }`}
                    >
                      {/* R1 active rail — one controlled accent, not a second color */}
                      <span
                        aria-hidden
                        className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary transition-opacity ${
                          isActive ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <item.icon
                        className={`h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-105 ${
                          isActive ? "text-primary" : ""
                        }`}
                      />
                      <span className="flex-1 text-left">{item.label}</span>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary glow-brand-soft" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Studio status card + session */}
      <div className="px-3 pb-4 space-y-2">
        <div className="glass tf-elev-1 rounded-xl p-3.5">
          <div className="flex items-center gap-2">
            <span className="animate-pulse-dot h-2 w-2 rounded-full bg-primary shrink-0" />
            <p className="text-xs font-medium">You direct · AI assists</p>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            Idea → Script → Scenes → Ship. You approve every step.
          </p>
        </div>
        {/* Sign out only makes sense while the lock is active (AuthGate broadcasts it) */}
        {gateOn && (
          <button
            onClick={() => {
              void fetch("/api/auth/logout", { method: "POST" }).then(() =>
                window.location.reload(),
              );
            }}
            className="tf-focusable w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}
