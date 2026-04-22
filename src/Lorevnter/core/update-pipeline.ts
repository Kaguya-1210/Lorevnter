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
import { analyzeOnePass, getApiSnapshot, type AnalysisEntry, type AnalysisRequest, type PatchOp, type UpdateInstruction } from './ai-engine';
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


// ── 通知辅助 ──

/**
 * 智能通知：后台模式下走日志，前台模式下弹 toastr。
 */
function notify(message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
  const { settings } = useSettingsStore();
  if (settings.lore_background_mode) {
    logger.info(`[静默] ${message}`);
    return;
  }
  switch (level) {
    case 'success': toastr.success(message, 'Lorevnter'); break;
    case 'warning': toastr.warning(message, 'Lorevnter'); break;
    case 'error':   toastr.error(message, 'Lorevnter');   break;
    default:        toastr.info(message, 'Lorevnter');    break;
  }
}

// ── 重试包装 ──

/**
 * 带自动重试的 AI 分析调用。
 * 指数退避（2s/4s/6s...），每次失败弹进度提示。
 */
async function analyzeWithRetry(request: AnalysisRequest): Promise<ReturnType<typeof analyzeOnePass>> {
  const { settings } = useSettingsStore();
  const maxRetries = settings.lore_retry_count;

  // 无重试配置 → 直接调用
  if (maxRetries <= 0) {
    return await analyzeOnePass(request);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = attempt * 2000; // 指数退避: 2s, 4s, 6s...
        notify(`重试中 (${attempt}/${maxRetries})，${delay / 1000}s 后重试...`, 'warning');
        await new Promise(r => setTimeout(r, delay));
      }
      return await analyzeOnePass(request);
    } catch (e) {
      lastError = e as Error;
      logger.warn(`AI 分析第 ${attempt + 1} 次失败: ${lastError.message}`);
      if (attempt < maxRetries) {
        // 非最后一次 → 还会重试，弹进度
        toastr.warning(`分析失败 (${attempt + 1}/${maxRetries + 1})，准备重试...`, 'Lorevnter');
      }
    }
  }

  // 全部重试失败
  toastr.error(`分析失败，已重试 ${maxRetries} 次: ${lastError!.message}`, 'Lorevnter');
  throw lastError!;
}

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

// ── [已废弃] 旧版正文点名兜底匹配函数（normalizeMatchText / getEntryMatchTerms / isEntryMentionedInContext） ──
// 废弃原因：依赖非标准字段猜测关键词+依赖扫描缓存，已被 isEntryMatchedByContext 取代。

// ── 主动关键词匹配（替代扫描缓存） ──

/**
 * 检查条目是否被正文命中（主动匹配）。
 * 纯正文关键词匹配——只要条目名或关键词出现在正文中就算命中。
 */
function isEntryMatchedByContext(entry: WorldbookEntry, contextLower: string): boolean {
  const matchTerms: string[] = [];

  if (entry.name && entry.name.trim().length >= 1) {
    matchTerms.push(entry.name.trim().toLowerCase());
  }

  if (entry.strategy?.keys) {
    for (const key of entry.strategy.keys) {
      if (key instanceof RegExp) {
        if (key.test(contextLower)) return true;
      } else {
        const k = String(key).toLowerCase().trim();
        if (k.length >= 1) matchTerms.push(k);
      }
    }
  }

  if (matchTerms.length === 0) return false;

  return matchTerms.some(term => contextLower.includes(term));
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
  const allEntries: WorldbookEntry[] = [];
  const worldbookMap: Record<string, WorldbookEntry[]> = {};
  const analysisEntries: AnalysisEntry[] = [];

  if (chatMessages.length === 0) {
    return { chatMessages, allEntries, worldbookMap, analysisEntries };
  }

  // 主动匹配：直接用正文关键词匹配条目，不依赖扫描缓存
  const contextLower = chatMessages.join('\n').toLowerCase();

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

        if (!isEntryMatchedByContext(entry, contextLower)) {
          continue;
        }

        analysisEntries.push({ entry, constraint, worldbookName: wbName });
      }
    } catch (e) {
      logger.error(`加载世界书失败: ${wbName} - ${(e as Error).message}`);
    }
  }

  logger.info(`主动匹配命中: ${analysisEntries.length} 条 (共 ${allEntries.length} 条)`);
  return { chatMessages, allEntries, worldbookMap, analysisEntries };
}

// ── Patch 合并引擎 ──

/**
 * 将 patches 应用到原文上，生成完整新内容。
 * - find/replace: 在原文中精确查找 → 替换
 * - append: 追加到末尾
 */
function applyPatches(original: string, patches: PatchOp[]): { result: string; failedCount: number } {
  let result = original;
  let failedCount = 0;

  for (const patch of patches) {
    if ('find' in patch) {
      if (result.includes(patch.find)) {
        result = result.replace(patch.find, patch.replace);
      } else {
        // 归一化空白后重试
        const normResult = result.replace(/\s+/g, ' ');
        const normFind = patch.find.replace(/\s+/g, ' ');
        if (normResult.includes(normFind)) {
          // 找到归一化匹配位置，在原文中定位并替换
          const idx = normResult.indexOf(normFind);
          // 逐字符映射回原文位置（简单策略：按比例估算）
          result = result.substring(0, idx) + patch.replace + result.substring(idx + patch.find.length);
        } else {
          logger.warn(`[patch] find 匹配失败，跳过: "${patch.find.substring(0, 50)}..."`);
          failedCount++;
        }
      }
    } else {
      // append 模式
      result = result.trimEnd() + '\n' + patch.content;
    }
  }

  return { result, failedCount };
}

