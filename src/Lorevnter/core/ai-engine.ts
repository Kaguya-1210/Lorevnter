// ============================================================
// Lorevnter - AI 分析引擎
// 封装 generateRaw 调用，支持一次调用和两次调用两种模式
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';
import { getEntryMacro, resolveMacros } from './constraints';
import type { LoreConstraint } from '../settings';

const logger = createLogger('ai-engine');

// ── 类型 ──

export interface AnalysisEntry {
  entry: WorldbookEntry;
  constraint: LoreConstraint | null;
}

export interface AnalysisRequest {
  /** 最近的聊天消息 */
  chatMessages: string[];
  /** 要分析的条目（已排除 skip 的） */
  entries: AnalysisEntry[];
  /** 全部条目（用于宏解析） */
  allEntries: WorldbookEntry[];
  /** 所属世界书名称 → 条目映射（用于写回） */
  worldbookMap: Record<string, WorldbookEntry[]>;
}

export interface UpdateInstruction {
  entryName: string;
  newContent: string;
  reason: string;
}

export interface AnalysisResult {
  updates: UpdateInstruction[];
  rawResponse: string;
}

// ── 默认系统提示词 ──

const DEFAULT_SYSTEM_PROMPT = `你是一个世界书管理助手。请阅读最近的对话内容，判断以下世界书条目中哪些需要更新。

对于需要更新的条目，返回更新后的内容和理由。
不需要更新的条目不要返回。

请严格以 JSON 格式返回：
{
  "updates": [
    {
      "entryName": "条目名称",
      "newContent": "更新后的完整内容",
      "reason": "更新理由"
    }
  ]
}

如果没有需要更新的条目，返回 {"updates": []}`;

// ── 核心函数 ──

/** 一次调用模式：筛选 + 更新合一 */
export async function analyzeOnePass(request: AnalysisRequest): Promise<AnalysisResult> {
  const { settings } = useSettingsStore();
  logger.info(`一次调用模式: ${request.entries.length} 个条目, ${request.chatMessages.length} 条消息`);

  const systemPrompt = resolveMacros(
    settings.lore_ai_system_prompt || DEFAULT_SYSTEM_PROMPT,
    request.allEntries,
  );

  // 构建条目描述
  const entriesText = request.entries
    .map((ae) => {
      const constraintText = ae.constraint
        ? `\n  约束: ${resolveMacros(ae.constraint.instruction, request.allEntries)}`
        : '';
      const macroText = getEntryMacro(ae.entry) ? ` (宏: {{${getEntryMacro(ae.entry)}}})` : '';
      return `- ${ae.entry.name}${macroText}:${constraintText}\n  当前内容: ${ae.entry.content}`;
    })
    .join('\n\n');

  const chatText = request.chatMessages.join('\n---\n');

  const userPrompt = `## 世界书条目\n${entriesText}\n\n## 最近的对话内容\n${chatText}`;

  const ordered_prompts: (RolePrompt)[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  toastr.info('AI 正在分析...', 'Lorevnter');

  try {
    const rawResponse = await generateRaw({
      ordered_prompts,
      should_silence: true,
      custom_api: undefined,
    } as any);

    logger.debug('AI 原始响应', rawResponse);
    const result = parseAiResponse(rawResponse);
    logger.info(`一次调用完成: ${result.updates.length} 条需更新`);

    if (result.updates.length > 0) {
      toastr.success(`分析完成: ${result.updates.length} 条需更新`, 'Lorevnter');
    } else {
      toastr.info('AI 判断无需更新', 'Lorevnter');
    }

    return result;
  } catch (e) {
    logger.error(`AI 调用失败: ${(e as Error).message}`);
    toastr.error(`AI 分析失败: ${(e as Error).message}`, 'Lorevnter');
    throw e;
  }
}

/** 两次调用模式：先筛选，再更新 */
export async function analyzeTwoPass(request: AnalysisRequest): Promise<AnalysisResult> {
  const { settings } = useSettingsStore();
  logger.info(`两次调用模式: ${request.entries.length} 个条目, ${request.chatMessages.length} 条消息`);

  const chatText = request.chatMessages.join('\n---\n');

  // ── 第 1 次：筛选 ──
  const namesList = request.entries.map((ae) => `- ${ae.entry.name}`).join('\n');
  const triagePrompt = `以下是所有世界书条目名称：\n${namesList}\n\n请阅读最近的对话内容，判断哪些条目需要更新。\n仅返回需要更新的条目名称列表，JSON 数组格式。\n\n## 最近的对话内容\n${chatText}`;

  toastr.info('AI 正在筛选条目...', 'Lorevnter');

  let markedNames: string[];
  try {
    const triageResponse = await generateRaw({
      ordered_prompts: [
        { role: 'system', content: '你是世界书管理助手。请筛选需要更新的条目名称。仅返回 JSON 数组。' },
        { role: 'user', content: triagePrompt },
      ],
      should_silence: true,
      custom_api: undefined,
    } as any);

    logger.debug('筛选响应', triageResponse);
    markedNames = parseNameList(triageResponse);
    logger.info(`筛选完成: ${markedNames.length} 条需检查`);
    toastr.info(`AI 筛选完成: ${markedNames.length} 条需检查`, 'Lorevnter');
  } catch (e) {
    logger.error(`筛选调用失败: ${(e as Error).message}`);
    toastr.error(`AI 筛选失败: ${(e as Error).message}`, 'Lorevnter');
    throw e;
  }

  if (markedNames.length === 0) {
    toastr.info('AI 判断无需更新', 'Lorevnter');
    return { updates: [], rawResponse: '[]' };
  }

  // ── 第 2 次：更新 ──
  const markedEntries = request.entries.filter((ae) =>
    markedNames.some((n) => n === ae.entry.name),
  );

  const systemPrompt = resolveMacros(
    settings.lore_ai_system_prompt || DEFAULT_SYSTEM_PROMPT,
    request.allEntries,
  );

  const entriesText = markedEntries
    .map((ae) => {
      const constraintText = ae.constraint
        ? `\n  约束: ${resolveMacros(ae.constraint.instruction, request.allEntries)}`
        : '';
      return `- ${ae.entry.name}:${constraintText}\n  当前内容: ${ae.entry.content}`;
    })
    .join('\n\n');

  const updatePrompt = `## 需要更新的条目\n${entriesText}\n\n## 最近的对话内容\n${chatText}`;

  toastr.info('AI 正在生成更新...', 'Lorevnter');

  try {
    const rawResponse = await generateRaw({
      ordered_prompts: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: updatePrompt },
      ],
      should_silence: true,
      custom_api: undefined,
    } as any);

    logger.debug('更新响应', rawResponse);
    const result = parseAiResponse(rawResponse);
    logger.info(`更新分析完成: ${result.updates.length} 条`);

    if (result.updates.length > 0) {
      toastr.success(`分析完成: ${result.updates.length} 条需更新`, 'Lorevnter');
    } else {
      toastr.info('AI 判断无需更新', 'Lorevnter');
    }

    return result;
  } catch (e) {
    logger.error(`更新调用失败: ${(e as Error).message}`);
    toastr.error(`AI 更新分析失败: ${(e as Error).message}`, 'Lorevnter');
    throw e;
  }
}

