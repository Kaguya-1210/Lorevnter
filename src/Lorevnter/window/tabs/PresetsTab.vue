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
          <span class="preset-data-tag">间隔: {{ preset.data.lore_scan_interval }}</span>
        </div>
        <div class="preset-card-actions">
          <button class="preset-btn preset-btn-sm" @click="onApply(i)">📥 应用</button>
          <button class="preset-btn preset-btn-sm" @click="onExport(i)">📤 导出</button>
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
      <textarea v-model="importJson" class="preset-textarea" placeholder="粘贴预设 JSON..." rows="3"></textarea>
      <button class="preset-btn" :disabled="!importJson.trim()" @click="onImport">📋 导入</button>
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
const importJson = ref('');
const confirmDeleteIndex = ref(-1);

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

function onImport() {
  if (!importJson.value.trim()) return;
  const ok = settingsStore.importPreset(importJson.value.trim());
  if (ok) {
    importJson.value = '';
    toastr.success('预设已导入');
  } else {
    toastr.error('导入失败，请检查 JSON 格式');
  }
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
.preset-tab { display: flex; flex-direction: column; gap: 14px; }

.preset-section-title {
  font-size: 11px; font-weight: 600; color: var(--lore-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px;
}

.preset-save-section { display: flex; flex-direction: column; gap: 6px; }
.preset-save-form { display: flex; gap: 6px; flex-wrap: wrap; }
.preset-input {
  flex: 1; min-width: 120px; padding: 6px 10px; border-radius: 6px;
  border: 1px solid var(--lore-border); background: var(--lore-bg-secondary);
  color: var(--lore-text-primary); font-size: 12px; outline: none;
  transition: border-color .15s;
}
.preset-input:focus { border-color: var(--lore-accent); }
.preset-input::placeholder { color: var(--lore-text-secondary); opacity: 0.6; }

.preset-btn {
  padding: 6px 12px; border-radius: 6px; border: 1px solid var(--lore-border);
  background: var(--lore-bg-secondary); color: var(--lore-text-secondary);
  font-size: 12px; cursor: pointer; transition: all .15s; white-space: nowrap;
}
.preset-btn:hover:not(:disabled) { background: var(--lore-bg-tertiary); color: var(--lore-text-primary); }
.preset-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.preset-btn-accent { border-color: var(--lore-accent); color: var(--lore-accent); }
.preset-btn-accent:hover:not(:disabled) { background: var(--lore-accent-bg); }
.preset-btn-sm { padding: 3px 8px; font-size: 11px; }
.preset-btn-danger { color: #e85050; border-color: rgba(232,80,80,.3); }
.preset-btn-danger:hover { background: rgba(232,80,80,.1); }

.preset-list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
.preset-card {
  padding: 10px 12px; border-radius: 8px; background: var(--lore-bg-secondary);
  border: 1px solid var(--lore-border); display: flex; flex-direction: column; gap: 6px;
}
.preset-card-header { display: flex; align-items: center; justify-content: space-between; }
.preset-card-name { font-size: 13px; font-weight: 600; color: var(--lore-text-primary); }
.preset-card-date { font-size: 10px; color: var(--lore-text-secondary); }
.preset-card-desc { font-size: 11px; color: var(--lore-text-secondary); }
.preset-card-data { display: flex; gap: 6px; flex-wrap: wrap; }
.preset-data-tag {
  font-size: 10px; padding: 2px 6px; border-radius: 3px;
  background: var(--lore-bg-tertiary); color: var(--lore-text-secondary);
}
.preset-card-actions { display: flex; gap: 4px; flex-wrap: wrap; }

.preset-import-section { display: flex; flex-direction: column; gap: 6px; }
.preset-textarea {
  padding: 8px 10px; border-radius: 6px; border: 1px solid var(--lore-border);
  background: var(--lore-bg-secondary); color: var(--lore-text-primary);
  font-size: 11px; font-family: 'Consolas', monospace; resize: vertical;
  outline: none; min-height: 50px;
}
.preset-textarea:focus { border-color: var(--lore-accent); }
.preset-textarea::placeholder { color: var(--lore-text-secondary); opacity: 0.6; }

.preset-empty { font-size: 12px; color: var(--lore-text-secondary); text-align: center; padding: 20px; }
</style>
