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
          <input v-model.number="settings.lore_scan_interval" type="number" class="st-number" min="1" max="99" />
        </div>
        <span class="st-hint">每隔 {{ settings.lore_scan_interval }} 次 AI 回复触发一次分析（仅计 AI 回复楼层）</span>
      </div>

      <label v-if="settings.lore_scan_trigger === 'auto'" class="st-row">
        <div class="st-row-main">
          <span class="st-label">跳过零层</span>
          <input v-model="settings.lore_skip_greeting" type="checkbox" class="ios-toggle" />
        </div>
        <span class="st-hint">开启后首条 AI 回复（开场白）不计入自动触发楼层计数</span>
      </label>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">上下文消息数</span>
          <input v-model.number="settings.lore_ai_max_context" type="number" class="st-number" min="1" max="50" />
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

    <!-- 并发与重试 -->
    <div class="st-group">
      <div class="st-group-title">并发与重试</div>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">后台静默模式</span>
          <input v-model="settings.lore_background_mode" type="checkbox" class="ios-toggle" />
        </div>
        <span class="st-hint">开启后自动分析时不弹提示，仅写入日志</span>
      </label>

      <label v-if="settings.lore_api_source === 'custom'" class="st-row">
        <div class="st-row-main">
          <span class="st-label">并发直连</span>
          <input v-model="settings.lore_concurrent_mode" type="checkbox" class="ios-toggle" />
        </div>
        <span class="st-hint">开启后分析请求直连 API，不经过酒馆代理，可与聊天并发进行（需 API 支持跨域）</span>
      </label>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">失败重试</span>
          <input v-model.number="settings.lore_retry_count" type="number" class="st-number" min="0" max="5" />
        </div>
        <span class="st-hint">API 调用失败后自动重试次数（0=不重试），每次退避 2s/4s/6s...</span>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">最小正文字数</span>
          <input v-model.number="settings.lore_min_content_length" type="number" class="st-number" min="0" max="9999" />
        </div>
        <span class="st-hint">AI 最新回复正文低于此字数时跳过分析（0=不检查）{{ settings.lore_context_include_tag ? '，优先检查标签内字数' : '' }}</span>
      </div>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">禁用模型思考</span>
          <input v-model="settings.lore_ai_disable_thinking" type="checkbox" class="ios-toggle" />
        </div>
        <span class="st-hint">通过 prefill 欺骗关闭 Gemini Thinking / OpenAI o-series 的内置推理链，大幅提速</span>
      </label>
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

      <label v-if="!settings.lore_debug_mode" class="st-row">
        <div class="st-row-main">
          <span class="st-label">修改审核</span>
          <input v-model="settings.lore_review_enabled" type="checkbox" class="ios-toggle" />
        </div>
        <span class="st-hint">AI 分析完成后弹出审核弹窗，逐条确认修改（调试模式下强制开启）</span>
      </label>
      <label v-if="settings.lore_debug_mode" class="st-row">
        <div class="st-row-main">
          <span class="st-label">修改审核</span>
          <input type="checkbox" checked disabled class="ios-toggle" />
        </div>
        <span class="st-hint">🔍 调试模式下审核强制开启</span>
      </label>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">用户人设处理</span>
          <input v-model="settings.lore_include_persona" type="checkbox" class="ios-toggle" />
        </div>
        <span class="st-hint">开启后，AI 分析时会同时处理用户人设的更新（可在约束 Tab 绑定约束）</span>
      </label>
    </div>

    <!-- 新增条目配置 -->
    <div class="st-group">
      <div class="st-group-title">新增条目</div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">起始排序号</span>
          <input v-model.number="settings.lore_new_entry_start_order" type="number" class="st-number" min="0" max="9999" />
        </div>
        <span class="st-hint">新增条目的 order 起始值（0 = 自动: 最大 order + 10）</span>
      </div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">默认世界书</span>
          <button class="debug-action-btn" title="刷新列表" @click="refreshNewEntryWorldbooks">🔄</button>
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
          <input v-model.number="settings.lore_cache_max_size" type="number" class="st-number" min="0" max="999" />
        </div>
        <span class="st-hint">0 = 无上限。超出上限时自动淘汰最早的条目</span>
      </div>
      <div v-if="settings.lore_cache_clear_mode === 'manual'" class="st-row">
        <div class="st-row-main">
          <span class="st-label">缓存聊天数</span>
          <span class="st-status">{{ cachedChatIds.length }} 个聊天</span>
        </div>
      </div>
      <div v-if="settings.lore_cache_clear_mode === 'manual'" class="st-row" style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="st-btn st-btn-danger" @click="onManualClearCache">🗑 清空当前聊天</button>
        <button class="st-btn st-btn-danger" :disabled="cachedChatIds.length === 0" @click="onClearAllCaches">🗑 清空全部缓存</button>
      </div>
      <div v-if="settings.lore_cache_clear_mode === 'manual' && cachedChatIds.length > 0" class="st-row">
        <div class="st-row-main">
          <span class="st-label">指定清理</span>
          <select v-model="selectedCacheChatId" class="st-select st-select-flex">
            <option value="">选择聊天...</option>
            <option v-for="cid in cachedChatIds" :key="cid" :value="cid">{{ cid }}</option>
          </select>
          <button class="st-btn" :disabled="!selectedCacheChatId" @click="onClearSelectedChat">清理</button>
        </div>
      </div>
    </div>

    <!-- 条目处理范围 -->
    <div class="st-group">
      <div class="st-group-title">条目处理范围</div>

      <div class="st-row">
        <div class="st-row-main">
          <span class="st-label">过滤模式</span>
          <select v-model="settings.lore_entry_filter_mode" class="st-select" @change="onFilterModeChange">
            <option value="all">全部条目</option>
            <option value="include">仅处理指定条目</option>
            <option value="exclude">排除指定条目</option>
          </select>
        </div>
        <span class="st-hint">
          {{ settings.lore_entry_filter_mode === 'all' ? '分析所有候选条目（默认）' :
             settings.lore_entry_filter_mode === 'include' ? '仅选中的条目参与 AI 分析' :
             '选中的条目将被排除，不参与 AI 分析' }}
        </span>
      </div>

      <!-- 条目选择器（仅 include/exclude 模式显示） -->
      <template v-if="settings.lore_entry_filter_mode !== 'all'">
        <!-- 当前作用世界书提示 + 摘要 -->
        <div v-if="filterTargetWbNames.length > 0" class="st-row">
          <div style="display:flex;flex-direction:column;gap:4px;width:100%;">
            <span class="st-hint" style="font-weight:500;">
              📚 当前主管线作用世界书：{{ filterTargetWbNames.join('、') }}
            </span>
            <span v-for="s in filterSummary" :key="s.wb" class="st-hint">
              {{ s.wb }}: {{ s.count }} 条目已选
            </span>
          </div>
        </div>
        <div v-else class="st-row">
          <span class="st-hint st-hint-err">⚠ 未检测到可作用的世界书，请先打开角色卡聊天或在设置里补充额外世界书</span>
        </div>

        <!-- 打开选择弹窗按钮 -->
        <div v-if="filterTargetWbNames.length > 0" class="st-row">
          <button class="debug-action-btn" style="width:100%;" @click="openFilterPopup">
            📋 选择条目
          </button>
        </div>
      </template>
    </div>

    <!-- 条目选择弹窗 (Teleport 到酒馆 body) -->
    <Teleport :to="teleportTarget">
      <div v-if="filterPopupOpen" class="entry-popup-overlay" @click.self="closeFilterPopup">
        <div class="entry-popup">
          <!-- 弹窗头 -->
          <div class="entry-popup-header">
            <span class="entry-popup-title">
              {{ settings.lore_entry_filter_mode === 'include' ? '选择要处理的条目' : '选择要排除的条目' }}
            </span>
            <button class="entry-popup-close" @click="closeFilterPopup">✕</button>
          </div>

          <!-- 世界书 Tab -->
          <div v-if="filterTargetWbNames.length > 1" class="entry-popup-tabs">
            <button
              v-for="wb in filterTargetWbNames" :key="wb"
              class="entry-filter-wb-tab"
              :class="{ active: filterActiveWb === wb }"
              @click="switchFilterWb(wb)"
            >{{ wb }}</button>
          </div>

          <!-- 搜索 + 操作栏 -->
          <div class="entry-popup-toolbar">
            <input
              v-model="filterSearchQuery"
              type="text"
              class="entry-popup-search"
              placeholder="🔍 搜索条目..."
            />
            <div class="entry-popup-actions">
              <span class="entry-filter-stat">已选 {{ filterSelectedCount }} / 全部 {{ filterEntries.length }}</span>
              <button class="entry-filter-btn" @click="onFilterSelectAll">全选</button>
              <button class="entry-filter-btn" @click="onFilterClearAll">清空</button>
              <button class="entry-filter-btn" @click="onFilterInvert">反选</button>
            </div>
          </div>

          <!-- 条目列表 -->
          <div class="entry-popup-body">
            <div v-if="filterEntriesLoading" class="debug-empty">加载中...</div>
            <div v-else-if="filteredEntries.length === 0" class="debug-empty">
              {{ filterEntries.length === 0 ? '该世界书无条目' : '无匹配条目' }}
            </div>
            <label
              v-for="entry in filteredEntries"
              :key="entry.uid"
              class="entry-filter-item"
              :class="{ 'entry-filter-selected': isEntrySelected(entry.uid) }"
            >
              <input
                type="checkbox"
                :checked="isEntrySelected(entry.uid)"
                class="entry-filter-checkbox"
                @change="onToggleEntry(entry.uid)"
              />
              <span class="entry-filter-name">{{ entry.name || `uid_${entry.uid}` }}</span>
            </label>
          </div>

          <!-- 底部确认栏 -->
          <div class="entry-popup-footer">
            <span class="entry-filter-stat">已选择 {{ filterSelectedCount }} 条条目</span>
            <button class="entry-filter-btn entry-filter-btn-confirm" @click="closeFilterPopup">✓ 确认</button>
          </div>
        </div>
      </div>
    </Teleport>

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
              <div v-for="param in samplingParams" :key="param.key" class="st-param-item">
                <label class="st-param-label">
                  <span>{{ param.label }}</span>
                </label>
                <input
                  type="number"
                  :value="settings[param.key] === 'same_as_preset' ? param.default : settings[param.key]"
                  class="st-number st-number-wide"
                  :min="param.min"
                  :max="param.max"
                  :step="param.step"
                  @input="settings[param.key] = Number(($event.target as HTMLInputElement).value)"
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