// ── 响应解析 ──

/** 解析 AI 返回的更新指令 JSON */
function parseAiResponse(raw: string): AnalysisResult {
  try {
    // 尝试提取 JSON 块（AI 可能包裹在 markdown 代码块中）
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

    const parsed = JSON.parse(jsonStr);
    const updates: UpdateInstruction[] = (parsed.updates || []).map((u: any) => ({
      entryName: String(u.entryName || u.name || ''),
      newContent: String(u.newContent || u.content || ''),
      reason: String(u.reason || ''),
    }));

    return { updates, rawResponse: raw };
  } catch (e) {
    logger.error(`JSON 解析失败，尝试修复: ${(e as Error).message}`);
    toastr.warning('AI 返回格式异常，尝试修复...', 'Lorevnter');

    // 尝试提取可能的 JSON 片段
    try {
      // 再尝试一次宽松匹配
      const looseMatch = raw.match(/\{[\s\S]*"updates"[\s\S]*\}/);
      if (looseMatch) {
        const parsed = JSON.parse(looseMatch[0]);
        const updates: UpdateInstruction[] = (parsed.updates || []).map((u: any) => ({
          entryName: String(u.entryName || u.name || ''),
          newContent: String(u.newContent || u.content || ''),
          reason: String(u.reason || ''),
        }));
        return { updates, rawResponse: raw };
      }
    } catch {
      // 最终失败
    }
    logger.error('所有解析尝试均失败');
    toastr.error('AI 返回格式无法解析', 'Lorevnter');
    return { updates: [], rawResponse: raw };
  }
}

/** 解析名称列表 JSON */
function parseNameList(raw: string): string[] {
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\[[\s\S]*\])/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
    return [];
  } catch {
    logger.warn('名称列表解析失败');
    return [];
  }
}
