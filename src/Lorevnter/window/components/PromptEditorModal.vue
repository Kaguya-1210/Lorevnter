<template>
  <div v-if="visible" class="pe-overlay" @click.self="$emit('close')">
    <div class="pe-modal" @click.stop>
      <!-- 头部 -->
      <div class="pe-header">
        <span class="pe-title">📝 提示词编辑器</span>
        <button class="pe-close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- 预设栏 -->
      <div class="pe-preset-bar">
        <!-- 保存预设：内联输入模式 -->
        <template v-if="showSaveInput">
          <input
            ref="saveInputRef"
            v-model="savePresetName"
            class="pe-select"
            placeholder="输入预设名称"
            @keydown.enter="confirmSavePreset"
            @keydown.escape="showSaveInput = false"
          />
          <button class="pe-bar-btn" @click="confirmSavePreset" title="确认保存">✓</button>
          <button class="pe-bar-btn" @click="showSaveInput = false" title="取消">✕</button>
        </template>
        <template v-else>
          <select v-model="selectedPresetName" class="pe-select" @change="onLoadPreset">
            <option value="">— 选择预设 —</option>
            <option v-for="p in settings.lore_prompt_presets" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
          <button class="pe-bar-btn" @click="startSavePreset" title="保存为预设">💾</button>
          <button class="pe-bar-btn" @click="onDeletePreset" :disabled="!selectedPresetName" title="删除预设">🗑</button>
        </template>
      </div>

      <!-- 提示词列表 -->
      <div class="pe-list">
        <div v-if="promptList.length === 0" class="pe-empty">
          暂无提示词，点击下方按钮添加
        </div>

        <div
          v-for="(item, index) in promptList"
          :key="item.id"
          class="pe-item"
          :class="{ 'pe-item-disabled': !item.enabled, 'pe-item-expanded': expandedId === item.id }"
        >
          <!-- 折叠行 -->
          <div class="pe-item-header" @click="toggleExpand(item.id)">
            <span class="pe-item-role" :class="'pe-role-' + item.role">{{ item.role.toUpperCase() }}</span>
            <span class="pe-item-name">{{ item.name || '(未命名)' }}</span>
            <span class="pe-item-preview" v-if="expandedId !== item.id">{{ item.content.slice(0, 50) }}{{ item.content.length > 50 ? '...' : '' }}</span>
            <div class="pe-item-actions" @click.stop>
              <input type="checkbox" v-model="item.enabled" class="pe-toggle" title="启用/禁用" />
              <button class="pe-mini-btn" @click="moveItem(index, -1)" :disabled="index === 0" title="上移">↑</button>
              <button class="pe-mini-btn" @click="moveItem(index, 1)" :disabled="index === promptList.length - 1" title="下移">↓</button>
              <button class="pe-mini-btn pe-mini-danger" @click="removeItem(index)" title="删除">✕</button>
            </div>
          </div>

          <!-- 展开编辑区 -->
          <div v-if="expandedId === item.id" class="pe-item-body">
            <div class="pe-edit-row">
              <label class="pe-edit-label">名称</label>
              <input v-model="item.name" class="pe-edit-input" placeholder="提示词名称（可选）" />
            </div>
            <div class="pe-edit-row">
              <label class="pe-edit-label">角色</label>
              <select v-model="item.role" class="pe-edit-select">
                <option value="system">System</option>
                <option value="user">User</option>
                <option value="assistant">Assistant</option>
              </select>
            </div>
            <div class="pe-edit-row">
              <label class="pe-edit-label">内容</label>
              <textarea v-model="item.content" class="pe-edit-textarea" rows="6" placeholder="输入提示词内容..."></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="pe-footer">
        <button class="pe-add-btn" @click="addItem">+ 添加提示词</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore, type PromptItem } from '../../settings';

const props = defineProps<{ visible: boolean }>();
defineEmits<{ close: [] }>();

const { settings } = useSettingsStore();

// 提示词列表（直接绑定 settings 的响应式数组）
const promptList = computed(() => settings.lore_ai_prompt_list);

// 当前展开的提示词 ID
const expandedId = ref<string | null>(null);

// 预设选择
const selectedPresetName = ref('');

