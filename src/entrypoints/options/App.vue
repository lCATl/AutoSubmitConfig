<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";

import type { CookieCaptureMode, TaskConfig, TaskDetailState } from "@/types/config";
import { createTaskDraft } from "@/utils/config";
import {
  deleteTaskFromStorage,
  getTaskDetailFromStorage,
  upsertTaskInStorage
} from "@/utils/task-store";

interface TaskFormState {
  id: string;
  name: string;
  enabled: boolean;
  targetPageUrl: string;
  scheduleMinutes: number;
  pageLoadWaitMs: number;
  closeTabAfterCapture: boolean;
  cookieCaptureEnabled: boolean;
  cookieCaptureMode: CookieCaptureMode;
  cookieNamesText: string;
}

const currentTaskId = ref(new URLSearchParams(window.location.search).get("taskId") ?? "");
const isNewTask = ref(!currentTaskId.value);
const isLoading = ref(false);
const isSaving = ref(false);
const isRunning = ref(false);
const isDeleting = ref(false);
const statusText = ref("等待初始化");
const lastLoadedAt = ref("");
const form = reactive<TaskFormState>(toFormState(createTaskDraft()));

const pageTitle = computed(() => isNewTask.value ? "新增任务" : `编辑任务 · ${form.name}`);

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
  statusText.value = "正在读取任务详情...";

  try {
    const detailState: TaskDetailState = await getTaskDetailFromStorage(currentTaskId.value);
    Object.assign(form, toFormState(detailState.task));
    isNewTask.value = detailState.isNew;
    lastLoadedAt.value = new Date().toLocaleString("zh-CN", { hour12: false });
    statusText.value = "任务详情已加载";
  } catch (error) {
    statusText.value = `读取失败：${getErrorMessage(error)}`;
  } finally {
    isLoading.value = false;
  }
}

async function saveTask() {
  isSaving.value = true;
  statusText.value = "正在保存任务...";

  try {
    const task = await upsertTaskInStorage(buildPayload());
    currentTaskId.value = task.id;
    isNewTask.value = false;
    window.history.replaceState({}, "", `${window.location.pathname}?taskId=${encodeURIComponent(task.id)}`);
    statusText.value = "任务已保存";
    await refreshState();
  } catch (error) {
    statusText.value = `保存失败：${getErrorMessage(error)}`;
  } finally {
    isSaving.value = false;
  }
}

async function runNow() {
  if (!currentTaskId.value) {
    statusText.value = "请先保存任务后再执行";
    return;
  }

  isRunning.value = true;
  statusText.value = "正在执行 Cookie 采集...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "auto-submit-config:run-task-now",
      payload: { taskId: currentTaskId.value }
    }) as { ok: boolean; error?: string };

    if (!response?.ok) {
      throw new Error(response?.error || "执行任务失败");
    }

    statusText.value = "执行完成，结果已输出到扩展 Service Worker 控制台";
  } catch (error) {
    statusText.value = `执行失败：${getErrorMessage(error)}`;
  } finally {
    isRunning.value = false;
  }
}

async function deleteCurrentTask() {
  if (!currentTaskId.value) {
    window.close();
    return;
  }

  if (!window.confirm(`确认删除任务「${form.name}」？`)) {
    return;
  }

  isDeleting.value = true;
  try {
    await deleteTaskFromStorage(currentTaskId.value);
    window.close();
  } catch (error) {
    statusText.value = `删除失败：${getErrorMessage(error)}`;
  } finally {
    isDeleting.value = false;
  }
}

function buildPayload(): Partial<TaskConfig> {
  return {
    id: form.id,
    name: form.name.trim(),
    enabled: form.enabled,
    targetPageUrl: form.targetPageUrl.trim(),
    scheduleMinutes: form.scheduleMinutes,
    pageLoadWaitMs: form.pageLoadWaitMs,
    closeTabAfterCapture: form.closeTabAfterCapture,
    cookieCaptureEnabled: form.cookieCaptureEnabled,
    cookieCaptureMode: form.cookieCaptureMode,
    cookieNames: parseListText(form.cookieNamesText)
  };
}

function toFormState(task: TaskConfig): TaskFormState {
  return {
    id: task.id,
    name: task.name,
    enabled: task.enabled,
    targetPageUrl: task.targetPageUrl,
    scheduleMinutes: task.scheduleMinutes,
    pageLoadWaitMs: task.pageLoadWaitMs,
    closeTabAfterCapture: task.closeTabAfterCapture,
    cookieCaptureEnabled: task.cookieCaptureEnabled,
    cookieCaptureMode: task.cookieCaptureMode,
    cookieNamesText: task.cookieNames.join("\n")
  };
}

function parseListText(input: string) {
  return input.split(/[\n,]/g).map((item) => item.trim()).filter(Boolean);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : `${error ?? "未知错误"}`;
}
</script>

