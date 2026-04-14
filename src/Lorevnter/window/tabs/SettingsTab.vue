<template>
  <div class="settings-tab">
    <!-- 全局开关 -->
    <div class="st-group">
      <div class="st-group-title">全局</div>

      <label class="st-row">
        <span class="st-label">插件启用</span>
        <input type="checkbox" v-model="settings.lore_plugin_enabled" class="st-checkbox" />
      </label>

      <label class="st-row">
        <span class="st-label">调试模式</span>
        <span class="st-hint">开启后显示日志标签页，输出详细日志到控制台</span>
        <input type="checkbox" v-model="settings.lore_debug_mode" class="st-checkbox" />
      </label>

      <div class="st-row">
        <span class="st-label">主题</span>
        <select v-model="settings.lore_theme" class="st-select">
          <option value="auto">自动</option>
          <option value="dark">暗色</option>
          <option value="light">亮色</option>
        </select>
      </div>
    </div>

    <!-- 世界书配置 -->
    <div class="st-group">
      <div class="st-group-title">世界书</div>

      <div class="st-row st-row-col">
        <span class="st-label">目标世界书</span>
        <span class="st-hint">管理的世界书名称列表</span>
        <div class="st-wb-list">
          <div v-for="(name, i) in settings.lore_target_worldbooks" :key="i" class="st-wb-item">
            <span class="st-wb-name">{{ name }}</span>
            <button class="st-wb-remove" @click="removeWorldbook(i)">✕</button>
          </div>
          <div v-if="settings.lore_target_worldbooks.length === 0" class="st-empty">未添加目标世界书</div>
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
        <span class="st-label">扫描间隔</span>
        <span class="st-hint">每 N 轮扫描一次</span>
        <input type="number" v-model.number="settings.lore_scan_interval" class="st-number" min="1" max="99" />
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

const { settings } = useSettingsStore();

const selectedWb = ref('');
const allWorldbooks = ref<string[]>([]);

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

onMounted(() => {
  allWorldbooks.value = WorldbookAPI.listAll();
});
</script>

<style scoped>
.settings-tab { display: flex; flex-direction: column; gap: 16px; }

.st-group {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px; border-radius: 8px; background: var(--lore-bg-secondary);
  border: 1px solid var(--lore-border);
}
.st-group-title {
  font-size: 11px; font-weight: 600; color: var(--lore-accent);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;
}

.st-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  min-height: 28px;
}
.st-row-col { flex-direction: column; align-items: stretch; }
.st-label { font-size: 12px; color: var(--lore-text-primary); flex: 1; }
.st-hint { font-size: 10px; color: var(--lore-text-secondary); flex-basis: 100%; margin-top: -4px; }

.st-checkbox {
  width: 16px; height: 16px; accent-color: var(--lore-accent); cursor: pointer;
}

.st-select {
  padding: 4px 8px; border-radius: 4px; border: 1px solid var(--lore-border);
  background: var(--lore-bg-tertiary); color: var(--lore-text-primary);
  font-size: 12px; outline: none;
}
.st-select-flex { flex: 1; }

.st-number {
  width: 60px; padding: 4px 8px; border-radius: 4px;
  border: 1px solid var(--lore-border); background: var(--lore-bg-tertiary);
  color: var(--lore-text-primary); font-size: 12px; outline: none; text-align: center;
}
.st-number:focus { border-color: var(--lore-accent); }

.st-btn {
  padding: 4px 10px; border-radius: 4px; border: 1px solid var(--lore-border);
  background: var(--lore-bg-tertiary); color: var(--lore-text-secondary);
  font-size: 11px; cursor: pointer; transition: all .15s;
}
.st-btn:hover:not(:disabled) { color: var(--lore-text-primary); border-color: var(--lore-accent); }
.st-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.st-wb-list { display: flex; flex-direction: column; gap: 3px; }
.st-wb-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 8px; border-radius: 4px; background: var(--lore-bg-tertiary);
  font-size: 12px; color: var(--lore-text-primary);
}
.st-wb-remove {
  background: none; border: none; color: var(--lore-text-secondary);
  cursor: pointer; font-size: 12px; padding: 0 4px; transition: color .15s;
}
.st-wb-remove:hover { color: #e85050; }
.st-wb-add { display: flex; gap: 6px; }

.st-empty { font-size: 11px; color: var(--lore-text-secondary); padding: 6px 0; }

.st-about {
  display: flex; flex-direction: column; gap: 2px; align-items: center; padding: 8px;
}
.st-about-name { font-size: 14px; font-weight: 700; color: var(--lore-text-primary); }
.st-about-ver { font-size: 11px; color: var(--lore-accent); }
.st-about-desc { font-size: 11px; color: var(--lore-text-secondary); }
</style>
