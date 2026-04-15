<template>
  <div class="settings-tab">
    <!-- ═══════════ 插件设置 ═══════════ -->
    <div class="st-group">
      <div class="st-group-title">插件设置</div>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">插件启用</span>
          <input type="checkbox" v-model="settings.lore_plugin_enabled" class="ios-toggle" />
        </div>
      </label>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">调试模式</span>
          <input type="checkbox" v-model="settings.lore_debug_mode" class="ios-toggle" />
        </div>
        <span class="st-hint">开启后显示调试标签页，输出详细日志</span>
      </label>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">主题</span>
          <select v-model="settings.lore_theme" class="st-select">
            <option value="auto">跟随系统</option>
            <option value="dark">暗色</option>
            <option value="light">亮色</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 世界书管理 -->
    <div class="st-group">
      <div class="st-group-title">世界书管理</div>

      <!-- 角色卡绑定状态 -->
      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">角色卡世界书</span>
          <span v-if="characterWorldbook" class="st-status st-status-on">{{ characterWorldbook }}</span>
          <span v-else class="st-status st-status-off">未绑定</span>
        </div>
        <span class="st-hint">当前角色卡默认绑定的世界书（自动纳入 AI 分析）</span>
      </div>

      <div class="st-row st-row-col">
        <span class="st-label">额外管理的世界书</span>
        <span class="st-hint">除角色卡世界书外，额外指定 AI 分析与约束管理的世界书</span>
        <div class="st-wb-list">
          <div v-for="(name, i) in settings.lore_target_worldbooks" :key="i" class="st-wb-item">
            <span class="st-wb-name" :title="name">{{ name }}</span>
            <button class="st-wb-remove" @click="removeWorldbook(i)">✕</button>
          </div>
          <div v-if="settings.lore_target_worldbooks.length === 0" class="st-empty">未添加额外世界书</div>
        </div>
        <div class="st-wb-add">
          <select v-model="selectedWb" class="st-select st-select-flex">
            <option value="">选择世界书...</option>
            <option v-for="name in availableWorldbooks" :key="name" :value="name">{{ name }}</option>
          </select>
          <button class="st-btn" :disabled="!selectedWb" @click="addWorldbook">+ 添加</button>
        </div>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">扫描间隔</span>
          <input type="number" v-model.number="settings.lore_scan_interval" class="st-number" min="1" max="99" />
        </div>
        <span class="st-hint">自动模式下每 N 轮消息触发一次分析</span>
      </div>
    </div>

    <!-- ═══════════ AI 设置 ═══════════ -->
    <div class="st-group">
      <div class="st-group-title">AI 分析</div>

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
        <span class="st-hint">{{ settings.lore_scan_trigger === 'auto' ? '每隔设定轮数自动运行 AI 分析' : '仅在点击「AI 分析」按钮时运行' }}</span>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">上下文消息数</span>
          <input type="number" v-model.number="settings.lore_ai_max_context" class="st-number" min="1" max="50" />
        </div>
        <span class="st-hint">发送给 AI 的最近聊天消息条数</span>
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
            <option value="tavern">与酒馆插头相同</option>
            <option value="custom">自定义</option>
          </select>
        </div>
        <span class="st-hint">{{ settings.lore_api_source === 'tavern' ? '复用酒馆当前 API 地址和密钥' : '使用自定义 API 端点' }}</span>
      </div>

      <!-- 自定义 API 字段（仅 source=custom 时显示） -->
      <template v-if="settings.lore_api_source === 'custom'">
        <div class="st-row">
          <div class="st-row-main">
            <span class="st-label">API 地址</span>
          </div>
          <input
            v-model="settings.lore_api_base_url"
            type="text"
            class="st-input"
            placeholder="https://api.openai.com"
          />
        </div>

        <div class="st-row">
          <div class="st-row-main">
            <span class="st-label">API 密钥</span>
          </div>
          <input
            v-model="settings.lore_api_key"
            type="password"
            class="st-input"
            placeholder="sk-..."
          />
        </div>
      </template>

      <!-- 模型选择 -->
      <div class="st-row st-row-col">
        <div class="st-row-main">
          <span class="st-label">模型</span>
          <!-- 仅 custom 模式显示获取模型按钮 -->
          <button
            v-if="settings.lore_api_source === 'custom'"
            class="st-btn"
            :disabled="modelLoading || !settings.lore_api_base_url"
            @click="onFetchModels"
          >
            {{ modelLoading ? '⏳ 获取中...' : '📋 获取模型' }}
          </button>
        </div>

        <!-- tavern 模式：显示当前酒馆模型 + 可选覆盖 -->
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

        <!-- custom 模式：获取列表 + 下拉/手动输入 -->
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
        <button
          class="st-btn st-btn-test"
          :disabled="apiTesting"
          @click="onTestConnection"
        >
          {{ apiTesting ? '⏳ 测试中...' : '🔗 测试连接' }}
        </button>
        <span v-if="apiTestResult" class="st-hint" :class="apiTestResult.ok ? 'st-hint-ok' : 'st-hint-err'">
          {{ apiTestResult.message }}
        </span>
      </div>
    </div>

    <!-- 关于 -->
    <div class="st-group">
      <div class="st-group-title">关于</div>
      <div class="st-about">
        <span class="st-about-name">📖 Lorevnter</span>
        <span class="st-about-ver">v0.1.0</span>
        <span class="st-about-desc">SillyTavern 世界书管理插件</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../settings';
