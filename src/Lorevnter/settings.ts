// ============================================================
// Lorevnter - 设置管理 (pinia + zod)
// 包含预设系统：快照业务数据，排除设置项
// ============================================================

import { createLogger } from './logger';

const logger = createLogger('settings');

// ── 约束 Schema ──
const LoreConstraintSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['prompt', 'skip']),
  instruction: z.string().default(''),
  enabled: z.boolean().default(true),
});
export type LoreConstraint = z.infer<typeof LoreConstraintSchema>;

// ── 提示词条目 Schema ──
const PromptItemSchema = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  enabled: z.boolean().default(true),
  name: z.string().default(''),
});
export type PromptItem = z.infer<typeof PromptItemSchema>;

// ── 提示词预设 Schema（独立于全局预设） ──
const PromptPresetSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  createdAt: z.string(),
  items: z.array(PromptItemSchema),
});
export type PromptPreset = z.infer<typeof PromptPresetSchema>;

// ── 预设业务数据子集 ──
// 预设只快照这些字段，不包含主题/调试/开关等设置项
const PresetDataSchema = z.object({
  lore_target_worldbooks: z.array(z.string()).default([]),
  lore_scan_interval: z.number().default(1),
  lore_constraints: z.array(LoreConstraintSchema).default([]),
  // AI 行为配置（不包含敏感的 API 密钥和地址）
  lore_ai_mode: z.enum(['onepass', 'twopass']).default('onepass'),
  lore_ai_system_prompt: z.string().default(''),
  lore_ai_max_context: z.number().default(10),
  lore_scan_trigger: z.enum(['auto', 'manual']).default('manual'),
  lore_api_format: z.enum(['openai']).default('openai'),
  lore_api_model: z.string().default(''),
});
export type PresetData = z.infer<typeof PresetDataSchema>;

// ── 预设 Schema ──
const PresetSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  createdAt: z.string(),
  data: PresetDataSchema,
});
export type Preset = z.infer<typeof PresetSchema>;

// ── 完整设置 Schema ──
const LorevnterSettings = z
  .object({
    // ── 设置项（不纳入预设） ──
    lore_plugin_enabled: z.boolean().default(true),
    lore_debug_mode: z.boolean().default(false),
    lore_theme: z.enum(['dark', 'light', 'auto']).default('auto'),

    // ── 业务数据（纳入预设快照） ──
    /** 目标世界书名称列表 */
    lore_target_worldbooks: z.array(z.string()).default([]),
    /** 扫描间隔（轮） */
    lore_scan_interval: z.number().default(1),
    /** 约束列表 */
    lore_constraints: z.array(LoreConstraintSchema).default([]),

    // ── AI 配置（不纳入预设） ──
    /** AI 分析模式 */
    lore_ai_mode: z.enum(['onepass', 'twopass']).default('onepass'),
    /** AI 系统提示词模板（旧字段，兼容回退） */
    lore_ai_system_prompt: z.string().default(''),
    /** AI 提示词列表（新，优先使用） */
    lore_ai_prompt_list: z.array(PromptItemSchema).default([]),
    /** AI 最大上下文消息数 */
    lore_ai_max_context: z.number().default(10),
    /** 触发模式 */
    lore_scan_trigger: z.enum(['auto', 'manual']).default('manual'),

    // ── AI 采样参数 ──
    /** 温度（创造性）。same_as_preset = 跟随酒馆预设 */
    lore_ai_temperature: z.union([z.literal('same_as_preset'), z.number()]).default('same_as_preset'),
    /** Top P（核采样） */
    lore_ai_top_p: z.union([z.literal('same_as_preset'), z.number()]).default('same_as_preset'),
    /** 最大回复 tokens */
    lore_ai_max_tokens: z.union([z.literal('same_as_preset'), z.number()]).default('same_as_preset'),
    /** 频率惩罚 */
    lore_ai_frequency_penalty: z.union([z.literal('same_as_preset'), z.number()]).default('same_as_preset'),
    /** 存在惩罚 */
    lore_ai_presence_penalty: z.union([z.literal('same_as_preset'), z.number()]).default('same_as_preset'),

    // ── AI API 连接配置（不纳入预设） ──
    /** API 格式（当前仅 OpenAI 兼容） */
    lore_api_format: z.enum(['openai']).default('openai'),
    /** API 来源: tavern=复用酒馆连接, custom=自定义端点 */
    lore_api_source: z.enum(['tavern', 'custom']).default('tavern'),
    /** 自定义 API Base URL（仅 source=custom 时生效） */
    lore_api_base_url: z.string().default(''),
    /** 自定义 API Key（仅 source=custom 时生效） */
    lore_api_key: z.string().default(''),
    /** 模型名称（两种模式共用，tavern 模式下覆盖酒馆默认模型） */
    lore_api_model: z.string().default(''),

    // ── 预设列表 ──
    lore_presets: z.array(PresetSchema).default([]),
    /** 提示词预设（独立于全局预设） */
    lore_prompt_presets: z.array(PromptPresetSchema).default([]),
  })
  .prefault({});

