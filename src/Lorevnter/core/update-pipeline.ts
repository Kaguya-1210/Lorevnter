// ============================================================
// Lorevnter - 更新管线
// 串联全流程: 触发 → 收集 → AI → 写回
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';
import { useContextStore } from './worldbook-context';
import { useRuntimeStore } from '../state';
import { getEntryConstraint } from './constraints';
import * as WorldbookAPI from './worldbook-api';
import { analyzeOnePass, getApiSnapshot, type AnalysisEntry, type AnalysisRequest } from './ai-engine';
import { autoBackupIfNeeded } from './backup-manager';
import { extractContent } from './context-extractor';
import { getUserPersona } from './persona';
import { getCachedEntryNames, clearCacheAfterAnalysis } from './scan-cache';

const logger = createLogger('pipeline');

/** 当前聊天文件名（由 index.ts 在 CHAT_CHANGED 时设置） */
let currentChatId = '';

/** 是否正在执行管线 */
let running = false;

/** 设置当前聊天 ID（由 index.ts 调用） */
export function setCurrentChatId(chatId: string): void {
  currentChatId = chatId;

  // 清理过期计数记录，最多保留 50 条
  const { settings } = useSettingsStore();
  const keys = Object.keys(settings.lore_ai_reply_counts);
  const MAX_RETAINED = 50;
  if (keys.length > MAX_RETAINED) {
    // 保留当前的 + 最近的（按 key 自然序取后 N 个）
    const toRemove = keys.filter(k => k !== chatId).slice(0, keys.length - MAX_RETAINED);
    for (const k of toRemove) {
      delete settings.lore_ai_reply_counts[k];
    }
  }
}

/** 获取当前聊天 ID */
export function getCurrentChatId(): string {
  return currentChatId;
}

/** 获取当前聊天的 AI 回复计数 */
export function getAiReplyCount(): number {
  if (!currentChatId) return 0;
  const { settings } = useSettingsStore();
  return settings.lore_ai_reply_counts[currentChatId] ?? 0;
}

/**
 * AI 回复时调用：增加持久化计数并判断是否应触发自动扫描。
 * 仅在 auto 模式下且满足间隔条件时返回 true。
 */
export function incrementAndCheckAutoScan(): boolean {
  const { settings } = useSettingsStore();
  if (settings.lore_scan_trigger !== 'auto') return false;
  if (running) return false;
  if (!currentChatId) return false;

  const count = (settings.lore_ai_reply_counts[currentChatId] ?? 0) + 1;
  settings.lore_ai_reply_counts[currentChatId] = count;

  // 跳过零层（开场白）：首次 AI 回复不计入触发
  if (settings.lore_skip_greeting && count === 1) return false;

  return count % settings.lore_scan_interval === 0;
}

/** 重置指定聊天的消息计数（不再使用，改为 per-chat 自动管理） */
export function resetMessageCount(): void {
  // 保留接口兼容，不再需要手动 reset
  // 切换聊天时 setCurrentChatId 自动切换到对应计数
}

/**
 * 运行完整的更新管线
 */
export async function runUpdatePipeline(): Promise<void> {
  if (running) {
    toastr.warning('分析正在进行中，请等待完成', 'Lorevnter');
    return;
  }

  const ctx = useContextStore();
  const { settings } = useSettingsStore();

  // ── 前置校验（running=true 之前，避免锁死） ──
  if (ctx.context.mode === 'idle') {
    toastr.warning('无活跃的世界书，请先打开角色卡', 'Lorevnter');
    return;
  }

  const worldbookNames = ctx.getActiveWorldbookNames();
  if (worldbookNames.length === 0) {
    toastr.warning('无活跃的世界书', 'Lorevnter');
    return;
  }

  running = true;
  toastr.info('开始分析剧情变化...', 'Lorevnter');
  logger.info('管线启动');

  try {
    // Step 1: 收集世界书名称
    logger.info(`活跃世界书: ${worldbookNames.join(', ')}`);

    // Step 1.5: 自动备份（AI 分析前快照）
    await autoBackupIfNeeded(worldbookNames);

    // Step 2: 加载所有条目
    const allEntries: WorldbookEntry[] = [];
    const worldbookMap: Record<string, WorldbookEntry[]> = {};
    const analysisEntries: AnalysisEntry[] = [];

    for (const wbName of worldbookNames) {
      try {
        const entries = await WorldbookAPI.fetch(wbName);
        worldbookMap[wbName] = entries;
        allEntries.push(...entries);

        for (const entry of entries) {
          const constraint = getEntryConstraint(entry);
          // 跳过 skip 类型
          if (constraint?.type === 'skip') {
            logger.debug(`跳过条目: ${entry.name} (约束: skip)`);
            continue;
          }
          analysisEntries.push({ entry, constraint });
        }
      } catch (e) {
        logger.error(`加载世界书失败: ${wbName} — ${(e as Error).message}`);
      }
    }

    if (analysisEntries.length === 0) {
      toastr.info('没有需要分析的条目（全部被跳过或无条目）', 'Lorevnter');
      return;
    }

    logger.info(`待分析: ${analysisEntries.length} 条目 (共 ${allEntries.length} 条, ${allEntries.length - analysisEntries.length} 跳过)`);

    // Step 3: 收集聊天上下文
    const chatMessages = getRecentChatMessages(settings.lore_ai_max_context);
    if (chatMessages.length === 0) {
      toastr.warning('聊天记录为空，无法分析', 'Lorevnter');
      return;
    }

    // Step 4: 调用 AI
    const request: AnalysisRequest = {
      chatMessages,
      entries: analysisEntries,
      allEntries,
      worldbookMap,
    };

    const result = await analyzeOnePass(request);

    // Step 5: 应用更新
    let appliedCount = 0;

    if (result.updates.length > 0) {
      for (const update of result.updates) {
        // 找到条目所属的世界书
        const targetWb = findWorldbookForEntry(update.entryName, worldbookMap);
        if (!targetWb) {
          logger.warn(`找不到条目 "${update.entryName}" 所属的世界书，跳过`);
          continue;
        }

        try {
          await updateWorldbookWith(targetWb.worldbookName, (entries) =>
            entries.map((e) =>
              e.name === update.entryName ? { ...e, content: update.newContent } : e,
            ),
          );
          appliedCount++;
          logger.info(`已更新: ${update.entryName} (${update.reason})`);
        } catch (e) {
          logger.error(`写入失败: ${update.entryName} — ${(e as Error).message}`);
        }
      }

      const names = result.updates.map((u) => u.entryName).join(', ');
      toastr.success(`已更新 ${appliedCount} 条: ${names}`, 'Lorevnter');
      logger.info(`管线完成: ${appliedCount}/${result.updates.length} 条已应用`);
    } else {
      logger.info('管线完成: 无需更新');
    }

    // 记录到 AI 调用历史（无论是否有更新都记录）
    recordAiCall(request, result, appliedCount);

    // 分析完成后清理缓存（若设置为 after_analysis）
    clearCacheAfterAnalysis();
  } catch (e) {
    logger.error(`管线失败: ${(e as Error).message}`);
    toastr.error(`更新失败: ${(e as Error).message}`, 'Lorevnter');
  } finally {
    running = false;
  }
}