<template>
  <main class="shell detail-shell">
    <section class="hero">
      <div>
        <p class="eyebrow">Task Detail</p>
        <h1>{{ pageTitle }}</h1>
      </div>
      <p class="hero-copy">配置定时打开页面并采集目标站点 Cookie 的任务。</p>
      <div class="hero-meta">
        <span class="badge" :class="{ active: form.enabled }">
          {{ form.enabled ? "任务开启" : "任务关闭" }}
        </span>
        <span class="status">{{ statusText }}</span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>基础信息</h2>
        <span class="muted" v-if="lastLoadedAt">上次刷新：{{ lastLoadedAt }}</span>
      </div>

      <label class="field">
        <span>任务名称</span>
        <input v-model="form.name" type="text" placeholder="站点 Cookie 任务" />
      </label>

      <label class="switch-row">
        <span>启用任务</span>
        <input v-model="form.enabled" type="checkbox" />
      </label>

      <label class="field">
        <span>目标页面 URL</span>
        <input v-model="form.targetPageUrl" type="url" placeholder="https://example.com/" />
      </label>

      <div class="two-column">
        <label class="field">
          <span>定时间隔（分钟）</span>
          <input v-model.number="form.scheduleMinutes" type="number" min="1" max="1440" />
        </label>
        <label class="field">
          <span>页面等待（毫秒）</span>
          <input v-model.number="form.pageLoadWaitMs" type="number" min="1000" max="120000" />
        </label>
      </div>

      <label class="switch-row">
        <span>采集后自动关闭标签页</span>
        <input v-model="form.closeTabAfterCapture" type="checkbox" />
      </label>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Cookie 采集</h2>
        <span class="muted">结果仅输出到本地扩展控制台</span>
      </div>

      <label class="switch-row">
        <span>启用 Cookie 采集</span>
        <input v-model="form.cookieCaptureEnabled" type="checkbox" />
      </label>

      <div class="segmented">
        <button
          type="button"
          class="segment"
          :class="{ selected: form.cookieCaptureMode === 'named' }"
          @click="form.cookieCaptureMode = 'named'"
        >
          指定 Cookie
        </button>
        <button
          type="button"
          class="segment"
          :class="{ selected: form.cookieCaptureMode === 'all' }"
          @click="form.cookieCaptureMode = 'all'"
        >
          当前站点全部 Cookie
        </button>
      </div>

      <label class="field" v-if="form.cookieCaptureMode === 'named'">
        <span>Cookie 名称（逗号或换行分隔）</span>
        <textarea v-model="form.cookieNamesText" rows="5" placeholder="sessionid&#10;token" />
      </label>
    </section>

    <section class="actions">
      <button class="primary" type="button" :disabled="isSaving || isLoading" @click="saveTask">
        {{ isSaving ? "保存中..." : "保存任务" }}
      </button>
      <button class="secondary" type="button" :disabled="isRunning || isLoading" @click="runNow">
        {{ isRunning ? "执行中..." : "立即执行" }}
      </button>
      <button class="ghost" type="button" :disabled="isLoading" @click="refreshState">刷新</button>
      <button class="danger" type="button" :disabled="isDeleting || isLoading" @click="deleteCurrentTask">
        {{ isDeleting ? "删除中..." : "删除任务" }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.detail-shell {
  max-width: 920px;
  margin: 0 auto;
  padding: 24px;
}

.hero,
.panel {
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 20px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 30px rgba(14, 24, 40, 0.06);
}

.eyebrow {
  margin: 0 0 6px;
  color: #ef6c00;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
}

.hero-copy,
.muted {
  color: #607080;
}

.hero-meta,
.panel-head,
.switch-row,
.two-column,
.actions,
.segmented {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel,
.field {
  display: grid;
  gap: 12px;
}

.two-column .field {
  flex: 1;
}

.switch-row {
  border-radius: 14px;
  padding: 10px 12px;
  background: #f4f7fa;
}

input[type="text"],
input[type="url"],
input[type="number"],
textarea {
  width: 100%;
  border: 1px solid rgba(27, 42, 64, 0.16);
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
}

button {
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
}

.primary {
  color: #fff;
  background: #ef6c00;
}

.secondary {
  color: #fff;
  background: #1677c8;
}

.ghost {
  background: #edf2f6;
}

.danger {
  color: #b42318;
  background: #fff0ee;
}

.segment {
  flex: 1;
  background: #edf2f6;
}

.segment.selected {
  color: #fff;
  background: #1677c8;
}

.badge {
  border-radius: 999px;
  padding: 6px 10px;
  background: #edf2f6;
}

.badge.active {
  color: #087443;
  background: #dcfce7;
}

@media (max-width: 700px) {
  .two-column,
  .actions,
  .panel-head {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
