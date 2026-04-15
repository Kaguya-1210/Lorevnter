<template>
  <div class="context-bar">
    <div class="context-bar-content">
      <!-- 模式图标 + 来源 -->
      <div class="context-info">
        <span class="context-icon">{{ modeIcon }}</span>
        <span class="context-label">{{ ctx.context.sourceLabel }}</span>
      </div>

      <!-- 世界书概要 -->
      <div v-if="ctx.context.mode !== 'idle'" class="context-detail">
        <span v-if="ctx.context.character.primary" class="context-chip">
          📕 {{ ctx.context.character.primary }}
        </span>
        <span v-if="ctx.context.character.additional.length > 0" class="context-chip context-chip-secondary">
          📎 +{{ ctx.context.character.additional.length }}
        </span>
        <span v-for="g in ctx.context.global" :key="g" class="context-chip context-chip-global">
          🌐 {{ g }}
        </span>
      </div>

      <!-- 空闲提示 -->
      <div v-else class="context-idle-hint">
        请打开角色卡或设置全局世界书
      </div>
    </div>

    <!-- 刷新按钮 -->
    <button
      class="context-refresh"
      :class="{ spinning: ctx.refreshing }"
      :disabled="ctx.refreshing"
      @click="onRefresh"
      title="刷新上下文"
    >
      🔄
    </button>
  </div>
</template>

<script setup lang="ts">
import { useContextStore } from '../../core/worldbook-context';

const ctx = useContextStore();

const modeIcon = computed(() => {
  switch (ctx.context.mode) {
    case 'character': return '👤';
    case 'global': return '🌐';
    default: return '💤';
  }
});

function onRefresh() {
  try {
    ctx.refresh();
    toastr.success('上下文已刷新', 'Lorevnter');
  } catch {
    toastr.error('刷新失败', 'Lorevnter');
  }
}
</script>

<style scoped>
.context-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--lore-bg-secondary);
  border-bottom: 1px solid var(--lore-border);
  min-height: 36px;
}

.context-bar-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.context-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.context-icon {
  font-size: 14px;
}

.context-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--lore-text-primary);
  white-space: nowrap;
}

.context-detail {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  flex: 1;
}

.context-chip {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--lore-accent-bg);
  color: var(--lore-accent);
  white-space: nowrap;
  flex-shrink: 0;
}

.context-chip-secondary {
  background: rgba(255, 255, 255, 0.05);
  color: var(--lore-text-secondary);
}

.context-chip-global {
  background: rgba(80, 200, 120, 0.1);
  color: #50c878;
}

.context-idle-hint {
  font-size: 11px;
  color: var(--lore-text-secondary);
  font-style: italic;
}

.context-refresh {
  background: none;
  border: none;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s ease-out;
  flex-shrink: 0;
}

.context-refresh:hover {
  background: var(--lore-bg-tertiary);
}

.context-refresh.spinning {
  animation: lore-spin 0.6s linear infinite;
}

@keyframes lore-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
