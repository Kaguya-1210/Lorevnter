<template>
  <div v-show="runtime.windowVisible" class="lorevnter-overlay" @click.self="runtime.windowVisible = false">
    <div class="lorevnter-window" :data-lore-theme="settings.lore_theme">
      <div class="lorevnter-header">
        <span class="lorevnter-title">📖 Lorevnter</span>
        <span class="lorevnter-subtitle">世界书管理</span>
        <button class="lorevnter-close" @click="runtime.windowVisible = false">✕</button>
      </div>

      <div class="lorevnter-tabs">
        <button :class="{ active: runtime.currentTab === 'worldbooks' }" @click="runtime.currentTab = 'worldbooks'">📖 世界书</button>
        <button :class="{ active: runtime.currentTab === 'presets' }" @click="runtime.currentTab = 'presets'">📦 预设</button>
        <button :class="{ active: runtime.currentTab === 'settings' }" @click="runtime.currentTab = 'settings'">⚙ 设置</button>
        <button
          v-show="settings.lore_debug_mode"
          :class="{ active: runtime.currentTab === 'logs' }"
          @click="onLogsTabClick"
        >📝 日志</button>
      </div>

      <div class="lorevnter-body">
        <!-- 世界书 -->
        <div v-if="runtime.currentTab === 'worldbooks'" class="tab-content">
          <p class="tab-placeholder">
            📖 世界书浏览与管理 — 待开发
          </p>
        </div>

        <!-- 预设 -->
        <div v-else-if="runtime.currentTab === 'presets'" class="tab-content">
          <p class="tab-placeholder">
            📦 预设管理 — 待开发
          </p>
        </div>

        <!-- 设置 -->
        <div v-else-if="runtime.currentTab === 'settings'" class="tab-content">
          <p class="tab-placeholder">
            ⚙ 设置面板 — 待开发
          </p>
        </div>

        <!-- 日志（仅 debugMode 下显示） -->
        <div v-else-if="runtime.currentTab === 'logs'" class="tab-content tab-logs">
          <div class="logs-toolbar">
            <span class="logs-count">{{ runtime.logEntries.length }} 条日志</span>
            <button class="logs-refresh" @click="runtime.refreshLogs()">🔄 刷新</button>
            <button class="logs-clear" @click="onClearLogs">🗑 清空</button>
          </div>
          <div class="logs-list">
            <div
              v-for="(entry, i) in runtime.logEntries.slice().reverse()"
              :key="i"
              class="log-entry"
              :class="'log-' + entry.level"
            >
              <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
              <span class="log-level">{{ entry.level.toUpperCase() }}</span>
              <span class="log-source">{{ entry.source }}</span>
              <span class="log-msg">{{ entry.message }}</span>
            </div>
            <p v-if="runtime.logEntries.length === 0" class="tab-placeholder">暂无日志</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../settings';
import { useRuntimeStore } from '../state';
import { clearLogBuffer } from '../logger';

const { settings } = useSettingsStore();
const runtime = useRuntimeStore();

function onLogsTabClick() {
  runtime.currentTab = 'logs';
  runtime.refreshLogs();
}

function onClearLogs() {
  clearLogBuffer();
  runtime.refreshLogs();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}
</script>

<style scoped>
.lorevnter-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,.55); z-index: 100000;
  display: flex; align-items: center; justify-content: center;
  animation: lore-fadeIn .2s ease-out;
}
@keyframes lore-fadeIn { from { opacity: 0; } to { opacity: 1; } }

.lorevnter-window {
  --lore-bg-primary: #1e1e2e;
  --lore-bg-secondary: #262637;
  --lore-bg-tertiary: #2e2e45;
  --lore-text-primary: #e0e0f0;
  --lore-text-secondary: #a0a0c0;
  --lore-accent: #7c5bf0;
  --lore-accent-bg: rgba(124,91,240,.1);
  --lore-border: rgba(255,255,255,.08);

  background: var(--lore-bg-primary);
  border-radius: 16px;
  width: min(90vw, 540px);
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 48px rgba(0,0,0,.5);
  border: 1px solid var(--lore-border);
}

.lorevnter-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px; border-bottom: 1px solid var(--lore-border);
}
.lorevnter-title {
  font-size: 16px; font-weight: 700; color: var(--lore-text-primary);
}
.lorevnter-subtitle {
  font-size: 11px; color: var(--lore-text-secondary); margin-top: 2px;
}
.lorevnter-close {
  margin-left: auto; background: none; border: none;
  color: var(--lore-text-secondary); font-size: 16px; cursor: pointer;
  padding: 4px 8px; border-radius: 6px; transition: all .15s;
}
.lorevnter-close:hover { background: var(--lore-bg-tertiary); color: var(--lore-text-primary); }

.lorevnter-tabs {
  display: flex; border-bottom: 1px solid var(--lore-border);
  padding: 0 12px;
}
.lorevnter-tabs button {
  flex: 1; padding: 10px 8px; background: none; border: none;
  color: var(--lore-text-secondary); font-size: 12px; font-weight: 500;
  cursor: pointer; border-bottom: 2px solid transparent;
  transition: all .15s;
}
.lorevnter-tabs button.active {
  color: var(--lore-accent); border-bottom-color: var(--lore-accent);
}
.lorevnter-tabs button:hover {
  color: var(--lore-text-primary); background: var(--lore-bg-secondary);
}

.lorevnter-body {
  flex: 1; overflow-y: auto; padding: 16px;
}
.tab-content { min-height: 200px; }
.tab-placeholder {
  color: var(--lore-text-secondary); font-size: 12px;
  text-align: center; padding: 40px 20px;
}

/* ── 日志 Tab ── */
.tab-logs { display: flex; flex-direction: column; gap: 8px; }
.logs-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 8px; border-bottom: 1px solid var(--lore-border);
}
.logs-count { font-size: 11px; color: var(--lore-text-secondary); flex: 1; }
.logs-refresh, .logs-clear {
  background: var(--lore-bg-secondary); border: 1px solid var(--lore-border);
  color: var(--lore-text-secondary); font-size: 11px; padding: 4px 8px;
  border-radius: 4px; cursor: pointer; transition: all .15s;
}
.logs-refresh:hover, .logs-clear:hover {
  background: var(--lore-bg-tertiary); color: var(--lore-text-primary);
}

.logs-list {
  max-height: 400px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px;
}
.log-entry {
  display: flex; gap: 6px; padding: 3px 6px;
  font-size: 11px; font-family: 'Consolas', 'Courier New', monospace;
  border-radius: 3px; align-items: baseline;
}
.log-time { color: var(--lore-text-secondary); flex-shrink: 0; }
.log-level {
  font-weight: 700; flex-shrink: 0; min-width: 40px;
}
.log-source {
  color: var(--lore-accent); flex-shrink: 0;
  font-size: 10px; opacity: 0.8;
}
.log-msg { color: var(--lore-text-primary); word-break: break-all; }

.log-debug .log-level { color: #888; }
.log-info .log-level { color: #7eb8da; }
.log-warn { background: rgba(255,200,50,.06); }
.log-warn .log-level { color: #e8b830; }
.log-error { background: rgba(255,80,80,.08); }
.log-error .log-level { color: #e85050; }
</style>