// 保存预设（内联输入模式，替代 prompt()）
const showSaveInput = ref(false);
const savePresetName = ref('');
const saveInputRef = ref<HTMLInputElement | null>(null);

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function addItem() {
  const newItem: PromptItem = {
    id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: 'system',
    content: '',
    enabled: true,
    name: '',
  };
  settings.lore_ai_prompt_list.push(newItem);
  expandedId.value = newItem.id;
}

function removeItem(index: number) {
  settings.lore_ai_prompt_list.splice(index, 1);
  expandedId.value = null;
}

function moveItem(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= settings.lore_ai_prompt_list.length) return;
  const list = settings.lore_ai_prompt_list;
  [list[index], list[target]] = [list[target], list[index]];
}

// ── 预设管理（无 prompt()） ──

function startSavePreset() {
  savePresetName.value = selectedPresetName.value || '';
  showSaveInput.value = true;
  nextTick(() => saveInputRef.value?.focus());
}

function confirmSavePreset() {
  const name = savePresetName.value.trim();
  if (!name) {
    toastr.warning('预设名称不能为空', 'Lorevnter');
    return;
  }

  const idx = settings.lore_prompt_presets.findIndex(p => p.name === name);
  const preset = {
    name,
    description: '',
    createdAt: new Date().toISOString(),
    items: JSON.parse(JSON.stringify(settings.lore_ai_prompt_list)),
  };

  if (idx >= 0) {
    settings.lore_prompt_presets[idx] = preset;
  } else {
    settings.lore_prompt_presets.push(preset);
  }

  selectedPresetName.value = name;
  showSaveInput.value = false;
  toastr.success(`提示词预设已保存: ${name}`, 'Lorevnter');
}

function onLoadPreset() {
  if (!selectedPresetName.value) return;
  const preset = settings.lore_prompt_presets.find(p => p.name === selectedPresetName.value);
  if (!preset) return;

  settings.lore_ai_prompt_list.splice(0, settings.lore_ai_prompt_list.length, ...JSON.parse(JSON.stringify(preset.items)));
  expandedId.value = null;
  toastr.success(`已加载预设: ${preset.name}`, 'Lorevnter');
}

function onDeletePreset() {
  if (!selectedPresetName.value) return;
  const idx = settings.lore_prompt_presets.findIndex(p => p.name === selectedPresetName.value);
  if (idx < 0) return;

  settings.lore_prompt_presets.splice(idx, 1);
  toastr.info(`已删除预设: ${selectedPresetName.value}`, 'Lorevnter');
  selectedPresetName.value = '';
}
</script>

<style scoped>
.pe-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.5); z-index: 100001;
  display: flex; justify-content: center; align-items: center;
  animation: pe-fade 0.2s ease-out;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
@keyframes pe-fade { from { opacity: 0; } to { opacity: 1; } }

