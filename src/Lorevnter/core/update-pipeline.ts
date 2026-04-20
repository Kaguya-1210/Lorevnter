// ============================================================
// Lorevnter - 更新管线
// 串联全流程: 触发 → 收集 → AI → 写回
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';
import { useContextStore } from './worldbook-context';
import { useRuntimeStore } from '../state';
import { getEntryConstraint, hasSkipConstraint } from './constraints';
import * as WorldbookAPI from './worldbook-api';
import { analyzeOnePass, getApiSnapshot, type AnalysisEntry, type AnalysisRequest } from './ai-engine';
import { autoBackupIfNeeded } from './backup-manager';
import { extractContent } from './context-extractor';
import { getUserPersona, setUserPersona } from './persona';
import { getCachedEntryKeys, clearCacheAfterAnalysis } from './scan-cache';
import { openReviewEditor } from './review-editor';
import type { ReviewUpdate } from './review-types';

const logger = createLogger('pipeline');

/** 管线执行结果 */
export type PipelineResult = 'applied' | 'pending_review' | 'no_change' | 'failed' | 'skipped';

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
 * 判断已有条目的变更类型：追加 or 修改
 * - 原文为空 → append
 * - 新内容以原文为严格前缀 → append
 * - 否则 → modify
 */
function classifyAction(originalContent: string, newContent: string): 'append' | 'modify' {
  const normalizedOrig = originalContent.replace(/\r\n/g, '\n').trimEnd();
  const normalizedNew = newContent.replace(/\r\n/g, '\n').trimEnd();
  if (!normalizedOrig.trim()) return 'append';
  if (normalizedNew.length <= normalizedOrig.length) return 'modify';
  if (normalizedNew.startsWith(normalizedOrig)) return 'append';
  return 'modify';
}

type EntryResolution =
  | { status: 'found'; worldbookName: string; entry: WorldbookEntry }
  | { status: 'missing' }
  | { status: 'ambiguous'; matches: Array<{ worldbookName: string; entry: WorldbookEntry }> };

type CollectedAnalysisInputs = {
  chatMessages: string[];
  allEntries: WorldbookEntry[];
  worldbookMap: Record<string, WorldbookEntry[]>;
  analysisEntries: AnalysisEntry[];
};

function normalizeMatchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s"'`.,!?;:()[\]{}<>/\\|@#$%^&*_+=~-]+/g, '')
    .replace(/[，。！？；：、“”‘’（）《》【】·…—]/g, '');
}

function getEntryMatchTerms(entry: WorldbookEntry): string[] {
  const rawTerms: string[] = [];
  const candidateArrays = [
    (entry as { keys?: unknown }).keys,
    (entry as { key?: unknown }).key,
    (entry as { secondary_keys?: unknown }).secondary_keys,
    (entry as { secondaryKeys?: unknown }).secondaryKeys,
  ];

  if (typeof entry.name === 'string') {
    rawTerms.push(entry.name);
  }

  for (const value of candidateArrays) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim().length >= 4) rawTerms.push(item);
      }
    } else if (typeof value === 'string') {
      if (value.trim().length >= 4) rawTerms.push(value);
    }
  }

  return [...new Set(rawTerms.map(term => term.trim()).filter(term => term.length >= 2))];
}

function isEntryMentionedInContext(entry: WorldbookEntry, normalizedContext: string): boolean {
  if (!normalizedContext) return false;

  return getEntryMatchTerms(entry).some((term) => {
    const normalizedTerm = normalizeMatchText(term);
    return normalizedTerm.length >= 2 && normalizedContext.includes(normalizedTerm);
  });
}

function passesEntryFilter(entry: WorldbookEntry, worldbookName: string): boolean {
  const { settings } = useSettingsStore();
  const filterUids = settings.lore_entry_filter_map[worldbookName];
  const filterUidSet = filterUids ? new Set(filterUids) : null;

  if (settings.lore_entry_filter_mode === 'include') {
    return filterUidSet?.has(entry.uid) ?? false;
  }
  if (settings.lore_entry_filter_mode === 'exclude') {
    return !filterUidSet?.has(entry.uid);
  }
  return true;
}

