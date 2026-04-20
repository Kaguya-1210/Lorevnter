// ============================================================
// Lorevnter - WORLDINFO_SCAN_DONE 缓存管理
// 累积激活条目标识（worldbook.uid），去重，持久化，过期提醒
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';

const logger = createLogger('scan-cache');

/** 3 天过期阈值（毫秒） */
const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

// ── 运行时 chatId ──
let currentChatId: string | null = null;

const CACHE_KEY_PATTERN = /.+\.\d+$/;

function toCacheKey(worldbook: string, uid: number): string {
  return `${worldbook}.${uid}`;
}

function getCurrentChatCache(settings: ReturnType<typeof useSettingsStore>['settings']): string[] {
  if (!currentChatId) return [];

  const raw = settings.lore_scan_cache[currentChatId] ?? [];
  const normalized = raw.filter((item) => CACHE_KEY_PATTERN.test(item));

  if (normalized.length !== raw.length) {
    settings.lore_scan_cache[currentChatId] = normalized;
    logger.warn(`检测到旧版按名称缓存，已丢弃 ${raw.length - normalized.length} 条遗留缓存`);
  }

  return normalized;
}

function formatCacheLabel(cacheKey: string): string {
  const lastDot = cacheKey.lastIndexOf('.');
  if (lastDot <= 0) return cacheKey;
  const worldbook = cacheKey.slice(0, lastDot);
  const uid = cacheKey.slice(lastDot + 1);
  return `${worldbook} · uid:${uid}`;
}

/** 设置当前聊天 ID（从 index.ts 调用） */
export function setCacheChatId(chatId: string): void {
  currentChatId = chatId;
}

/**
 * 处理 WORLDINFO_SCAN_DONE 事件。
 * 从 activated.entries Map 中提取条目标识（worldbook.uid），
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

  // 从 Map 中提取条目标识。Map key 形如 worldbook.uid。
  const entryKeys: string[] = [];
  eventData.activated.entries.forEach((entry, key) => {
    if (CACHE_KEY_PATTERN.test(key)) {
      entryKeys.push(key);
      return;
    }
    const world = (entry as { world?: string }).world;
    if (world && typeof entry.uid === 'number') {
      entryKeys.push(toCacheKey(world, entry.uid));
    }
  });

  if (entryKeys.length === 0) {
    logger.debug('SCAN_DONE: 无激活条目');
    return;
  }

  // 直接用最新的激活列表覆盖（SCAN_DONE 每次返回的是当前全量激活条目，无需累积）
  const dedupedKeys = [...new Set(entryKeys)];

  // 手动模式下检查上限（FIFO 淘汰）
  let finalArray = dedupedKeys;
  if (settings.lore_cache_clear_mode === 'manual' && settings.lore_cache_max_size > 0) {
    if (finalArray.length > settings.lore_cache_max_size) {
      const overflow = finalArray.length - settings.lore_cache_max_size;
      finalArray = finalArray.slice(overflow);
      logger.debug(`缓存上限 ${settings.lore_cache_max_size}，淘汰 ${overflow} 条`);
    }
  }

  const prevCount = (settings.lore_scan_cache[currentChatId] ?? []).length;
  settings.lore_scan_cache[currentChatId] = finalArray;
  settings.lore_scan_cache_timestamps[currentChatId] = Date.now();

  logger.info(`SCAN_DONE: 缓存已覆盖 (${prevCount} → ${finalArray.length} 条, chatId: ${currentChatId})`);
}

/** 获取当前 chatId 的缓存条目标识列表（worldbook.uid） */
export function getCachedEntryKeys(): string[] {
  if (!currentChatId) return [];

  const { settings } = useSettingsStore();
  return getCurrentChatCache(settings);
}

/** 获取当前 chatId 的缓存显示标签列表（调试用） */
export function getCachedEntryLabels(): string[] {
  return getCachedEntryKeys().map(formatCacheLabel);
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
    ? getCurrentChatCache(settings).length
    : 0;
  const totalChats = Object.keys(settings.lore_scan_cache).length;

  return { chatId: currentChatId, currentCount, totalChats };
}

/** 获取所有有缓存的 chatId 列表 */
export function getCachedChatIds(): string[] {
  const { settings } = useSettingsStore();
  return Object.keys(settings.lore_scan_cache).filter(
    id => (settings.lore_scan_cache[id]?.length ?? 0) > 0,
  );
}

/** 清空所有聊天的缓存 */
export function clearAllCaches(): void {
  const { settings } = useSettingsStore();
  const count = Object.keys(settings.lore_scan_cache).length;
  settings.lore_scan_cache = {};
  settings.lore_scan_cache_timestamps = {};
  logger.info(`已清空全部缓存: ${count} 个聊天`);
}
