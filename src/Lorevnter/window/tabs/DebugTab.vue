<template>
  <div class="debug-tab">
    <!-- 分组 1: 上下文快照 -->
    <div class="debug-section">
      <div class="debug-section-header" @click="showContext = !showContext">
        <span class="debug-section-icon">{{ showContext ? '▼' : '▶' }}</span>
        <span class="debug-section-title">上下文快照</span>
        <button class="debug-action-btn" @click.stop="onRefreshContext" title="刷新">🔄</button>
      </div>
      <div v-if="showContext" class="debug-section-body">
        <div class="debug-kv">
          <div class="debug-kv-item">
            <span class="debug-key">模式</span>
            <span class="debug-value">{{ ctx.context.mode }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">来源</span>
            <span class="debug-value">{{ ctx.context.sourceLabel }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">角色名</span>
            <span class="debug-value">{{ ctx.context.characterName ?? '—' }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">主世界书</span>
            <span class="debug-value">{{ ctx.context.character.primary ?? '—' }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">附加世界书</span>
            <span class="debug-value">{{ ctx.context.character.additional.length > 0 ? ctx.context.character.additional.join(', ') : '—' }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">全局世界书</span>
            <span class="debug-value">{{ ctx.context.global.length > 0 ? ctx.context.global.join(', ') : '—' }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">Chat ID</span>
            <span class="debug-value debug-mono">{{ ctx.context.chatId ?? '—' }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">分析模式</span>
            <span class="debug-value">{{ settings.lore_ai_mode === 'twopass' ? '两次调用' : '一次调用' }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">触发方式</span>
            <span class="debug-value">{{ settings.lore_scan_trigger === 'auto' ? '自动' : '手动' }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">约束数</span>
            <span class="debug-value">{{ settings.lore_constraints.length }}</span>
          </div>
          <div class="debug-kv-item">
            <span class="debug-key">上次刷新</span>
            <span class="debug-value debug-mono">{{ formatTime(ctx.context.lastRefreshed) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 分组 2: AI 调用历史 -->
    <div class="debug-section">
      <div class="debug-section-header" @click="showAiHistory = !showAiHistory">
        <span class="debug-section-icon">{{ showAiHistory ? '▼' : '▶' }}</span>
        <span class="debug-section-title">AI 调用历史 ({{ runtime.aiCallHistory.length }})</span>
        <button class="debug-action-btn" @click.stop="onClearAiHistory" title="清空">🗑</button>
      </div>
      <div v-if="showAiHistory" class="debug-section-body">
        <div v-if="runtime.aiCallHistory.length === 0" class="debug-empty">暂无 AI 调用记录</div>
        <div v-for="(call, i) in aiHistoryReversed" :key="i" class="debug-ai-call">
          <div class="debug-ai-call-header">
            <span class="debug-ai-call-time">{{ formatTime(call.timestamp) }}</span>
            <span class="debug-ai-call-mode">{{ call.mode === 'twopass' ? '两次' : '一次' }}</span>
            <span class="debug-ai-call-stat">
              输入: {{ call.inputEntries }} 条目 {{ call.inputMessages }} 消息
            </span>
            <span class="debug-ai-call-result" :class="call.appliedCount > 0 ? 'has-updates' : ''">
              更新 {{ call.appliedCount }}/{{ call.outputUpdates }}
            </span>
          </div>
          <div v-if="call.updates.length > 0" class="debug-ai-call-updates">
            <div v-for="(u, j) in call.updates" :key="j" class="debug-ai-update-item">
              <span class="debug-ai-update-name">{{ u.entryName }}</span>
              <span class="debug-ai-update-reason">{{ u.reason }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分组 3: 操作日志 -->
    <div class="debug-section">
      <div class="debug-section-header" @click="showLogs = !showLogs">
        <span class="debug-section-icon">{{ showLogs ? '▼' : '▶' }}</span>
        <span class="debug-section-title">操作日志 ({{ runtime.logEntries.length }})</span>
        <div class="debug-log-actions">
          <button class="debug-action-btn" @click.stop="onRefreshLogs" title="刷新">🔄</button>
          <button class="debug-action-btn" @click.stop="onClearLogs" title="清空">🗑</button>
          <button class="debug-action-btn" @click.stop="onExportDebug" title="导出">📋</button>
        </div>
      </div>
      <div v-if="showLogs" class="debug-section-body">
        <!-- 级别过滤 -->
        <div class="debug-log-filters">
          <button
            v-for="lvl in ['all', 'error', 'warn', 'info', 'debug']"
            :key="lvl"
            class="debug-filter-btn"
            :class="{ active: logFilter === lvl }"
            @click="logFilter = lvl"
          >
            {{ lvl }}
          </button>
        </div>
        <div class="debug-logs-list">
          <div
            v-for="(entry, i) in filteredLogs"
            :key="i"
            class="log-entry"
            :class="'log-' + entry.level"
          >
            <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
            <span class="log-level">{{ entry.level.toUpperCase() }}</span>
            <span class="log-source">{{ entry.source }}</span>
            <span class="log-msg">{{ entry.message }}</span>
          </div>
          <div v-if="filteredLogs.length === 0" class="debug-empty">暂无日志</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRuntimeStore } from '../../state';
import { useSettingsStore } from '../../settings';
import { useContextStore } from '../../core/worldbook-context';
import { clearLogBuffer } from '../../logger';

const runtime = useRuntimeStore();
const { settings } = useSettingsStore();
const ctx = useContextStore();

// ── 折叠状态 ──
const showContext = ref(true);
const showAiHistory = ref(true);
const showLogs = ref(false);

// ── 日志过滤 ──
const logFilter = ref('all');

const filteredLogs = computed(() => {
  const logs = runtime.logEntries.slice().reverse();
  if (logFilter.value === 'all') return logs;
  return logs.filter((e) => e.level === logFilter.value);
});

const aiHistoryReversed = computed(() =>
  runtime.aiCallHistory.slice().reverse(),
);

// ── 操作 ──
function onRefreshContext() {
  try {
    ctx.refresh();
    toastr.success('已刷新', 'Lorevnter');
  } catch {
    toastr.error('刷新失败', 'Lorevnter');
  }
}

function onRefreshLogs() {
  runtime.refreshLogs();
}

function onClearLogs() {
  clearLogBuffer();
  runtime.refreshLogs();
  toastr.info('日志已清空', 'Lorevnter');
}

function onClearAiHistory() {
  runtime.clearAiHistory();
  toastr.info('AI 历史已清空', 'Lorevnter');
}

function onExportDebug() {
  const data = {
    context: ctx.context,
    aiHistory: runtime.aiCallHistory,
    logs: runtime.logEntries,
    settings: {
      ai_mode: settings.lore_ai_mode,
      scan_trigger: settings.lore_scan_trigger,
      scan_interval: settings.lore_scan_interval,
      constraints_count: settings.lore_constraints.length,
    },
  };
  navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  toastr.success('调试信息已复制到剪贴板', 'Lorevnter');
}

function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

onMounted(() => {
  runtime.refreshLogs();
});
</script>

<style scoped>
.debug-tab { display: flex; flex-direction: column; gap: 16px; padding: 4px; }

.debug-section {
  background: var(--lore-bg-secondary); border-radius: var(--lore-radius-md);
  border: 1px solid var(--lore-border-light); overflow: hidden;
}
.debug-section-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; cursor: pointer; transition: background 0.15s;
}
.debug-section-header:hover { background: var(--lore-bg-tertiary); }
.debug-section-icon { font-size: 11px; color: var(--lore-text-secondary); width: 14px; display: inline-block; text-align: center; }
.debug-section-title {
  font-size: 14px; font-weight: 500; color: var(--lore-text-primary); flex: 1; letter-spacing: -0.2px;
}
.debug-section-body {
  padding: 0 14px 12px; border-top: 1px solid var(--lore-border-light);
  padding-top: 12px;
}

/* KV 表 */
.debug-kv { display: flex; flex-direction: column; }
.debug-kv-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid var(--lore-border-light);
}
.debug-kv-item:last-child { border-bottom: none; }
.debug-key { font-size: 13px; color: var(--lore-text-secondary); }
.debug-value { font-size: 13px; color: var(--lore-text-primary); text-align: right; max-width: 60%; word-break: break-word; overflow-wrap: break-word; font-weight: 500; }
.debug-mono { font-family: -apple-system, monospace; font-size: 12px; }

/* AI 调用 */
.debug-ai-call {
  padding: 12px 0; border-bottom: 1px solid var(--lore-border-light); display: flex; flex-direction: column; gap: 6px;
}
.debug-ai-call:last-child { border-bottom: none; }
.debug-ai-call-header {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.debug-ai-call-time { font-size: 12px; color: var(--lore-text-secondary); font-family: -apple-system, monospace; }
.debug-ai-call-mode {
  font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: 500;
  background: var(--lore-accent-bg); color: var(--lore-accent);
}
.debug-ai-call-stat { font-size: 12px; color: var(--lore-text-secondary); }
.debug-ai-call-result {
  font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: 500;
  background: var(--lore-bg-primary); color: var(--lore-text-secondary);
}
.debug-ai-call-result.has-updates { background: var(--lore-success-bg); color: var(--lore-success); }
.debug-ai-call-updates { margin-top: 4px; padding-left: 8px; border-left: 2px solid var(--lore-border-light); }
.debug-ai-update-item {
  display: flex; gap: 8px; font-size: 12px; padding: 3px 0;
}
.debug-ai-update-name { color: var(--lore-accent); font-weight: 500; }
.debug-ai-update-reason { color: var(--lore-text-secondary); }

/* 日志 */
.debug-log-actions { display: flex; gap: 4px; }
.debug-action-btn {
  background: var(--lore-bg-primary); border: none; font-size: 14px; cursor: pointer;
  padding: 4px 6px; border-radius: var(--lore-radius-sm); transition: background 0.15s;
  min-width: 32px; min-height: 32px; /* 触控最小区域 */
  display: flex; align-items: center; justify-content: center;
}
.debug-action-btn:hover { background: var(--lore-border-light); }
.debug-log-filters { display: flex; gap: 6px; margin-bottom: 12px; }
.debug-filter-btn {
  padding: 4px 10px; border-radius: 12px; border: 1px solid var(--lore-border-light);
  background: transparent; color: var(--lore-text-secondary);
  font-size: 11px; cursor: pointer; transition: all 0.15s;
  text-transform: uppercase; font-weight: 500;
}
.debug-filter-btn.active { background: var(--lore-accent); color: #fff; border-color: var(--lore-accent); }
.debug-filter-btn:hover:not(.active) { color: var(--lore-text-primary); border-color: var(--lore-text-tertiary); }

.debug-logs-list { max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }

/* 复用日志条目样式 */
.log-entry {
  display: flex; gap: 8px; padding: 6px 8px;
  font-size: 12px; font-family: -apple-system, monospace;
  border-radius: var(--lore-radius-sm); align-items: baseline; line-height: 1.4;
}
.log-time { color: var(--lore-text-tertiary); flex-shrink: 0; }
.log-level { font-weight: 600; flex-shrink: 0; min-width: 44px; }
.log-source { color: var(--lore-accent); flex-shrink: 0; font-size: 11px; opacity: 0.8; font-weight: 500;}
.log-msg { color: var(--lore-text-primary); word-break: break-word; overflow-wrap: break-word; }

.log-debug .log-level { color: var(--lore-text-tertiary); }
.log-info .log-level { color: var(--lore-accent); }
.log-warn { background: rgba(255, 149, 0, 0.1); }
.log-warn .log-level { color: #ff9500; }
.log-error { background: var(--lore-danger-bg); }
.log-error .log-level { color: var(--lore-danger); }

.debug-empty { font-size: 13px; color: var(--lore-text-secondary); text-align: center; padding: 20px; }
</style>