// ── 缓存手动清理 ──
import { clearCacheForChat, getCurrentCacheChatId, getCachedChatIds, clearAllCaches } from '../../core/scan-cache';

const cachedChatIds = ref<string[]>(getCachedChatIds());
const selectedCacheChatId = ref('');

function refreshCachedChatIds() {
  cachedChatIds.value = getCachedChatIds();
}

function onManualClearCache() {
  const chatId = getCurrentCacheChatId();
  if (!chatId) {
    toastr.warning('当前无聊天 ID，无法清理', 'Lorevnter');
    return;
  }
  if (!confirm(`确认清空当前聊天 (${chatId}) 的缓存？`)) return;
  clearCacheForChat(chatId);
  refreshCachedChatIds();
  toastr.success('当前聊天缓存已清空', 'Lorevnter');
}

function onClearAllCaches() {
  if (!confirm(`确认清空全部 ${cachedChatIds.value.length} 个聊天的缓存？此操作不可恢复。`)) return;
  clearAllCaches();
  refreshCachedChatIds();
  toastr.success('全部缓存已清空', 'Lorevnter');
}

function onClearSelectedChat() {
  if (!selectedCacheChatId.value) return;
  if (!confirm(`确认清空聊天 "${selectedCacheChatId.value}" 的缓存？`)) return;
  clearCacheForChat(selectedCacheChatId.value);
  selectedCacheChatId.value = '';
  refreshCachedChatIds();
  toastr.success('指定聊天缓存已清空', 'Lorevnter');
}

