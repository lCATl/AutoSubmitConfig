import type { TaskConfig } from "@/types/config";

export const DEFAULT_TASK_TEMPLATE: Omit<TaskConfig, "id" | "createdAt" | "updatedAt"> = {
  name: "新任务",
  enabled: true,
  targetPageUrl: "https://www.tiktok.com/",
  scheduleMinutes: 30,
  pageLoadWaitMs: 5000,
  closeTabAfterCapture: true,
  cookieCaptureEnabled: true,
  cookieCaptureMode: "named",
  cookieNames: ["sessionid", "sessionid_ss", "sid_tt"]
};

export function createTaskDraft(input?: Partial<TaskConfig>): TaskConfig {
  const now = new Date().toISOString();

  return normalizeTask({
    id: input?.id ?? crypto.randomUUID(),
    createdAt: input?.createdAt ?? now,
    updatedAt: input?.updatedAt ?? now,
    ...DEFAULT_TASK_TEMPLATE,
    ...input
  });
}

export function normalizeTask(input?: Partial<TaskConfig>): TaskConfig {
  const now = new Date().toISOString();
  const merged = {
    ...DEFAULT_TASK_TEMPLATE,
    ...input
  };

  const targetPageUrl = `${merged.targetPageUrl ?? DEFAULT_TASK_TEMPLATE.targetPageUrl}`.trim();
  const inferredName = inferTaskName(targetPageUrl);
  const rawName = `${merged.name ?? ""}`.trim();

  return {
    id: `${merged.id ?? crypto.randomUUID()}`,
    name: rawName || inferredName || "未命名任务",
    enabled: merged.enabled ?? DEFAULT_TASK_TEMPLATE.enabled,
    targetPageUrl,
    scheduleMinutes: normalizeNumber(merged.scheduleMinutes, DEFAULT_TASK_TEMPLATE.scheduleMinutes, 1, 24 * 60),
    pageLoadWaitMs: normalizeNumber(merged.pageLoadWaitMs, DEFAULT_TASK_TEMPLATE.pageLoadWaitMs, 1000, 120000),
    closeTabAfterCapture: merged.closeTabAfterCapture ?? DEFAULT_TASK_TEMPLATE.closeTabAfterCapture,
    cookieCaptureEnabled: merged.cookieCaptureEnabled ?? DEFAULT_TASK_TEMPLATE.cookieCaptureEnabled,
    cookieCaptureMode: merged.cookieCaptureMode === "all" ? "all" : "named",
    cookieNames: normalizeStringList(merged.cookieNames),
    createdAt: `${merged.createdAt ?? now}`,
    updatedAt: `${merged.updatedAt ?? now}`
  };
}

export function normalizeTaskList(input: unknown): TaskConfig[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return sortTasks(
    input
      .map((item) => normalizeTask(item as Partial<TaskConfig>))
      .filter((task, index, list) => list.findIndex((candidate) => candidate.id === task.id) === index)
  );
}

export function sortTasks(tasks: TaskConfig[]): TaskConfig[] {
  return [...tasks].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt) || 0;
    const rightTime = Date.parse(right.updatedAt) || 0;
    return rightTime - leftTime;
  });
}

export function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => `${item ?? ""}`.trim())
    .filter(Boolean);
}

export function inferTaskName(targetPageUrl: string): string {
  try {
    const hostname = new URL(targetPageUrl).hostname.replace(/^www\./, "");
    return hostname || "新任务";
  } catch {
    return "新任务";
  }
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(parsed), min), max);
}
