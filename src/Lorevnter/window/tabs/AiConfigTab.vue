<template>
  <div class="ai-config-tab">
    <!-- AI 分析行为 -->
    <div class="st-group">
      <div class="st-group-title">分析行为</div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">触发方式</span>
          <select v-model="settings.lore_scan_trigger" class="st-select">
            <option value="manual">手动触发</option>
            <option value="auto">自动触发</option>
          </select>
        </div>
        <span class="st-hint">{{ settings.lore_scan_trigger === 'auto' ? '每隔设定的 AI 回复楼层数自动运行分析' : '仅在点击「AI 分析」按钮时运行' }}</span>
      </div>

      <!-- 自动模式下显示触发楼层 + 跳过零层 -->
      <div v-if="settings.lore_scan_trigger === 'auto'" class="st-row">
        <div class="st-row-main">
          <span class="st-label">触发楼层</span>
          <input type="number" v-model.number="settings.lore_scan_interval" class="st-number" min="1" max="99" />
        </div>
        <span class="st-hint">每隔 {{ settings.lore_scan_interval }} 次 AI 回复触发一次分析（仅计 AI 回复楼层）</span>
      </div>

      <label v-if="settings.lore_scan_trigger === 'auto'" class="st-row">
        <div class="st-row-main">
          <span class="st-label">跳过零层</span>
          <input type="checkbox" v-model="settings.lore_skip_greeting" class="ios-toggle" />
        </div>
        <span class="st-hint">开启后首条 AI 回复（开场白）不计入自动触发楼层计数</span>
      </label>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">上下文消息数</span>
          <input type="number" v-model.number="settings.lore_ai_max_context" class="st-number" min="1" max="50" />
        </div>
        <span class="st-hint">发送给 AI 的最近聊天消息条数</span>
      </div>

      <!-- 系统提示词（原生弹窗编辑） -->
      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">提示词</span>
          <button class="st-btn st-btn-sm" @click="onOpenPromptEditor">
            编辑提示词 ({{ settings.lore_active_prompt_preset || 'default' }})
          </button>
        </div>
        <span class="st-hint">当前预设：{{ settings.lore_active_prompt_preset || 'default' }}</span>
      </div>
    </div>

    <!-- 正文提取规则 -->
    <div class="st-group">
      <div class="st-group-title">正文提取</div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">包含标签</span>
        </div>
        <input v-model="settings.lore_context_include_tag" type="text" class="st-input" placeholder="留空 = 提取全文（如: content）" />
        <span class="st-hint">只提取此 XML 标签内的内容。如填 content → 只取 &lt;content&gt;...&lt;/content&gt;</span>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">排除标签</span>
        </div>
        <input v-model="settings.lore_context_exclude_tags" type="text" class="st-input" placeholder="逗号分隔（如: think,tucao）或 * 排除全部" />
        <span class="st-hint">排除这些标签内的内容。* = 排除所有标签，只保留裸文本</span>
      </div>

      <div class="st-row">
        <button class="st-btn st-btn-test" @click="onPreviewExtraction">
          👁 预览提取效果
        </button>
        <span v-if="extractionPreview" class="st-hint">
          原文 {{ extractionPreview.originalLen }} 字 → 提取后 {{ extractionPreview.extractedLen }} 字
        </span>
      </div>
    </div>

    <!-- 功能开关 -->
    <div class="st-group">
      <div class="st-group-title">功能开关</div>

      <label class="st-row" v-if="!settings.lore_debug_mode">
        <div class="st-row-main">
          <span class="st-label">修改审核</span>
          <input type="checkbox" v-model="settings.lore_review_enabled" class="ios-toggle" />
        </div>
        <span class="st-hint">AI 分析完成后弹出审核弹窗，逐条确认修改（调试模式下强制开启）</span>
      </label>
      <label class="st-row" v-if="settings.lore_debug_mode">
        <div class="st-row-main">
          <span class="st-label">修改审核</span>
          <input type="checkbox" checked disabled class="ios-toggle" />
        </div>
        <span class="st-hint">🔍 调试模式下审核强制开启</span>
      </label>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">附加用户人设</span>
          <input type="checkbox" v-model="settings.lore_include_persona" class="ios-toggle" />
        </div>
        <span class="st-hint">在 AI 提示词中附加 &lt;user_persona&gt; 标签包裹的用户人设</span>
      </label>
    </div>

    <!-- 新增条目配置 -->
    <div class="st-group">
      <div class="st-group-title">新增条目</div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">起始排序号</span>
          <input type="number" v-model.number="settings.lore_new_entry_start_order" class="st-number" min="0" max="9999" />
        </div>
        <span class="st-hint">新增条目的 order 起始值（0 = 自动: 最大 order + 10）</span>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">默认世界书</span>
          <button class="debug-action-btn" @click="refreshNewEntryWorldbooks" title="刷新列表">🔄</button>
        </div>
        <select v-model="settings.lore_new_entry_default_worldbook" class="st-select st-select-full">
          <option value="">审核时手动选择</option>
          <option v-for="wb in newEntryWorldbooks" :key="wb" :value="wb">{{ wb }}</option>
        </select>
        <span class="st-hint">新增条目默认写入的世界书（选择「审核时手动选择」则在弹窗中选）</span>
      </div>
    </div>

    <!-- 缓存配置 -->
    <div class="st-group">
      <div class="st-group-title">缓存管理</div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">清空时机</span>
          <select v-model="settings.lore_cache_clear_mode" class="st-select">
            <option value="after_analysis">分析完成后自动清空</option>
            <option value="manual">手动清空</option>
          </select>
        </div>
        <span class="st-hint">条目缓存通过 AI 生成时自动收集，此处设置何时清空</span>
      </div>

      <div v-if="settings.lore_cache_clear_mode === 'manual'" class="st-row">
        <div class="st-row-main">
          <span class="st-label">缓存上限</span>
          <input type="number" v-model.number="settings.lore_cache_max_size" class="st-number" min="0" max="999" />
        </div>
        <span class="st-hint">0 = 无上限。超出上限时自动淘汰最早的条目</span>
      </div>
    </div>

    <!-- 采样参数 -->
    <div class="st-group">
      <div class="st-group-title">采样参数</div>
      <!-- 采样参数（折叠 + 总开关） -->
      <div class="st-collapsible">
        <div class="st-collapsible-header" @click="showSamplingParams = !showSamplingParams">
          <span class="st-collapsible-icon">{{ showSamplingParams ? '▼' : '▶' }}</span>
          <span class="st-label">参数设置</span>
          <span class="st-collapsible-status">{{ isAllSameAsPreset ? '跟随预设' : '自定义' }}</span>
        </div>
        <div v-if="showSamplingParams" class="st-collapsible-body">
          <div class="st-row">
            <div class="st-row-main">
              <span class="st-label">全部跟随预设</span>
              <input type="checkbox" class="ios-toggle" :checked="isAllSameAsPreset" @change="onToggleAllPreset" />
            </div>
            <span class="st-hint">开启后所有参数使用酒馆当前预设的值</span>
          </div>

          <template v-if="!isAllSameAsPreset">
            <div class="st-param-grid">
              <div class="st-param-item" v-for="param in samplingParams" :key="param.key">
                <label class="st-param-label">
                  <span>{{ param.label }}</span>
                </label>
                <input
                  type="number"
                  :value="settings[param.key] === 'same_as_preset' ? param.default : settings[param.key]"
                  @input="settings[param.key] = Number(($event.target as HTMLInputElement).value)"
                  class="st-number st-number-wide"
                  :min="param.min"
                  :max="param.max"
                  :step="param.step"
                />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- API 连接 -->
    <div class="st-group">
      <div class="st-group-title">API 连接</div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">API 格式</span>
          <select v-model="settings.lore_api_format" class="st-select">
            <option value="openai">OpenAI 格式</option>
          </select>
        </div>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">连接方式</span>
          <select v-model="settings.lore_api_source" class="st-select" @change="onSourceChange">
            <option value="tavern">与酒馆相同（独立发送）</option>
            <option value="custom">自定义</option>
          </select>
        </div>
        <span class="st-hint">{{ settings.lore_api_source === 'tavern' ? '读取酒馆当前 API 配置（地址、密钥），独立发送请求，不影响聊天流程' : '使用自定义 API 端点' }}</span>
      </div>

      <!-- 自定义 API 字段 -->
      <template v-if="settings.lore_api_source === 'custom'">
        <div class="st-row">
          <div class="st-row-main">
            <span class="st-label">API 地址</span>
          </div>
          <input v-model="settings.lore_api_base_url" type="text" class="st-input" placeholder="https://api.openai.com" />
        </div>

        <div class="st-row">
          <div class="st-row-main">
            <span class="st-label">API 密钥</span>
          </div>
          <input v-model="settings.lore_api_key" type="password" class="st-input" placeholder="sk-..." autocomplete="new-password" />
        </div>
      </template>

      <!-- 模型选择 -->
      <div class="st-row st-row-col">
        <div class="st-row-main">
          <span class="st-label">模型</span>
          <button
            v-if="settings.lore_api_source === 'custom'"
            class="st-btn"
            :disabled="modelLoading || !settings.lore_api_base_url"
            @click="onFetchModels"
          >
            {{ modelLoading ? '⏳ 获取中...' : '📋 获取模型' }}
          </button>
        </div>

        <template v-if="settings.lore_api_source === 'tavern'">
          <span class="st-hint">当前酒馆模型: {{ tavernModel || '未知' }}</span>
          <input
            v-model="settings.lore_api_model"
            type="text"
            class="st-input"
            :placeholder="tavernModel ? `留空使用 ${tavernModel}` : '输入模型名覆盖'"
          />
          <span class="st-hint">留空则使用酒馆当前模型，填写则覆盖</span>
        </template>

        <template v-else>
          <select
            v-if="modelList.length > 0"
            v-model="settings.lore_api_model"
            class="st-select st-select-full"
          >
            <option value="">使用默认</option>
            <option v-for="m in modelList" :key="m" :value="m">{{ m }}</option>
          </select>
          <input
            v-else
            v-model="settings.lore_api_model"
            type="text"
            class="st-input"
            placeholder="手动输入或点击「获取模型」"
          />
        </template>
        <span v-if="modelError" class="st-hint st-hint-err">{{ modelError }}</span>
      </div>

      <!-- 测试连接 -->
      <div class="st-row">
        <button class="st-btn st-btn-test" :disabled="apiTesting" @click="onTestConnection">
          {{ apiTesting ? '⏳ 测试中...' : '🔗 测试连接' }}
        </button>
        <span v-if="apiTestResult" class="st-hint" :class="apiTestResult.ok ? 'st-hint-ok' : 'st-hint-err'">
          {{ apiTestResult.message }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../settings';
import { testApiConnection, fetchModelList, getTavernCurrentModel } from '../../core/ai-engine';
import { openPromptEditor } from '../../core/prompt-editor';
import { previewExtraction } from '../../core/context-extractor';
import { getAvailableWorldbooks } from '../../core/test-mode';

const { settings } = useSettingsStore();

// ── 折叠状态 ──
const showSamplingParams = ref(false);

// ── 新增条目世界书列表 ──
const newEntryWorldbooks = ref<string[]>(getAvailableWorldbooks());

function refreshNewEntryWorldbooks() {
  newEntryWorldbooks.value = getAvailableWorldbooks();
}

// ── 提取预览 ──
const extractionPreview = ref<{ originalLen: number; extractedLen: number } | null>(null);

function onPreviewExtraction() {
  const result = previewExtraction(
    settings.lore_context_include_tag,
    settings.lore_context_exclude_tags,
  );
  if (!result) {
    toastr.warning('无聊天消息可预览', 'Lorevnter');
    return;
  }
  extractionPreview.value = {
    originalLen: result.original.length,
    extractedLen: result.extracted.length,
  };

  // 用弹窗展示提取结果
  showExtractionPopup(result.original, result.extracted);
}

/** 弹窗展示提取前后对比 */
function showExtractionPopup(original: string, extracted: string) {
  const doc = (typeof window.parent !== 'undefined' ? window.parent : window).document;
  // 移除已有弹窗
  const existing = doc.getElementById('lore-extract-preview');
  if (existing) existing.remove();
  const existingBg = doc.getElementById('lore-extract-preview-bg');
  if (existingBg) existingBg.remove();

  const overlay = doc.createElement('div');
  overlay.id = 'lore-extract-preview-bg';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:100010;
    background:rgba(0,0,0,0.5);
  `;

  const popup = doc.createElement('div');
  popup.id = 'lore-extract-preview';
  popup.style.cssText = `
    position:fixed;z-index:100011;
    top:50%;left:50%;transform:translate(-50%,-50%);
    background:var(--SmartThemeBlurTintColor,#1e1e2e);
    border:1px solid var(--SmartThemeBorderColor,#333);
    border-radius:12px;
    width:min(90vw,520px);max-height:80vh;display:flex;flex-direction:column;
    box-shadow:0 20px 60px rgba(0,0,0,0.4);overflow:hidden;
    color:var(--SmartThemeBodyColor,#ccc);
    animation:lpe-in .2s ease-out;
  `;

  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--SmartThemeBorderColor,#333);flex-shrink:0">
      <span style="font-weight:600;font-size:15px">📝 提取预览</span>
      <span style="font-size:12px;color:#888">原文 ${original.length} 字 → 提取后 ${extracted.length} 字</span>
      <button id="lore-extract-close" style="padding:6px 14px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:transparent;color:var(--SmartThemeBodyColor,#ccc);cursor:pointer;font-size:13px;min-height:36px;min-width:36px">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:14px 18px;min-height:0">
      <pre style="white-space:pre-wrap;word-break:break-all;font-size:12px;font-family:monospace;color:var(--SmartThemeBodyColor,#ccc);line-height:1.6;margin:0">${escHtml(extracted) || '(提取结果为空)'}</pre>
    </div>
  `;

  function close() {
    popup.remove();
    overlay.remove();
  }

  popup.querySelector('#lore-extract-close')!.addEventListener('click', close);
  overlay.addEventListener('click', close);

  doc.body.appendChild(overlay);
  doc.body.appendChild(popup);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function onOpenPromptEditor() {
  try {
    openPromptEditor();
  } catch (e) {
    console.error('[Lorevnter] 提示词编辑器打开失败:', e);
    toastr.error(`编辑器打开失败: ${(e as Error).message}`, 'Lorevnter');
  }
}

// ── 酒馆模型 ──
const tavernModel = computed(() => getTavernCurrentModel());

// ── 模型列表 ──
const modelList = ref<string[]>([]);
const modelLoading = ref(false);
const modelError = ref('');

async function onFetchModels() {
  modelLoading.value = true;
  modelError.value = '';
  try {
    modelList.value = await fetchModelList();
    if (modelList.value.length === 0) {
      modelError.value = '未获取到可用模型';
    } else {
      toastr.success(`获取到 ${modelList.value.length} 个模型`, 'Lorevnter');
    }
  } catch (e) {
    modelError.value = (e as Error).message;
    toastr.error((e as Error).message, 'Lorevnter');
  } finally {
    modelLoading.value = false;
  }
}

function onSourceChange() {
  modelList.value = [];
  modelError.value = '';
  apiTestResult.value = null;
}

// ── API 测试 ──
const apiTesting = ref(false);
const apiTestResult = ref<{ ok: boolean; message: string } | null>(null);

async function onTestConnection() {
  apiTesting.value = true;
  apiTestResult.value = null;
  try {
    apiTestResult.value = await testApiConnection();
    if (apiTestResult.value.ok) {
      toastr.success(apiTestResult.value.message, 'Lorevnter');
    } else {
      toastr.error(apiTestResult.value.message, 'Lorevnter');
    }
  } catch (e) {
    apiTestResult.value = { ok: false, message: (e as Error).message };
    toastr.error((e as Error).message, 'Lorevnter');
  } finally {
    apiTesting.value = false;
  }
}

// ── 采样参数 ──
type SamplingKey = 'lore_ai_temperature' | 'lore_ai_top_p' | 'lore_ai_max_tokens' | 'lore_ai_frequency_penalty' | 'lore_ai_presence_penalty';

const samplingParams: { key: SamplingKey; label: string; min: number; max: number; step: number; default: number }[] = [
  { key: 'lore_ai_temperature', label: 'Temperature', min: 0, max: 2, step: 0.05, default: 0.7 },
  { key: 'lore_ai_top_p', label: 'Top P', min: 0, max: 1, step: 0.05, default: 0.9 },
  { key: 'lore_ai_max_tokens', label: 'Max Tokens', min: 1, max: 16384, step: 1, default: 2048 },
  { key: 'lore_ai_frequency_penalty', label: '频率惩罚', min: -2, max: 2, step: 0.1, default: 0 },
  { key: 'lore_ai_presence_penalty', label: '存在惩罚', min: -2, max: 2, step: 0.1, default: 0 },
];

const isAllSameAsPreset = computed(() =>
  samplingParams.every(p => (settings as any)[p.key] === 'same_as_preset'),
);

function onToggleAllPreset(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  for (const p of samplingParams) {
    (settings as any)[p.key] = checked ? 'same_as_preset' : p.default;
  }
}
</script>

<style scoped>
.ai-config-tab { display: flex; flex-direction: column; gap: 20px; padding: 4px; }

/* Tab 专有：采样参数 */
.st-param-grid { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.st-param-item {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; border-radius: var(--lore-radius-sm);
  background: var(--lore-bg-primary); border: 1px solid var(--lore-border-light);
}
.st-param-label {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 14px; font-weight: 500; color: var(--lore-text-primary);
}
</style>
