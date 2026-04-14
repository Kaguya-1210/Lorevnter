// ============================================================
// Lorevnter - 运行时状态 (Pinia)
// ============================================================

import type { LogEntry } from './logger';
import { getLogBuffer } from './logger';

export const useRuntimeStore = defineStore('lorevnter_runtime', () => {
  // ── 窗口状态 ──
  const windowVisible = ref(false);
  const currentTab = ref<'worldbooks' | 'presets' | 'settings' | 'logs'>('worldbooks');

  // ── 世界书数据缓存 ──
  /** key = 世界书名称, value = 条目列表 */
  const worldBookCache = ref<Record<string, WorldbookEntry[]>>({});

  // ── 日志（引用 logger 模块的缓冲区） ──
  /** 响应式日志快照，通过 refreshLogs() 手动刷新 */
  const logEntries = ref<LogEntry[]>([]);

  /** 从 logger 缓冲区刷新日志到响应式状态 */
  function refreshLogs() {
    logEntries.value = [...getLogBuffer()];
  }

  return {
    windowVisible,
    currentTab,
    worldBookCache,
    logEntries,
    refreshLogs,
  };
});
