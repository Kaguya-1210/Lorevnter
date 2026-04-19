<template>
  <div class="debug-tab">
    <!-- 分组 0: 系统自检 -->
    <div class="debug-section">
      <div class="debug-section-header" @click="showSelfCheck = !showSelfCheck">
        <span class="debug-section-icon">{{ showSelfCheck ? '▼' : '▶' }}</span>
        <span class="debug-section-title">🩺 系统自检</span>
        <button
          class="debug-action-btn"
          @click.stop="startDiagnostics"
          :disabled="selfCheckStore.isRunning"
          :title="selfCheckStore.isRunning ? '自检中...' : '开始自检'"
        >{{ selfCheckStore.isRunning ? '⏳' : '▶️' }}</button>
      </div>
      <div v-if="showSelfCheck" class="debug-section-body">
        <!-- 自检列表 -->
        <div v-if="selfCheckStore.steps.length === 0" class="debug-empty">未初始化</div>
        <div v-else class="sc-compact-list">
          <div
            v-for="step in selfCheckStore.steps"
            :key="step.id"
            class="sc-compact-item"
            :class="[`sc-st-${step.status}`]"
          >
            <span class="sc-compact-icon">
              <span v-if="step.status === 'pending'">◎</span>
              <span v-else-if="step.status === 'running'" class="sc-spin">⟳</span>
              <span v-else-if="step.status === 'success'">✓</span>
              <span v-else-if="step.status === 'error'">✕</span>
            </span>
            <div class="sc-compact-text">
              <span class="sc-compact-title">{{ step.title }}</span>
              <span class="sc-compact-desc">{{ step.description }}</span>
              <span v-if="step.resultMessage && (step.status === 'success' || step.status === 'error')" class="sc-compact-result">
                {{ step.resultMessage }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="selfCheckStore.isFinished" class="sc-compact-done">🎉 自检完成</div>
      </div>
    </div>

    <!-- 分组 0.5: 快速信息 -->
    <div class="debug-section">
      <div class="debug-section-header" @click="showQuickInfo = !showQuickInfo">
        <span class="debug-section-icon">{{ showQuickInfo ? '▼' : '▶' }}</span>
        <span class="debug-section-title">⚡ 快速信息</span>
      </div>
      <div v-if="showQuickInfo" class="debug-section-body">
        <!-- 上下文快照 -->
        <div class="debug-kv-item">
          <span class="debug-key">聊天 ID</span>
          <span class="debug-value debug-mono">{{ currentChatId || '(无)' }}</span>
        </div>
        <div class="debug-kv-item">
          <span class="debug-key">世界书来源</span>
          <span class="debug-value">{{ ctx.context.sourceLabel }}</span>
        </div>
        <div class="debug-kv-item">
          <span class="debug-key">分析模式</span>
          <span class="debug-value">一次调用</span>
        </div>

        <!-- 触发配置 -->
        <div class="debug-kv-item">
          <span class="debug-key">触发模式</span>
          <span class="debug-value">{{ settings.lore_scan_trigger === 'auto' ? '🟢 自动' : '🔵 手动' }}</span>
        </div>
        <div v-if="settings.lore_scan_trigger === 'auto'" class="debug-kv-item">
          <span class="debug-key">当前计数 / 触发间隔</span>
          <span class="debug-value">{{ currentAiReplyCount }} / {{ settings.lore_scan_interval }}</span>
        </div>
        <div v-if="settings.lore_scan_trigger === 'auto'" class="debug-kv-item">
          <span class="debug-key">距下次触发</span>
          <span class="debug-value">{{ remainingToTrigger }} 次 AI 回复</span>
        </div>
        <div v-if="settings.lore_scan_trigger === 'auto'" class="debug-kv-item">
          <span class="debug-key">跳过零层</span>
          <span class="debug-value">{{ settings.lore_skip_greeting ? '✓ 开启' : '✕ 关闭' }}</span>
        </div>

        <!-- 一键获取 API 配置 -->
        <div style="margin-top: 8px;">
          <button class="debug-action-btn-full" @click="onFetchApiSnapshot">📋 一键获取当前 API 配置</button>
        </div>
        <div v-if="apiSnapshot" class="debug-ai-api-details" style="margin-top: 6px;">
          <div class="debug-kv-item"><span class="debug-key">来源</span><span class="debug-value">{{ apiSnapshot.source === 'tavern' ? '酒馆代理' : '自定义' }}</span></div>
          <div class="debug-kv-item"><span class="debug-key">API 地址</span><span class="debug-value debug-mono">{{ apiSnapshot.apiUrl }}</span></div>
          <div class="debug-kv-item"><span class="debug-key">模型</span><span class="debug-value debug-mono">{{ apiSnapshot.model }}</span></div>
          <div class="debug-kv-item"><span class="debug-key">温度</span><span class="debug-value">{{ apiSnapshot.temperature }}</span></div>
          <div class="debug-kv-item"><span class="debug-key">Top P</span><span class="debug-value">{{ apiSnapshot.topP }}</span></div>
          <div class="debug-kv-item"><span class="debug-key">最大 Tokens</span><span class="debug-value">{{ apiSnapshot.maxTokens }}</span></div>
          <div class="debug-kv-item"><span class="debug-key">频率惩罚</span><span class="debug-value">{{ apiSnapshot.frequencyPenalty }}</span></div>
          <div class="debug-kv-item"><span class="debug-key">存在惩罚</span><span class="debug-value">{{ apiSnapshot.presencePenalty }}</span></div>
        </div>
      </div>
    </div>

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
            <span class="debug-value">一次调用</span>
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
              <div class="debug-ai-update-header">
                <span class="debug-ai-update-name">{{ u.entryName }}</span>
                <span class="debug-ai-update-reason">{{ u.reason }}</span>
              </div>
              <pre class="debug-ai-update-content">{{ u.newContent }}</pre>
            </div>
          </div>
          <!-- AI 原始响应 -->
          <div v-if="call.rawResponse" class="debug-ai-raw">
            <button class="debug-action-btn" @click="toggleRawResponse(i)" style="font-size:12px;">{{ expandedRaw[i] ? '▼ 收起原始响应' : '▶ 查看原始响应' }}</button>
            <pre v-if="expandedRaw[i]" class="debug-prompt-content" style="max-height:200px;overflow-y:auto;margin-top:6px;">{{ call.rawResponse }}</pre>
          </div>
          <!-- API 配置快照（调试模式下采集） -->
          <div v-if="call.apiDetails" class="debug-ai-api-details">
            <div class="debug-kv-item"><span class="debug-key">来源</span><span class="debug-value">{{ call.apiDetails.source === 'tavern' ? '酒馆代理' : '自定义' }}</span></div>
            <div class="debug-kv-item"><span class="debug-key">API 地址</span><span class="debug-value debug-mono">{{ call.apiDetails.apiUrl }}</span></div>
            <div class="debug-kv-item"><span class="debug-key">模型</span><span class="debug-value debug-mono">{{ call.apiDetails.model }}</span></div>
            <div class="debug-kv-item"><span class="debug-key">温度</span><span class="debug-value">{{ call.apiDetails.temperature }}</span></div>
            <div class="debug-kv-item"><span class="debug-key">Top P</span><span class="debug-value">{{ call.apiDetails.topP }}</span></div>
            <div class="debug-kv-item"><span class="debug-key">最大 Tokens</span><span class="debug-value">{{ call.apiDetails.maxTokens }}</span></div>
            <div class="debug-kv-item"><span class="debug-key">频率惩罚</span><span class="debug-value">{{ call.apiDetails.frequencyPenalty }}</span></div>
            <div class="debug-kv-item"><span class="debug-key">存在惩罚</span><span class="debug-value">{{ call.apiDetails.presencePenalty }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分组 3: 提示词预览（管线干跑） -->
    <div class="debug-section">
      <div class="debug-section-header" @click="showPromptPreview = !showPromptPreview">
        <span class="debug-section-icon">{{ showPromptPreview ? '▼' : '▶' }}</span>
        <span class="debug-section-title">🔬 管线预览</span>
        <button class="debug-action-btn" @click.stop="onBuildPreview" title="运行管线预览（不调用AI）" :disabled="previewLoading">
          {{ previewLoading ? '⏳' : '▶️' }}
        </button>
      </div>
      <div v-if="showPromptPreview" class="debug-section-body">
        <div v-if="!previewPrompts && !previewError" class="debug-empty">
          点击 ▶️ 运行管线预览：收集命中条目 → 提取上下文 → 组装提示词（不调用 AI，不写入数据）
        </div>
        <div v-if="previewError" class="debug-empty" style="color: var(--lore-danger);">{{ previewError }}</div>

        <template v-if="previewPrompts">
          <!-- 命中条目列表 -->
          <div class="debug-preview-entries">
            <div class="debug-key" style="margin-bottom:6px;">📋 命中条目（{{ previewPrompts.entryCount }} 条，跳过 {{ previewPrompts.skippedCount }} 条）</div>
            <div v-for="(name, i) in previewPrompts.entryNames" :key="i" class="debug-cache-name-item">
              {{ name }}
            </div>
            <div class="debug-kv-item" style="margin-top:6px;">
              <span class="debug-key">上下文消息</span>
              <span class="debug-value">{{ previewPrompts.messageCount }} 条</span>
            </div>
            <div class="debug-kv-item">
              <span class="debug-key">预估 Token</span>
              <span class="debug-value" :style="previewPrompts.estimatedTokens > 30000 ? 'color: var(--lore-danger)' : ''">
                ≈ {{ previewPrompts.estimatedTokens.toLocaleString() }} tokens
              </span>
            </div>
          </div>

          <!-- 提示词卡片 -->
          <div class="debug-key" style="margin-top:12px;margin-bottom:6px;">📝 最终提示词（{{ previewPrompts.onepass.length }} 条消息）</div>
          <template v-if="previewPrompts.mode === 'onepass'">
            <div v-for="(p, i) in previewPrompts.onepass" :key="i" class="debug-prompt-card" :class="'debug-prompt-' + p.role">
              <div class="debug-prompt-role" :class="'debug-prompt-role-' + p.role">{{ p.role.toUpperCase() }}</div>
              <pre class="debug-prompt-content" :class="{ 'debug-prompt-collapsed': !expandedPreviews[`o_${i}`] && p.content.length > 200 }" @click="togglePreviewExpand(`o_${i}`)">{{ p.content }}</pre>
              <div v-if="p.content.length > 200" class="debug-prompt-expand" @click="togglePreviewExpand(`o_${i}`)">
                {{ expandedPreviews[`o_${i}`] ? '收起 ▲' : '展开全文 ▼' }}
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- 分组 4: 操作日志 -->
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

    <!-- 测试模式 -->
    <div class="debug-section">
      <div class="debug-section-header" @click="showTestMode = !showTestMode">
        <span class="debug-section-icon">{{ showTestMode ? '▼' : '▶' }}</span>
        <span class="debug-section-title">🧪 测试模式</span>
      </div>
      <div v-if="showTestMode" class="debug-section-body">
        <div class="debug-kv-item">
          <span class="debug-key">说明</span>
          <span class="debug-value">写入假数据到世界书（不走 AI），测试修改/新增/回档是否正常</span>
        </div>

        <!-- 活跃快照横幅 -->
        <div v-if="testSnapshotInfo" class="test-mode-banner">
          <div class="test-banner-text">
            📸 快照活跃 — {{ testSnapshotInfo.worldbook }}<br/>
            修改 {{ testSnapshotInfo.modifiedCount }} 条 | 新增 {{ testSnapshotInfo.createdCount }} 条
          </div>
          <div class="test-banner-actions">
            <button class="st-btn st-btn-danger" :disabled="testBusy" @click="onRollback">
              {{ testBusy ? '⏳' : '↩️ 回档' }}
            </button>
            <button class="st-btn" :disabled="testBusy" @click="onDiscardSnapshot">
              🗑️ 丢弃快照
            </button>
          </div>
        </div>

        <!-- 目标世界书选择 -->
        <div class="st-row" v-if="!testSnapshotInfo">
          <div class="st-row-main">
            <span class="st-label">目标世界书</span>
            <button class="debug-action-btn" @click="refreshTestWorldbooks" title="刷新列表">🔄</button>
          </div>
          <select v-model="testTargetWorldbook" class="st-select st-select-full">
            <option value="" disabled>请选择世界书</option>
            <option v-for="wb in testWorldbookList" :key="wb" :value="wb">{{ wb }}</option>
          </select>
        </div>
        <div class="st-row" v-if="!testSnapshotInfo">
          <button class="st-btn st-btn-test" :disabled="testBusy || !testTargetWorldbook" @click="onTestWrite">
            {{ testBusy ? '⏳ 写入中...' : '🧪 执行测试写入' }}
          </button>
        </div>

        <!-- 操作结果详情 -->
        <div v-if="testActions.length > 0" class="test-results">
          <div class="debug-key" style="margin-bottom:6px">操作结果:</div>
          <div
            v-for="(act, i) in testActions"
            :key="i"
            class="test-result-item"
            :class="act.success ? 'test-ok' : 'test-fail'"
          >
            <span class="test-result-icon">{{ act.success ? '✓' : '✕' }}</span>
            <span class="test-result-action">{{ act.action === 'modify' ? '修改' : '新增' }}</span>
            <span class="test-result-name">{{ act.entryName }}</span>
            <span class="test-result-uid">uid: {{ act.uid }}</span>
            <span class="test-result-detail">{{ act.detail }}</span>
          </div>
        </div>

        <!-- 说明：测试写入已集成审核弹窗 -->
        <div class="st-row" style="margin-top:8px;border-top:1px solid var(--lore-border);padding-top:8px">
          <span class="st-hint">💡 点击「🧪 执行测试写入」后会先弹出审核弹窗，确认后才写入。审核通过的条目支持回档恢复。</span>
        </div>
      </div>
    </div>

    <!-- 缓存状态 -->
    <div class="debug-section">
      <div class="debug-section-header" @click="showCacheInfo = !showCacheInfo">
        <span class="debug-section-icon">{{ showCacheInfo ? '▼' : '▶' }}</span>
        <span class="debug-section-title">📦 条目缓存</span>
        <button class="debug-action-btn" @click.stop="onRefreshCache" title="刷新缓存信息">🔄</button>
      </div>
      <div v-if="showCacheInfo" class="debug-section-body">
        <div class="debug-kv-item">
          <span class="debug-key">当前 Chat ID</span>
          <span class="debug-value debug-mono">{{ cacheStats.chatId || '—' }}</span>
        </div>
        <div class="debug-kv-item">
          <span class="debug-key">当前缓存条目数</span>
          <span class="debug-value">{{ cacheStats.currentCount }}</span>
        </div>
        <div class="debug-kv-item">
          <span class="debug-key">总缓存聊天数</span>
          <span class="debug-value">{{ cacheStats.totalChats }}</span>
        </div>
        <div class="debug-kv-item">
          <span class="debug-key">清空模式</span>
          <span class="debug-value">{{ settings.lore_cache_clear_mode === 'after_analysis' ? '分析后自动' : '手动' }}</span>
        </div>
        <div v-if="cachedNames.length > 0" class="debug-cache-names">
          <div class="debug-key" style="margin-bottom:4px">缓存条目清单:</div>
          <div v-for="name in cachedNames" :key="name" class="debug-cache-name-item">
            {{ name }}
          </div>
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
import { buildAnalysisRequest, getAiReplyCount, getCurrentChatId } from '../../core/update-pipeline';
import { buildOnePassPrompts, testApiConnection, getApiSnapshot } from '../../core/ai-engine';
import { useSelfCheckStore } from '../../stores/selfCheckStore';
import * as WorldbookAPI from '../../core/worldbook-api';
import { runTestWrite, rollbackTestWrite, discardTestSnapshot, getTestSnapshotInfo, getAvailableWorldbooks, type TestActionResult } from '../../core/test-mode';
import { getCacheStats, getCachedEntryNames } from '../../core/scan-cache';
import { openReviewEditor } from '../../core/review-editor';
import type { ReviewUpdate } from '../../core/review-types';

const runtime = useRuntimeStore();
const { settings } = useSettingsStore();
const ctx = useContextStore();
const selfCheckStore = useSelfCheckStore();

// ── 折叠状态 ──
const showSelfCheck = ref(false);
const showQuickInfo = ref(false);
const showContext = ref(false);
const showAiHistory = ref(false);
const showPromptPreview = ref(false);
const showLogs = ref(false);
const showTestMode = ref(false);
const showCacheInfo = ref(false);

// ── 测试模式 ──
const testTargetWorldbook = ref('');
const testBusy = ref(false);
const testActions = ref<TestActionResult[]>([]);
const testSnapshotInfo = ref(getTestSnapshotInfo());
const testWorldbookList = ref<string[]>(getAvailableWorldbooks());

function refreshTestWorldbooks() {
  testWorldbookList.value = getAvailableWorldbooks();
  toastr.info(`已刷新：${testWorldbookList.value.length} 个世界书`, 'Lorevnter');
}

async function onTestWrite() {
  if (!testTargetWorldbook.value) return;
  testBusy.value = true;
  testActions.value = [];
  try {
    const result = await runTestWrite(testTargetWorldbook.value);
    testActions.value = result.actions;
    testSnapshotInfo.value = getTestSnapshotInfo();
    if (result.success) {
      toastr.success(result.message, 'Lorevnter');
    } else {
      toastr.error(result.message, 'Lorevnter');
    }
  } finally {
    testBusy.value = false;
  }
}

async function onRollback() {
  if (!confirm('确认回档？将恢复世界书为测试前的状态。')) return;
  testBusy.value = true;
  try {
    const result = await rollbackTestWrite();
    testSnapshotInfo.value = getTestSnapshotInfo();
    testActions.value = [];
    if (result.success) {
      toastr.success(result.message, 'Lorevnter');
    } else {
      toastr.error(result.message, 'Lorevnter');
    }
  } finally {
    testBusy.value = false;
  }
}

function onDiscardSnapshot() {
  if (!confirm('确认丢弃快照？测试写入的数据将保留在世界书中。')) return;
  discardTestSnapshot();
  testSnapshotInfo.value = null;
  testActions.value = [];
  toastr.info('快照已丢弃，测试数据已保留', 'Lorevnter');
}



// ── 缓存信息 ──
const cacheStats = ref(getCacheStats());
const cachedNames = ref<string[]>(getCachedEntryNames());

function onRefreshCache() {
  cacheStats.value = getCacheStats();
  cachedNames.value = getCachedEntryNames();
  toastr.info('缓存信息已刷新', 'Lorevnter');
}

// ── 快速信息 ──
const apiSnapshot = ref<ReturnType<typeof getApiSnapshot> | null>(null);
const currentChatId = computed(() => getCurrentChatId());
const currentAiReplyCount = computed(() => getAiReplyCount());
const remainingToTrigger = computed(() => {
  const count = currentAiReplyCount.value;
  const interval = settings.lore_scan_interval;
  if (interval <= 0) return 0;
  return interval - (count % interval);
});

// ── AI 原始响应展开 ──
const expandedRaw = ref<Record<number, boolean>>({});
function toggleRawResponse(index: number) {
  expandedRaw.value[index] = !expandedRaw.value[index];
}

function onFetchApiSnapshot() {
  apiSnapshot.value = getApiSnapshot();
  toastr.success('API 配置已获取', 'Lorevnter');
}

// ── 提示词预览展开/折叠 ──
const expandedPreviews = ref<Record<string, boolean>>({});
function togglePreviewExpand(key: string) {
  expandedPreviews.value[key] = !expandedPreviews.value[key];
}

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

// ── 管线预览（干跑） ──
interface PromptPreviewData {
  mode: 'onepass';
  onepass: RolePrompt[];
  entryNames: string[];
  entryCount: number;
  skippedCount: number;
  messageCount: number;
  /** 粗略 Token 估算（英文约 4 字符/token，中文约 1.5 字符/token，取加权均值） */
  estimatedTokens: number;
}

const previewPrompts = ref<PromptPreviewData | null>(null);
const previewLoading = ref(false);
const previewError = ref('');

async function onBuildPreview() {
  previewLoading.value = true;
  previewError.value = '';
  previewPrompts.value = null;

  try {
    const request = await buildAnalysisRequest();
    if (!request) {
      previewError.value = '无法构建请求：请确认已打开角色卡、有活跃世界书且聊天记录不为空';
      return;
    }

    const prompts = buildOnePassPrompts(request);

    // 统计条目信息
    const entryNames = request.entries.map(ae => ae.entry.name || `uid_${ae.entry.uid}`);
    const totalEntries = Object.values(request.worldbookMap).reduce((sum, arr) => sum + arr.length, 0);
    const skippedCount = totalEntries - request.entries.length;

    // Token 估算：统计所有提示词总字符数
    const totalChars = prompts.reduce((sum, p) => sum + p.content.length, 0);
    // 粗略估算：中文为主的内容约 1.5 字符/token，混合取 ~2
    const estimatedTokens = Math.ceil(totalChars / 2);

    previewPrompts.value = {
      mode: 'onepass',
      onepass: prompts,
      entryNames,
      entryCount: request.entries.length,
      skippedCount,
      messageCount: request.chatMessages.length,
      estimatedTokens,
    };

    toastr.success(`管线预览完成：${request.entries.length} 条目, ${request.chatMessages.length} 消息`, 'Lorevnter');
  } catch (e) {
    previewError.value = `构建失败: ${(e as Error).message}`;
  } finally {
    previewLoading.value = false;
  }
}

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
  if (!confirm('确定清空所有日志？')) return;
  clearLogBuffer();
  runtime.refreshLogs();
  toastr.info('日志已清空', 'Lorevnter');
}

function onClearAiHistory() {
  if (!confirm('确定清空所有 AI 调用历史？')) return;
  runtime.clearAiHistory();
  toastr.info('AI 历史已清空', 'Lorevnter');
}

function onExportDebug() {
  const data = {
    context: ctx.context,
    aiHistory: runtime.aiCallHistory,
    logs: runtime.logEntries,
    settings: {
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

  // 初始化自检步骤
  if (selfCheckStore.steps.length === 0) {
    selfCheckStore.initSteps([
      {
        id: 'ui-engine',
        title: '主渲染引擎',
        description: '探测宿主运行环境挂载点',
        action: async () => 'DOM 渲染一切正常，当前节点已被激活',
      },
      {
        id: 'local-worldbook',
        title: '局部世界书系统',
        description: '验证 SillyTavern Worldbook 数据流',
        action: async () => {
          const all = WorldbookAPI.listAll();
          if (all.length === 0) return '未发现可用世界书';
          return `共计载入 ${all.length} 本`;
        },
      },
      {
        id: 'ai-connectivity',
        title: 'AI 引擎连通性',
        description: '向 API 端点发起握手测试',
        action: async () => {
          const t0 = performance.now();
          const result = await testApiConnection();
          const rtt = Math.round(performance.now() - t0);
          if (!result.ok) throw new Error(result.message);
          return `握手成功，延迟 ${rtt}ms`;
        },
      },
    ]);
  }
});

function startDiagnostics() {
  showSelfCheck.value = true;
  selfCheckStore.runCheck();
}
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
  display: flex; flex-direction: column; gap: 4px; font-size: 12px; padding: 6px 0;
  border-bottom: 1px dashed var(--lore-border-light);
}
.debug-ai-update-item:last-child { border-bottom: none; }
.debug-ai-update-header { display: flex; gap: 8px; align-items: center; }
.debug-ai-update-name { color: var(--lore-accent); font-weight: 500; }
.debug-ai-update-reason { color: var(--lore-text-secondary); }
.debug-ai-update-content {
  font-size: 12px; font-family: monospace; color: var(--lore-text-primary);
  background: var(--lore-bg-primary); border: 1px solid var(--lore-border-light);
  border-radius: var(--lore-radius-sm); padding: 8px 10px;
  white-space: pre-wrap; word-break: break-word; margin: 0;
  max-height: 120px; overflow-y: auto;
}
.debug-ai-api-details {
  margin-top: 6px; padding: 8px 10px;
  background: var(--lore-bg-primary); border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light);
}

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

