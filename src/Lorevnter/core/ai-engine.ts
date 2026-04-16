// ============================================================
// Lorevnter - AI 分析引擎
// 封装 generateRaw 调用，支持一次调用和两次调用两种模式
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';
import { getEntryMacro, resolveMacros } from './constraints';
import type { LoreConstraint } from '../settings';

const logger = createLogger('ai-engine');

// ── API 调用抽象层 ──

interface ApiCallerOptions {
  ordered_prompts: RolePrompt[];
}

/**
 * 根据 settings 中的 API 配置构建 custom_api 参数。
 * - tavern 模式：复用酒馆 URL/Key，仅覆盖 model
 * - custom 模式：使用用户自定义的 apiurl/key/model
 */
function buildCustomApiConfig(): CustomApiConfig | undefined {
  const { settings } = useSettingsStore();

  // 构建采样参数（通用）
  const samplingParams: Partial<CustomApiConfig> = {};
  if (settings.lore_ai_temperature !== 'same_as_preset') samplingParams.temperature = settings.lore_ai_temperature;
  if (settings.lore_ai_top_p !== 'same_as_preset') samplingParams.top_p = settings.lore_ai_top_p;
  if (settings.lore_ai_max_tokens !== 'same_as_preset') samplingParams.max_tokens = settings.lore_ai_max_tokens;
  if (settings.lore_ai_frequency_penalty !== 'same_as_preset') samplingParams.frequency_penalty = settings.lore_ai_frequency_penalty;
  if (settings.lore_ai_presence_penalty !== 'same_as_preset') samplingParams.presence_penalty = settings.lore_ai_presence_penalty;

  if (settings.lore_api_source === 'tavern') {
    // 复用酒馆当前连接，仅覆盖模型和采样参数
    const hasOverrides = settings.lore_api_model || Object.keys(samplingParams).length > 0;
    if (!hasOverrides) return undefined; // 完全使用酒馆默认
    return {
      model: settings.lore_api_model || undefined,
      ...samplingParams,
    };
  }

  // 自定义端点
  return {
    apiurl: settings.lore_api_base_url.replace(/\/+$/, ''),
    key: settings.lore_api_key || undefined,
    model: settings.lore_api_model || undefined,
    source: 'openai',
    ...samplingParams,
  };
}

/**
 * 构建统一的 API 调用函数。
 * 两种模式都通过 generateRaw + custom_api 走酒馆的统一代理路径。
 */
function buildApiCaller(): (opts: ApiCallerOptions) => Promise<string> {
  const customApi = buildCustomApiConfig();

  return async ({ ordered_prompts }) => {
    return await generateRaw({
      ordered_prompts,
      should_silence: true,
      custom_api: customApi,
    } as any);
  };
}

// ── 模型列表获取 ──

/**
 * 获取可用模型列表（仅 custom 模式可用）。
 * tavern 模式下酒馆脚本环境不暴露 API 地址和密钥，无法获取模型列表。
 */
export async function fetchModelList(): Promise<string[]> {
  const { settings } = useSettingsStore();

  if (settings.lore_api_source === 'tavern') {
    throw new Error('酒馆模式下不支持获取模型列表');
  }

  const apiurl = settings.lore_api_base_url.replace(/\/+$/, '');
  const key = settings.lore_api_key || undefined;
  if (!apiurl) {
    throw new Error('请先填写 API 地址');
  }

  try {
    const models = await getModelList({ apiurl, key });
    logger.info(`获取模型列表成功: ${models.length} 个模型`);
    return models;
  } catch (e) {
    logger.error(`获取模型列表失败: ${(e as Error).message}`);
    throw e;
  }
}

/**
 * 获取酒馆当前正在使用的模型名称。
 * 通过 SillyTavern.getChatCompletionModel() 读取。
 */
export function getTavernCurrentModel(): string {
  try {
    return SillyTavern.getChatCompletionModel() || '';
  } catch {
    return '';
  }
}