export type LorevnterSettingsType = z.infer<typeof LorevnterSettings>;

/** 从完整设置中提取业务数据子集（用于预设快照） */
function extractPresetData(settings: LorevnterSettingsType): PresetData {
  return {
    lore_target_worldbooks: settings.lore_target_worldbooks,
    lore_scan_interval: settings.lore_scan_interval,
    lore_constraints: settings.lore_constraints,
    lore_ai_mode: settings.lore_ai_mode,
    lore_ai_system_prompt: settings.lore_ai_system_prompt,
    lore_ai_max_context: settings.lore_ai_max_context,
    lore_scan_trigger: settings.lore_scan_trigger,
    lore_api_format: settings.lore_api_format,
    lore_api_model: settings.lore_api_model,
    // 注意：严格排除 lore_api_key 和 lore_api_base_url
  };
}

/** 将预设数据应用到设置（只覆盖业务字段） */
function applyPresetData(settings: LorevnterSettingsType, data: PresetData): void {
  settings.lore_target_worldbooks = data.lore_target_worldbooks;
  settings.lore_scan_interval = data.lore_scan_interval;
  settings.lore_constraints = data.lore_constraints;
  settings.lore_ai_mode = data.lore_ai_mode;
  settings.lore_ai_system_prompt = data.lore_ai_system_prompt;
  settings.lore_ai_max_context = data.lore_ai_max_context;
  settings.lore_scan_trigger = data.lore_scan_trigger;
  settings.lore_api_format = data.lore_api_format;
  settings.lore_api_model = data.lore_api_model;
  // 注意：不覆盖 lore_api_key 和 lore_api_base_url
}

/** 设置 Store */
export const useSettingsStore = defineStore('lorevnter-settings', () => {
  const settings = ref(LorevnterSettings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  // 自动同步回酒馆变量（debounce 500ms）
  let _syncTimer: ReturnType<typeof setTimeout> | null = null;
  watchEffect(() => {
    const snapshot = klona(settings.value);
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
      insertOrAssignVariables(snapshot, { type: 'script', script_id: getScriptId() });
    }, 500);
  });

  // ── 预设操作 ──

  /** 保存当前业务数据为预设 */
  function savePreset(name: string, description = '') {
    const preset: Preset = {
      name,
      description,
      createdAt: new Date().toISOString(),
      data: extractPresetData(settings.value),
    };
    settings.value.lore_presets.push(preset);
    logger.info(`预设已保存: ${name}`);
  }

  /** 应用预设（只覆盖业务字段，不影响设置项） */
  function applyPreset(index: number) {
    const preset = settings.value.lore_presets[index];
    if (!preset) {
      logger.warn(`预设索引越界: ${index}`);
      return;
    }
    applyPresetData(settings.value, preset.data);
    logger.info(`预设已应用: ${preset.name}`);
  }

  /** 删除预设 */
  function deletePreset(index: number) {
    const preset = settings.value.lore_presets[index];
    if (!preset) return;
    const name = preset.name;
    settings.value.lore_presets.splice(index, 1);
    logger.info(`预设已删除: ${name}`);
  }

  /** 导出预设为 JSON 字符串 */
  function exportPreset(index: number): string | null {
    const preset = settings.value.lore_presets[index];
    if (!preset) return null;
    logger.info(`预设已导出: ${preset.name}`);
    return JSON.stringify(preset, null, 2);
  }

  /** 导入预设（带 Zod 校验） */
  function importPreset(jsonString: string): boolean {
    try {
      const raw = JSON.parse(jsonString);
      const preset = PresetSchema.parse(raw);
      settings.value.lore_presets.push(preset);
      logger.info(`预设已导入: ${preset.name}`);
      return true;
    } catch (e) {
      logger.error('预设导入失败: ' + (e as Error).message);
      return false;
    }
  }

  return {
    settings,
    savePreset,
    applyPreset,
    deletePreset,
    exportPreset,
    importPreset,
  };
});
