"use client";
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";

interface SavedJob {
  job_id: string;
  name: string;
  module: "retrieve" | "promoter" | "sgrna";
  saved_at: string;
}

const STORAGE_KEY = "editease.saved_jobs";

export function loadSavedJobs(): SavedJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveJob(job: SavedJob): void {
  if (typeof window === "undefined") return;
  const list = loadSavedJobs();
  // De-dup by job_id
  const filtered = list.filter(j => j.job_id !== job.job_id);
  filtered.unshift(job);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 50)));
}

export function removeJob(jobId: string): void {
  if (typeof window === "undefined") return;
  const list = loadSavedJobs().filter(j => j.job_id !== jobId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isJobSaved(jobId: string): boolean {
  return loadSavedJobs().some(j => j.job_id === jobId);
}

interface SaveButtonProps {
  jobId: string;
  module: SavedJob["module"];
  defaultName?: string;
}

export function SaveJobButton({ jobId, module, defaultName }: SaveButtonProps) {
  const [saved, setSaved] = useState(false);

  useEffect(() => { setSaved(isJobSaved(jobId)); }, [jobId]);

  function toggle() {
    if (saved) {
      removeJob(jobId);
      setSaved(false);
    } else {
      const name = defaultName?.trim()
        || prompt("Name this project:", `${module} - ${new Date().toLocaleString()}`)
        || `${module} - ${jobId.slice(0, 8)}`;
      saveJob({
        job_id: jobId, name, module,
        saved_at: new Date().toISOString(),
      });
      setSaved(true);
    }
  }

  return (
    <button onClick={toggle}
            className="btn btn-ghost border border-zinc-300 text-sm">
      {saved
        ? <><BookmarkCheck className="h-4 w-4 text-brand-600" />Saved</>
        : <><Bookmark className="h-4 w-4" />Save project</>}
    </button>
  );
}

interface ListProps {
  filterModule?: SavedJob["module"];
  onPick?: (job: SavedJob) => void;
}

export function SavedJobsList({ filterModule, onPick }: ListProps) {
  const [list, setList] = useState<SavedJob[]>([]);

  useEffect(() => {
    setList(loadSavedJobs());
  }, []);

  function refresh() { setList(loadSavedJobs()); }

  const visible = filterModule ? list.filter(j => j.module === filterModule) : list;

  if (visible.length === 0) {
    return (
      <div className="text-zinc-500 text-sm">
        No saved projects yet. Click <strong>Save project</strong> on a finished job to keep it here.
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {visible.map(j => (
        <li key={j.job_id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-zinc-50">
          <div className="min-w-0 flex-1">
            <button onClick={() => onPick?.(j)} className="block w-full text-left">
              <div className="font-medium text-sm truncate">{j.name}</div>
              <div className="text-xs text-zinc-500 font-mono truncate">
                {j.module} · {j.job_id}
              </div>
            </button>
          </div>
          <button onClick={() => { removeJob(j.job_id); refresh(); }}
                  className="p-1.5 text-zinc-400 hover:text-red-600 rounded">
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
