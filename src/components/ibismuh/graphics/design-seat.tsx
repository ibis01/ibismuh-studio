"use client";
// design-seat.tsx — the WS9 browser seat for the graphics studio (the
// engineering master plan's "editor and catalog UX" for the Motion
// Graphics lane): the icon catalog browser (the 200-icon vocabulary,
// searchable by id and tag, placing real elements), the semantic
// component seat (the 13 named cards, placed through the ONE expansion
// seam — expandComponent — with the derived-id collision law), and the
// recipe seat (the 11 named choreographies, applied as ENTER deltas on
// the scene's existing elements through recipeEnterFor — the exits stay
// the planner's law).
//
// Everything rides PURE client-safe registries: the icon library, the
// component registry, and the recipe registry are plain data + pure
// functions (no node:, no fetch) — the browser compiles the same
// motions the planner would, byte for byte.
import { useMemo, useState } from "react";
import { GRAPHICS_ICON_LIBRARY } from "@/lib/ibismuh/graphics/icons";
import {
  GRAPHICS_COMPONENTS,
  componentNames,
  type ComponentContent,
} from "@/lib/ibismuh/graphics/components";
import { GRAPHICS_RECIPES, recipeNames, resolveRecipe } from "@/lib/ibismuh/graphics/recipes";

const btnGhost =
  "inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-white/80 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40";

export interface DesignSeatProps {
  disabled: boolean;
  /** Place a REGISTERED icon as a real icon element (the parent owns the
   *  id allocation + the buffer patch). */
  onInsertIcon: (iconId: string) => void;
  /** Place a semantic component through the ONE expansion seam. Returns
   *  a named refusal when the derived ids collide with the scene. */
  onPlaceComponent: (componentId: string, content: ComponentContent) => { ok: boolean; why?: string };
  /** Re-apply a recipe's ENTER choreography to the scene's existing
   *  elements (kind-order compiled through recipeEnterFor). */
  onApplyRecipe: (recipeId: string) => { ok: boolean; why?: string };
}

function IconGlyph({ paths, className }: { paths: readonly string[]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function GraphicsDesignSeat({ disabled, onInsertIcon, onPlaceComponent, onApplyRecipe }: DesignSeatProps) {
  // The icon browser's memory: the free-text query filters id + tags —
  // deterministic order (id asc), the head of the vocabulary first.
  const [iconQuery, setIconQuery] = useState("");
  const [componentId, setComponentId] = useState<string>(componentNames()[0]);
  const [componentText, setComponentText] = useState("");
  const [recipeId, setRecipeId] = useState<string>(recipeNames()[0]);
  const [status, setStatus] = useState<string | null>(null);

  const iconHits = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    const all = Object.entries(GRAPHICS_ICON_LIBRARY);
    const filtered = q === ""
      ? all
      : all.filter(([id, icon]) => id.toLowerCase().includes(q) || icon.tags.some((t) => t.toLowerCase().includes(q)));
    return filtered
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(0, 48)
      .map(([id, icon]) => ({ id, tags: icon.tags, paths: icon.paths }));
  }, [iconQuery]);

  const totalIcons = Object.keys(GRAPHICS_ICON_LIBRARY).length;
  const componentSpec = GRAPHICS_COMPONENTS[componentId as keyof typeof GRAPHICS_COMPONENTS];
  const recipe = resolveRecipe(recipeId);

  return (
    <div className="space-y-3" aria-label="Design seat — icon catalog, semantic components, recipes">
      {/* ---- the icon catalog browser ---- */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-white/40">Icon catalog</p>
          <p className="text-xs text-white/35" role="status">
            {iconHits.length} of {totalIcons}
          </p>
        </div>
        <input
          type="search"
          value={iconQuery}
          onChange={(e) => setIconQuery(e.target.value)}
          placeholder={`Search ${totalIcons} icons — names, tags…`}
          aria-label="Search the icon catalog"
          className="mb-2 h-8 w-full rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white/85 placeholder:text-white/30"
        />
        <div className="grid max-h-44 grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5 overflow-y-auto tf-scroll-bar">
          {iconHits.map(({ id, paths, tags }) => (
            <button
              key={id}
              onClick={() => {
                onInsertIcon(id);
                setStatus(`placed the "${id}" icon — its paths ride the element, never free-form`);
              }}
              disabled={disabled}
              title={`${id} — ${tags.join(", ")} (click to place)`}
              className="flex flex-col items-center gap-0.5 rounded-md bg-white/5 px-1 py-1.5 text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-40"
            >
              <IconGlyph paths={paths} className="h-5 w-5" />
              <span className="w-full truncate text-center text-xs" title={id}>
                {id}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-white/30">every path ONE stroke on the 24 grid — the library's own law</p>
      </div>

      {/* ---- the semantic component seat ---- */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-white/40">Semantic components</p>
        <div className="mb-2 flex gap-2">
          <select
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
            aria-label="Choose a semantic component"
            className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-1.5 text-xs text-white/80"
          >
            {componentNames().map((id) => (
              <option key={id} value={id}>
                {GRAPHICS_COMPONENTS[id].label} — {id}
              </option>
            ))}
          </select>
        </div>
        {componentSpec && <p className="mb-2 text-xs text-white/50">{componentSpec.intent}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            value={componentText}
            onChange={(e) => setComponentText(e.target.value)}
            placeholder="the primary text (headline slot)"
            aria-label="Component primary text"
            className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white/85 placeholder:text-white/30"
          />
          <button
            type="button"
            disabled={disabled || componentText.trim() === ""}
            onClick={() => {
              const res = onPlaceComponent(componentId, { text: componentText });
              setStatus(res.ok ? `placed ${componentId} — the derived ids are the addresses` : (res.why ?? "refused"));
            }}
            className={btnGhost}
          >
            Place
          </button>
        </div>
        <p className="mt-1.5 text-xs text-white/30">
          places through expandComponent — the doc carries primitives only; the derived ids are the addresses
        </p>
      </div>

      {/* ---- the recipe seat ---- */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-white/40">Choreography recipe</p>
        <div className="flex gap-2">
          <select
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
            aria-label="Choose a choreography recipe"
            className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-1.5 text-xs text-white/80"
          >
            {recipeNames().map((id) => (
              <option key={id} value={id}>
                {GRAPHICS_RECIPES[id].label} — {id}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const res = onApplyRecipe(recipeId);
              setStatus(res.ok ? `applied the "${recipeId}" ENTER choreography to this scene's elements` : (res.why ?? "refused"));
            }}
            className={btnGhost}
          >
            Apply enters
          </button>
        </div>
        {recipe && <p className="mt-1.5 text-xs text-white/50">{recipe.intent}</p>}
        <p className="mt-1 text-xs text-white/30">
          re-applies each element&apos;s ENTER per kind-order (recipeEnterFor) — the exits stay the planner&apos;s one law
        </p>
      </div>

      {status && (
        <p className="rounded-md bg-white/5 px-2 py-1.5 text-xs text-white/60" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
