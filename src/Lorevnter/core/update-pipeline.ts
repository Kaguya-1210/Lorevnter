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
import { analyzeOnePass, analyzeTwoPass, type AnalysisEntry, type AnalysisRequest } from './ai-engine';

const logger = createLogger('pipeline');

/** 消息计数（用于自动触发间隔判断） */
let messageCount = 0;

/** 是否正在执行管线 */
let running = false;

/**
 * 判断是否应该触发自动扫描
 */
export function shouldAutoScan(): boolean {
  const { settings } = useSettingsStore();
  if (settings.lore_scan_trigger !== 'auto') return false;
  if (running) return false;

  messageCount++;
  if (messageCount % settings.lore_scan_interval === 0) {
    return true;
  }
  return false;
}

/** 重置消息计数 */
export function resetMessageCount(): void {
  messageCount = 0;
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

  if (ctx.context.mode === 'idle') {
    toastr.warning('无活跃的世界书，请先打开角色卡', 'Lorevnter');
    return;
  }

  running = true;
  toastr.info('开始分析剧情变化...', 'Lorevnter');
  logger.info('管线启动');

  try {
    // Step 1: 收集世界书名称
    const worldbookNames = ctx.getActiveWorldbookNames();
    if (worldbookNames.length === 0) {
      toastr.warning('无活跃的世界书', 'Lorevnter');
      return;
    }
    logger.info(`活跃世界书: ${worldbookNames.join(', ')}`);

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

    const result = settings.lore_ai_mode === 'twopass'
      ? await analyzeTwoPass(request)
      : await analyzeOnePass(request);

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
  } catch (e) {
    logger.error(`管线失败: ${(e as Error).message}`);
    toastr.error(`更新失败: ${(e as Error).message}`, 'Lorevnter');
  } finally {
    running = false;
  }
}

// ── 辅助函数 ──

/** 获取最近 N 条聊天消息 */
function getRecentChatMessages(maxCount: number): string[] {
  try {
    const chat = SillyTavern.chat;
    if (!chat || chat.length === 0) return [];

    const recent = chat.slice(-maxCount);
    return recent
      .filter((msg: any) => msg.mes && typeof msg.mes === 'string')
      .map((msg: any) => {
        const role = msg.is_user ? '{{user}}' : '{{char}}';
        return `${role}: ${msg.mes}`;
      });
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
    runtime.aiCallHistory.push({
      timestamp: Date.now(),
      mode: useSettingsStore().settings.lore_ai_mode,
      inputEntries: request.entries.length,
      inputMessages: request.chatMessages.length,
      outputUpdates: result.updates.length,
      appliedCount,
      updates: result.updates,
    });
  } catch {
    // 静默，不影响主流程
  }
}
