<template>
  <div class="preset-tab">
    <!-- 保存新预设 -->
    <div class="preset-save-section">
      <div class="preset-section-title">保存为新预设</div>
      <div class="preset-save-form">
        <input v-model="newName" class="preset-input" placeholder="预设名称" />
        <input v-model="newDesc" class="preset-input" placeholder="描述（可选）" />
        <button class="preset-btn preset-btn-accent" :disabled="!newName.trim()" @click="onSave">💾 保存</button>
      </div>
    </div>

    <!-- 预设列表 -->
    <div class="preset-section-title">已保存预设 ({{ settingsStore.settings.lore_presets.length }})</div>
    <div class="preset-list">
      <div v-for="(preset, i) in settingsStore.settings.lore_presets" :key="i" class="preset-card">
        <div class="preset-card-header">
          <span class="preset-card-name">{{ preset.name }}</span>
          <span class="preset-card-date">{{ formatDate(preset.createdAt) }}</span>
        </div>
        <div v-if="preset.description" class="preset-card-desc">{{ preset.description }}</div>
        <div class="preset-card-data">
          <span class="preset-data-tag">世界书: {{ preset.data.lore_target_worldbooks.length }} 个</span>
          <span class="preset-data-tag">约束: {{ preset.data.lore_constraints?.length ?? 0 }}</span>
          <span class="preset-data-tag">间隔: {{ preset.data.lore_scan_interval }}</span>
          <span v-if="preset.data.lore_api_model" class="preset-data-tag">模型: {{ preset.data.lore_api_model }}</span>
        </div>
        <div class="preset-card-actions">
          <div class="preset-action-group">
            <button class="preset-btn preset-btn-sm preset-btn-accent" @click="onApply(i)">📥 应用</button>
            <button class="preset-btn preset-btn-sm" @click="onExport(i)">📤 导出</button>
          </div>
          <button
            v-if="confirmDeleteIndex !== i"
            class="preset-btn preset-btn-sm preset-btn-danger"
            @click="confirmDeleteIndex = i"
          >🗑 删除</button>
          <template v-else>
            <button class="preset-btn preset-btn-sm preset-btn-danger" @click="onDelete(i)">确认删除</button>
            <button class="preset-btn preset-btn-sm" @click="confirmDeleteIndex = -1">取消</button>
          </template>
        </div>
      </div>
      <div v-if="settingsStore.settings.lore_presets.length === 0" class="preset-empty">
        暂无预设，点击上方保存当前配置
      </div>
    </div>

    <!-- 导入 -->
    <div class="preset-import-section">
      <div class="preset-section-title">导入预设</div>
      <input
        ref="fileInputRef"
        type="file"
        accept=".json"
        style="display: none"
        @change="onFileSelected"
      />
      <button class="preset-btn preset-btn-import" @click="fileInputRef?.click()">
        📂 选择预设文件
      </button>
      <span class="preset-import-hint">支持 .json 格式</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../settings';
import { createLogger } from '../../logger';

const logger = createLogger('presets-tab');
const settingsStore = useSettingsStore();

const newName = ref('');
const newDesc = ref('');
const confirmDeleteIndex = ref(-1);
const fileInputRef = ref<HTMLInputElement | null>(null);

function onSave() {
  if (!newName.value.trim()) return;
  settingsStore.savePreset(newName.value.trim(), newDesc.value.trim());
  newName.value = '';
  newDesc.value = '';
  toastr.success('预设已保存');
}

function onApply(index: number) {
  settingsStore.applyPreset(index);
  toastr.success('预设已应用');
}

function onDelete(index: number) {
  settingsStore.deletePreset(index);
  confirmDeleteIndex.value = -1;
  toastr.info('预设已删除');
}

function onExport(index: number) {
  const json = settingsStore.exportPreset(index);
  if (!json) return;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lorevnter-preset-${settingsStore.settings.lore_presets[index].name}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toastr.success('预设已导出');
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    const ok = settingsStore.importPreset(text);
    if (ok) {
      toastr.success(`预设已导入: ${file.name}`);
    } else {
      toastr.error('导入失败，请检查文件格式');
    }
    // 清空 input，允许重复选择同一文件
    input.value = '';
  };
  reader.onerror = () => {
    toastr.error('文件读取失败');
    input.value = '';
  };
  reader.readAsText(file);
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  } catch {
    return iso;
  }
}
</script>

