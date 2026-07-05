<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import type { PopupState, TaskSummary } from "@/types/config";
import { getPopupStateFromStorage, setTaskEnabledInStorage } from "@/utils/task-store";

const tasks = ref<TaskSummary[]>([]);
const isLoading = ref(false);
const togglingTaskIds = ref<string[]>([]);
const statusText = ref("等待初始化");
const taskCountText = computed(() => `${tasks.value.length} 个任务`);

onMounted(async () => {
  await refreshState();
  chrome.storage.onChanged.addListener(handleStorageChanged);
});

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(handleStorageChanged);
});

function handleStorageChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
  if (areaName === "local" && changes["auto-submit-config:tasks"]) {
    void refreshState();
  }
}

async function refreshState() {
  isLoading.value = true;
  statusText.value = "正在读取任务列表...";

  try {
    const state: PopupState = await getPopupStateFromStorage();
    tasks.value = state.tasks;
    statusText.value = "任务列表已更新";
  } catch (error) {
    statusText.value = `读取失败：${getErrorMessage(error)}`;
  } finally {
    isLoading.value = false;
  }
}

async function openEditor(taskId?: string) {
  const url = new URL(chrome.runtime.getURL("options.html"));
  if (taskId) {
    url.searchParams.set("taskId", taskId);
  }
  await chrome.tabs.create({ url: url.toString(), active: true });
  window.close();
}

async function toggleTask(task: TaskSummary) {
  if (togglingTaskIds.value.includes(task.id)) {
    return;
  }

  togglingTaskIds.value = [...togglingTaskIds.value, task.id];
  try {
    await setTaskEnabledInStorage(task.id, !task.enabled);
    await refreshState();
  } catch (error) {
    statusText.value = `切换失败：${getErrorMessage(error)}`;
  } finally {
    togglingTaskIds.value = togglingTaskIds.value.filter((id) => id !== task.id);
  }
}

function formatNextRunTime(task: TaskSummary) {
  if (!task.enabled) {
    return "任务已关闭";
  }
  if (!task.nextRunAt) {
    return "等待同步";
  }
  return new Date(task.nextRunAt).toLocaleString("zh-CN", { hour12: false });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : `${error ?? "未知错误"}`;
}
</script>

<template>
  <main class="shell popup-shell">
    <section class="hero">
      <p class="eyebrow">Cookie Scheduler</p>
      <h1>Auto Submit Config</h1>
      <p class="hero-copy">定时打开目标网页并采集该站点的 Cookie。</p>
      <div class="hero-meta">
        <span class="badge">{{ taskCountText }}</span>
        <span class="status">{{ statusText }}</span>
      </div>
    </section>

    <section class="actions">
      <button class="primary" type="button" :disabled="isLoading" @click="openEditor()">新增任务</button>
      <button class="ghost" type="button" :disabled="isLoading" @click="refreshState">刷新</button>
    </section>

    <section class="panel">
      <h2>任务列表</h2>
      <div v-if="!tasks.length" class="empty-state">还没有任务，点击“新增任务”开始配置。</div>

      <article v-for="task in tasks" :key="task.id" class="task-card" @click="openEditor(task.id)">
        <div class="task-head">
          <div>
            <strong>{{ task.name }}</strong>
            <p>{{ task.targetPageUrl }}</p>
          </div>
          <button
            class="task-toggle"
            type="button"
            :disabled="togglingTaskIds.includes(task.id)"
            @click.stop="toggleTask(task)"
          >
            {{ task.enabled ? "关闭" : "开启" }}
          </button>
        </div>
        <div class="task-meta">
          <span>每 {{ task.scheduleMinutes }} 分钟</span>
          <span>{{ formatNextRunTime(task) }}</span>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.popup-shell {
  min-width: 380px;
  min-height: 500px;
  padding: 18px;
}

.hero,
.panel {
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.94);
}

.eyebrow {
  margin: 0 0 6px;
  color: #ef6c00;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

.hero-copy,
.task-card p,
.task-meta,
.status {
  color: #607080;
}

.hero-meta,
.actions,
.task-head,
.task-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel {
  display: grid;
  gap: 10px;
}

.task-card {
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  background: #f8fafc;
}

.task-card p {
  max-width: 260px;
  margin: 6px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button,
.badge {
  border: 0;
  border-radius: 12px;
  padding: 8px 12px;
}

button {
  cursor: pointer;
}

.primary {
  color: #fff;
  background: #ef6c00;
}

.ghost,
.task-toggle,
.badge {
  background: #edf2f6;
}

.empty-state {
  padding: 20px 8px;
  text-align: center;
  color: #607080;
}
</style>