async function collectAnalysisInputs(worldbookNames: string[]): Promise<CollectedAnalysisInputs> {
  const { settings } = useSettingsStore();
  const chatMessages = getRecentChatMessages(settings.lore_ai_max_context);
  const normalizedContext = normalizeMatchText(chatMessages.join('\n'));
  const allEntries: WorldbookEntry[] = [];
  const worldbookMap: Record<string, WorldbookEntry[]> = {};
  const analysisEntries: AnalysisEntry[] = [];

  if (chatMessages.length === 0) {
    return { chatMessages, allEntries, worldbookMap, analysisEntries };
  }

  const cachedEntryKeys = getCachedEntryKeys();
  const hasCachedKeys = cachedEntryKeys.length > 0;
  const cachedKeySet = new Set(cachedEntryKeys);
  const expandedEntries: string[] = [];

  if (hasCachedKeys) {
    logger.info(`使用命中缓存过滤: ${cachedEntryKeys.length} 条命中条目`);
  } else {
    logger.warn('无命中缓存，将分析全部条目（首次运行或缓存已清空）');
  }

  for (const wbName of worldbookNames) {
    try {
      const entries = await WorldbookAPI.fetch(wbName);
      worldbookMap[wbName] = entries;
      allEntries.push(...entries);

      for (const entry of entries) {
        const constraint = getEntryConstraint(entry, wbName);

        if (hasSkipConstraint(entry, wbName)) {
          logger.debug(`跳过条目: ${entry.name} (约束: skip)`);
          continue;
        }

        if (!passesEntryFilter(entry, wbName)) {
          continue;
        }

        const cacheKey = `${wbName}.${entry.uid}`;
        const includedByCache = !hasCachedKeys || cachedKeySet.has(cacheKey);
        const includedByContextMention = hasCachedKeys
          && !includedByCache
          && isEntryMentionedInContext(entry, normalizedContext);

        if (!includedByCache && !includedByContextMention) {
          continue;
        }

        if (includedByContextMention) {
          expandedEntries.push(`${wbName}/${entry.name || `uid_${entry.uid}`}`);
        }

        analysisEntries.push({ entry, constraint, worldbookName: wbName });
      }
    } catch (e) {
      logger.error(`加载世界书失败: ${wbName} - ${(e as Error).message}`);
    }
  }

  if (expandedEntries.length > 0) {
    logger.info(`基于正文点名兜底扩容 ${expandedEntries.length} 条: ${expandedEntries.slice(0, 10).join(', ')}`);
  }

  return { chatMessages, allEntries, worldbookMap, analysisEntries };
}

/**
 * 运行完整的更新管线
 * @returns 管线执行结果态
 */
