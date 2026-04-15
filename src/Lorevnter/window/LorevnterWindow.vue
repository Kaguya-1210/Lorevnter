<template>
  <div v-show="runtime.windowVisible" class="lorevnter-overlay" @click.self="runtime.windowVisible = false">
    <div class="lorevnter-window" :data-lore-theme="settings.lore_theme">
      <div class="lorevnter-header">
        <span class="lorevnter-title">📖 Lorevnter</span>
        <span class="lorevnter-subtitle">世界书管理</span>
        <button class="lorevnter-close" @click="runtime.windowVisible = false">✕</button>
      </div>

      <ContextBar />

      <div class="lorevnter-tabs">
        <button :class="{ active: runtime.currentTab === 'worldbooks' }" @click="runtime.currentTab = 'worldbooks'">📖 世界书</button>
        <button :class="{ active: runtime.currentTab === 'constraints' }" @click="runtime.currentTab = 'constraints'">📐 约束</button>
        <button :class="{ active: runtime.currentTab === 'presets' }" @click="runtime.currentTab = 'presets'">📦 预设</button>
        <button :class="{ active: runtime.currentTab === 'settings' }" @click="runtime.currentTab = 'settings'">⚙ 设置</button>
        <button
          v-show="settings.lore_debug_mode"
          :class="{ active: runtime.currentTab === 'logs' }"
          @click="runtime.currentTab = 'logs'"
        >🔧 调试</button>
      </div>

      <div class="lorevnter-body">
        <WorldbooksTab v-if="runtime.currentTab === 'worldbooks'" />
        <ConstraintsTab v-else-if="runtime.currentTab === 'constraints'" />
        <PresetsTab v-else-if="runtime.currentTab === 'presets'" />
        <SettingsTab v-else-if="runtime.currentTab === 'settings'" />

        <DebugTab v-else-if="runtime.currentTab === 'logs'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../settings';
import { useRuntimeStore } from '../state';
import ContextBar from './components/ContextBar.vue';
import WorldbooksTab from './tabs/WorldbooksTab.vue';
import ConstraintsTab from './tabs/ConstraintsTab.vue';
import PresetsTab from './tabs/PresetsTab.vue';
import SettingsTab from './tabs/SettingsTab.vue';
import DebugTab from './tabs/DebugTab.vue';

const { settings } = useSettingsStore();
const runtime = useRuntimeStore();
</script>

<style scoped>
.lorevnter-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,.55); z-index: 100000;
  display: flex; align-items: center; justify-content: center;
  animation: lore-fadeIn .2s ease-out;
}
@keyframes lore-fadeIn { from { opacity: 0; } to { opacity: 1; } }

.lorevnter-window {
  --lore-bg-primary: #1e1e2e;
  --lore-bg-secondary: #262637;
  --lore-bg-tertiary: #2e2e45;
  --lore-text-primary: #e0e0f0;
  --lore-text-secondary: #a0a0c0;
  --lore-accent: #7c5bf0;
  --lore-accent-bg: rgba(124,91,240,.1);
  --lore-border: rgba(255,255,255,.08);

  background: var(--lore-bg-primary);
  border-radius: 16px;
  width: min(90vw, 540px);
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 48px rgba(0,0,0,.5);
  border: 1px solid var(--lore-border);
}

.lorevnter-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px; border-bottom: 1px solid var(--lore-border);
}
.lorevnter-title {
  font-size: 16px; font-weight: 700; color: var(--lore-text-primary);
}
.lorevnter-subtitle {
  font-size: 11px; color: var(--lore-text-secondary); margin-top: 2px;
}
.lorevnter-close {
  margin-left: auto; background: none; border: none;
  color: var(--lore-text-secondary); font-size: 16px; cursor: pointer;
  padding: 4px 8px; border-radius: 6px; transition: all .15s;
}
.lorevnter-close:hover { background: var(--lore-bg-tertiary); color: var(--lore-text-primary); }

.lorevnter-tabs {
  display: flex; border-bottom: 1px solid var(--lore-border);
  padding: 0 12px;
}
.lorevnter-tabs button {
  flex: 1; padding: 10px 8px; background: none; border: none;
  color: var(--lore-text-secondary); font-size: 12px; font-weight: 500;
  cursor: pointer; border-bottom: 2px solid transparent;
  transition: all .15s;
}
.lorevnter-tabs button.active {
  color: var(--lore-accent); border-bottom-color: var(--lore-accent);
}
.lorevnter-tabs button:hover {
  color: var(--lore-text-primary); background: var(--lore-bg-secondary);
}

.lorevnter-body {
  flex: 1; overflow-y: auto; padding: 16px;
}
.tab-content { min-height: 200px; }
.tab-placeholder {
  color: var(--lore-text-secondary); font-size: 12px;
  text-align: center; padding: 40px 20px;
}


</style>