// ── 条目处理范围 ──
import * as WorldbookAPI from '../../core/worldbook-api';
import { useContextStore } from '../../core/worldbook-context';

interface FilterEntry { uid: number; name: string; }

const filterActiveWb = ref('');
const filterEntries = ref<FilterEntry[]>([]);
const filterEntriesLoading = ref(false);

/** 从 context store 获取管线实际处理的世界书名（与主管线完全对齐） */
const filterTargetWbNames = computed(() => {
  const ctx = useContextStore();
  return ctx.getActiveWorldbookNames();
});

/** 模式切换时自动加载第一本世界书条目 */
async function onFilterModeChange() {
  if (settings.lore_entry_filter_mode === 'all') return;
  if (filterTargetWbNames.value.length > 0 && !filterActiveWb.value) {
    await switchFilterWb(filterTargetWbNames.value[0]);
  }
}

/** 切换世界书 Tab 并加载条目 */
async function switchFilterWb(wb: string) {
  filterActiveWb.value = wb;
  filterEntries.value = [];
  filterEntriesLoading.value = true;
  try {
    const entries = await WorldbookAPI.fetch(wb);
    filterEntries.value = entries.map(e => ({ uid: e.uid, name: e.name }));
  } catch (e) {
    toastr.error(`加载条目失败: ${(e as Error).message}`, 'Lorevnter');
  } finally {
    filterEntriesLoading.value = false;
  }
}