.pe-modal {
  width: min(95vw, 520px);
  max-height: 85vh;
  background: var(--lore-glass-bg);
  -webkit-backdrop-filter: blur(25px) saturate(200%);
  backdrop-filter: blur(25px) saturate(200%);
  border-radius: var(--lore-radius-lg);
  border: 1px solid var(--lore-border-light);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: pe-slide 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes pe-slide { from { transform: translateY(20px) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }

/* 头部 */
.pe-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--lore-border-light);
}
.pe-title { font-size: 16px; font-weight: 600; color: var(--lore-text-primary); }
.pe-close-btn {
  background: none; border: none; font-size: 16px; color: var(--lore-text-tertiary);
  cursor: pointer; padding: 4px 8px; border-radius: var(--lore-radius-sm);
  min-width: 44px; min-height: 44px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.pe-close-btn:hover { background: var(--lore-bg-tertiary); color: var(--lore-text-primary); }

/* 预设栏 */
.pe-preset-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 20px; border-bottom: 1px solid var(--lore-border-light);
  background: var(--lore-bg-primary);
}
.pe-select {
  flex: 1; padding: 6px 10px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-secondary);
  color: var(--lore-text-primary); font-size: 13px; outline: none;
  min-height: 36px;
}
.pe-bar-btn {
  padding: 6px 8px; border: none; background: var(--lore-bg-secondary);
  border-radius: var(--lore-radius-sm); cursor: pointer; font-size: 14px;
  min-width: 44px; min-height: 44px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.pe-bar-btn:hover { background: var(--lore-bg-tertiary); }
.pe-bar-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 列表 */
.pe-list {
  flex: 1; overflow-y: auto; padding: 12px 20px;
  display: flex; flex-direction: column; gap: 8px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.pe-empty {
  text-align: center; font-size: 13px; color: var(--lore-text-tertiary); padding: 30px 0;
}

/* 单条提示词 */
.pe-item {
  background: var(--lore-bg-secondary); border: 1px solid var(--lore-border-light);
  border-radius: var(--lore-radius-md); overflow: hidden;
  transition: border-color 0.2s;
}
.pe-item-expanded { border-color: var(--lore-accent); }
.pe-item-disabled { opacity: 0.5; }

.pe-item-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; cursor: pointer; transition: background 0.15s;
  min-height: 44px;
}
.pe-item-header:hover { background: var(--lore-bg-tertiary); }

.pe-item-role {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px;
  letter-spacing: 0.3px; flex-shrink: 0;
}
.pe-role-system { background: var(--lore-accent-bg); color: var(--lore-accent); }
.pe-role-user { background: rgba(52, 199, 89, 0.15); color: #34c759; }
.pe-role-assistant { background: rgba(255, 149, 0, 0.15); color: #ff9500; }

.pe-item-name {
  font-size: 13px; font-weight: 500; color: var(--lore-text-primary); flex-shrink: 0;
}
.pe-item-preview {
  font-size: 12px; color: var(--lore-text-tertiary); flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.pe-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.pe-toggle { width: 16px; height: 16px; cursor: pointer; }
.pe-mini-btn {
  padding: 2px 6px; border: none; background: var(--lore-bg-primary);
  color: var(--lore-text-secondary); font-size: 12px; border-radius: 4px;
  cursor: pointer; min-width: 32px; min-height: 32px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.pe-mini-btn:hover { background: var(--lore-border-light); }
.pe-mini-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.pe-mini-danger:hover { background: var(--lore-danger-bg); color: var(--lore-danger); }

/* 展开编辑区 */
.pe-item-body {
  padding: 12px; border-top: 1px solid var(--lore-border-light);
  display: flex; flex-direction: column; gap: 10px;
  background: var(--lore-bg-primary);
}
.pe-edit-row { display: flex; flex-direction: column; gap: 4px; }
.pe-edit-label { font-size: 12px; font-weight: 500; color: var(--lore-text-secondary); }
.pe-edit-input, .pe-edit-select {
  padding: 7px 10px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-secondary);
  color: var(--lore-text-primary); font-size: 13px; outline: none;
  min-height: 36px;
  transition: border-color 0.2s;
}
.pe-edit-input:focus, .pe-edit-select:focus, .pe-edit-textarea:focus {
  border-color: var(--lore-accent);
}
.pe-edit-textarea {
  width: 100%; padding: 8px 10px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-secondary);
  color: var(--lore-text-primary); font-size: 13px; font-family: monospace;
  outline: none; resize: vertical; line-height: 1.5; min-height: 100px;
  transition: border-color 0.2s;
}

/* 底部 */
.pe-footer {
  padding: 12px 20px; border-top: 1px solid var(--lore-border-light);
}
.pe-add-btn {
  width: 100%; padding: 10px; border: 1px dashed var(--lore-border-light);
  border-radius: var(--lore-radius-sm); background: transparent;
  color: var(--lore-accent); font-size: 13px; font-weight: 500;
  cursor: pointer; min-height: 44px;
  transition: background 0.15s, border-color 0.15s;
}
.pe-add-btn:hover { background: var(--lore-accent-bg); border-color: var(--lore-accent); }

/* 移动端适配 — 近全屏面板 */
@media (max-width: 600px) {
  .pe-overlay { align-items: flex-end; }
  .pe-modal {
    width: 100vw;
    max-height: calc(100vh - env(safe-area-inset-top, 20px));
    height: calc(100vh - env(safe-area-inset-top, 20px));
    border-radius: 16px 16px 0 0;
    padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
  }
  .pe-list {
    flex: 1;
    min-height: 0; /* flex 子项需要 min-height:0 才能正确缩放 */
  }
  .pe-header { padding: 12px 16px; }
  .pe-preset-bar { padding: 8px 16px; }
  .pe-list { padding: 10px 16px; }
  .pe-footer { padding: 10px 16px; }
  .pe-item-preview { display: none; }
  .pe-edit-textarea { min-height: 80px; }
}
</style>
