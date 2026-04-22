// ============================================================
// Lorevnter - AI 分析引擎
// 封装 generateRaw 调用，一次调用模式
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore, type PromptItem, type LoreConstraint } from '../settings';
import { useRuntimeStore } from '../state';
import { getEntryMacro, getEntryConstraints, collectActiveConstraints, resolveMacros, resolveLoreMacros, getConstraintById } from './constraints';
import { getUserPersona } from './persona';
import { useContextStore } from './worldbook-context';

const logger = createLogger('ai-engine');

// ── API 调用抽象层 ──

interface ApiCallerOptions {
  ordered_prompts: RolePrompt[];
}

function buildPersonaMacroValue(): string {
  const { settings } = useSettingsStore();
  if (!settings.lore_include_persona) return '';

  const persona = getUserPersona();
  if (!persona) return '';

  let personaBlock = persona;
  if (settings.lore_persona_constraint_id) {
    const pc = getConstraintById(settings.lore_persona_constraint_id);
    const currentCharacterScopeKey = useContextStore().context.characterScopeKey ?? '';
    const scopeMatches = pc?.scope !== 'local'
      || !settings.lore_persona_constraint_character_id
      || settings.lore_persona_constraint_character_id === currentCharacterScopeKey;
    if (pc && pc.enabled && pc.instruction && scopeMatches) {
      personaBlock += `\n<persona_constraint name="${pc.name}">\n${pc.instruction}\n</persona_constraint>`;
    }
  }

  return personaBlock;
}

function buildLoreMacros(request: AnalysisRequest): Record<string, string> {
  const { settings } = useSettingsStore();

  return {
    lore_worldbook: formatWorldbookEntries(request.entries, request.allEntries),
    lore_context: formatChatContext(request.chatMessages),
    lore_max_context: String(settings.lore_ai_max_context),
    lore_entry_count: String(request.entries.length),
    lore_entries: formatEntriesBlock(request.entries),
    lore_constraints: formatConstraintsBlock(request.entries),
    lore_constraint_policy: formatConstraintPolicy(),
    lore_user_persona: buildPersonaMacroValue(),
  };
}

function parseCandidateUpdates(raw: string): UpdateInstruction[] {
  const normalizeUpdates = (parsed: unknown): UpdateInstruction[] => {
    const result = RawResponseSchema.safeParse(parsed);
    if (!result.success) return [];
    return result.data.updates.map((u): UpdateInstruction => {
      const entryName = String(u.entryName ?? u.name ?? '');
      const reason = String(u.reason ?? '');
      const think = String(u.think ?? '');
      const entryUid = u.entryUid != null && Number.isFinite(Number(u.entryUid)) ? Number(u.entryUid) : undefined;

      // 判断类型：显式 type > 有 patches > 有 newContent/content（旧格式兼容）
      const explicitType = u.type ?? (u.patches ? 'update' : undefined);
      const legacyContent = String(u.newContent ?? u.content ?? '');

      if (explicitType === 'create') {
        return { entryName, type: 'create', content: legacyContent || undefined, patches: undefined, reason, think, entryUid };
      }

      if (u.patches && u.patches.length > 0) {
        // 新格式：直接用 patches
        const patches: PatchOp[] = u.patches.map(p => {
          if ('find' in p) return { find: p.find, replace: p.replace };
          return { type: 'append' as const, content: p.content };
        });
        return { entryName, type: 'update', patches, reason, think, entryUid };
      }

      if (legacyContent) {
        // 旧格式兼容：newContent 全文 → 在管线中降级处理
        return { entryName, type: 'update', content: legacyContent, reason, think, entryUid };
      }

      return { entryName, type: 'update', reason, think, entryUid };
    });
  };

  let cleaned = raw;
  const thinkMatch = cleaned.match(/<lore_think>[\s\S]*?<\/lore_think>/);
  if (thinkMatch) {
    logger.debug('AI 响应包含旧版 <lore_think>，已在解析前剥离');
    cleaned = cleaned.replace(/<lore_think>[\s\S]*?<\/lore_think>/, '').trim();
  }

  const candidates: string[] = [
    cleaned.trim(),
    cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? '',
    cleaned.match(/(\{[\s\S]*\})/)?.[1]?.trim() ?? '',
    cleaned.match(/\{[\s\S]*"updates"[\s\S]*\}/)?.[0]?.trim() ?? '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return normalizeUpdates(JSON.parse(candidate));
    } catch {
      // continue
    }
  }

  return [];
}