/**
 * 根据 UpdateInstruction 解析出最终的 newContent。
 * - type=create → 直接用 content
 * - type=update + patches → applyPatches(原文, patches)
 * - type=update + content（旧格式兼容）→ 直接用 content
 */
function resolveNewContent(
  update: UpdateInstruction,
  originalContent: string,
): string {
  if (update.type === 'create') {
    return (update.content ?? '').trim();
  }

  if (update.patches && update.patches.length > 0) {
    const { result, failedCount } = applyPatches(originalContent, update.patches);
    if (failedCount > 0) {
      logger.warn(`条目 "${update.entryName}" 有 ${failedCount} 个 patch 匹配失败`);
    }
    return result;
  }

  // 旧格式兼容：直接用 content 当 newContent
  if (update.content) {
    return update.content.trim();
  }

  return originalContent;
}

/**
 * 运行完整的更新管线
 * @returns 管线执行结果态
 */
export async function runUpdatePipeline(isManual = false): Promise<PipelineResult> {
  if (running) {
    toastr.warning('分析正在进行中，请等待完成', 'Lorevnter');
    return 'skipped';
  }

  const ctx = useContextStore();
  const { settings } = useSettingsStore();

  // ── 手动触发时重置自动计数 ──
  if (isManual && currentChatId) {
    settings.lore_ai_reply_counts[currentChatId] = 0;
    logger.info('手动触发，已重置自动触发计数');
  }

  // ── 总开关检查 ──
  if (!settings.lore_plugin_enabled) {
    logger.info('插件已禁用，跳过管线');
    toastr.warning('插件已禁用', 'Lorevnter');
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
  runtime.pipelineStartTime = Date.now();
  logger.info('管线启动');

  // 超时保护：180s 后自动恢复（给重试留余量）
  const pipelineTimeout = setTimeout(() => {
    if (running) {
      running = false;
      runtime.pipelineStatus = 'failed';
      runtime.pipelineLastMessage = '管线超时（180s），已自动恢复';
      logger.error('管线超时，强制重置');
      toastr.error('AI 分析超时，已自动恢复', 'Lorevnter');
    }
  }, 180_000);

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

    // Step 3.5: 最小正文字数检查
    if (settings.lore_min_content_length > 0) {
      // 直接取最新一条 AI 原始消息检查字数
      // 注意：chatMessages 已经经过 extractContent 处理，不能再重复提取
      try {
        const lastId = getLastMessageId();
        const rawMsgs = lastId >= 0 ? getChatMessages(lastId) : null;
        if (rawMsgs && rawMsgs.length > 0 && rawMsgs[0].role !== 'user') {
          const rawText = rawMsgs[0].message || '';
          // 如果设了 include 标签，优先检查标签内字数；否则检查原始全文
          const textToCheck = (settings.lore_context_include_tag || settings.lore_context_exclude_tags)
            ? extractContent(rawText, settings.lore_context_include_tag, settings.lore_context_exclude_tags)
            : rawText.trim();
          const charCount = textToCheck.length;
          if (charCount < settings.lore_min_content_length) {
            logger.info(`最新正文仅 ${charCount} 字，低于阈值 ${settings.lore_min_content_length}，跳过分析`);
            notify(`正文字数不足（${charCount}/${settings.lore_min_content_length}），跳过分析`);
            runtime.pipelineStatus = 'idle';
            runtime.pipelineLastMessage = `正文字数不足 (${charCount}/${settings.lore_min_content_length})`;
            return 'skipped';
          }
          logger.debug(`最新正文 ${charCount} 字，达标（阈值 ${settings.lore_min_content_length}）`);
        }
      } catch (e) {
        logger.warn(`最小正文字数检查异常: ${(e as Error).message}，继续分析`);
      }
    }

    // Step 4: 调用 AI（带自动重试）
    const request: AnalysisRequest = {
      chatMessages,
      entries: analysisEntries,
      allEntries,
      worldbookMap,
    };

    const result = await analyzeWithRetry(request);

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
            const newContent = resolveNewContent(u, currentPersona);
            if (currentPersona.trim() === newContent.trim()) return [];
            return [{
              entryName: '用户人设',
              originalContent: currentPersona,
              newContent,
              reason: u.reason,
              think: u.think,
              approved: null,
              action: classifyAction(currentPersona, newContent),
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
          const newContent = resolveNewContent(u, originalContent);
          if (resolution.status === 'found' && originalContent.trim() === newContent.trim()) return [];
          return [{
            entryName: u.entryName,
            originalContent,
            newContent,
            reason: u.reason,
            think: u.think,
            approved: null,
            action: resolution.status === 'found' ? classifyAction(originalContent, newContent) : 'create' as const,
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
              const currentPersona = getUserPersona() ?? '';
              const newContent = resolveNewContent(update, currentPersona);
              const ok = setUserPersona(newContent);
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
              const newContent = resolveNewContent(update, '');
              await WorldbookAPI.createEntries(createWb, [{
                name: update.entryName,
                content: newContent,
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
              const newContent = resolveNewContent(update, resolution.entry.content);
              await WorldbookAPI.updateEntry(resolution.worldbookName, resolution.entry.uid, {
                content: newContent,
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
    runtime.streamingText = '';
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
