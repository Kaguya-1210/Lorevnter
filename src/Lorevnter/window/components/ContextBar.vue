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
      title="刷新上下文"
      @click="onRefresh"
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
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  margin: 0 16px;
  background: var(--lore-bg-secondary);
  border-radius: var(--lore-radius-md);
  border: 1px solid var(--lore-border-light);
  min-height: 40px;
}

.context-bar-content {
  flex: 1; display: flex; align-items: center; gap: 10px; overflow: hidden;
}

.context-info {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}

.context-icon { font-size: 16px; }

.context-label {
  font-size: 14px; font-weight: 600; color: var(--lore-text-primary);
  white-space: nowrap; letter-spacing: -0.2px;
}

.context-detail {
  display: flex; align-items: center; gap: 6px; overflow-x: auto; flex: 1;
  -ms-overflow-style: none; scrollbar-width: none; /* 隐藏滚动条 */
}
.context-detail::-webkit-scrollbar { display: none; }

.context-chip {
  font-size: 11px; padding: 3px 10px; border-radius: 12px;
  background: var(--lore-accent-bg); color: var(--lore-accent);
  white-space: nowrap; flex-shrink: 0; font-weight: 500;
}

.context-chip-secondary {
  background: var(--lore-bg-primary); color: var(--lore-text-secondary);
}

.context-chip-global {
  background: var(--lore-danger-bg); color: var(--lore-danger);
}

.context-idle-hint {
  font-size: 13px; color: var(--lore-text-secondary); font-style: italic;
}

.context-refresh {
  background: var(--lore-bg-primary); border: none; font-size: 14px;
  cursor: pointer; padding: 8px;
  border-radius: 50%;
  color: var(--lore-accent);
  transition: all 0.2s ease-out; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  min-width: 32px; min-height: 32px; /* 确保触控区域足够 */
}

.context-refresh:hover { background: var(--lore-border-light); }
.context-refresh.spinning { animation: lore-spin 0.6s linear infinite; }

@keyframes lore-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
