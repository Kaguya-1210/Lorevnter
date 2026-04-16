<template>
  <div v-show="runtime.windowVisible" class="lorevnter-overlay" @click.self="runtime.windowVisible = false">
    <div class="lorevnter-window" :data-lore-theme="settings.lore_theme">
      
      <!-- iOS Panel Grabber -->
      <div class="lorevnter-grabber-box" @click="runtime.windowVisible = false">
        <div class="lorevnter-grabber"></div>
      </div>

      <div class="lorevnter-header">
        <span class="lorevnter-title">📖 Lorevnter</span>
        <span class="lorevnter-subtitle">世界书管理</span>
      </div>

      <ContextBar />

      <div class="lorevnter-tabs-container">
        <div class="lorevnter-tabs">
          <button :class="{ active: runtime.currentTab === 'worldbooks' }" @click="runtime.currentTab = 'worldbooks'">世界书</button>
          <button :class="{ active: runtime.currentTab === 'constraints' }" @click="runtime.currentTab = 'constraints'">约束</button>
          <button :class="{ active: runtime.currentTab === 'presets' }" @click="runtime.currentTab = 'presets'">预设</button>
          <button :class="{ active: runtime.currentTab === 'settings' }" @click="runtime.currentTab = 'settings'">设置</button>
          <button
            v-show="settings.lore_debug_mode"
            :class="{ active: runtime.currentTab === 'logs' }"
            @click="runtime.currentTab = 'logs'"
          >调试</button>
        </div>
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
  background: var(--lore-overlay); z-index: 100000;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
  animation: lore-fade-in 0.3s ease-out;
  touch-action: manipulation; /* 消除双击缩放延迟 */
  -webkit-tap-highlight-color: transparent;
}

.lorevnter-window {
  /* 基础面板设置 */
  background: var(--lore-glass-bg);
  -webkit-backdrop-filter: blur(25px) saturate(200%);
  backdrop-filter: blur(25px) saturate(200%);
  border-radius: var(--lore-radius-lg) var(--lore-radius-lg) 0 0;
  width: min(100vw, 540px);
  max-height: 85vh;
  height: auto;
  min-height: min(400px, 50vh); /* 小屏不超出屏幕 */
  display: flex;
  flex-direction: column;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.2);
  border: 1px solid var(--lore-border-light);
  border-bottom: none;
  animation: lore-slide-up 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  padding-bottom: max(20px, env(safe-area-inset-bottom, 20px)); /* iPhone 安全区域 */
  position: relative;
  overflow: hidden;
}

/* 顶部 Grabber */
.lorevnter-grabber-box {
  width: 100%; height: 34px; /* ≥ 44pt 触控区域（含上下 padding） */
  display: flex; justify-content: center; align-items: center;
  cursor: pointer;
  padding: 10px 0 0;
}
.lorevnter-grabber {
  width: 36px; height: 5px;
  background-color: var(--lore-text-tertiary);
  border-radius: 3px;
}

/* Header */
.lorevnter-header {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 0 20px 14px;
}
.lorevnter-title {
  font-size: 17px; font-weight: 600; color: var(--lore-text-primary);
  letter-spacing: -0.41px;
}
.lorevnter-subtitle {
  font-size: 13px; color: var(--lore-text-secondary);
}

/* 分段控制器 Tabs (Segmented Control, 可滚动) */
.lorevnter-tabs-container {
  padding: 10px 16px;
}
.lorevnter-tabs {
  display: flex; padding: 2px;
  background: var(--lore-bg-primary);
  border-radius: var(--lore-radius-sm);
  border: 1px solid var(--lore-border-light);
  overflow-x: auto; flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch; /* iOS 惯性滚动 */
  touch-action: pan-x; /* 精准横划 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.lorevnter-tabs::-webkit-scrollbar { display: none; }
.lorevnter-tabs button {
  flex: 1 0 auto; min-width: fit-content;
  padding: 6px 12px; background: transparent; border: none;
  color: var(--lore-text-primary); font-size: 13px; font-weight: 500;
  cursor: pointer; border-radius: 6px; white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.lorevnter-tabs button.active {
  background: var(--lore-bg-secondary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  font-weight: 600;
}

/* Body */
.lorevnter-body {
  flex: 1; overflow-y: auto; padding: 0 16px;
  display: flex; flex-direction: column; gap: 16px;
  -webkit-overflow-scrolling: touch; /* iOS 惯性滚动 */
  overscroll-behavior: contain; /* 防止滚动穿透 */
  padding-bottom: 16px;
}
.tab-content { min-height: 200px; }
.tab-placeholder {
  color: var(--lore-text-secondary); font-size: 13px;
  text-align: center; padding: 40px 20px;
}
</style>