import * as WorldbookAPI from '../../core/worldbook-api';
import { testApiConnection, fetchModelList, getTavernCurrentModel } from '../../core/ai-engine';
import { useContextStore } from '../../core/worldbook-context';

const { settings } = useSettingsStore();
const contextStore = useContextStore();

const selectedWb = ref('');
const allWorldbooks = ref<string[]>([]);

// 角色卡绑定的世界书（primary）
const characterWorldbook = computed(() => contextStore.context.character.primary);

// 酒馆当前使用的模型名
const tavernModel = computed(() => getTavernCurrentModel());

const availableWorldbooks = computed(() =>
  allWorldbooks.value.filter(n => !settings.lore_target_worldbooks.includes(n)),
);

function addWorldbook() {
  if (!selectedWb.value) return;
  settings.lore_target_worldbooks.push(selectedWb.value);
  selectedWb.value = '';
}

function removeWorldbook(index: number) {
  settings.lore_target_worldbooks.splice(index, 1);
}

// ── 模型列表获取 ──
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
      // 如果当前选的模型不在列表中，自动选第一个
      if (settings.lore_api_model && !modelList.value.includes(settings.lore_api_model)) {
        // 保留用户当前选择
      }
    }
  } catch (e) {
    modelError.value = (e as Error).message;
    toastr.error((e as Error).message, 'Lorevnter');
  } finally {
    modelLoading.value = false;
  }
}

function onSourceChange() {
  // 切换连接方式时清空模型列表和错误
  modelList.value = [];
  modelError.value = '';
  apiTestResult.value = null;
}

// ── API 连接测试 ──
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

onMounted(() => {
  allWorldbooks.value = WorldbookAPI.listAll();
});
</script>

<style scoped>
.settings-tab { display: flex; flex-direction: column; gap: 20px; padding: 4px; }

