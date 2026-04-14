<template>
  <div class="wb-tab">
    <!-- 工具栏 -->
    <div class="wb-toolbar">
      <button class="wb-btn wb-btn-accent" @click="refreshAll">🔄 刷新世界书列表</button>
    </div>

    <!-- 激活状态 -->
    <div v-if="activeInfo" class="wb-active-section">
      <div class="wb-section-title">当前激活</div>
      <div class="wb-active-tags">
        <span v-for="name in activeInfo.global" :key="'g-'+name" class="wb-tag wb-tag-global" @click="selectWorldbook(name)">🌐 {{ name }}</span>
        <span v-if="activeInfo.character.primary" class="wb-tag wb-tag-char" @click="selectWorldbook(activeInfo.character.primary!)">👤 {{ activeInfo.character.primary }}</span>
        <span v-for="name in activeInfo.character.additional" :key="'ca-'+name" class="wb-tag wb-tag-char" @click="selectWorldbook(name)">👤 {{ name }}</span>
        <span v-if="activeInfo.chat" class="wb-tag wb-tag-chat" @click="selectWorldbook(activeInfo.chat!)">💬 {{ activeInfo.chat }}</span>
        <span v-if="!activeInfo.global.length && !activeInfo.character.primary && !activeInfo.character.additional.length && !activeInfo.chat" class="wb-empty">无激活的世界书</span>
      </div>
    </div>

    <!-- 世界书列表 -->
    <div class="wb-section-title">全部世界书 ({{ allNames.length }})</div>
    <div class="wb-list">
      <div
        v-for="name in allNames"
        :key="name"
        class="wb-item"
        :class="{ active: selectedName === name }"
        @click="selectWorldbook(name)"
      >
        <span class="wb-item-name">{{ name }}</span>
        <span v-if="runtime.worldBookCache[name]" class="wb-item-count">{{ runtime.worldBookCache[name].length }} 条</span>
      </div>
      <div v-if="allNames.length === 0" class="wb-empty">未找到世界书</div>
    </div>

    <!-- 条目浏览 -->
    <template v-if="selectedName && entries.length > 0">
      <div class="wb-section-title">{{ selectedName }} — {{ entries.length }} 条条目</div>
      <div class="wb-entries">
        <div v-for="entry in entries" :key="entry.uid" class="wb-entry" :class="{ disabled: !entry.enabled }">
          <div class="wb-entry-header">
            <span class="wb-entry-status" :class="entry.enabled ? 'on' : 'off'">{{ entry.enabled ? '●' : '○' }}</span>
            <span class="wb-entry-name">{{ entry.name || '(未命名)' }}</span>
            <span class="wb-entry-uid">uid:{{ entry.uid }}</span>
          </div>
          <div v-if="entry.content" class="wb-entry-content">{{ entry.content.slice(0, 120) }}{{ entry.content.length > 120 ? '…' : '' }}</div>
        </div>
      </div>
    </template>
    <div v-else-if="selectedName && !loading" class="wb-empty">该世界书无条目</div>
    <div v-if="loading" class="wb-loading">加载中...</div>
  </div>
</template>

<script setup lang="ts">
import { useRuntimeStore } from '../../state';
import * as WorldbookAPI from '../../core/worldbook-api';
import { createLogger } from '../../logger';

const logger = createLogger('worldbooks-tab');
const runtime = useRuntimeStore();

const allNames = ref<string[]>([]);
const selectedName = ref<string | null>(null);
const entries = ref<WorldbookEntry[]>([]);
const loading = ref(false);
const activeInfo = ref<ReturnType<typeof WorldbookAPI.getActive> | null>(null);

function refreshAll() {
  allNames.value = WorldbookAPI.listAll();
  activeInfo.value = WorldbookAPI.getActive();
  logger.info(`已刷新世界书列表: ${allNames.value.length} 个`);
}

async function selectWorldbook(name: string) {
  selectedName.value = name;
  loading.value = true;
  try {
    entries.value = await WorldbookAPI.fetch(name);
  } catch (e) {
    logger.error(`加载世界书失败: ${(e as Error).message}`);
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refreshAll();
});
</script>

<style scoped>
.wb-tab { display: flex; flex-direction: column; gap: 12px; }

.wb-toolbar { display: flex; gap: 8px; }
.wb-btn {
  padding: 6px 12px; border-radius: 6px; border: 1px solid var(--lore-border);
  background: var(--lore-bg-secondary); color: var(--lore-text-secondary);
  font-size: 12px; cursor: pointer; transition: all .15s;
}
.wb-btn:hover { background: var(--lore-bg-tertiary); color: var(--lore-text-primary); }
.wb-btn-accent { border-color: var(--lore-accent); color: var(--lore-accent); }
.wb-btn-accent:hover { background: var(--lore-accent-bg); }

.wb-section-title {
  font-size: 11px; font-weight: 600; color: var(--lore-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px;
}

.wb-active-section { display: flex; flex-direction: column; gap: 6px; }
.wb-active-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.wb-tag {
  padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: all .15s;
}
.wb-tag-global { background: rgba(100,180,255,.12); color: #7eb8da; }
.wb-tag-char { background: rgba(180,130,255,.12); color: #b88cff; }
.wb-tag-chat { background: rgba(100,220,160,.12); color: #6edca0; }
.wb-tag:hover { filter: brightness(1.3); }

.wb-list {
  display: flex; flex-direction: column; gap: 2px;
  max-height: 160px; overflow-y: auto;
}
.wb-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; border-radius: 6px; cursor: pointer;
  font-size: 12px; color: var(--lore-text-primary); transition: all .12s;
}
.wb-item:hover { background: var(--lore-bg-secondary); }
.wb-item.active { background: var(--lore-accent-bg); border-left: 2px solid var(--lore-accent); }
.wb-item-count { font-size: 10px; color: var(--lore-text-secondary); }

.wb-entries {
  display: flex; flex-direction: column; gap: 4px;
  max-height: 300px; overflow-y: auto;
}
.wb-entry {
  padding: 8px 10px; border-radius: 6px; background: var(--lore-bg-secondary);
  border: 1px solid var(--lore-border); transition: all .12s;
}
.wb-entry.disabled { opacity: 0.5; }
.wb-entry-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.wb-entry-status { font-size: 10px; }
.wb-entry-status.on { color: #4caf50; }
.wb-entry-status.off { color: #666; }
.wb-entry-name { font-size: 12px; font-weight: 600; color: var(--lore-text-primary); flex: 1; }
.wb-entry-uid { font-size: 10px; color: var(--lore-text-secondary); font-family: monospace; }
.wb-entry-content {
  font-size: 11px; color: var(--lore-text-secondary); line-height: 1.4;
  word-break: break-all;
}

.wb-empty { font-size: 12px; color: var(--lore-text-secondary); text-align: center; padding: 20px; }
.wb-loading { font-size: 12px; color: var(--lore-accent); text-align: center; padding: 16px; }
</style>
