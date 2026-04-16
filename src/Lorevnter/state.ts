// ============================================================
// Lorevnter - 运行时状态 (Pinia)
// ============================================================

import type { LogEntry } from './logger';
import { getLogBuffer } from './logger';

export const useRuntimeStore = defineStore('lorevnter_runtime', () => {
  // ── 窗口状态 ──
  const windowVisible = ref(false);
  const currentTab = ref<'worldbooks' | 'constraints' | 'presets' | 'settings' | 'logs'>('worldbooks');

  // ── 世界书浏览状态 ──
  /** 当前选中的世界书名（Tab 切换不丢失） */
  const worldbookSelectedName = ref<string | null>(null);

  // ── 世界书数据缓存 ──
  /** key = 世界书名称, value = 条目列表 */
  const worldBookCache = ref<Record<string, WorldbookEntry[]>>({});

  // ── 日志（引用 logger 模块的缓冲区） ──
  /** 响应式日志快照，通过 refreshLogs() 手动刷新 */
  const logEntries = ref<LogEntry[]>([]);

  // ── AI 调用历史 ──
  interface AiCallRecord {
    timestamp: number;
    mode: string;
    inputEntries: number;
    inputMessages: number;
    outputUpdates: number;
    appliedCount: number;
    updates: Array<{ entryName: string; newContent: string; reason: string }>;
  }
  const aiCallHistory = ref<AiCallRecord[]>([]);

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
    worldBookCache,
    logEntries,
    aiCallHistory,
    refreshLogs,
    clearAiHistory,
  };
});
