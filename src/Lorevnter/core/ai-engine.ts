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

/**
 * 获取当前 API 配置快照（用于调试记录）。
 * 返回当前生效的 source、apiUrl、model、采样参数等。
 */
export function getApiSnapshot(): NonNullable<import('../state').AiCallRecord['apiDetails']> {
  const { settings } = useSettingsStore();
  const isTavern = settings.lore_api_source === 'tavern';

  return {
    source: isTavern ? 'tavern' : 'custom',
    apiUrl: isTavern ? '(酒馆代理)' : (settings.lore_api_base_url || '(未配置)'),
    model: settings.lore_api_model || (isTavern ? getTavernCurrentModel() || '(酒馆默认)' : '(未配置)'),
    temperature: settings.lore_ai_temperature,
    topP: settings.lore_ai_top_p,
    maxTokens: settings.lore_ai_max_tokens,
    frequencyPenalty: settings.lore_ai_frequency_penalty,
    presencePenalty: settings.lore_ai_presence_penalty,
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

// ── Prefill 工具 ──

/** 提取消息序列中最后一条 assistant 消息的内容（用于预填充拼接） */
function extractAssistantPrefill(prompts: RolePrompt[]): string {
  return prompts.filter(p => p.role === 'assistant').pop()?.content || '';
}

/** 安全拼接预填充前缀：若 AI 响应已包含前缀则不重复拼接 */
function concatPrefill(prefill: string, rawResponse: string): string {
  if (!prefill) return rawResponse;
  const trimmed = rawResponse.trimStart();
  if (trimmed.startsWith(prefill.trim())) return trimmed;
  return prefill + rawResponse;
}

// ── 从激活预设构建提示词 ──

import { getActivePreset, BUILTIN_UPDATE_PRESET, BUILTIN_TRIAGE_PRESET } from './prompt-editor';

/**
 * 构建更新阶段的 ordered_prompts。
 * 从当前激活预设的 update_items 读取，回退到内置。
 */
function buildUpdatePrompts(allEntries: WorldbookEntry[]): RolePrompt[] {
  const preset = getActivePreset();
  const enabledItems = preset.update_items.filter(p => p.enabled);

  const source = enabledItems.length > 0 ? enabledItems : BUILTIN_UPDATE_PRESET.filter(p => p.enabled);
  return source.map(p => ({
    role: p.role,
    content: resolveMacros(p.content, allEntries),
  } as RolePrompt));
}

/**
 * 构建筛选阶段的 ordered_prompts。
 * 从当前激活预设的 triage_items 读取，回退到内置。
 */
function buildTriagePromptMessages(allEntries: WorldbookEntry[]): RolePrompt[] {
  const preset = getActivePreset();
  const enabledItems = preset.triage_items.filter(p => p.enabled);

  const source = enabledItems.length > 0 ? enabledItems : BUILTIN_TRIAGE_PRESET.filter(p => p.enabled);
  return source.map(p => ({
    role: p.role,
    content: resolveMacros(p.content, allEntries),
  } as RolePrompt));
}

// ── 核心函数 ──

/** 一次调用模式：筛选 + 更新合一 */
export async function analyzeOnePass(request: AnalysisRequest): Promise<AnalysisResult> {
  const callApi = buildApiCaller();
  logger.info(`一次调用模式: ${request.entries.length} 个条目, ${request.chatMessages.length} 条消息`);

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

  // 构建消息序列（含内置预设回退）
  const updatePrompts = buildUpdatePrompts(request.allEntries);
  const ordered_prompts: RolePrompt[] = [
    ...updatePrompts,
    { role: 'user', content: userPrompt } as RolePrompt,
  ];

  toastr.info('AI 正在分析...', 'Lorevnter');

  // 检测 assistant 预填充前缀（CoT 锚定）
  const prefill = extractAssistantPrefill(ordered_prompts);

  try {
    const rawResponse = await callApi({ ordered_prompts });

    logger.debug('AI 原始响应', rawResponse);
    const fullResponse = concatPrefill(prefill, rawResponse);
    const result = parseAiResponse(fullResponse);
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
    // 筛选阶段：从激活预设读取
    const triageListMsgs = buildTriagePromptMessages(request.allEntries);
    const ordered_prompts: RolePrompt[] = [
      ...triageListMsgs,
      { role: 'user', content: triagePrompt } as RolePrompt,
    ];

    const triagePrefill = extractAssistantPrefill(triageListMsgs);

    const triageResponse = await callApi({ ordered_prompts });

    logger.debug('筛选响应', triageResponse);
    const fullTriageResponse = concatPrefill(triagePrefill, triageResponse);
    markedNames = parseNameList(fullTriageResponse);
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

  // 构建消息序列（含内置预设回退）
  const updatePrompts = buildUpdatePrompts(request.allEntries);

  // 检测 assistant 预填充前缀
  const prefill2 = extractAssistantPrefill(updatePrompts);

  try {
    const ordered_prompts: RolePrompt[] = [
      ...updatePrompts,
      { role: 'user', content: updatePrompt } as RolePrompt,
    ];

    const rawResponse = await callApi({
      ordered_prompts,
    });

    logger.debug('更新响应', rawResponse);
    const fullResponse2 = concatPrefill(prefill2, rawResponse);
    const result = parseAiResponse(fullResponse2);
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
  const extractUpdates = (parsed: any): UpdateInstruction[] =>
    (parsed.updates || []).map((u: any) => ({
      entryName: String(u.entryName || u.name || ''),
      newContent: String(u.newContent || u.content || ''),
      reason: String(u.reason || ''),
    }));

  // 1. 最优路径：直接解析
  try {
    const parsed = JSON.parse(raw.trim());
    return { updates: extractUpdates(parsed), rawResponse: raw };
  } catch { /* continue */ }

  // 2. markdown 代码块
  try {
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return { updates: extractUpdates(parsed), rawResponse: raw };
    }
  } catch { /* continue */ }

  // 3. 正则提取 JSON 对象
  try {
    const jsonMatch = raw.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return { updates: extractUpdates(parsed), rawResponse: raw };
    }
  } catch { /* continue */ }
  // 4. 最终回退：宽松匹配
  try {
    const looseMatch = raw.match(/\{[\s\S]*"updates"[\s\S]*\}/);
    if (looseMatch) {
      const parsed = JSON.parse(looseMatch[0]);
      return { updates: extractUpdates(parsed), rawResponse: raw };
    }
  } catch { /* continue */ }

  logger.error('所有解析尝试均失败');
  toastr.error('AI 返回格式无法解析', 'Lorevnter');
  return { updates: [], rawResponse: raw };
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

  const updateMsgs = buildUpdatePrompts(request.allEntries);
  return [
    ...updateMsgs,
    { role: 'user', content: userPrompt } as RolePrompt,
  ];
}

/** 组装两次调用模式的 prompt（用于调试预览） */
export function buildTwoPassPrompts(request: AnalysisRequest): { triage: RolePrompt[]; update: RolePrompt[] } {
  const chatText = request.chatMessages.join('\n---\n');

  // 第 1 次：筛选
  const namesList = request.entries.map((ae) => `- ${ae.entry.name}`).join('\n');
  const triagePrompt = `以下是所有世界书条目名称：\n${namesList}\n\n请阅读最近的对话内容，判断哪些条目需要更新。\n仅返回需要更新的条目名称列表，JSON 数组格式。\n\n## 最近的对话内容\n${chatText}`;

  const triageMsgs = buildTriagePromptMessages(request.allEntries);
  const triage: RolePrompt[] = [
    ...triageMsgs,
    { role: 'user', content: triagePrompt } as RolePrompt,
  ];

  // 第 2 次：更新
  const updateMsgs = buildUpdatePrompts(request.allEntries);

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
    ...updateMsgs,
    { role: 'user', content: updatePrompt } as RolePrompt,
  ];

  return { triage, update };
}
