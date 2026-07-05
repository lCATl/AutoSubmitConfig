import type { CookieCapturePayload, TaskConfig } from "@/types/config";
import { createTaskDraft, normalizeTaskList, sortTasks } from "@/utils/config";

const TASKS_STORAGE_KEY = "auto-submit-config:tasks";
const LEGACY_CONFIG_STORAGE_KEY = "auto-submit-config:settings";
const ALARM_PREFIX = "auto-submit-config:task:";
const TAB_LOAD_TIMEOUT_MS = 60000;
const SERVICE_WORKER_KEEP_ALIVE_MS = 20000;

interface RuntimeMessage {
  type?: string;
  payload?: Record<string, unknown>;
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void initializeExtension();
  });

  chrome.runtime.onStartup.addListener(() => {
    void initializeExtension();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    const taskId = getTaskIdFromAlarmName(alarm.name);
    if (taskId) {
      void runTaskById(taskId, false).catch((error) => {
        console.error("[AutoSubmitConfig][alarm] 任务执行失败", getErrorMessage(error));
      });
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[TASKS_STORAGE_KEY]) {
      void syncTaskAlarms();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleRuntimeMessage(message as RuntimeMessage, sendResponse);
    return true;
  });

  void initializeExtension();
});

async function initializeExtension() {
  await migrateLegacyTaskIfNeeded();
  const tasks = await getTasks();
  await saveTasks(tasks);
  await syncTaskAlarms(tasks);
}

async function handleRuntimeMessage(
  message: RuntimeMessage,
  sendResponse: (response: { ok: boolean; error?: string }) => void
) {
  try {
    if (message?.type !== "auto-submit-config:run-task-now") {
      sendResponse({ ok: false, error: `未知消息类型: ${message?.type ?? "undefined"}` });
      return;
    }

    const taskId = `${message.payload?.taskId ?? ""}`.trim();
    await runTaskById(taskId, true);
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({ ok: false, error: getErrorMessage(error) });
  }
}

async function runTaskById(taskId: string, ignoreEnabled: boolean) {
  if (!taskId) {
    throw new Error("缺少任务 ID");
  }

  const task = (await getTasks()).find((item) => item.id === taskId);
  if (!task) {
    throw new Error("任务不存在");
  }

  if (!task.enabled && !ignoreEnabled) {
    return;
  }

  await withServiceWorkerKeepAlive(() => runCookieCapture(task));
}

async function runCookieCapture(task: TaskConfig) {
  if (!task.targetPageUrl) {
    throw new Error(`任务「${task.name}」缺少目标页面 URL`);
  }

  if (!task.cookieCaptureEnabled) {
    throw new Error("当前任务没有启用 Cookie 采集");
  }

  const targetUrl = ensureValidUrl(task.targetPageUrl);
  const openedTabId = await openTargetTab(targetUrl);

  try {
    await waitForTabComplete(openedTabId);
    await sleep(task.pageLoadWaitMs);
    const finalPageUrl = await resolveTabUrl(openedTabId) ?? targetUrl;
    const result = await captureCookies(task, finalPageUrl);

    console.info("[AutoSubmitConfig][result]", {
      taskId: task.id,
      taskName: task.name,
      capturedAt: new Date().toISOString(),
      ...result
    });
  } finally {
    if (task.closeTabAfterCapture) {
      await chrome.tabs.remove(openedTabId).catch(() => undefined);
    }
  }
}

async function captureCookies(task: TaskConfig, targetPageUrl: string): Promise<CookieCapturePayload> {
  const targetCookies = await chrome.cookies.getAll({ url: targetPageUrl });
  let selectedCookies = targetCookies;
  let missingCookieNames: string[] = [];

  if (task.cookieCaptureMode === "named") {
    const lookup = new Map<string, chrome.cookies.Cookie>();
    for (const cookie of targetCookies) {
      if (!lookup.has(cookie.name)) {
        lookup.set(cookie.name, cookie);
      }
    }

    selectedCookies = task.cookieNames
      .map((name) => lookup.get(name))
      .filter((cookie): cookie is chrome.cookies.Cookie => Boolean(cookie));
    missingCookieNames = task.cookieNames.filter((name) => !lookup.has(name));
  }

  return {
    targetPageUrl,
    captureMode: task.cookieCaptureMode,
    matchedCount: selectedCookies.length,
    missingCookieNames,
    cookies: selectedCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate,
      session: cookie.session,
      storeId: cookie.storeId
    }))
  };
}