<style scoped>
.preset-tab { display: flex; flex-direction: column; gap: 20px; padding: 4px; }

.preset-section-title {
  font-size: 13px; font-weight: 500; color: var(--lore-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px; padding-left: 12px; margin-bottom: 6px;
}

.preset-save-section, .preset-import-section { display: flex; flex-direction: column; }
.preset-save-form { 
  display: flex; flex-direction: column; gap: 8px; 
  padding: 12px; background: var(--lore-bg-secondary);
  border-radius: var(--lore-radius-md); border: 1px solid var(--lore-border-light);
}
.preset-input {
  width: 100%; padding: 10px 14px; border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-primary);
  color: var(--lore-text-primary); font-size: 15px; outline: none;
  transition: border-color .15s;
}
.preset-input:focus { border-color: var(--lore-accent); }
.preset-input::placeholder { color: var(--lore-text-tertiary); }

.preset-btn {
  padding: 10px; border-radius: var(--lore-radius-sm); border: none;
  background: var(--lore-bg-tertiary); color: var(--lore-accent);
  font-size: 15px; font-weight: 500; cursor: pointer; transition: all .15s;
}
.preset-btn:hover:not(:disabled) { background: var(--lore-bg-primary); }
.preset-btn:active:not(:disabled) { transform: scale(0.98); }
.preset-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.preset-btn-accent { background: var(--lore-accent); color: #fff; }
.preset-btn-accent:hover:not(:disabled) { opacity: 0.9; }
.preset-btn-sm { padding: 6px 10px; font-size: 13px; }
.preset-btn-danger { color: var(--lore-danger); }
.preset-btn-danger:hover { background: var(--lore-danger-bg); }

.preset-list { display: flex; flex-direction: column; gap: 10px; max-height: 380px; overflow-y: auto; padding-right: 4px; }
.preset-card {
  padding: 16px; border-radius: var(--lore-radius-md); background: var(--lore-bg-secondary);
  border: 1px solid var(--lore-border-light); display: flex; flex-direction: column; gap: 10px;
}
.preset-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: -4px;}
.preset-card-name { font-size: 16px; font-weight: 600; color: var(--lore-text-primary); letter-spacing: -0.3px;}
.preset-card-date { font-size: 12px; color: var(--lore-text-secondary); }
.preset-card-desc { font-size: 14px; color: var(--lore-text-secondary); line-height: 1.4; }
.preset-card-data { display: flex; gap: 8px; flex-wrap: wrap; }
.preset-data-tag {
  font-size: 12px; padding: 4px 8px; border-radius: 6px;
  background: var(--lore-bg-primary); color: var(--lore-text-secondary); font-weight: 500;
}
.preset-card-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px;}
.preset-action-group { display: flex; gap: 8px; flex: 1; min-width: max-content; }
.preset-action-group .preset-btn { flex: 1; }
.preset-btn-danger { margin-left: auto; background: transparent; color: var(--lore-text-secondary); }
.preset-btn-danger:hover { background: var(--lore-danger-bg); color: var(--lore-danger); }

.preset-import-section { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.preset-btn-import {
  width: 100%; padding: 16px; text-align: center;
  background: var(--lore-bg-secondary); border: 2px dashed var(--lore-border-light);
  border-radius: var(--lore-radius-md); color: var(--lore-accent);
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
  min-height: 52px; /* 移动端触控友好 */
}
.preset-btn-import:hover { border-color: var(--lore-accent); background: var(--lore-accent-bg); }
.preset-btn-import:active { transform: scale(0.98); }
.preset-import-hint { font-size: 12px; color: var(--lore-text-tertiary); }

.preset-empty { font-size: 14px; color: var(--lore-text-secondary); text-align: center; padding: 20px; }
</style>
