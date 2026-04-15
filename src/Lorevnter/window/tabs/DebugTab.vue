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
.debug-tab { display: flex; flex-direction: column; gap: 12px; }

.debug-section {
  background: var(--lore-bg-secondary); border-radius: 12px;
  border: 1px solid var(--lore-border); overflow: hidden;
}
.debug-section-header {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px; cursor: pointer; transition: background 0.15s;
}
.debug-section-header:hover { background: var(--lore-bg-tertiary); }
.debug-section-icon { font-size: 10px; color: var(--lore-text-secondary); width: 14px; }
.debug-section-title {
  font-size: 12px; font-weight: 600; color: var(--lore-text-primary); flex: 1;
}
.debug-section-body {
  padding: 0 14px 12px; border-top: 1px solid var(--lore-border);
  padding-top: 10px;
}

/* KV 表 */
.debug-kv { display: flex; flex-direction: column; gap: 4px; }
.debug-kv-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
}
.debug-key { font-size: 11px; color: var(--lore-text-secondary); }
.debug-value { font-size: 11px; color: var(--lore-text-primary); text-align: right; max-width: 60%; word-break: break-all; }
.debug-mono { font-family: 'Consolas', monospace; font-size: 10px; }

/* AI 调用 */
.debug-ai-call {
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
}
.debug-ai-call:last-child { border-bottom: none; }
.debug-ai-call-header {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.debug-ai-call-time { font-size: 10px; color: var(--lore-text-secondary); font-family: monospace; }
.debug-ai-call-mode {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: var(--lore-accent-bg); color: var(--lore-accent);
}
.debug-ai-call-stat { font-size: 10px; color: var(--lore-text-secondary); }
.debug-ai-call-result {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: rgba(255,255,255,0.05); color: var(--lore-text-secondary);
}
.debug-ai-call-result.has-updates { background: rgba(80, 200, 120, 0.1); color: #50c878; }
.debug-ai-call-updates { margin-top: 6px; padding-left: 12px; }
.debug-ai-update-item {
  display: flex; gap: 8px; font-size: 10px; padding: 2px 0;
}
.debug-ai-update-item::before { content: '├'; color: var(--lore-text-secondary); }
.debug-ai-update-name { color: var(--lore-accent); font-weight: 600; }
.debug-ai-update-reason { color: var(--lore-text-secondary); }

/* 日志 */
.debug-log-actions { display: flex; gap: 2px; }
.debug-action-btn {
  background: none; border: none; font-size: 12px; cursor: pointer;
  padding: 2px 4px; border-radius: 4px; transition: background 0.15s;
}
.debug-action-btn:hover { background: var(--lore-bg-tertiary); }
.debug-log-filters { display: flex; gap: 4px; margin-bottom: 8px; }
.debug-filter-btn {
  padding: 3px 8px; border-radius: 6px; border: 1px solid var(--lore-border);
  background: none; color: var(--lore-text-secondary);
  font-size: 10px; cursor: pointer; transition: all 0.15s;
  text-transform: uppercase;
}
.debug-filter-btn.active { background: var(--lore-accent-bg); color: var(--lore-accent); border-color: var(--lore-accent); }
.debug-filter-btn:hover { color: var(--lore-text-primary); }

.debug-logs-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }

/* 复用日志条目样式 */
.log-entry {
  display: flex; gap: 6px; padding: 3px 6px;
  font-size: 10px; font-family: 'Consolas', monospace;
  border-radius: 3px; align-items: baseline;
}
.log-time { color: var(--lore-text-secondary); flex-shrink: 0; }
.log-level { font-weight: 700; flex-shrink: 0; min-width: 40px; }
.log-source { color: var(--lore-accent); flex-shrink: 0; font-size: 9px; opacity: 0.8; }
.log-msg { color: var(--lore-text-primary); word-break: break-all; }

.log-debug .log-level { color: #888; }
.log-info .log-level { color: #7eb8da; }
.log-warn { background: rgba(255,200,50,.06); }
.log-warn .log-level { color: #e8b830; }
.log-error { background: rgba(255,80,80,.08); }
.log-error .log-level { color: #e85050; }

.debug-empty { font-size: 11px; color: var(--lore-text-secondary); text-align: center; padding: 16px; }
</style>