function isEntrySelected(uid: number): boolean {
  const map = settings.lore_entry_filter_map;
  const uids = map[filterActiveWb.value];
  return uids ? uids.includes(uid) : false;
}

function onToggleEntry(uid: number) {
  const wb = filterActiveWb.value;
  if (!wb) return;

  const map = settings.lore_entry_filter_map;
  if (!map[wb]) map[wb] = [];

  const idx = map[wb].indexOf(uid);
  if (idx >= 0) {
    map[wb].splice(idx, 1);
  } else {
    map[wb].push(uid);
  }
  // 清理空数组
  if (map[wb].length === 0) delete map[wb];
}

function onFilterSelectAll() {
  const wb = filterActiveWb.value;
  if (!wb) return;
  // filteredEntries 自动适配：有搜索=结果集，无搜索=全部
  const targetUids = filteredEntries.value.map(e => e.uid);
  const existing = new Set(settings.lore_entry_filter_map[wb] ?? []);
  for (const uid of targetUids) existing.add(uid);
  settings.lore_entry_filter_map[wb] = [...existing];
}

function onFilterClearAll() {
  const wb = filterActiveWb.value;
  if (!wb) return;
  // filteredEntries 自动适配：有搜索=只清结果，无搜索=清全部
  const removeUids = new Set(filteredEntries.value.map(e => e.uid));
  const remaining = (settings.lore_entry_filter_map[wb] ?? []).filter(uid => !removeUids.has(uid));
  if (remaining.length > 0) {
    settings.lore_entry_filter_map[wb] = remaining;
  } else {
    delete settings.lore_entry_filter_map[wb];
  }
}

const filterSelectedCount = computed(() => {
  const uids = settings.lore_entry_filter_map[filterActiveWb.value];
  return uids ? uids.length : 0;
});

