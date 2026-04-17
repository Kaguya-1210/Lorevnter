// ============================================================
// Lorevnter - WORLDINFO_SCAN_DONE 缓存管理
// 累积激活条目名，去重，持久化，过期提醒
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';

const logger = createLogger('scan-cache');

/** 3 天过期阈值（毫秒） */
const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

// ── 运行时 chatId ──
let currentChatId: string | null = null;

/** 设置当前聊天 ID（从 index.ts 调用） */
export function setCacheChatId(chatId: string): void {
  currentChatId = chatId;
}

/**
 * 处理 WORLDINFO_SCAN_DONE 事件。
 * 从 activated.entries Map 中提取条目名（comment 字段），
 * 去重后合并到当前 chatId 的缓存中。
 */
export function onScanDone(eventData: {
  activated: {
    entries: Map<string, SillyTavern.FlattenedWorldInfoEntry>;
  };
}): void {
  if (!currentChatId) {
    logger.debug('SCAN_DONE: 无 chatId，跳过缓存');
    return;
  }

  const { settings } = useSettingsStore();

  // 从 Map 中提取条目名
  const entryNames: string[] = [];
  eventData.activated.entries.forEach((entry) => {
    const name = entry.comment?.trim();
    if (name) entryNames.push(name);
  });

  if (entryNames.length === 0) {
    logger.debug('SCAN_DONE: 无激活条目');
    return;
  }

  // 获取或创建当前 chatId 的缓存
  const existing = settings.lore_scan_cache[currentChatId] ?? [];
  const existingSet = new Set(existing);

  let addedCount = 0;
  for (const name of entryNames) {
    if (!existingSet.has(name)) {
      existingSet.add(name);
      addedCount++;
    }
  }

  // 手动模式下检查上限（FIFO 淘汰）
  let finalArray = [...existingSet];
  if (settings.lore_cache_clear_mode === 'manual' && settings.lore_cache_max_size > 0) {
    if (finalArray.length > settings.lore_cache_max_size) {
      const overflow = finalArray.length - settings.lore_cache_max_size;
      finalArray = finalArray.slice(overflow); // 淘汰最早加入的
      logger.debug(`缓存上限 ${settings.lore_cache_max_size}，淘汰 ${overflow} 条`);
    }
  }

  settings.lore_scan_cache[currentChatId] = finalArray;
  settings.lore_scan_cache_timestamps[currentChatId] = Date.now();

  logger.info(`SCAN_DONE: 缓存更新 +${addedCount}，当前 ${finalArray.length} 条 (chatId: ${currentChatId})`);
}

/** 获取当前 chatId 的缓存条目名列表 */
export function getCachedEntryNames(): string[] {
  if (!currentChatId) return [];

  const { settings } = useSettingsStore();
  return settings.lore_scan_cache[currentChatId] ?? [];
}

/** 分析完成后清空当前 chatId 缓存（若设置为 after_analysis） */
export function clearCacheAfterAnalysis(): void {
  if (!currentChatId) return;

  const { settings } = useSettingsStore();
  if (settings.lore_cache_clear_mode !== 'after_analysis') return;

  delete settings.lore_scan_cache[currentChatId];
  delete settings.lore_scan_cache_timestamps[currentChatId];
  logger.info(`分析后缓存已清空 (chatId: ${currentChatId})`);
}

/** 手动清空指定 chatId 的缓存 */
export function clearCacheForChat(chatId: string): void {
  const { settings } = useSettingsStore();
  delete settings.lore_scan_cache[chatId];
  delete settings.lore_scan_cache_timestamps[chatId];
  logger.info(`手动清空缓存: ${chatId}`);
}

/**
 * 检查过期缓存。
 * 返回超过 3 天未更新的 chatId 列表。
 * 调用方（index.ts CHAT_CHANGED 回调）负责弹窗提示。
 */
export function getStaleChats(): string[] {
  const { settings } = useSettingsStore();
  const now = Date.now();
  const stale: string[] = [];

  for (const [chatId, ts] of Object.entries(settings.lore_scan_cache_timestamps)) {
    if (now - ts > STALE_THRESHOLD_MS) {
      // 确认该 chatId 确实有缓存数据
      if (settings.lore_scan_cache[chatId]?.length) {
        stale.push(chatId);
      }
    }
  }

  return stale;
}

/** 获取当前 chatId */
export function getCurrentCacheChatId(): string | null {
  return currentChatId;
}

/** 获取缓存统计（调试 Tab 用） */
export function getCacheStats(): {
  chatId: string | null;
  currentCount: number;
  totalChats: number;
} {
  const { settings } = useSettingsStore();
  const currentCount = currentChatId
    ? (settings.lore_scan_cache[currentChatId]?.length ?? 0)
    : 0;
  const totalChats = Object.keys(settings.lore_scan_cache).length;

  return { chatId: currentChatId, currentCount, totalChats };
}