function parsePublicThink(raw: string): string {
  let cleaned = raw;
  const thinkMatch = cleaned.match(/<lore_think>[\s\S]*?<\/lore_think>/);
  if (thinkMatch) {
    cleaned = cleaned.replace(/<lore_think>[\s\S]*?<\/lore_think>/, '').trim();
  }

  const candidates: string[] = [
    cleaned.trim(),
    cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? '',
    cleaned.match(/(\{[\s\S]*\})/)?.[1]?.trim() ?? '',
    cleaned.match(/\{[\s\S]*"updates"[\s\S]*\}/)?.[0]?.trim() ?? '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const result = RawResponseSchema.safeParse(parsed);
      if (!result.success) continue;
      return String(result.data.think ?? '').trim();
    } catch {
      // continue
    }
  }

  return '';
}

function sanitizeAnalysisResult(request: AnalysisRequest, rawUpdates: UpdateInstruction[]): UpdateInstruction[] {
  const { settings } = useSettingsStore();
  const entriesByName = new Map<string, AnalysisEntry[]>();
  const existingNames = new Set(request.allEntries.map(entry => (entry.name || '').trim()).filter(Boolean));

  for (const analysisEntry of request.entries) {
    const key = analysisEntry.entry.name.trim();
    if (!key) continue;
    const list = entriesByName.get(key) ?? [];
    list.push(analysisEntry);
    entriesByName.set(key, list);
  }

  const sanitized: UpdateInstruction[] = [];
  const seenTargets = new Set<string>();

  for (const update of rawUpdates) {
    const entryName = update.entryName.trim();
    const reason = update.reason.trim() || 'AI 未提供理由';
    const numericUid = update.entryUid != null && Number.isFinite(update.entryUid) ? update.entryUid : undefined;
    const think = update.think?.trim() || '';
    const hasPatches = update.patches && update.patches.length > 0;
    const hasContent = update.content && update.content.trim().length > 0;

    if (!entryName) continue;
    // update 模式需要 patches 或 content（旧格式兼容），create 模式需要 content
    if (update.type === 'create' && !hasContent) continue;
    if (update.type === 'update' && !hasPatches && !hasContent) continue;

    // 人设更新
    if (entryName === '__persona__') {
      if (!settings.lore_include_persona) continue;
      if (seenTargets.has('persona')) continue;
      seenTargets.add('persona');
      sanitized.push({ entryName, entryUid: -1, type: update.type, patches: update.patches, content: update.content, reason, think });
      continue;
    }

    // create 模式：不在已有条目中
    if (update.type === 'create') {
      if (existingNames.has(entryName)) continue;
      const targetKey = `create:${entryName}`;
      if (seenTargets.has(targetKey)) continue;
      seenTargets.add(targetKey);
      sanitized.push({ entryName, type: 'create', content: update.content, reason, think });
      continue;
    }

    // update 模式：匹配已有条目
    let matchedEntry: AnalysisEntry | null = null;
    if (numericUid != null && numericUid >= 0) {
      matchedEntry = request.entries.find(ae => ae.entry.uid === numericUid) ?? null;
    }

    if (!matchedEntry) {
      const sameNameEntries = entriesByName.get(entryName) ?? [];
      if (sameNameEntries.length > 1) continue;
      matchedEntry = sameNameEntries[0] ?? null;
    }

    if (matchedEntry) {
      const targetKey = `entry:${matchedEntry.entry.uid}`;
      if (seenTargets.has(targetKey)) continue;
      seenTargets.add(targetKey);
      sanitized.push({
        entryName: matchedEntry.entry.name,
        entryUid: matchedEntry.entry.uid,
        type: 'update',
        patches: update.patches,
        content: update.content,
        reason,
        think,
      });
      continue;
    }

    // 未匹配到已有条目且不是显式 create → 当做新建
    if (existingNames.has(entryName)) continue;
    const targetKey = `create:${entryName}`;
    if (seenTargets.has(targetKey)) continue;
    seenTargets.add(targetKey);
    sanitized.push({ entryName, type: 'create', content: update.content, reason, think });
  }

  return sanitized;
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
// ── 直接 fetch 调用 OpenAI 兼容 API（绕过酒馆代理，支持真并发） ──

/**
 * 直接通过 fetch 调用 OpenAI 兼容 API。
 * 不经过酒馆的 generateRaw 代理，完全独立的 HTTP 连接。
 * 当 lore_concurrent_mode=true 且 source=custom 时启用。
 */
async function directOpenAiFetch(
  messages: Array<{ role: string; content: string }>,
  apiUrl: string,
  apiKey: string | undefined,
  model: string | undefined,
  samplingParams: Record<string, unknown>,
): Promise<string> {
  // 智能拼接 URL：如果用户 base URL 已包含 /v1 或更深路径，不重复拼接
  const trimmedUrl = apiUrl.replace(/\/+$/, '');
  const url = trimmedUrl.match(/\/v\d+(\/|$)/)
    ? `${trimmedUrl}/chat/completions`
    : `${trimmedUrl}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: model || 'gpt-4',
    messages,
    stream: false,
    ...Object.fromEntries(
      Object.entries(samplingParams).filter(([, v]) => v !== 'same_as_preset' && v !== 'unset' && v != null),
    ),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  logger.debug(`直连 API: ${url}, model=${model || '(default)'}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();

    // OpenAI 格式: data.choices[0].message.content
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('API 响应格式异常: 缺少 choices[0].message.content');
    }

    return content;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('API 请求超时（120s）');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 构建统一的 API 调用函数。
 * - concurrent + custom 模式：directOpenAiFetch 直连（真并发）
 * - 其他情况：generateRaw 走酒馆代理
 */
function buildApiCaller(): (opts: ApiCallerOptions) => Promise<string> {
  const { settings } = useSettingsStore();
  const customApi = buildCustomApiConfig();

  // 并发模式 + custom 端点 → 直连
  if (settings.lore_concurrent_mode && settings.lore_api_source === 'custom' && settings.lore_api_base_url) {
    const apiUrl = settings.lore_api_base_url.replace(/\/+$/, '');
    const apiKey = settings.lore_api_key || undefined;
    const model = settings.lore_api_model || undefined;

    const sampling: Record<string, unknown> = {};
    if (settings.lore_ai_temperature !== 'same_as_preset') sampling.temperature = settings.lore_ai_temperature;
    if (settings.lore_ai_top_p !== 'same_as_preset') sampling.top_p = settings.lore_ai_top_p;
    if (settings.lore_ai_max_tokens !== 'same_as_preset') sampling.max_tokens = settings.lore_ai_max_tokens;
    if (settings.lore_ai_frequency_penalty !== 'same_as_preset') sampling.frequency_penalty = settings.lore_ai_frequency_penalty;
    if (settings.lore_ai_presence_penalty !== 'same_as_preset') sampling.presence_penalty = settings.lore_ai_presence_penalty;

    logger.info('API 模式: 直连（并发模式）');

    return async ({ ordered_prompts }) => {
      const messages = ordered_prompts.map(p => ({ role: p.role, content: p.content }));
      return await directOpenAiFetch(messages, apiUrl, apiKey, model, sampling);
    };
  }

  // 非并发 / tavern 模式 → 酒馆代理
  logger.info(`API 模式: 酒馆代理${settings.lore_api_source === 'custom' ? '（并发未开启）' : ''}`);
  return async ({ ordered_prompts }) => {
    // 流式 token 写入 runtime store → UI 实时展示
    const runtime = useRuntimeStore();
    runtime.streamingText = '';
    const streamHandler = (text: string) => {
      runtime.streamingText = text;
    };
    eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, streamHandler);

    try {
      const result = await generateRaw({
        ordered_prompts,
        should_silence: true,
        should_stream: true,  // 流式保持连接活跃，防止反代 524 超时
        custom_api: customApi,
      } as any);
      return result;
    } finally {
      eventRemoveListener(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, streamHandler);
    }
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

/** 单个补丁操作 */
export type PatchOp =
  | { find: string; replace: string }
  | { type: 'append'; content: string };

export interface UpdateInstruction {
  entryName: string;
  /** 操作类型：update=补丁更新已有条目, create=创建新条目 */
  type: 'update' | 'create';
  /** update 模式下的变更补丁 */
  patches?: PatchOp[];
  /** create 模式下的完整内容 */
  content?: string;
  reason: string;
  think?: string;
  /** 条目 uid（AI 返回时可能包含，用于精确定位） */
  entryUid?: number;
}

export interface AnalysisResult {
  updates: UpdateInstruction[];
  rawResponse: string;
  think?: string;
}

const SAFE_UPDATE_PROMPT_ITEMS: PromptItem[] = [
  {
    id: 'builtin_safe_update_sys',
    role: 'system',
    name: '系统规则',
    enabled: true,
    content: `<role>你是 Lorevnter 的世界书更新引擎，负责基于聊天正文中的证据提出精确、可执行的条目更新。</role>

<constraints>
{{lore_constraints}}
</constraints>

<constraint_priority>
{{lore_constraint_policy}}
</constraint_priority>

<decision_rules>
1. 约束规则拥有最高优先级——当约束要求记录能力值、数据、关系等信息时，必须执行，即使默认规则建议跳过。
2. 有约束的条目：严格按约束指令更新，约束说"自由扩展"就自由扩展，约束说"记录数值"就记录数值。
3. 无约束的条目：仅在出现明确新事实、状态变化、关系变化，或能将模糊表述精确化时，才更新。
4. 如果证据不足或只是措辞差异，不更新（此规则不适用于有约束的条目——约束已明确指定更新策略）。
5. 优先更新已有条目；只有当稳定新概念无法合理归入任何已有条目时，才创建新条目。
6. 使用 patches（find/replace）精确修改变化部分，不要复述未变化内容。
7. 保持原条目的格式、结构和文风。
</decision_rules>

<output_rules>
1. 只能输出 JSON 对象，不要输出解释、前言、代码块或思考过程。
2. 更新已有条目用 type="update" + patches 数组（find/replace 或 append）。
3. 新建条目用 type="create" + content。
4. patches.find 必须是条目原文中的精确片段。
5. 更新已有条目时必须填写 entryUid。
6. 更新用户人设时 entryName 必须是 "__persona__"，entryUid 必须是 -1。
7. 没有需要更新的条目时，返回 {"updates":[] }。
</output_rules>`,
  },
  {
    id: 'builtin_safe_update_task',
    role: 'user',
    name: '安全任务说明',
    enabled: true,
    content: `<task>
请检查聊天上下文、世界书条目、约束规则和用户人设，输出需要更新的项目。

重点要求：
- 只根据当前输入中的证据判断，不要脑补。
- 如果更新无法安全定位到唯一目标，就不要输出它。
- 如果新内容和旧内容没有实质差异，不要输出它。
- 如果没有必要更新，直接返回 {"updates":[] }。
</task>

<output_format>
{
  "updates": [
    {
      "entryName": "条目名",
      "entryUid": 123,
      "type": "update",
      "patches": [
        { "find": "旧片段原文", "replace": "新片段" },
        { "type": "append", "content": "追加的新信息" }
      ],
      "reason": "理由"
    },
    {
      "entryName": "新条目名",
      "type": "create",
      "content": "完整内容",
      "reason": "理由"
    }
  ]
}
</output_format>`,
  },
];

function injectBeforeClosingTag(content: string, tagName: string, addition: string): string {
  const closingTag = `</${tagName}>`;
  if (!content.includes(closingTag)) return content;
  return content.replace(closingTag, `${addition}\n${closingTag}`);
}

SAFE_UPDATE_PROMPT_ITEMS[0].content = injectBeforeClosingTag(
  SAFE_UPDATE_PROMPT_ITEMS[0].content,
  'decision_rules',
  `8. 多线剧情时，只更新与当前正文直接对应的那条线；不要把一条线的事实覆盖到另一条线。
9. 用户 persona 只记录用户自身的稳定设定、长期偏好、长期关系倾向；普通剧情推进、他人状态变化、世界设定变化，不应写入 persona。
10. 如果某条世界书条目已经能承载该事实，应优先更新世界书条目，而不是改写 persona。`,
);

SAFE_UPDATE_PROMPT_ITEMS[1].content = injectBeforeClosingTag(
  SAFE_UPDATE_PROMPT_ITEMS[1].content,
  'task',
  `- 如果正文明确提到某个角色、组织、地点或设定变化，就优先检查对应世界书条目，而不是优先修改 persona。
- 如果只是用户写作指导被正文转述，仍以正文最终呈现的事实为准。`,
);

const PROMPT_ITEM_BLOCKLIST = new Set([
  'builtin_update_sys', // 被 SAFE[0] 替代（含 decision_rules）
  // builtin_update_task 和 builtin_update_ast 恢复（CoT 思考链）
]);

const RawPatchSchema = z.union([
  z.object({ find: z.string(), replace: z.string() }),
  z.object({ type: z.literal('append'), content: z.string() }),
]);

const RawUpdateSchema = z.object({
  entryName: z.union([z.string(), z.number()]).optional(),
  name: z.union([z.string(), z.number()]).optional(),
  type: z.enum(['update', 'create']).optional(),
  patches: z.array(RawPatchSchema).optional(),
  // 兼容旧格式 + create 模式
  newContent: z.union([z.string(), z.number()]).optional(),
  content: z.union([z.string(), z.number()]).optional(),
  reason: z.union([z.string(), z.number()]).optional(),
  think: z.union([z.string(), z.number()]).optional(),
  entryUid: z.union([z.number(), z.string()]).optional(),
});

const RawResponseSchema = z.object({
  think: z.union([z.string(), z.number()]).optional(),
  updates: z.array(RawUpdateSchema).default([]),
});

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
  // 组装顺序：SAFE[0](系统规则) → 用户数据块+CoT指令+CoT锚定
  // SAFE[0] 替代原 builtin_update_sys，包含 decision_rules 防止过度修改
  // CoT 思考链（builtin_update_task + builtin_update_ast）恢复，确保 AI 逐条分析
  const normalizedSource = [
    SAFE_UPDATE_PROMPT_ITEMS[0],
    ...source.filter(p => !PROMPT_ITEM_BLOCKLIST.has(p.id)),
  ];

  const result = normalizedSource
    .map(p => ({
      role: p.role,
      content: (() => {
        let content = resolveMacros(resolveLoreMacros(p.content, loreMacros), allEntries);
        if (p.id === 'builtin_safe_update_sys' && !useSettingsStore().settings.lore_ai_disable_thinking) {
          content += '\n<visible_think_policy>你可以返回 top-level think 和每条 update 的 think，但必须是可展示的简短分析摘要，不要长篇隐式推理。</visible_think_policy>';
        }
        return content;
      })(),
    } as RolePrompt))
    // 过滤掉宏解析后内容为空的提示词块（如人设关闭时 <user_persona></user_persona>）
    .filter(p => p.content.replace(/<[^>]+>\s*<\/[^>]+>/g, '').trim().length > 0);

  // ── Prefill 欺骗：卡掉原生 CoT ──
  // 在最后一条 assistant 消息前注入已关闭的 <think> 块，
  // 让模型认为原生思考阶段已完成，直接跳到输出。
  // 这是通用方案，不依赖 API 参数，对任何模型/代理都有效。
  if (useSettingsStore().settings.lore_ai_disable_thinking) {
    try {
      const thinkPrefill = '<think>\n我已完成对世界书条目的分析。\n</think>\n';
      // 兼容写法：手动找最后一条 assistant 消息
      let lastAstIdx = -1;
      for (let i = result.length - 1; i >= 0; i--) {
        if (result[i].role === 'assistant') { lastAstIdx = i; break; }
      }
      if (lastAstIdx >= 0) {
        result[lastAstIdx].content = thinkPrefill + result[lastAstIdx].content;
      } else {
        result.push({ role: 'assistant', content: thinkPrefill + '{' });
      }
      logger.debug('已注入 think prefill 欺骗');
    } catch (e) {
      logger.warn(`Prefill 注入失败: ${(e as Error).message}，跳过`);
    }
  }

  return result;
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

  // 构建人设宏（含约束）
  let personaMacroValue = '';
  if (settings.lore_include_persona) {
    const persona = getUserPersona();
    if (persona) {
      let personaBlock = persona;
      // 附加人设约束（如有）
      if (settings.lore_persona_constraint_id) {
        const pc = getConstraintById(settings.lore_persona_constraint_id);
        const currentCharacterScopeKey = useContextStore().context.characterScopeKey ?? '';
        const scopeMatches = pc?.scope !== 'local'
          || !settings.lore_persona_constraint_character_id
          || settings.lore_persona_constraint_character_id === currentCharacterScopeKey;
        if (pc && pc.enabled && pc.instruction && scopeMatches) {
          personaBlock += `\n<persona_constraint name="${pc.name}">\n${pc.instruction}\n</persona_constraint>`;
        }
      }
      personaMacroValue = personaBlock;
      logger.debug('人设宏已注入');
    }
  }

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
    // 人设宏
    lore_user_persona: personaMacroValue,
  };

  // Step 3: 构建消息序列（宏在 buildUpdatePrompts 内替换）
  // 只传命中条目（不是全部条目），保证 resolveMacros 也只处理命中条目
  void loreMacros;
  const ordered_prompts = buildUpdatePrompts(
    request.entries.map(ae => ae.entry),
    buildLoreMacros(request),
  );

  toastr.info('AI 正在分析...', 'Lorevnter');

  // 检测 assistant 预填充前缀（CoT 锚定）
  extractAssistantPrefill(ordered_prompts);

  try {
    const rawResponse = await callApi({ ordered_prompts });

    logger.debug('AI 原始响应', rawResponse);

    // ── 关键：检测 API 错误标记 ──
    // generateRaw 在 API 失败时返回错误字符串（不是 throw），必须主动检测并抛出异常
    if (!rawResponse || !rawResponse.trim()) {
      throw new Error('API 返回空响应');
    }
    const trimmedResponse = rawResponse.trim();
    const apiErrorPatterns = ['[API Error]', '[Error]', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
    for (const pattern of apiErrorPatterns) {
      if (trimmedResponse.includes(pattern)) {
        throw new Error(`API 返回错误: ${trimmedResponse.slice(0, 200)}`);
      }
    }
    // 检测 HTTP 错误状态码（status 4xx/5xx）
    const httpMatch = trimmedResponse.match(/\bstatus\s+(\d{3})\b/i);
    if (httpMatch) {
      const code = parseInt(httpMatch[1], 10);
      if (code >= 400) {
        throw new Error(`API HTTP ${code}: ${trimmedResponse.slice(0, 200)}`);
      }
    }

    concatPrefill('', rawResponse);
    const result = parseAiResponse(rawResponse, request);
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
function parseAiResponse(raw: string, request: AnalysisRequest): AnalysisResult {
  const extractUpdates = (_parsed?: any): UpdateInstruction[] => parseCandidateUpdates(raw);

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
    return { updates: sanitizeAnalysisResult(request, extractUpdates(parsed)), rawResponse: raw, think: parsePublicThink(raw) };
  } catch { /* continue */ }

  // 2. markdown 代码块
  try {
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return { updates: sanitizeAnalysisResult(request, extractUpdates(parsed)), rawResponse: raw, think: parsePublicThink(raw) };
    }
  } catch { /* continue */ }

  // 3. 正则提取 JSON 对象
  try {
    const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return { updates: sanitizeAnalysisResult(request, extractUpdates(parsed)), rawResponse: raw, think: parsePublicThink(raw) };
    }
  } catch { /* continue */ }
  // 4. 最终回退：宽松匹配
  try {
    const looseMatch = cleaned.match(/\{[\s\S]*"updates"[\s\S]*\}/);
    if (looseMatch) {
      const parsed = JSON.parse(looseMatch[0]);
      return { updates: sanitizeAnalysisResult(request, extractUpdates(parsed)), rawResponse: raw, think: parsePublicThink(raw) };
    }
  } catch { /* continue */ }

  logger.error('所有解析尝试均失败');
  toastr.error('AI 返回格式无法解析', 'Lorevnter');
  return { updates: [], rawResponse: raw, think: parsePublicThink(raw) };
}



