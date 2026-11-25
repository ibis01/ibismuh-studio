"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  StatusBadge,
  EmptyState,
  ErrorState,
  RetryButton,
  formatDuration,
  timeAgo,
} from "@/components/ibismuh/shared";
import type { VideoDTO } from "@/lib/ibismuh/types";
import {
  Film,
  Wand2,
  AudioLines,
  Trash2,
  Clapperboard,
  Library as LibraryIcon,
} from "lucide-react";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "scripted", label: "Scripted" },
  { id: "voiced", label: "Voiced" },
  { id: "ready", label: "Ready" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
];

export function LibraryView() {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const setFocusVideoId = useAppStore((s) => s.setFocusVideoId);
  const setView = useAppStore((s) => s.setView);
  const { toast } = useToast();
  const setPrefillTopic = useAppStore((s) => s.setPrefillTopic);

  const [videos, setVideos] = useState<VideoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  // R2 — failure is not emptiness: a failed load renders the designed error
  // state (with retry) instead of pretending the library is fresh.
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    return fetch(`/api/videos?status=${filter}`)
      .then((r) => r.json())
      .then((d) => {
        setVideos(d.videos ?? []);
        setLoadError(false);
        setLoading(false);
      })
      .catch(() => {
        setVideos([]);
        setLoadError(true);
        setLoading(false);
      });
  }, [filter]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // B3 — opening a project lands on the production workspace (focus id +
  // view ride the store together; the workspace consumes the id on load).
  const openWorkspace = (id: string) => {
    setFocusVideoId(id);
    setView("workspace");
  };

  // Deleting a project is irreversible (script, storyboard, renders all go)
  // — the trash icon only ARMS the AlertDialog; the request fires on explicit
  // confirm, and a failed delete keeps the card and says so (silent loss was
  // the pre-pass behavior).
  const [deleting, setDeleting] = useState(false);
  const quickDelete = async (id: string, label: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `The studio refused the delete (HTTP ${res.status})`);
      }
      setVideos((vs) => vs.filter((v) => v.id !== id));
      useAppStore.getState().bumpRefresh();
      toast({
        title: "Project deleted",
        description: `“${label}” and its production files are gone.`,
      });
    } catch (e) {
      toast({
        title: "Delete failed",
        description:
          e instanceof Error ? e.message : "Unknown error — the project was kept.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={setFilter} className="w-full sm:w-auto">
          <TabsList className="bg-white/4 border border-white/8 h-10 w-full sm:w-auto overflow-x-auto tf-scroll-bar">
            {FILTERS.map((f) => (
              <TabsTrigger
                key={f.id}
                value={f.id}
                className="data-[state=active]:bg-primary/20 data-[state=active]:text-cyan-200 px-3 text-xs sm:text-13px h-8"
              >
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {!loadError && (
          <p className="text-xs text-muted-foreground shrink-0">
            {videos.length === 0
              ? "Nothing here yet"
              : `${videos.length} project${videos.length === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      {loadError ? (
        <ErrorState
          icon={LibraryIcon}
          title="Could not load the library"
          message="The projects service did not respond. Your projects are safe — nothing was deleted; the list just failed to arrive."
          retry={
            <RetryButton
              onClick={() => {
                setLoadError(false);
                setLoading(true);
                load();
              }}
            />
          }
        />
      ) : loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState
          icon={LibraryIcon}
          title={filter === "all" ? "No projects yet" : "No projects in this stage"}
          hint={
            filter === "all"
              ? "Start your first project — brief in, finished video out. You direct, AI assists."
              : "Try another filter, or start a new project."
          }
          action={
            <Button
              onClick={() => setView("create")}
              className="bg-brand-gradient hover:opacity-90 font-medium"
            >
              <Wand2 className="h-4 w-4" />
              New project
            </Button>
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {videos.map((v) => (
            <Card
              key={v.id}
              className="glass rounded-2xl overflow-hidden group hover:border-primary/25 transition-all duration-300"
            >
              <div className="flex flex-col">
                {/* Thumb strip */}
                <button
                  onClick={() => openWorkspace(v.id)}
                  className="relative w-full aspect-[2.4/1] bg-white/4 overflow-hidden text-left"
                  aria-label={`Open the workspace for ${v.title ?? v.topic}`}
                >
                  {v.hasThumbnail ? (
                    <img
                      src={`/api/videos/${v.id}/thumbnail`}
                      alt={`Thumbnail for ${v.title ?? v.topic}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Film className="h-8 w-8 text-white/15" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-2 flex-wrap">
                    <StatusBadge status={v.status} />
                    {v.hasVideo && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/80 backdrop-blur px-2 py-0.5 text-xs text-white font-medium">
                        <Clapperboard className="h-3 w-3" />
                        MP4
                      </span>
                    )}
                    {v.hasVoiceover && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-0.5 text-xs text-white/85">
                        <AudioLines className="h-3 w-3" />
                        {formatDuration(v.audioDuration)}
                      </span>
                    )}
                  </div>
                </button>

                {/* Meta */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => openWorkspace(v.id)} className="min-w-0 text-left flex-1">
                      <p className="font-medium leading-snug line-clamp-2 group-hover:text-cyan-200 transition-colors">
                        {v.title ?? v.topic}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {v.niche} · {v.wordCount ?? 0}w · {timeAgo(v.createdAt)}
                        {v.channelName ? ` · ${v.channelName}` : ""}
                      </p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/8"
                        onClick={() => {
                          // Mirror the Home reuse flow: prefill + land on
                          // Create, or the wand looks like it does nothing.
                          setPrefillTopic(v.topic);
                          setView("create");
                        }}
                        aria-label="Reuse this topic"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-300 hover:bg-red-500/10"
                            aria-label="Delete video"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="glass-strong rounded-2xl border-white/10">
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete “{v.title ?? v.topic}”?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes the script, storyboard,
                              voiceover and any rendered video. There is no undo.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={deleting}
                              onClick={(e) => {
                                e.preventDefault();
                                void quickDelete(v.id, v.title ?? v.topic);
                              }}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete project
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