export async function runUpdatePipeline(): Promise<PipelineResult> {
  if (running) {
    toastr.warning('分析正在进行中，请等待完成', 'Lorevnter');
    return 'skipped';
  }

  const ctx = useContextStore();
  const { settings } = useSettingsStore();

  // ── 总开关检查 ──
  if (!settings.lore_plugin_enabled) {
    logger.info('插件已禁用，跳过管线');
    return 'skipped';
  }

  // ── 刷新上下文（确保世界书列表是最新的） ──
  try {
    ctx.refresh();
  } catch (e) {
    logger.error('管线启动前刷新上下文失败: ' + (e as Error).message);
  }

  // ── 前置校验（running=true 之前，避免锁死） ──
  if (ctx.context.mode === 'idle') {
    toastr.warning('无活跃的世界书，请先打开角色卡', 'Lorevnter');
    return 'failed';
  }

  const worldbookNames = ctx.getActiveWorldbookNames();
  if (worldbookNames.length === 0) {
    toastr.warning('无活跃的世界书', 'Lorevnter');
    return 'failed';
  }

  running = true;
  const runtime = useRuntimeStore();
  runtime.pipelineStatus = 'running';
  runtime.pipelineLastMessage = '';
  toastr.info('开始分析剧情变化...', 'Lorevnter');
  logger.info('管线启动');

  // 超时保护：120s 后自动恢复，防止管线卡死
  const pipelineTimeout = setTimeout(() => {
    if (running) {
      running = false;
      runtime.pipelineStatus = 'failed';
      runtime.pipelineLastMessage = '管线超时（120s），已自动恢复';
      logger.error('管线超时，强制重置');
      toastr.error('AI 分析超时，已自动恢复', 'Lorevnter');
    }
  }, 120_000);

  try {
    // Step 1: 收集世界书名称
    logger.info(`活跃世界书: ${worldbookNames.join(', ')}`);

    // Step 1.5: 自动备份（AI 分析前快照）
    await autoBackupIfNeeded(worldbookNames);

    // Step 2: 收集上下文 + 分析候选条目
    const { chatMessages, allEntries, worldbookMap, analysisEntries } = await collectAnalysisInputs(worldbookNames);

    if (analysisEntries.length === 0) {
      toastr.info('没有命中的条目需要分析', 'Lorevnter');
      runtime.pipelineStatus = 'idle';
      runtime.pipelineLastMessage = '没有命中的条目';
      return 'no_change';
    }

    logger.info(`待分析: ${analysisEntries.length} 条目 (共 ${allEntries.length} 条, ${allEntries.length - analysisEntries.length} 跳过)`);

    // Step 3: 校验聊天上下文
    if (chatMessages.length === 0) {
      toastr.warning('聊天记录为空，无法分析', 'Lorevnter');
      runtime.pipelineStatus = 'failed';
      runtime.pipelineLastMessage = '聊天记录为空';
      return 'failed';
    }

    // Step 3.5: 用户 persona 注入（已迁移至 ai-engine 宏系统 {{lore_user_persona}}）

    // Step 4: 调用 AI
    const request: AnalysisRequest = {
      chatMessages,
      entries: analysisEntries,
      allEntries,
      worldbookMap,
    };

    const result = await analyzeOnePass(request);

    // Step 5: 应用更新（根据审核开关分流）
    if (result.updates.length > 0) {
      // 确定新增条目的目标世界书
      const defaultCreateWb = settings.lore_new_entry_default_worldbook || worldbookNames[0] || '';

      // 审核分流：调试模式强制审核，非调试模式看 review_enabled
      const shouldReview = settings.lore_debug_mode || settings.lore_review_enabled;

      if (shouldReview) {
        // 审核模式：构造 ReviewUpdate 并打开审核弹窗
        const reviewUpdates: ReviewUpdate[] = result.updates.flatMap((u) => {
          // 人设更新特殊处理
          if (u.entryName === '__persona__') {
            const currentPersona = getUserPersona() ?? '';
            return [{
              entryName: '用户人设',
              originalContent: currentPersona,
              newContent: u.newContent,
              reason: u.reason,
              think: u.think,
              approved: null,
              action: classifyAction(currentPersona, u.newContent),
              uid: -1,
              worldbook: '__persona__',
            }];
          }
          const resolution = resolveWorldbookEntry(u.entryName, worldbookMap, u.entryUid);
          if (resolution.status === 'ambiguous') {
            logger.warn(`跳过不安全写回: "${u.entryName}" 存在 ${resolution.matches.length} 个同名候选且缺少可用 uid`);
            return [];
          }
          const originalContent = resolution.status === 'found' ? resolution.entry.content : '';
          return [{
            entryName: u.entryName,
            originalContent,
            newContent: u.newContent,
            reason: u.reason,
            think: u.think,
            approved: null,
            action: resolution.status === 'found' ? classifyAction(originalContent, u.newContent) : 'create' as const,
            uid: resolution.status === 'found' ? resolution.entry.uid : -1,
            worldbook: resolution.status === 'found' ? resolution.worldbookName : defaultCreateWb,
          }];
        });

        if (reviewUpdates.length === 0) {
          toastr.warning('AI 返回了无法安全定位的更新，已跳过写回', 'Lorevnter');
          runtime.pipelineStatus = 'failed';
          runtime.pipelineLastMessage = 'AI 返回的更新无法安全定位';
          return 'failed';
        }

        // 记录 AI 调用历史（审核前）
        recordAiCall(request, result, 0);

        // 打开审核弹窗，用户确认后执行写入
        openReviewEditor(reviewUpdates, async (approved) => {
          let appliedCount = 0;
          for (const update of approved) {
            try {
              if (update.worldbook === '__persona__') {
                // 人设更新
                const ok = setUserPersona(update.newContent);
                if (ok) {
                  appliedCount++;
                  logger.info(`已更新用户人设`);
                } else {
                  logger.error('人设写入失败');
                }
              } else if (update.action === 'create') {
                // 新增条目
                const targetWb = update.worldbook || defaultCreateWb;
                await WorldbookAPI.createEntries(targetWb, [{
                  name: update.entryName,
                  content: update.newContent,
                  strategy: {
                    type: 'selective',
                    keys: [update.entryName],
                  },
                  position: {
                    order: settings.lore_new_entry_start_order || 100,
                  },
                  recursion: { prevent_outgoing: true },
                }]);
                appliedCount++;
                logger.info(`已新增: ${update.entryName} → ${targetWb}`);
              } else {
                // 更新已有条目（通过 uid 精确定位）
                await WorldbookAPI.updateEntry(update.worldbook, update.uid, {
                  content: update.newContent,
                });
                appliedCount++;
                logger.info(`已更新: ${update.entryName} (uid: ${update.uid})`);
              }
            } catch (e) {
              logger.error(`写入失败: ${update.entryName} — ${(e as Error).message}`);
            }
          }
          toastr.success(`审核完成，已写入 ${appliedCount} 条`, 'Lorevnter');
        });

        logger.info(`管线完成: ${result.updates.length} 条待审核`);
        runtime.pipelineStatus = 'pending_review';
        runtime.pipelineLastMessage = `${result.updates.length} 条待审核`;
        return 'pending_review';
      } else {
        // 直接写入模式
        let appliedCount = 0;
        for (const update of result.updates) {
          try {
            // 人设更新特殊处理
            if (update.entryName === '__persona__') {
              const ok = setUserPersona(update.newContent);
              if (ok) {
                appliedCount++;
                logger.info('已更新用户人设');
              } else {
                logger.error('人设写入失败');
              }
              continue;
            }
            const resolution = resolveWorldbookEntry(update.entryName, worldbookMap, update.entryUid);
            if (resolution.status === 'ambiguous') {
              logger.warn(`跳过不安全写回: "${update.entryName}" 存在多个同名条目`);
              continue;
            }
            if (resolution.status === 'missing') {
              // 新增条目
              const createWb = defaultCreateWb;
              if (!createWb) {
                logger.warn(`找不到条目 "${update.entryName}" 且无默认世界书，跳过`);
                continue;
              }
              await WorldbookAPI.createEntries(createWb, [{
                name: update.entryName,
                content: update.newContent,
                strategy: {
                  type: 'selective',
                  keys: [update.entryName],
                },
                position: {
                  order: settings.lore_new_entry_start_order || 100,
                },
                recursion: { prevent_outgoing: true },
              }]);
              appliedCount++;
              logger.info(`已新增: ${update.entryName} → ${createWb}`);
            } else {
              // 更新已有条目（通过 uid 精确定位）
              await WorldbookAPI.updateEntry(resolution.worldbookName, resolution.entry.uid, {
                content: update.newContent,
              });
              appliedCount++;
              logger.info(`已更新: ${update.entryName} uid:${resolution.entry.uid} (${update.reason})`);
            }
          } catch (e) {
            logger.error(`写入失败: ${update.entryName} — ${(e as Error).message}`);
          }
        }
        const names = result.updates.map((u) => u.entryName).join(', ');
        toastr.success(`已写入 ${appliedCount} 条: ${names}`, 'Lorevnter');
        logger.info(`管线完成: ${appliedCount}/${result.updates.length} 条已应用`);
        recordAiCall(request, result, appliedCount);
        runtime.pipelineStatus = 'done';
        runtime.pipelineLastMessage = `已写入 ${appliedCount} 条`;
        return 'applied';
      }
    } else {
      logger.info('管线完成: 无需更新');
      recordAiCall(request, result, 0);
      runtime.pipelineStatus = 'idle';
      runtime.pipelineLastMessage = '无需更新';
      return 'no_change';
    }
  } catch (e) {
    logger.error(`管线失败: ${(e as Error).message}`);
    toastr.error(`更新失败: ${(e as Error).message}`, 'Lorevnter');
    runtime.pipelineStatus = 'failed';
    runtime.pipelineLastMessage = (e as Error).message;
    return 'failed';
  } finally {
    clearTimeout(pipelineTimeout);
    clearCacheAfterAnalysis();
    running = false;
  }
}

