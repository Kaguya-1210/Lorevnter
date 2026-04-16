<template>
  <div class="ai-config-tab">
    <!-- AI 分析行为 -->
    <div class="st-group">
      <div class="st-group-title">分析行为</div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">分析模式</span>
          <select v-model="settings.lore_ai_mode" class="st-select">
            <option value="onepass">一次调用</option>
            <option value="twopass">两次调用</option>
          </select>
        </div>
        <span class="st-hint">{{ settings.lore_ai_mode === 'twopass' ? '先让 AI 筛选需要更新的条目，再针对性生成更新内容' : '一次调用完成筛选和更新，速度更快但精度略低' }}</span>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">触发方式</span>
          <select v-model="settings.lore_scan_trigger" class="st-select">
            <option value="manual">手动触发</option>
            <option value="auto">自动触发</option>
          </select>
        </div>
        <span class="st-hint">{{ settings.lore_scan_trigger === 'auto' ? '每隔设定的 AI 回复轮数自动运行分析' : '仅在点击「AI 分析」按钮时运行' }}</span>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">上下文消息数</span>
          <input type="number" v-model.number="settings.lore_ai_max_context" class="st-number" min="1" max="50" />
        </div>
        <span class="st-hint">发送给 AI 的最近聊天消息条数</span>
      </div>

      <!-- 系统提示词（弹窗编辑） -->
      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">提示词</span>
          <button class="st-btn st-btn-sm" @click="showPromptModal = true">
            编辑提示词 ({{ settings.lore_ai_prompt_list.length || '默认' }})
          </button>
        </div>
        <span class="st-hint">{{ settings.lore_ai_prompt_list.length > 0 ? `已配置 ${settings.lore_ai_prompt_list.filter(p => p.enabled).length} 条启用的提示词` : '使用内置默认提示词，点击编辑可自定义' }}</span>
      </div>

      <PromptEditorModal :visible="showPromptModal" @close="showPromptModal = false" />

      <!-- 采样参数（折叠 + 总开关） -->
      <div class="st-collapsible">
        <div class="st-collapsible-header" @click="showSamplingParams = !showSamplingParams">
          <span class="st-collapsible-icon">{{ showSamplingParams ? '▼' : '▶' }}</span>
          <span class="st-label">采样参数</span>
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
import PromptEditorModal from '../components/PromptEditorModal.vue';

const { settings } = useSettingsStore();

// ── 折叠状态 ──
const showPromptModal = ref(false);
const showSamplingParams = ref(false);

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

.st-group { display: flex; flex-direction: column; }
.st-group-title {
  font-size: 13px; font-weight: 500; color: var(--lore-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; padding-left: 12px;
}

.st-row {
  display: flex; flex-direction: column; justify-content: center;
  padding: 12px 16px; background: var(--lore-bg-secondary);
  border-bottom: 1px solid var(--lore-border-light);
  min-height: 44px; overflow: hidden;
}
.st-row:first-of-type { border-radius: var(--lore-radius-md) var(--lore-radius-md) 0 0; }
.st-row:last-of-type { border-radius: 0 0 var(--lore-radius-md) var(--lore-radius-md); border-bottom: none; }
.st-row:first-of-type:last-of-type { border-radius: var(--lore-radius-md); }

.st-row-main { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px; min-width: 0; }
.st-row-col { align-items: stretch; }
.st-label { font-size: 16px; color: var(--lore-text-primary); flex: 1; min-width: 0; letter-spacing: -0.3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-hint { font-size: 12px; color: var(--lore-text-secondary); margin-top: 4px; line-height: 1.3; }
.st-hint-ok { color: var(--lore-success); }
.st-hint-err { color: var(--lore-danger); }

.st-select {
  padding: 6px 12px; border-radius: var(--lore-radius-sm); border: 1px solid var(--lore-border-light);
  background: var(--lore-bg-tertiary); color: var(--lore-text-primary);
  font-size: 15px; outline: none; appearance: none; -webkit-appearance: none;
  background-image: url('data:image/svg+xml;charset=US-ASCII,<svg width="10" height="6" viewBox="0 0 10 6" fill="gray" xmlns="http://www.w3.org/2000/svg"><path d="M5 6L0 0H10L5 6Z"/></svg>');
  background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px;
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.st-select-full { width: 100%; margin-top: 6px; }

.st-number {
  width: 70px; padding: 6px 10px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-tertiary);
  color: var(--lore-text-primary); font-size: 15px; outline: none; text-align: right;
  -moz-appearance: textfield;
}
.st-number::-webkit-inner-spin-button,
.st-number::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.st-number:focus { border-color: var(--lore-accent); }
.st-number-wide { width: 100%; }

.st-btn {
  padding: 8px 14px; border-radius: var(--lore-radius-sm); border: none;
  background: var(--lore-bg-tertiary); color: var(--lore-accent);
  font-size: 14px; font-weight: 500; cursor: pointer; transition: all .15s;
}
.st-btn:hover:not(:disabled) { background: var(--lore-accent-bg); }
.st-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.st-btn-sm { padding: 6px 12px; font-size: 12px; margin-top: 6px; }
.st-btn-danger { color: var(--lore-danger); }
.st-btn-danger:hover:not(:disabled) { background: var(--lore-danger-bg); }

.st-btn-test {
  width: 100%; padding: 10px; text-align: center;
  background: var(--lore-accent-bg); color: var(--lore-accent); font-weight: 600;
}
.st-btn-test:active:not(:disabled) { transform: scale(0.98); }

.st-input {
  width: 100%; padding: 10px 12px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-primary);
  color: var(--lore-text-primary); font-size: 15px; outline: none;
  transition: border-color 0.2s; margin-top: 6px;
}
.st-input:focus { border-color: var(--lore-accent); }
.st-input::placeholder { color: var(--lore-text-tertiary); }

/* 折叠 */
.st-collapsible {
  background: var(--lore-bg-secondary); border-radius: var(--lore-radius-md);
  overflow: hidden; margin-top: 2px;
}
.st-collapsible-header {
  display: flex; align-items: center; gap: 8px; padding: 12px 14px;
  cursor: pointer; transition: background .15s; min-height: 44px;
}
.st-collapsible-header:hover { background: var(--lore-bg-tertiary); }
.st-collapsible-icon { font-size: 10px; color: var(--lore-text-tertiary); flex-shrink: 0; width: 12px; }
.st-collapsible-status { margin-left: auto; font-size: 12px; color: var(--lore-text-tertiary); font-weight: 400; }
.st-collapsible-body { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 8px; }

/* Textarea */
.st-textarea {
  width: 100%; padding: 10px 12px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-primary);
  color: var(--lore-text-primary); font-size: 13px; font-family: monospace;
  outline: none; resize: vertical; transition: border-color 0.2s;
  margin-top: 6px; line-height: 1.5; min-height: 80px;
}
.st-textarea:focus { border-color: var(--lore-accent); }
.st-textarea::placeholder { color: var(--lore-text-tertiary); }

/* 采样参数 */
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
