<template>
  <div class="settings-tab">
    <!-- ═══════════ 插件设置 ═══════════ -->
    <div class="st-group">
      <div class="st-group-title">插件设置</div>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">启用 AI 分析</span>
          <input v-model="settings.lore_plugin_enabled" type="checkbox" class="ios-toggle" />
        </div>
      </label>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">调试模式</span>
          <input v-model="settings.lore_debug_mode" type="checkbox" class="ios-toggle" />
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
        <span class="st-hint">除角色卡世界书外，额外指定 AI 分析与约束管理的世界书。全局世界书默认排除，可在此手动添加</span>
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
    </div>

    <!-- 世界书备份 -->
    <div class="st-group">
      <div class="st-group-title">世界书备份</div>

      <label class="st-row">
        <div class="st-row-main">
          <span class="st-label">自动备份</span>
          <input v-model="settings.lore_backup_enabled" type="checkbox" class="ios-toggle" />
        </div>
        <span class="st-hint">AI 分析写入前自动备份当前世界书</span>
      </label>

      <div v-if="settings.lore_backup_enabled" class="st-row">
        <div class="st-row-main">
          <span class="st-label">备份间隔</span>
          <input v-model.number="settings.lore_backup_interval" type="number" class="st-number" min="1" max="99" />
        </div>
        <span class="st-hint">每 N 次 AI 分析后自动备份（1 = 每次都备份）</span>
      </div>

      <div v-if="settings.lore_backup_enabled" class="st-row">
        <div class="st-row-main">
          <span class="st-label">最大保留数</span>
          <input v-model.number="settings.lore_backup_max_count" type="number" class="st-number" min="1" max="50" />
        </div>
        <span class="st-hint">每本世界书最多保留几份备份，超出自动淘汰最早的</span>
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
import { useContextStore } from '../../core/worldbook-context';

const { settings } = useSettingsStore();
const contextStore = useContextStore();

const selectedWb = ref('');
const allWorldbooks = ref<string[]>([]);

// 角色卡绑定的世界书（primary）
const characterWorldbook = computed(() => contextStore.context.character.primary);

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
.settings-tab { display: flex; flex-direction: column; gap: 20px; padding: 4px; }

/* Tab 专有样式 */
.st-wb-list { display: flex; flex-direction: column; gap: 4px; margin: 10px 0;}
.st-wb-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-radius: var(--lore-radius-sm); background: var(--lore-bg-tertiary);
  font-size: 14px; color: var(--lore-text-primary); border: 1px solid var(--lore-border-light);
  min-width: 0;
}
.st-wb-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1; min-width: 0;
}
.st-wb-remove {
  background: none; border: none; color: var(--lore-danger);
  cursor: pointer; font-size: 14px; padding: 6px; transition: color .15s;
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
  min-width: 32px; min-height: 32px;
}
.st-wb-remove:hover { background: var(--lore-danger-bg); }
.st-wb-add { display: flex; gap: 8px; margin-top: 4px; min-width: 0; }

.st-about {
  display: flex; flex-direction: column; gap: 4px; align-items: center; padding: 16px;
  background: var(--lore-bg-secondary); border-radius: var(--lore-radius-md);
}
.st-about-name { font-size: 18px; font-weight: 600; color: var(--lore-text-primary); letter-spacing: -0.5px;}
.st-about-ver { font-size: 13px; color: var(--lore-text-secondary); font-variant-numeric: tabular-nums;}
.st-about-desc { font-size: 13px; color: var(--lore-text-tertiary); margin-top: 4px;}
</style>