// ── 辅助函数 ──

/** 获取最近 N 条聊天消息（集成正文提取规则，仅取 AI/char 消息） */
function getRecentChatMessages(maxCount: number): string[] {
  try {
    const { settings } = useSettingsStore();

    // 正确用法：getChatMessages 的参数是楼层号/范围，不是"最近N条"
    const lastId = getLastMessageId();
    if (lastId < 0) return [];

    // 多取一些楼层，因为会过滤掉 user 消息
    const fetchCount = maxCount * 2;
    const startId = Math.max(0, lastId - fetchCount + 1);
    const range = `${startId}-${lastId}`;
    const msgs = getChatMessages(range);
    if (!msgs || msgs.length === 0) return [];

    const includeTag = settings.lore_context_include_tag;
    const excludeTags = settings.lore_context_exclude_tags;

    return msgs
      // 只取 AI/char 消息，不包含用户输入
      .filter((msg) => msg.role !== 'user' && msg.message && typeof msg.message === 'string')
      .map((msg) => {
        const content = (includeTag || excludeTags)
          ? extractContent(msg.message, includeTag, excludeTags)
          : msg.message.trim();
        return content.trim();
      })
      .filter(content => content.length > 0)
      .slice(-maxCount)
      .map(content => `{{char}}: ${content}`);
  } catch (e) {
    logger.error(`获取聊天消息失败: ${(e as Error).message}`);
    return [];
  }
}

