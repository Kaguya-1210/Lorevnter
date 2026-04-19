// ============================================================
// Lorevnter - AI 分析引擎
// 封装 generateRaw 调用，一次调用模式
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';
import { getEntryMacro, getEntryConstraints, collectActiveConstraints, resolveMacros, resolveLoreMacros } from './constraints';
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
        { role: 'user', content: 'Respond with exactly one word: "ok"' } as RolePrompt,
      ],
    });

    if (!result || result.trim().length === 0) {
      return { ok: false, message: '响应为空，请检查 API 配置' };
    }

    // 检测 API 错误标记（酒馆返回错误时包含这些标记）
    const errorPatterns = ['[API Error]', '[Error]', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '401', '403', '404', '500', '502', '503'];
    const resultText = result.trim();
    for (const pattern of errorPatterns) {
      if (resultText.includes(pattern)) {
        return { ok: false, message: `API 错误: ${resultText.slice(0, 120)}` };
      }
    }

    return { ok: true, message: `连接成功 (${resultText.slice(0, 40).trim()})` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ── 类型 ──

export interface AnalysisEntry {
  entry: WorldbookEntry;
  constraint: LoreConstraint | null;
  /** 条目所属世界书名，用于约束绑定表查询和提示词展示 */
  worldbookName?: string;
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
  /** 条目 uid（AI 返回时可能包含，用于精确定位） */
  entryUid?: number;
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

import { getActivePreset, BUILTIN_UPDATE_PRESET } from './prompt-editor';

// ── 数据提取 ──

/** 将分析条目格式化为文本（供旧宏 {{lore_worldbook}} 兼容使用） */
function formatWorldbookEntries(entries: AnalysisEntry[], allEntries: WorldbookEntry[]): string {
  return entries
    .map((ae) => {
      const constraintText = ae.constraint
        ? `\n<constraint>${resolveMacros(ae.constraint.instruction, allEntries)}</constraint>`
        : '';
      const macroText = getEntryMacro(ae.entry) ? ` (宏: {{${getEntryMacro(ae.entry)}}})` : '';
      const renderedContent = substitudeMacros(ae.entry.content);
      return `<entry name="${ae.entry.name}"${macroText}>${constraintText}\n<content>${renderedContent}</content>\n</entry>`;
    })
    .join('\n\n');
}

/**
 * 三块式结构 - 条目数据块
 * 每条目列出：名称、所属世界书、约束ID引用、当前内容
 */
function formatEntriesBlock(entries: AnalysisEntry[]): string {
  return entries
    .map((ae) => {
      const constraints = getEntryConstraints(ae.entry, ae.worldbookName);
      const constraintIds = constraints.map(c => `${c.scope === 'local' ? 'L' : 'G'}:${c.name}`);
      const constraintRef = constraintIds.length > 0 ? `\n<constraints>${constraintIds.join(', ')}</constraints>` : '';
      const renderedContent = substitudeMacros(ae.entry.content);
      const wbAttr = ae.worldbookName ? ` worldbook="${ae.worldbookName}"` : '';
      return `<entry name="${ae.entry.name}" uid="${ae.entry.uid}"${wbAttr}>${constraintRef}\n<content>${renderedContent}</content>\n</entry>`;
    })
    .join('\n\n');
}

/**
 * 三块式结构 - 约束定义块
 * 去重列出本轮所有命中的约束及其作用条目
 */
function formatConstraintsBlock(entries: AnalysisEntry[]): string {
  const collected = collectActiveConstraints(
    entries.map(ae => ({ entry: ae.entry, worldbookName: ae.worldbookName }))
  );
  if (collected.length === 0) return '<no_constraints/>';

  return collected
    .map(({ constraint, entryNames }) => {
      const scope = constraint.scope === 'local' ? 'local' : 'global';
      const type = constraint.type === 'skip' ? 'skip' : 'prompt';
      return `<constraint name="${constraint.name}" scope="${scope}" type="${type}">\n<instruction>${constraint.instruction}</instruction>\n<bound_entries>${entryNames.join(', ')}</bound_entries>\n</constraint>`;
    })
    .join('\n\n');
}

/** 三块式结构 - 约束优先级说明 */
function formatConstraintPolicy(): string {
  return `<priority_rules>
<rule level="1" priority="critical">输出格式规则：必须输出有效 JSON</rule>
<rule level="2" priority="critical">数据安全规则：不得丢失未变化的内容</rule>
<rule level="3" priority="high">局部约束：仅对当前角色卡生效的规则</rule>
<rule level="4" priority="medium">全局约束：跨角色卡通用规则</rule>
<rule level="5" priority="low">默认更新原则：分析步骤中的通用判断逻辑</rule>
</priority_rules>`;
}

/** 将聊天消息格式化为文本（供宏 {{lore_context}} 使用） */
function formatChatContext(chatMessages: string[]): string {
  if (chatMessages.length === 0) return '<no_context/>';
  if (chatMessages.length === 1) {
    return `<latest_context>\n${chatMessages[0]}\n</latest_context>`;
  }
  const history = chatMessages.slice(0, -1).join('\n');
  const latest = chatMessages[chatMessages.length - 1];
  return `<history_context>\n${history}\n</history_context>\n\n<latest_context>\n${latest}\n</latest_context>`;
}

/**
 * 构建更新阶段的 ordered_prompts。
 * 从当前激活预设的 update_items 读取，回退到内置。
 * 通过宏系统填充数据：{{lore_worldbook}}、{{lore_context}} 等。
 */
function buildUpdatePrompts(
  allEntries: WorldbookEntry[],
  loreMacros: Record<string, string>,
): RolePrompt[] {
  const preset = getActivePreset();
  const enabledItems = preset.update_items.filter(p => p.enabled);

  const source = enabledItems.length > 0 ? enabledItems : BUILTIN_UPDATE_PRESET.filter(p => p.enabled);
  return source.map(p => ({
    role: p.role,
    // 正确顺序：
    // 1. 先替换 Lorevnter 数据宏（注入 {{lore_entries}} {{lore_context}} 等）
    // 2. 再替换条目宏（{{macro}} → entry.content）+ 酒馆宏（{{user}} {{char}} 等）
    content: resolveMacros(resolveLoreMacros(p.content, loreMacros), allEntries),
  } as RolePrompt));
}



// ── 核心函数 ──

/** 一次调用模式：筛选 + 更新合一 */
export async function analyzeOnePass(request: AnalysisRequest): Promise<AnalysisResult> {
  const callApi = buildApiCaller();
  const { settings } = useSettingsStore();
  logger.info(`一次调用模式: ${request.entries.length} 个条目, ${request.chatMessages.length} 条消息`);

  // Step 1: 提取数据
  const worldbookText = formatWorldbookEntries(request.entries, request.allEntries);
  const contextText = formatChatContext(request.chatMessages);

  // Step 2: 构建宏字典（Lorevnter 专属宏）
  const loreMacros: Record<string, string> = {
    // 旧宏（兼容）
    lore_worldbook: worldbookText,
    lore_context: contextText,
    lore_max_context: String(settings.lore_ai_max_context),
    lore_entry_count: String(request.entries.length),
    // 新三块式宏
    lore_entries: formatEntriesBlock(request.entries),
    lore_constraints: formatConstraintsBlock(request.entries),
    lore_constraint_policy: formatConstraintPolicy(),
  };

  // Step 3: 构建消息序列（宏在 buildUpdatePrompts 内替换）
  const ordered_prompts = buildUpdatePrompts(request.allEntries, loreMacros);

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



// ── 响应解析 ──

/** 解析 AI 返回的更新指令 JSON */
function parseAiResponse(raw: string): AnalysisResult {
  const extractUpdates = (parsed: any): UpdateInstruction[] =>
    (parsed.updates || []).map((u: any) => ({
      entryName: String(u.entryName || u.name || ''),
      newContent: String(u.newContent || u.content || ''),
      reason: String(u.reason || ''),
      entryUid: u.entryUid != null ? Number(u.entryUid) : undefined,
    }));

  // 0. 剥离 CoT 思考标签（<lore_think>...</lore_think>）
  let cleaned = raw;
  const thinkMatch = cleaned.match(/<lore_think>[\s\S]*?<\/lore_think>/);
  if (thinkMatch) {
    logger.debug('已剥离 CoT 思考内容', thinkMatch[0].slice(0, 200));
    cleaned = cleaned.replace(/<lore_think>[\s\S]*?<\/lore_think>/, '').trim();
  }

  // 1. 最优路径：直接解析
  try {
    const parsed = JSON.parse(cleaned.trim());
    return { updates: extractUpdates(parsed), rawResponse: raw };
  } catch { /* continue */ }

  // 2. markdown 代码块
  try {
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return { updates: extractUpdates(parsed), rawResponse: raw };
    }
  } catch { /* continue */ }

  // 3. 正则提取 JSON 对象
  try {
    const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return { updates: extractUpdates(parsed), rawResponse: raw };
    }
  } catch { /* continue */ }
  // 4. 最终回退：宽松匹配
  try {
    const looseMatch = cleaned.match(/\{[\s\S]*"updates"[\s\S]*\}/);
    if (looseMatch) {
      const parsed = JSON.parse(looseMatch[0]);
      return { updates: extractUpdates(parsed), rawResponse: raw };
    }
  } catch { /* continue */ }

  logger.error('所有解析尝试均失败');
  toastr.error('AI 返回格式无法解析', 'Lorevnter');
  return { updates: [], rawResponse: raw };
}



// ── 提示词预览（纯组装，不调用 API） ──

/** 组装一次调用模式的 prompt（用于调试预览） */
export function buildOnePassPrompts(request: AnalysisRequest): RolePrompt[] {
  const { settings } = useSettingsStore();
  const worldbookText = formatWorldbookEntries(request.entries, request.allEntries);
  const contextText = formatChatContext(request.chatMessages);

  const loreMacros: Record<string, string> = {
    // 旧宏（兼容）
    lore_worldbook: worldbookText,
    lore_context: contextText,
    lore_max_context: String(settings.lore_ai_max_context),
    lore_entry_count: String(request.entries.length),
    // 新三块式宏
    lore_entries: formatEntriesBlock(request.entries),
    lore_constraints: formatConstraintsBlock(request.entries),
    lore_constraint_policy: formatConstraintPolicy(),
  };

  return buildUpdatePrompts(request.allEntries, loreMacros);
}

