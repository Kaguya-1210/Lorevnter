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
.st-btn-sm { padding: 6px 12px; font-size: 12px; margin-top: 6px; }
.st-btn-danger { color: var(--lore-danger); }
.st-btn-danger:hover:not(:disabled) { background: var(--lore-danger-bg); }

/* 折叠组件 */
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
.st-collapsible-status {
  margin-left: auto; font-size: 12px; color: var(--lore-text-tertiary);
  font-weight: 400;
}
.st-collapsible-body { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 8px; }

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

.st-empty { font-size: 13px; color: var(--lore-text-secondary); text-align: center; padding: 10px 0; }

.st-about {
  display: flex; flex-direction: column; gap: 4px; align-items: center; padding: 16px;
  background: var(--lore-bg-secondary); border-radius: var(--lore-radius-md);
}
.st-about-name { font-size: 18px; font-weight: 600; color: var(--lore-text-primary); letter-spacing: -0.5px;}
.st-about-ver { font-size: 13px; color: var(--lore-text-secondary); font-variant-numeric: tabular-nums;}
.st-about-desc { font-size: 13px; color: var(--lore-text-tertiary); margin-top: 4px;}
</style>
