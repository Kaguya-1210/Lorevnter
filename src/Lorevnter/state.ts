// ============================================================
// Lorevnter - 运行时状态 (Pinia)
// ============================================================

import type { LogEntry } from './logger';
import { getLogBuffer } from './logger';

// ── AI 调用历史类型 ──
export interface AiCallRecord {
  timestamp: number;
  mode: string;
  inputEntries: number;
  inputMessages: number;
  outputUpdates: number;
  appliedCount: number;
  updates: Array<{ entryName: string; newContent: string; reason: string }>;
  /** AI 原始响应文本（调试用） */
  rawResponse?: string;
  /** 调试模式下采集的 API 配置快照 */
  apiDetails?: {
    source: 'tavern' | 'custom';
    apiUrl: string;
    model: string;
    temperature: number | string;
    topP: number | string;
    maxTokens: number | string;
    frequencyPenalty: number | string;
    presencePenalty: number | string;
  };
}

export type TabName = 'worldbooks' | 'constraints' | 'ai' | 'presets' | 'settings' | 'logs';

/** 管线状态 */
export type PipelineStatus = 'disabled' | 'idle' | 'running' | 'pending_review' | 'done' | 'failed';

export const useRuntimeStore = defineStore('lorevnter_runtime', () => {
  // ── 窗口状态 ──
  const windowVisible = ref(false);
  const currentTab = ref<TabName>('worldbooks');

  // ── 世界书浏览状态 ──
  /** 当前选中的世界书名（Tab 切换不丢失） */
  const worldbookSelectedName = ref<string | null>(null);

  // ── 日志（引用 logger 模块的缓冲区） ──
  /** 响应式日志快照，通过 refreshLogs() 手动刷新 */
  const logEntries = ref<LogEntry[]>([]);

  // ── AI 调用历史 ──
  const aiCallHistory = ref<AiCallRecord[]>([]);

  // ── 管线状态 ──
  const pipelineStatus = ref<PipelineStatus>('idle');
  /** 最近一次管线结果摘要 */
  const pipelineLastMessage = ref('');
  /** AI 流式返回实时文本 */
  const streamingText = ref('');
  /** 管线开始时间戳 */
  const pipelineStartTime = ref(0);

  /** 从 logger 缓冲区刷新日志到响应式状态 */
  function refreshLogs() {
    logEntries.value = [...getLogBuffer()];
  }

  /** 清空 AI 调用历史 */
  function clearAiHistory() {
    aiCallHistory.value = [];
  }

  return {
    windowVisible,
    currentTab,
    worldbookSelectedName,
    logEntries,
    aiCallHistory,
    pipelineStatus,
    pipelineLastMessage,
    streamingText,
    pipelineStartTime,
    refreshLogs,
    clearAiHistory,
  };
});