async function migrateLegacyTaskIfNeeded() {
  const stored = await chrome.storage.local.get([TASKS_STORAGE_KEY, LEGACY_CONFIG_STORAGE_KEY]);
  const hasTasks = Array.isArray(stored[TASKS_STORAGE_KEY]) && stored[TASKS_STORAGE_KEY].length > 0;

  if (hasTasks || !stored[LEGACY_CONFIG_STORAGE_KEY]) {
    return;
  }

  await chrome.storage.local.set({
    [TASKS_STORAGE_KEY]: [createTaskDraft(stored[LEGACY_CONFIG_STORAGE_KEY] as Partial<TaskConfig>)]
  });
}

async function getTasks(): Promise<TaskConfig[]> {
  const stored = await chrome.storage.local.get(TASKS_STORAGE_KEY);
  return normalizeTaskList(stored[TASKS_STORAGE_KEY]);
}

async function saveTasks(tasks: TaskConfig[]) {
  await chrome.storage.local.set({
    [TASKS_STORAGE_KEY]: sortTasks(tasks)
  });
}

async function syncTaskAlarms(tasks?: TaskConfig[]) {
  const currentTasks = tasks ?? await getTasks();
  const alarms = await chrome.alarms.getAll();
  const managedAlarms = alarms.filter((alarm) => alarm.name.startsWith(ALARM_PREFIX));
  const alarmMap = new Map(managedAlarms.map((alarm) => [alarm.name, alarm]));

  await Promise.all(
    managedAlarms
      .filter((alarm) => !currentTasks.some((task) => getAlarmName(task.id) === alarm.name))
      .map((alarm) => chrome.alarms.clear(alarm.name))
  );

  for (const task of currentTasks) {
    const alarmName = getAlarmName(task.id);
    if (!task.enabled || !task.targetPageUrl || !task.cookieCaptureEnabled) {
      await chrome.alarms.clear(alarmName);
      continue;
    }

    const currentAlarm = alarmMap.get(alarmName);
    if (currentAlarm?.periodInMinutes === task.scheduleMinutes) {
      continue;
    }

    if (currentAlarm) {
      await chrome.alarms.clear(alarmName);
    }

    chrome.alarms.create(alarmName, {
      delayInMinutes: task.scheduleMinutes,
      periodInMinutes: task.scheduleMinutes
    });
  }
}

async function openTargetTab(url: string) {
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id === undefined) {
    throw new Error("新标签页创建失败");
  }
  return tab.id;
}

function waitForTabComplete(tabId: number) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    };

    const handleUpdated = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
    timerId = setTimeout(() => {
      cleanup();
      reject(new Error("等待目标页面加载超时"));
    }, TAB_LOAD_TIMEOUT_MS);

    chrome.tabs.get(tabId)
      .then((tab) => {
        if (tab.status === "complete") {
          cleanup();
          resolve();
        }
      })
      .catch(() => undefined);
  });
}

async function resolveTabUrl(tabId: number) {
  try {
    return (await chrome.tabs.get(tabId)).url;
  } catch {
    return undefined;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withServiceWorkerKeepAlive<T>(runner: () => Promise<T>) {
  const timerId = setInterval(() => {
    void chrome.runtime.getPlatformInfo().catch(() => undefined);
  }, SERVICE_WORKER_KEEP_ALIVE_MS);

  try {
    await chrome.runtime.getPlatformInfo().catch(() => undefined);
    return await runner();
  } finally {
    clearInterval(timerId);
  }
}

function ensureValidUrl(url: string) {
  const parsed = new URL(url.trim());
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("目标页面 URL 仅支持 http 或 https");
  }
  return parsed.toString();
}

function getAlarmName(taskId: string) {
  return `${ALARM_PREFIX}${taskId}`;
}

function getTaskIdFromAlarmName(alarmName: string) {
  return alarmName.startsWith(ALARM_PREFIX) ? alarmName.slice(ALARM_PREFIX.length) : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : `${error ?? "未知错误"}`;
}