/**
 * 测试 API 连接（发送一条简单请求）。
 * 两种模式都会实际调用 AI 进行验证。
 */
export async function testApiConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const caller = buildApiCaller();
    const result = await caller({
      ordered_prompts: [
        { role: 'user', content: 'Hello, respond with "ok".' } as RolePrompt,
      ],
    });
    if (result && result.length > 0) {
      return { ok: true, message: `连接成功 (${result.slice(0, 30)}...)` };
    }
    return { ok: false, message: '响应为空' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

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
  const callApi = buildApiCaller();
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
    const rawResponse = await callApi({ ordered_prompts });

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
  const callApi = buildApiCaller();
  logger.info(`两次调用模式: ${request.entries.length} 个条目, ${request.chatMessages.length} 条消息`);

  const chatText = request.chatMessages.join('\n---\n');

  // ── 第 1 次：筛选 ──
  const namesList = request.entries.map((ae) => `- ${ae.entry.name}`).join('\n');
  const triagePrompt = `以下是所有世界书条目名称：\n${namesList}\n\n请阅读最近的对话内容，判断哪些条目需要更新。\n仅返回需要更新的条目名称列表，JSON 数组格式。\n\n## 最近的对话内容\n${chatText}`;

  toastr.info('AI 正在筛选条目...', 'Lorevnter');

  let markedNames: string[];
  try {
    const triageResponse = await callApi({
      ordered_prompts: [
        { role: 'system', content: '你是世界书管理助手。请筛选需要更新的条目名称。仅返回 JSON 数组。' },
        { role: 'user', content: triagePrompt },
      ],
    });

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
    const rawResponse = await callApi({
      ordered_prompts: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: updatePrompt },
      ],
    });

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

// ── 提示词预览（纯组装，不调用 API） ──

/** 组装一次调用模式的 prompt（用于调试预览） */
export function buildOnePassPrompts(request: AnalysisRequest): RolePrompt[] {
  const { settings } = useSettingsStore();

  const systemPrompt = resolveMacros(
    settings.lore_ai_system_prompt || DEFAULT_SYSTEM_PROMPT,
    request.allEntries,
  );

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

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/** 组装两次调用模式的 prompt（用于调试预览） */
export function buildTwoPassPrompts(request: AnalysisRequest): { triage: RolePrompt[]; update: RolePrompt[] } {
  const { settings } = useSettingsStore();
  const chatText = request.chatMessages.join('\n---\n');

  // 第 1 次：筛选
  const namesList = request.entries.map((ae) => `- ${ae.entry.name}`).join('\n');
  const triagePrompt = `以下是所有世界书条目名称：\n${namesList}\n\n请阅读最近的对话内容，判断哪些条目需要更新。\n仅返回需要更新的条目名称列表，JSON 数组格式。\n\n## 最近的对话内容\n${chatText}`;

  const triage: RolePrompt[] = [
    { role: 'system', content: '你是世界书管理助手。请筛选需要更新的条目名称。仅返回 JSON 数组。' },
    { role: 'user', content: triagePrompt },
  ];

  // 第 2 次：更新
  const systemPrompt = resolveMacros(
    settings.lore_ai_system_prompt || DEFAULT_SYSTEM_PROMPT,
    request.allEntries,
  );

  const entriesText = request.entries
    .map((ae) => {
      const constraintText = ae.constraint
        ? `\n  约束: ${resolveMacros(ae.constraint.instruction, request.allEntries)}`
        : '';
      return `- ${ae.entry.name}:${constraintText}\n  当前内容: ${ae.entry.content}`;
    })
    .join('\n\n');

  const updatePrompt = `## 需要更新的条目\n${entriesText}\n\n## 最近的对话内容\n${chatText}`;

  const update: RolePrompt[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: updatePrompt },
  ];

  return { triage, update };
}
