import type { PopupState, TaskConfig, TaskDetailState, TaskSummary } from "@/types/config";
import { createTaskDraft, normalizeTask, normalizeTaskList, sortTasks } from "@/utils/config";

const TASKS_STORAGE_KEY = "auto-submit-config:tasks";
const ALARM_PREFIX = "auto-submit-config:task:";

export async function getPopupStateFromStorage(): Promise<PopupState> {
  const tasks = await getStoredTasks();
  await syncStoredTaskAlarms(tasks);
  const alarms = await chrome.alarms.getAll();

  return {
    tasks: buildTaskSummaries(tasks, alarms)
  };
}

export async function getTaskDetailFromStorage(taskId: string): Promise<TaskDetailState> {
  const tasks = await getStoredTasks();
  await syncStoredTaskAlarms(tasks);
  const task = tasks.find((item) => item.id === taskId);

  return {
    task: task ? normalizeTask(task) : createTaskDraft(),
    isNew: !task
  };
}

export async function upsertTaskInStorage(input?: Partial<TaskConfig>) {
  const tasks = await getStoredTasks();
  const current = input?.id ? tasks.find((task) => task.id === input.id) : undefined;
  const now = new Date().toISOString();
  const task = normalizeTask({
    ...current,
    ...input,
    createdAt: current?.createdAt ?? input?.createdAt ?? now,
    updatedAt: now
  });

  const nextTasks = sortTasks([
    task,
    ...tasks.filter((item) => item.id !== task.id)
  ]);

  await saveStoredTasks(nextTasks);
  await syncStoredTaskAlarms(nextTasks);
  return task;
}

export async function deleteTaskFromStorage(taskId: string) {
  if (!taskId) {
    throw new Error("缺少任务 ID");
  }

  const tasks = await getStoredTasks();
  await saveStoredTasks(tasks.filter((item) => item.id !== taskId));
  await chrome.alarms.clear(getAlarmName(taskId));
}

export async function setTaskEnabledInStorage(taskId: string, enabled: boolean) {
  if (!taskId) {
    throw new Error("缺少任务 ID");
  }

  const tasks = await getStoredTasks();
  const current = tasks.find((item) => item.id === taskId);
  if (!current) {
    throw new Error("任务不存在");
  }

  const now = new Date().toISOString();
  const nextTasks = sortTasks(tasks.map((item) => (
    item.id === taskId
      ? normalizeTask({ ...item, enabled, updatedAt: now })
      : item
  )));

  await saveStoredTasks(nextTasks);
  await syncStoredTaskAlarms(nextTasks);
}

export async function getStoredTasks(): Promise<TaskConfig[]> {
  const stored = await chrome.storage.local.get(TASKS_STORAGE_KEY);
  return normalizeTaskList(stored[TASKS_STORAGE_KEY]);
}

async function saveStoredTasks(tasks: TaskConfig[]) {
  await chrome.storage.local.set({
    [TASKS_STORAGE_KEY]: sortTasks(tasks)
  });
}

async function syncStoredTaskAlarms(tasks: TaskConfig[]) {
  const alarms = await chrome.alarms.getAll();
  const managedAlarms = alarms.filter((alarm) => alarm.name.startsWith(ALARM_PREFIX));

  await Promise.all(
    managedAlarms
      .filter((alarm) => !tasks.some((task) => getAlarmName(task.id) === alarm.name))
      .map((alarm) => chrome.alarms.clear(alarm.name))
  );

  const managedAlarmMap = new Map(managedAlarms.map((alarm) => [alarm.name, alarm]));

  for (const task of tasks) {
    const alarmName = getAlarmName(task.id);

    if (!task.enabled || !task.targetPageUrl || !task.cookieCaptureEnabled) {
      await chrome.alarms.clear(alarmName);
      continue;
    }

    const currentAlarm = managedAlarmMap.get(alarmName);
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

function buildTaskSummaries(tasks: TaskConfig[], alarms: chrome.alarms.Alarm[]): TaskSummary[] {
  const alarmMap = new Map(alarms.map((alarm) => [alarm.name, alarm]));

  return tasks.map((task) => {
    const taskAlarm = alarmMap.get(getAlarmName(task.id));
    return {
      id: task.id,
      name: task.name,
      enabled: task.enabled,
      targetPageUrl: task.targetPageUrl,
      scheduleMinutes: task.scheduleMinutes,
      updatedAt: task.updatedAt,
      nextRunAt: taskAlarm?.scheduledTime ? new Date(taskAlarm.scheduledTime).toISOString() : undefined
    };
  });
}

function getAlarmName(taskId: string) {
  return `${ALARM_PREFIX}${taskId}`;
}