/** 根据条目名称找到所属世界书 */
function resolveWorldbookEntry(
  entryName: string,
  worldbookMap: Record<string, WorldbookEntry[]>,
  uid?: number,
): EntryResolution {
  // 优先按 uid 精确匹配
  if (uid != null && uid >= 0) {
    for (const [wbName, entries] of Object.entries(worldbookMap)) {
      const entry = entries.find((e) => e.uid === uid);
      if (entry) return { status: 'found', worldbookName: wbName, entry };
    }
  }

  // 回退：仅在 name 全局唯一时才允许使用
  const matches: Array<{ worldbookName: string; entry: WorldbookEntry }> = [];
  for (const [wbName, entries] of Object.entries(worldbookMap)) {
    const entry = entries.find((e) => e.name === entryName);
    if (entry) matches.push({ worldbookName: wbName, entry });
  }

  if (matches.length === 1) return { status: 'found', ...matches[0] };
  if (matches.length > 1) return { status: 'ambiguous', matches };
  return { status: 'missing' };
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

  if (ctx.context.mode === 'idle') return null;

  const worldbookNames = ctx.getActiveWorldbookNames();
  if (worldbookNames.length === 0) return null;

  const { chatMessages, allEntries, worldbookMap, analysisEntries } = await collectAnalysisInputs(worldbookNames);

  if (analysisEntries.length === 0) return null;

  if (chatMessages.length === 0) return null;

  return { chatMessages, entries: analysisEntries, allEntries, worldbookMap };
}