/* 提示词预览 */
.debug-prompt-card {
  margin-bottom: 10px; border-radius: var(--lore-radius-sm);
  background: var(--lore-bg-primary); border: 1px solid var(--lore-border-light);
  overflow: hidden; transition: border-color 0.2s;
}
/* 按 role 分色边框 */
.debug-prompt-system { border-left: 3px solid var(--lore-accent); }
.debug-prompt-user { border-left: 3px solid #34c759; }
.debug-prompt-assistant { border-left: 3px solid #ff9500; }

.debug-prompt-role {
  padding: 6px 12px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
  border-bottom: 1px solid var(--lore-border-light);
}
/* 按 role 分色标签 */
.debug-prompt-role-system { background: var(--lore-accent-bg); color: var(--lore-accent); }
.debug-prompt-role-user { background: rgba(52, 199, 89, 0.12); color: #34c759; }
.debug-prompt-role-assistant { background: rgba(255, 149, 0, 0.12); color: #ff9500; }

.debug-prompt-content {
  padding: 10px 12px; font-size: 12px; line-height: 1.5;
  color: var(--lore-text-primary); font-family: monospace;
  white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word;
  max-height: none; overflow-y: auto; margin: 0;
  cursor: pointer;
}
.debug-prompt-collapsed { max-height: 80px; overflow: hidden; }
.debug-prompt-expand {
  text-align: center; padding: 4px; font-size: 11px;
  color: var(--lore-accent); cursor: pointer;
  border-top: 1px dashed var(--lore-border-light);
  transition: background 0.15s;
}
.debug-prompt-expand:hover { background: var(--lore-accent-bg); }

.debug-prompt-phase {
  font-size: 12px; font-weight: 600; color: var(--lore-text-secondary);
  padding: 8px 0 4px; margin-top: 8px;
  border-top: 1px dashed var(--lore-border-light);
}
.debug-prompt-phase:first-child { border-top: none; margin-top: 0; }

/* 自检紧凑列表 */
.sc-compact-list { display: flex; flex-direction: column; gap: 6px; }
.sc-compact-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 10px; border-radius: var(--lore-radius-sm);
  background: var(--lore-bg-primary); border: 1px solid var(--lore-border-light);
  transition: border-color 0.2s;
}
.sc-compact-icon { flex-shrink: 0; width: 18px; text-align: center; font-size: 13px; padding-top: 1px; }
.sc-st-pending .sc-compact-icon { color: var(--lore-text-tertiary); }
.sc-st-running .sc-compact-icon { color: var(--lore-accent); }
.sc-st-success .sc-compact-icon { color: var(--lore-success); font-weight: 700; }
.sc-st-error .sc-compact-icon { color: var(--lore-danger); font-weight: 700; }
.sc-st-error { border-color: var(--lore-danger); }
.sc-spin { display: inline-block; animation: sc-rotate 1s linear infinite; }
@keyframes sc-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.sc-compact-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.sc-compact-title { font-size: 13px; font-weight: 600; color: var(--lore-text-primary); }
.sc-compact-desc { font-size: 11px; color: var(--lore-text-tertiary); }
.sc-compact-result { font-size: 11px; color: var(--lore-accent); font-family: monospace; margin-top: 2px; }
.sc-st-error .sc-compact-result { color: var(--lore-danger); }
.sc-st-success .sc-compact-result { color: var(--lore-success); }
.sc-compact-done { font-size: 12px; color: var(--lore-success); font-weight: 600; text-align: center; padding: 8px 0; }

/* 全宽操作按钮 */
.debug-action-btn-full {
  width: 100%; padding: 10px 14px; border: 1px solid var(--lore-accent);
  border-radius: var(--lore-radius-sm); background: var(--lore-accent-bg);
  color: var(--lore-accent); font-size: 13px; font-weight: 500;
  cursor: pointer; min-height: 44px;
  transition: background 0.2s, box-shadow 0.2s;
}
.debug-action-btn-full:hover {
  background: var(--lore-accent); color: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

/* 测试模式 banner */
.test-mode-banner {
  background: rgba(255, 165, 0, 0.12);
  border: 1px solid rgba(255, 165, 0, 0.35);
  border-radius: var(--lore-radius-sm);
  padding: 12px 14px;
  margin: 8px 0;
}
.test-banner-text {
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 8px;
  color: var(--lore-text);
}
.test-banner-actions {
  display: flex;
  gap: 8px;
}


/* 缓存条目列表 */
.debug-cache-names {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--lore-surface-2, rgba(255,255,255,0.04));
  border-radius: var(--lore-radius-sm);
}
.debug-cache-name-item {
  padding: 3px 0;
  font-size: 12px;
  font-family: var(--lore-font-mono, monospace);
  color: var(--lore-text-secondary);
  border-bottom: 1px solid var(--lore-border);
}
.debug-cache-name-item:last-child {
  border-bottom: none;
}

/* 测试结果列表 */
.test-results {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--lore-surface-2, rgba(255,255,255,0.04));
  border-radius: var(--lore-radius-sm);
}
.test-result-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--lore-border);
}
.test-result-item:last-child { border-bottom: none; }
.test-result-icon { width: 16px; text-align: center; font-weight: 600; }
.test-ok .test-result-icon { color: #34c759; }
.test-fail .test-result-icon { color: #ff3b30; }
.test-result-action {
  font-weight: 500;
  min-width: 28px;
  color: var(--lore-text);
}
.test-result-name {
  flex: 1;
  color: var(--lore-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.test-result-uid {
  font-family: var(--lore-font-mono, monospace);
  color: var(--lore-text-tertiary, #666);
  font-size: 11px;
}
.test-result-detail {
  color: var(--lore-text-secondary);
  font-size: 11px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