const filterSummary = computed(() => {
  const result: { wb: string; count: number }[] = [];
  for (const [wb, uids] of Object.entries(settings.lore_entry_filter_map)) {
    if (uids && uids.length > 0) {
      result.push({ wb, count: uids.length });
    }
  }
  return result;
});

// ── 弹窗控制 ──
const filterPopupOpen = ref(false);
const filterSearchQuery = ref('');

/** Teleport 目标：酒馆的 parent body（iframe 外层） */
const teleportTarget = computed(() => {
  return (typeof window.parent !== 'undefined' ? window.parent : window).document.body;
});

async function openFilterPopup() {
  filterSearchQuery.value = '';
  // 自动加载第一本世界书
  if (filterTargetWbNames.value.length > 0 && !filterActiveWb.value) {
    await switchFilterWb(filterTargetWbNames.value[0]);
  }
  filterPopupOpen.value = true;
}

function closeFilterPopup() {
  filterPopupOpen.value = false;
}

/** 搜索过滤后的条目 */
const filteredEntries = computed(() => {
  const q = filterSearchQuery.value.trim().toLowerCase();
  if (!q) return filterEntries.value;
  return filterEntries.value.filter(e =>
    (e.name || `uid_${e.uid}`).toLowerCase().includes(q)
  );
});

/** 反选 */
function onFilterInvert() {
  const wb = filterActiveWb.value;
  if (!wb) return;
  // 反选也基于当前搜索结果
  const targetUids = filteredEntries.value.map(e => e.uid);
  const selected = new Set(settings.lore_entry_filter_map[wb] ?? []);
  for (const uid of targetUids) {
    if (selected.has(uid)) {
      selected.delete(uid);
    } else {
      selected.add(uid);
    }
  }
  if (selected.size > 0) {
    settings.lore_entry_filter_map[wb] = [...selected];
  } else {
    delete settings.lore_entry_filter_map[wb];
  }
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

/* 条目处理范围 */
.entry-filter-toolbar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.entry-filter-stat {
  font-size: 12px; color: var(--lore-text-secondary); flex: 1;
}
.entry-filter-btn {
  padding: 4px 10px; border-radius: 6px; border: 1px solid var(--lore-border-light);
  background: transparent; color: var(--lore-text-secondary);
  font-size: 11px; cursor: pointer; transition: all 0.15s;
}
.entry-filter-btn:hover {
  color: var(--lore-accent); border-color: var(--lore-accent);
}
.entry-filter-list {
  max-height: 280px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px;
  border: 1px solid var(--lore-border-light); border-radius: var(--lore-radius-sm);
  padding: 4px;
}
.entry-filter-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 4px; cursor: pointer;
  font-size: 13px; color: var(--lore-text-primary);
  transition: background 0.15s;
}
.entry-filter-item:hover { background: var(--lore-bg-tertiary); }
.entry-filter-selected {
  background: var(--lore-accent-bg, rgba(59, 130, 246, 0.08));
}
.entry-filter-checkbox {
  width: 16px; height: 16px; flex-shrink: 0;
  accent-color: var(--lore-accent);
}
.entry-filter-name {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.debug-empty {
  font-size: 13px; color: var(--lore-text-secondary); text-align: center; padding: 16px 0;
}
.entry-filter-wb-tabs {
  display: flex; gap: 4px; flex-wrap: wrap;
}
.entry-filter-wb-tab {
  padding: 5px 12px; border-radius: 6px; border: 1px solid var(--lore-border-light);
  background: transparent; color: var(--lore-text-secondary);
  font-size: 12px; cursor: pointer; transition: all 0.15s;
}
.entry-filter-wb-tab.active {
  background: var(--lore-accent); color: #fff; border-color: var(--lore-accent);
}
.entry-filter-wb-tab:hover:not(.active) {
  color: var(--lore-text-primary); border-color: var(--lore-text-tertiary);
}
</style>