// ── 辅助函数 ──

/** 获取最近 N 条聊天消息（集成正文提取规则） */
function getRecentChatMessages(maxCount: number): string[] {
  try {
    const { settings } = useSettingsStore();
    const chat = SillyTavern.chat;
    if (!chat || chat.length === 0) return [];

    const includeTag = settings.lore_context_include_tag;
    const excludeTags = settings.lore_context_exclude_tags;

    const recent = chat.slice(-maxCount);
    return recent
      .filter((msg: any) => msg.mes && typeof msg.mes === 'string')
      .map((msg: any) => {
        const role = msg.is_user ? '{{user}}' : '{{char}}';
        // 应用正文提取规则
        const content = (includeTag || excludeTags)
          ? extractContent(msg.mes, includeTag, excludeTags)
          : msg.mes;
        return `${role}: ${content}`;
      })
      .filter(msg => msg.trim().length > 5); // 过滤掉提取后为空的消息
  } catch (e) {
    logger.error(`获取聊天消息失败: ${(e as Error).message}`);
    return [];
  }
}

/** 根据条目名称找到所属世界书 */
function findWorldbookForEntry(
  entryName: string,
  worldbookMap: Record<string, WorldbookEntry[]>,
): { worldbookName: string; entry: WorldbookEntry } | null {
  for (const [wbName, entries] of Object.entries(worldbookMap)) {
    const entry = entries.find((e) => e.name === entryName);
    if (entry) return { worldbookName: wbName, entry };
  }
  return null;
}

/** 记录 AI 调用到 runtime 历史 */
function recordAiCall(
  request: AnalysisRequest,
  result: { updates: { entryName: string; newContent: string; reason: string }[]; rawResponse: string },
  appliedCount: number,
): void {
  try {
    const runtime = useRuntimeStore();
    const { settings } = useSettingsStore();

    runtime.aiCallHistory.push({
      timestamp: Date.now(),
      mode: 'onepass',
      inputEntries: request.entries.length,
      inputMessages: request.chatMessages.length,
      outputUpdates: result.updates.length,
      appliedCount,
      updates: result.updates,
      // 调试模式下采集原始响应和 API 配置快照
      rawResponse: settings.lore_debug_mode ? result.rawResponse : undefined,
      apiDetails: settings.lore_debug_mode ? getApiSnapshot() : undefined,
    });
  } catch {
    // 静默，不影响主流程
  }
}

/**
 * 构建分析请求（不执行分析）。
 * 供调试页提示词预览使用。
 * 返回 null 表示条件不满足（无世界书/无条目/无消息）。
 */
export async function buildAnalysisRequest(): Promise<AnalysisRequest | null> {
  const ctx = useContextStore();
  const { settings } = useSettingsStore();

  if (ctx.context.mode === 'idle') return null;

  const worldbookNames = ctx.getActiveWorldbookNames();
  if (worldbookNames.length === 0) return null;

  const allEntries: WorldbookEntry[] = [];
  const worldbookMap: Record<string, WorldbookEntry[]> = {};
  const analysisEntries: AnalysisEntry[] = [];

  for (const wbName of worldbookNames) {
    try {
      const entries = await WorldbookAPI.fetch(wbName);
      worldbookMap[wbName] = entries;
      allEntries.push(...entries);

      for (const entry of entries) {
        const constraint = getEntryConstraint(entry);
        if (constraint?.type === 'skip') continue;
        analysisEntries.push({ entry, constraint });
      }
    } catch {
      // 静默
    }
  }

  if (analysisEntries.length === 0) return null;

  const chatMessages = getRecentChatMessages(settings.lore_ai_max_context);
  if (chatMessages.length === 0) return null;

  return { chatMessages, entries: analysisEntries, allEntries, worldbookMap };
}