// ── 提示词预览（纯组装，不调用 API） ──

/** 组装一次调用模式的 prompt（用于调试预览） */
export function buildOnePassPrompts(request: AnalysisRequest): RolePrompt[] {
  const { settings } = useSettingsStore();
  const worldbookText = formatWorldbookEntries(request.entries, request.allEntries);
  const contextText = formatChatContext(request.chatMessages);

  // 构建人设宏（与 analyzeOnePass 保持一致）
  let personaMacroValue = '';
  if (settings.lore_include_persona) {
    const persona = getUserPersona();
    if (persona) {
      let personaBlock = persona;
      if (settings.lore_persona_constraint_id) {
        const pc = getConstraintById(settings.lore_persona_constraint_id);
        const currentCharacterScopeKey = useContextStore().context.characterScopeKey ?? '';
        const scopeMatches = pc?.scope !== 'local'
          || !settings.lore_persona_constraint_character_id
          || settings.lore_persona_constraint_character_id === currentCharacterScopeKey;
        if (pc && pc.enabled && pc.instruction && scopeMatches) {
          personaBlock += `\n<persona_constraint name="${pc.name}">\n${pc.instruction}\n</persona_constraint>`;
        }
      }
      personaMacroValue = personaBlock;
    }
  }

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
    // 人设宏
    lore_user_persona: personaMacroValue,
  };

  void loreMacros;
  return buildUpdatePrompts(request.allEntries, buildLoreMacros(request));
}
