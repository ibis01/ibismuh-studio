"use client";

// create-project-dialog.tsx — the create flow: lane picker grid + brief form.
// Aspect choices respect lane.supportedAspects (slides is pinned 9:16).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Clapperboard, FileText, PenTool, PersonStanding, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CreateProjectBody, ProjectState } from "@/lib/ibismuh/api-dto";
import { VOICES } from "@/lib/ibismuh/studio-catalogs";
import { LANE_ORDER, LANE_REGISTRY, LANE_UI_META, type VideoType } from "@/lib/ibismuh/studio-lanes";
import { ApiClientError, createProject } from "./api-client";

const ICON_BY_NAME: Record<string, LucideIcon> = {
  FileText,
  Clapperboard,
  PenTool,
  BarChart3,
  PersonStanding,
  Presentation,
};

const TONES = ["informative", "energetic", "calm", "cinematic"] as const;

const SCRIPT_PLACEHOLDER: Record<VideoType, string> = {
  classic: "Paste your full narration script…",
  story: "Leave empty and the AI planner drafts scenes",
  whiteboard: "Leave empty and the AI planner drafts scenes",
  graphics2d: "Leave empty and the AI planner drafts scenes",
  character: "Leave empty and the AI planner drafts scenes",
  slides: "Leave empty and the AI planner drafts scenes",
};

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLane: VideoType | null;
  onCreated: (state: ProjectState) => void;
}

export function CreateProjectDialog({ open, onOpenChange, defaultLane, onCreated }: CreateProjectDialogProps) {
  const [lane, setLane] = useState<VideoType>(defaultLane ?? "classic");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [tone, setTone] = useState<string>("informative");
  const [aspect, setAspect] = useState<string>("16:9");
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [characterName, setCharacterName] = useState("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const contract = LANE_REGISTRY[lane];
  const aspects = contract.supportedAspects;

  // reset when opened with a new preselected lane — React's documented
  // "adjust state when a prop changes" pattern (guarded render-phase setState,
  // never an effect: effects that setState synchronously cascade renders).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const next = defaultLane ?? "classic";
      setLane(next);
      setAspect(LANE_REGISTRY[next].supportedAspects[0]);
      setTitleTouched(false);
      setTitle("");
      setTopic("");
      setScript("");
      setTone("informative");
      setVoice(VOICES[0].id);
      setCharacterName("");
      setCharacterDescription("");
    }
  }

  // default title: "<Lane title>: <topic trunc 24>" — DERIVED, never synced
  // into state: the input shows the untouched default until the user types.
  const defaultTitle = useMemo(() => {
    const t = topic.trim();
    if (!t) return "";
    return `${LANE_UI_META[lane].title}: ${t.slice(0, 24)}`;
  }, [topic, lane]);
  const titleValue = titleTouched ? title : defaultTitle;

  const submit = async () => {
    if (!topic.trim()) {
      toast.error("Topic is required", { description: "Describe what the video should say — the planner builds from it." });
      return;
    }
    setSubmitting(true);
    try {
      const body: CreateProjectBody = {
        lane,
        title: titleValue.trim() || defaultTitle || undefined,
        topic: topic.trim(),
        script: script.trim() || undefined,
        tone,
        aspect: (aspects.includes(aspect) ? aspect : aspects[0]) as "16:9" | "9:16" | "1:1",
        voice,
      };
      if (lane === "character") {
        if (characterName.trim()) body.characterName = characterName.trim();
        if (characterDescription.trim()) body.characterDescription = characterDescription.trim();
      }
      const state = await createProject(body);
      toast.success("Project created", { description: `${state.project.title} is ready in the ${LANE_UI_META[lane].title} lane.` });
      onCreated(state);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast.error(err.message, { description: err.detail });
      } else {
        toast.error("Create failed", { description: err instanceof Error ? err.message : "unknown error" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="studio-panel border-stone-800 max-w-2xl max-h-[90vh] overflow-y-auto studio-scroll">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Pick a lane, write the brief — the lane planner turns it into a compiled plan you can preview and render.
          </DialogDescription>
        </DialogHeader>

        {/* lane picker */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Video lane">
          {LANE_ORDER.map((l) => {
            const meta = LANE_UI_META[l];
            const Icon = ICON_BY_NAME[meta.icon] ?? FileText;
            const selected = l === lane;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`flex min-h-[72px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  selected ? "border-amber-500/80 bg-amber-500/10" : "border-stone-700 bg-stone-900/60 hover:border-stone-500"
                }`}
                onClick={() => {
                  setLane(l);
                  setAspect(LANE_REGISTRY[l].supportedAspects[0]);
                }}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-100">
                  <Icon className="h-4 w-4 shrink-0" style={{ color: meta.accentHex }} aria-hidden />
                  {meta.title}
                </span>
                <span className="line-clamp-2 text-xs leading-snug text-zinc-500">{meta.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3.5 pt-1">
          <div className="grid gap-1.5">
            <Label htmlFor="cp-title">Title</Label>
            <Input
              id="cp-title"
              value={titleValue}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder={defaultTitle || "Project title"}
              className="h-11 border-stone-700 bg-stone-950/60"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-topic">Topic — required</Label>
            <Textarea
              id="cp-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What should this video say? One or two sentences."
              rows={2}
              className="border-stone-700 bg-stone-950/60 resize-none"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-script">Script — optional</Label>
            <Textarea
              id="cp-script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={SCRIPT_PLACEHOLDER[lane]}
              rows={4}
              className="border-stone-700 bg-stone-950/60 resize-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cp-tone">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="cp-tone" className="h-11 border-stone-700 bg-stone-950/60" aria-label="Tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="cp-voice">Voice</Label>
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger id="cp-voice" className="h-11 border-stone-700 bg-stone-950/60" aria-label="Voice">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label} — {v.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Aspect</Label>
              <RadioGroup value={aspect} onValueChange={setAspect} className="flex flex-row gap-2" aria-label="Aspect ratio">
                {aspects.map((a) => (
                  <label
                    key={a}
                    className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs ${
                      aspect === a ? "border-amber-500/80 bg-amber-500/10 text-amber-200" : "border-stone-700 text-zinc-400"
                    }`}
                  >
                    <RadioGroupItem value={a} className="sr-only" />
                    {a}
                    {lane === "slides" && <span className="text-xs text-zinc-500">pinned</span>}
                  </label>
                ))}
              </RadioGroup>
              {lane === "slides" && (
                <p className="text-xs text-zinc-500">The keynote deck geometry is pinned to 9:16 — vertical video only.</p>
              )}
            </div>
          </div>

          {lane === "character" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="cp-char-name">Character name</Label>
                <Input
                  id="cp-char-name"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="e.g. Nova the guide"
                  className="h-11 border-stone-700 bg-stone-950/60"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cp-char-desc">Character description</Label>
                <Input
                  id="cp-char-desc"
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                  placeholder="Include 'rigged' to attach the native rig channel"
                  className="h-11 border-stone-700 bg-stone-950/60"
                />
              </div>
              <p className="text-xs text-zinc-500 sm:col-span-2">
                The native rig channel performs scenes pose-by-pose only when a valid rig is attached; otherwise storyboard art
                carries each scene (declared per scene, never silent).
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 border-stone-700" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="h-11 bg-amber-500 text-stone-950 hover:bg-amber-400 font-semibold"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