.st-group {
  display: flex; flex-direction: column;
}
.st-group-title {
  font-size: 13px; font-weight: 500; color: var(--lore-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; padding-left: 12px;
}

.st-row {
  display: flex; flex-direction: column; justify-content: center;
  padding: 12px 16px; background: var(--lore-bg-secondary);
  border-bottom: 1px solid var(--lore-border-light);
  min-height: 44px; overflow: hidden; /* 防止子元素溢出 */
}
.st-row:first-of-type { border-radius: var(--lore-radius-md) var(--lore-radius-md) 0 0; }
.st-row:last-of-type { border-radius: 0 0 var(--lore-radius-md) var(--lore-radius-md); border-bottom: none; }
/* Single item case */
.st-row:first-of-type:last-of-type { border-radius: var(--lore-radius-md); }

.st-row-main { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px; min-width: 0; /* flex 截断链 */ }
.st-row-col { align-items: stretch; }
.st-label { font-size: 16px; color: var(--lore-text-primary); flex: 1; min-width: 0; letter-spacing: -0.3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-hint { font-size: 12px; color: var(--lore-text-secondary); margin-top: 4px; line-height: 1.3;}
.st-hint-ok { color: var(--lore-success); }
.st-hint-err { color: var(--lore-danger); }

/* 状态标签 */
.st-status {
  font-size: 13px; font-weight: 500; padding: 3px 10px;
  border-radius: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 50%; min-width: 0; /* 允许缩小，最多占行宽的一半 */
}
.st-status-on {
  background: var(--lore-success-bg);
  color: var(--lore-success);
}
.st-status-off {
  background: var(--lore-bg-tertiary);
  color: var(--lore-text-secondary);
}

.st-select {
  padding: 6px 12px; border-radius: var(--lore-radius-sm); border: 1px solid var(--lore-border-light);
  background: var(--lore-bg-tertiary); color: var(--lore-text-primary);
  font-size: 15px; outline: none; appearance: none; -webkit-appearance: none;
  background-image: url('data:image/svg+xml;charset=US-ASCII,<svg width="10" height="6" viewBox="0 0 10 6" fill="gray" xmlns="http://www.w3.org/2000/svg"><path d="M5 6L0 0H10L5 6Z"/></svg>');
  background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px;
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.st-select-flex { flex: 1; min-width: 0; }
.st-select-full { width: 100%; margin-top: 6px; }

.st-number {
  width: 70px; padding: 6px 10px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-tertiary);
  color: var(--lore-text-primary); font-size: 15px; outline: none; text-align: right;
  -moz-appearance: textfield; /* Firefox 去除 spinner */
}
.st-number::-webkit-inner-spin-button,
.st-number::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.st-number:focus { border-color: var(--lore-accent); }

.st-btn {
  padding: 8px 14px; border-radius: var(--lore-radius-sm); border: none;
  background: var(--lore-bg-tertiary); color: var(--lore-accent);
  font-size: 14px; font-weight: 500; cursor: pointer; transition: all .15s;
}
.st-btn:hover:not(:disabled) { background: var(--lore-accent-bg); }
.st-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.st-wb-list { display: flex; flex-direction: column; gap: 4px; margin: 10px 0;}
.st-wb-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-radius: var(--lore-radius-sm); background: var(--lore-bg-tertiary);
  font-size: 14px; color: var(--lore-text-primary); border: 1px solid var(--lore-border-light);
  min-width: 0; /* 确保 flex 子元素可以缩小 */
}
.st-wb-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1; min-width: 0; /* flex 截断必需 */
}
.st-wb-remove {
  background: none; border: none; color: var(--lore-danger);
  cursor: pointer; font-size: 14px; padding: 6px; transition: color .15s;
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
  min-width: 32px; min-height: 32px; /* 最小触控区域 */
}
.st-wb-remove:hover { background: var(--lore-danger-bg); }
.st-wb-add { display: flex; gap: 8px; margin-top: 4px; min-width: 0; }

.st-input {
  width: 100%; padding: 10px 12px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-primary);
  color: var(--lore-text-primary); font-size: 15px; outline: none;
  transition: border-color 0.2s; margin-top: 6px;
}
.st-input:focus { border-color: var(--lore-accent); }
.st-input::placeholder { color: var(--lore-text-tertiary); }

.st-btn-test {
  width: 100%; padding: 10px; text-align: center;
  background: var(--lore-accent-bg); color: var(--lore-accent); font-weight: 600;
}
.st-btn-test:active:not(:disabled) { transform: scale(0.98); }

.st-hint-ok { color: var(--lore-success); }
.st-hint-err { color: var(--lore-danger); }

.st-empty { font-size: 13px; color: var(--lore-text-secondary); text-align: center; padding: 10px 0; }

.st-about {
  display: flex; flex-direction: column; gap: 4px; align-items: center; padding: 16px;
  background: var(--lore-bg-secondary); border-radius: var(--lore-radius-md);
}
.st-about-name { font-size: 18px; font-weight: 600; color: var(--lore-text-primary); letter-spacing: -0.5px;}
.st-about-ver { font-size: 13px; color: var(--lore-text-secondary); font-variant-numeric: tabular-nums;}
.st-about-desc { font-size: 13px; color: var(--lore-text-tertiary); margin-top: 4px;}
</style>
