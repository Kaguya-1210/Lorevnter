// ============================================================
// Lorevnter - WORLDINFO_SCAN_DONE 缓存管理
// 缓存当前激活条目标识（worldbook.uid），持久化，过期清理
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';

const logger = createLogger('scan-cache');

/** 3 天过期阈值（毫秒） */
const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

/** 缓存最大保留聊天数（超出时清理最旧的） */
const MAX_CACHED_CHATS = 20;

// ── 运行时 chatId ──
let currentChatId: string | null = null;

/**
 * 分析后冷却时间戳：在此时间之前 onScanDone 不会写入缓存。
 * 解决"clearCacheAfterAnalysis 刚清完，SCAN_DONE 立刻重新填充"的问题。
 */
let suppressUntil = 0;

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

  // 切换聊天时清理孤儿缓存（保留最多 MAX_CACHED_CHATS 个）
  pruneOldCaches();
}

/**
 * 处理 WORLDINFO_SCAN_DONE 事件。
 * 从 activated.entries Map 中提取条目标识（worldbook.uid），
 * 直接覆盖当前 chatId 的缓存。
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

  // 分析后冷却期内不更新缓存
  if (Date.now() < suppressUntil) {
    logger.debug('SCAN_DONE: 冷却期内，跳过缓存更新');
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

  if (prevCount !== finalArray.length) {
    logger.info(`SCAN_DONE: 缓存已覆盖 (${prevCount} → ${finalArray.length} 条)`);
  }
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

/**
 * 分析完成后清空当前 chatId 缓存（若设置为 after_analysis）。
 * 同时设置 3 秒冷却，防止 SCAN_DONE 立刻重新填充。
 */
export function clearCacheAfterAnalysis(): void {
  if (!currentChatId) return;

  const { settings } = useSettingsStore();
  if (settings.lore_cache_clear_mode !== 'after_analysis') return;

  delete settings.lore_scan_cache[currentChatId];
  delete settings.lore_scan_cache_timestamps[currentChatId];

  // 设置 3 秒冷却：在此期间 onScanDone 不会写入缓存
  suppressUntil = Date.now() + 3000;

  logger.info(`分析后缓存已清空 (chatId: ${currentChatId})，3s 内抑制 SCAN_DONE`);
}

/** 手动清空指定 chatId 的缓存 */
export function clearCacheForChat(chatId: string): void {
  const { settings } = useSettingsStore();
  delete settings.lore_scan_cache[chatId];
  delete settings.lore_scan_cache_timestamps[chatId];
  logger.info(`手动清空缓存: ${chatId}`);
}

/**
 * 检查过期缓存（仅返回手动模式下残留的）。
 * 自动模式下过期缓存已在 pruneOldCaches 中自动清理。
 */
export function getStaleChats(): string[] {
  const { settings } = useSettingsStore();
  // 自动清理模式下不需要提醒（pruneOldCaches 已处理）
  if (settings.lore_cache_clear_mode === 'after_analysis') return [];

  const now = Date.now();
  const stale: string[] = [];

  for (const [chatId, ts] of Object.entries(settings.lore_scan_cache_timestamps)) {
    if (now - ts > STALE_THRESHOLD_MS) {
      if (settings.lore_scan_cache[chatId]?.length) {
        stale.push(chatId);
      }
    }
  }

  return stale;
}

/**
 * 清理孤儿缓存：
 * 1. 清空缓存数组为空的残留记录
 * 2. 自动删除超过 3 天的过期缓存（不再弹窗烦人）
 * 3. 超出上限时淘汰最旧的
 */
function pruneOldCaches(): void {
  const { settings } = useSettingsStore();
  const now = Date.now();
  let cleaned = 0;

  // 1. 清理空缓存数组和残留 timestamps
  for (const chatId of Object.keys(settings.lore_scan_cache)) {
    if (!settings.lore_scan_cache[chatId]?.length) {
      delete settings.lore_scan_cache[chatId];
      delete settings.lore_scan_cache_timestamps[chatId];
      cleaned++;
    }
  }
  for (const chatId of Object.keys(settings.lore_scan_cache_timestamps)) {
    if (!settings.lore_scan_cache[chatId]?.length) {
      delete settings.lore_scan_cache_timestamps[chatId];
      cleaned++;
    }
  }

  // 2. 自动清理超过 3 天的过期缓存（非当前聊天）
  for (const [chatId, ts] of Object.entries(settings.lore_scan_cache_timestamps)) {
    if (chatId === currentChatId) continue;
    if (now - ts > STALE_THRESHOLD_MS) {
      delete settings.lore_scan_cache[chatId];
      delete settings.lore_scan_cache_timestamps[chatId];
      cleaned++;
    }
  }

  // 3. 超出上限时淘汰最旧的
  const chatIds = Object.keys(settings.lore_scan_cache);
  if (chatIds.length > MAX_CACHED_CHATS) {
    const sorted = chatIds
      .map(id => ({ id, ts: settings.lore_scan_cache_timestamps[id] ?? 0 }))
      .sort((a, b) => a.ts - b.ts);

    const toRemove = sorted.slice(0, sorted.length - MAX_CACHED_CHATS);
    for (const { id } of toRemove) {
      if (id === currentChatId) continue;
      delete settings.lore_scan_cache[id];
      delete settings.lore_scan_cache_timestamps[id];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`缓存清理: 清除 ${cleaned} 条孤儿/过期记录`);
  }
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
  // 只统计有实际缓存数据的聊天
  const totalChats = Object.keys(settings.lore_scan_cache).filter(
    id => (settings.lore_scan_cache[id]?.length ?? 0) > 0,
  ).length;

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
