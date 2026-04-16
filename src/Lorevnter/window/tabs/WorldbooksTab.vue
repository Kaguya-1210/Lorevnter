<template>
  <div class="wb-tab">
    <!-- 工具栏 -->
    <div class="wb-toolbar">
      <button class="wb-btn wb-btn-accent" @click="refreshAll">🔄 刷新世界书列表</button>
      <button class="wb-btn wb-btn-ai" @click="onAiAnalyze">🔍 AI 分析</button>
    </div>

    <!-- 功能说明 -->
    <div class="wb-hint-bar">
      💡 此页面用于<strong>浏览和查看</strong>条目内容。如需指定 AI 管理哪些世界书，请到「设置 → 世界书管理」中配置。
    </div>

    <!-- 备份管理 -->
    <div class="wb-section">
      <div class="wb-section-header" @click="showBackups = !showBackups">
        <span>{{ showBackups ? '▼' : '▶' }}</span>
        <span class="wb-section-title" style="margin-bottom:0">📦 备份管理</span>
        <span class="wb-backup-badge" v-if="backupList.length">{{ backupList.length }}</span>
      </div>
      <div v-if="showBackups" class="wb-backup-body">
        <div class="wb-backup-toolbar">
          <button class="wb-btn" @click="onManualBackup" :disabled="!selectedName">💾 手动备份当前</button>
          <button class="wb-btn" @click="onImportBackup">📥 导入</button>
          <button class="wb-btn" @click="onExportAllBackups" :disabled="backupList.length === 0">📤 导出全部</button>
          <button class="wb-btn wb-btn-danger" @click="onClearAllBackups" :disabled="backupList.length === 0">🗑 清空</button>
        </div>
        <input ref="importFileRef" type="file" accept=".json" style="display:none" @change="onImportFileSelected" />

        <div v-if="backupList.length === 0" class="wb-empty">暂无备份</div>
        <div v-else class="wb-backup-list">
          <div v-for="bk in backupList" :key="bk.id" class="wb-backup-item">
            <div class="wb-backup-info">
              <span class="wb-backup-name">📖 {{ bk.worldbookName }}</span>
              <span class="wb-backup-meta">{{ bk.entryCount }} 条 · {{ formatBackupTime(bk.timestamp) }} · {{ bk.triggerType === 'auto' ? '自动' : '手动' }}</span>
            </div>
            <div class="wb-backup-actions">
              <button class="wb-mini-btn" @click="onRestoreBackup(bk)" title="还原">↩</button>
              <button class="wb-mini-btn wb-mini-danger" @click="onDeleteBackup(bk)" title="删除">✕</button>
            </div>
          </div>
        </div>

        <!-- 还原确认弹窗 -->
        <div v-if="restoreConfirm" class="wb-confirm-overlay">
          <div class="wb-confirm-box">
            <div class="wb-confirm-title">⚠️ 确认还原</div>
            <div class="wb-confirm-text">
              此操作将覆盖「{{ restoreConfirm.worldbookName }}」的全部 {{ restoreConfirm.entryCount }} 个条目，不可撤销。
            </div>
            <div class="wb-confirm-actions">
              <button class="wb-btn" @click="restoreConfirm = null">取消</button>
              <button
                class="wb-btn wb-btn-danger"
                :disabled="restoreCountdown > 0"
                @click="confirmRestore"
              >
                {{ restoreCountdown > 0 ? `确认还原 (${restoreCountdown}s)` : '确认还原' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 激活状态 -->
    <div v-if="activeInfo" class="wb-active-section">
      <div class="wb-section-title">当前激活</div>
      <div class="wb-active-tags">
        <span v-for="name in activeInfo.global" :key="'g-'+name" class="wb-tag wb-tag-global" @click="onSelectTag(name)">🌐 {{ name }}</span>
        <span v-if="activeInfo.character.primary" class="wb-tag wb-tag-char" @click="onSelectTag(activeInfo.character.primary!)">👤 {{ activeInfo.character.primary }}</span>
        <span v-for="name in activeInfo.character.additional" :key="'ca-'+name" class="wb-tag wb-tag-char" @click="onSelectTag(name)">👤 {{ name }}</span>
        <span v-if="activeInfo.chat" class="wb-tag wb-tag-chat" @click="onSelectTag(activeInfo.chat!)">💬 {{ activeInfo.chat }}</span>
        <span v-if="!activeInfo.global.length && !activeInfo.character.primary && !activeInfo.character.additional.length && !activeInfo.chat" class="wb-empty">无激活的世界书</span>
      </div>
    </div>

    <!-- 世界书选择（下拉框） -->
    <div class="wb-select-section">
      <div class="wb-section-title">浏览世界书条目</div>
      <select v-model="selectedName" class="wb-select" @change="onSelectChange">
        <option :value="null">选择一本世界书...</option>
        <option v-for="name in allNames" :key="name" :value="name">
          {{ name }}{{ entryCounts[name] ? ` (${entryCounts[name]} 条)` : '' }}
        </option>
      </select>
    </div>

    <!-- 条目浏览 -->
    <template v-if="selectedName && entries.length > 0">
      <div class="wb-section-title">{{ selectedName }} — {{ entries.length }} 条条目</div>
      <div class="wb-entries">
        <div v-for="entry in entries" :key="entry.uid" class="wb-entry" :class="{ disabled: !entry.enabled }">
          <div class="wb-entry-header">
            <span class="wb-entry-strategy" :class="getStrategyClass(entry)" :title="getStrategyTitle(entry)">{{ getStrategyIcon(entry) }}</span>
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
import { runUpdatePipeline } from '../../core/update-pipeline';
import { createLogger } from '../../logger';
import * as BackupManager from '../../core/backup-manager';
import type { BackupRecord } from '../../core/backup-manager';

const logger = createLogger('worldbooks-tab');
const runtime = useRuntimeStore();

const allNames = ref<string[]>([]);
const entryCounts = ref<Record<string, number>>({});
const selectedName = computed({
  get: () => runtime.worldbookSelectedName,
  set: (v) => { runtime.worldbookSelectedName = v; },
});
const entries = ref<WorldbookEntry[]>([]);
const loading = ref(false);
const activeInfo = ref<ReturnType<typeof WorldbookAPI.getActive> | null>(null);

function refreshAll(silent = false) {
  try {
    allNames.value = WorldbookAPI.listAll();
    activeInfo.value = WorldbookAPI.getActive();
    logger.info(`已刷新世界书列表: ${allNames.value.length} 个`);
    if (!silent) toastr.success(`已刷新: ${allNames.value.length} 个世界书`, 'Lorevnter');
  } catch (e) {
    logger.error(`刷新世界书列表失败: ${(e as Error).message}`);
    toastr.error('刷新世界书列表失败', 'Lorevnter');
  }
}

async function loadEntries(name: string, silent = false) {
  if (loading.value) return; // 防止重复加载
  loading.value = true;
  try {
    entries.value = await WorldbookAPI.fetch(name);
    entryCounts.value[name] = entries.value.length;
    if (!silent) toastr.success(`已加载: ${name} (${entries.value.length} 条)`, 'Lorevnter');
  } catch (e) {
    logger.error(`加载世界书失败: ${(e as Error).message}`);
    toastr.error(`加载失败: ${name}`, 'Lorevnter');
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

/** 激活标签点击：同名不重复加载 */
function onSelectTag(name: string) {
  if (selectedName.value === name && entries.value.length > 0) return;
  selectedName.value = name;
  loadEntries(name);
}

function onSelectChange() {
  if (selectedName.value) {
    loadEntries(selectedName.value);
  } else {
    entries.value = [];
  }
}

async function onAiAnalyze() {
  await runUpdatePipeline();
  if (selectedName.value) {
    try {
      entries.value = await WorldbookAPI.fetch(selectedName.value);
    } catch (e) { logger.warn(`AI 分析后刷新条目失败: ${(e as Error).message}`); }
  }
}

// ── 备份管理 ──

const showBackups = ref(false);
const backupList = ref<BackupRecord[]>([]);
const restoreConfirm = ref<BackupRecord | null>(null);
const restoreCountdown = ref(0);
const importFileRef = ref<HTMLInputElement | null>(null);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function refreshBackups() {
  backupList.value = BackupManager.getBackups();
}

async function onManualBackup() {
  if (!selectedName.value) {
    toastr.warning('请先在下方选择一本世界书', 'Lorevnter');
    return;
  }
  try {
    toastr.info(`正在备份: ${selectedName.value}...`, 'Lorevnter');
    const result = await BackupManager.createBackup(selectedName.value, 'manual');
    if (result) {
      toastr.success(`已备份: ${result.worldbookName} (${result.entryCount} 条)`, 'Lorevnter');
    } else {
      toastr.info('无需备份（内容无变化或无条目）', 'Lorevnter');
    }
    refreshBackups();
  } catch (e) {
    toastr.error(`备份失败: ${(e as Error).message}`, 'Lorevnter');
    logger.error(`手动备份失败: ${(e as Error).message}`);
  }
}

function onRestoreBackup(bk: BackupRecord) {
  restoreConfirm.value = bk;
  restoreCountdown.value = 3;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    restoreCountdown.value--;
    if (restoreCountdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
}

async function confirmRestore() {
  if (!restoreConfirm.value) return;
  const ok = await BackupManager.restoreBackup(restoreConfirm.value.id);
  if (ok) {
    toastr.success(`已还原: ${restoreConfirm.value.worldbookName}`, 'Lorevnter');
    // 刷新当前浏览
    if (selectedName.value === restoreConfirm.value.worldbookName) {
      await loadEntries(selectedName.value, true);
    }
  } else {
    toastr.error('还原失败', 'Lorevnter');
  }
  restoreConfirm.value = null;
}

function onDeleteBackup(bk: BackupRecord) {
  BackupManager.deleteBackup(bk.id);
  toastr.info(`已删除备份`, 'Lorevnter');
  refreshBackups();
}

function onClearAllBackups() {
  if (!confirm('确定要清空所有备份吗？此操作不可撤销。')) return;
  BackupManager.clearAllBackups();
  toastr.info('所有备份已清空', 'Lorevnter');
  refreshBackups();
}

function onExportAllBackups() {
  const json = BackupManager.exportBackups();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lorevnter-backups-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toastr.success('备份已导出', 'Lorevnter');
}

function onImportBackup() {
  importFileRef.value?.click();
}

function onImportFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const count = BackupManager.importBackups(reader.result as string);
    toastr.success(`已导入 ${count} 条备份`, 'Lorevnter');
    refreshBackups();
  };
  reader.readAsText(file);
  // 重置以允许重复选择同一文件
  (e.target as HTMLInputElement).value = '';
}

function formatBackupTime(ts: number): string {
  const d = new Date(ts);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ── 蓝灯/绿灯策略图标（纯 UI 辅助） ──

function getStrategyIcon(entry: WorldbookEntry): string {
  if (!entry.enabled) return '⚫';
  switch (entry.strategy?.type) {
    case 'constant': return '🔵';
    case 'selective': return '🟢';
    case 'vectorized': return '🔗';
    default: return '●';
  }
}

function getStrategyClass(entry: WorldbookEntry): string {
  if (!entry.enabled) return 'strategy-off';
  switch (entry.strategy?.type) {
    case 'constant': return 'strategy-constant';
    case 'selective': return 'strategy-selective';
    case 'vectorized': return 'strategy-vector';
    default: return '';
  }
}

function getStrategyTitle(entry: WorldbookEntry): string {
  if (!entry.enabled) return '已禁用';
  switch (entry.strategy?.type) {
    case 'constant': return '蓝灯 — 常量激活';
    case 'selective': return '绿灯 — 关键字匹配激活';
    case 'vectorized': return '向量化';
    default: return '未知策略';
  }
}

onMounted(async () => {
  refreshAll(true); // 挂载时静默刷新
  refreshBackups(); // 刷新备份列表
  if (selectedName.value) {
    await loadEntries(selectedName.value, true); // 恢复时静默加载
  }
});
</script>

<style scoped>
.wb-tab { display: flex; flex-direction: column; gap: 16px; }

.wb-toolbar { display: flex; gap: 10px; flex-wrap: wrap; }
.wb-btn {
  flex: 1; min-width: 120px;
  padding: 10px 14px; border-radius: var(--lore-radius-md); border: none;
  background: var(--lore-bg-secondary); color: var(--lore-text-primary);
  font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  min-height: 44px; /* 触控最小区域 */
}
.wb-btn:active { transform: scale(0.98); }
.wb-btn-accent { color: var(--lore-accent); }
.wb-btn-ai { color: var(--lore-success); }

/* 功能提示栏 */
.wb-hint-bar {
  font-size: 13px; color: var(--lore-text-secondary); line-height: 1.5;
  padding: 10px 14px; border-radius: var(--lore-radius-md);
  background: var(--lore-accent-bg); border: 1px solid var(--lore-border-light);
}
.wb-hint-bar strong { color: var(--lore-accent); font-weight: 600; }

/* Section 基础 (Inset Grouped) */
.wb-section-title {
  font-size: 13px; font-weight: 500; color: var(--lore-text-secondary);
  text-transform: uppercase; margin-bottom: -6px; padding-left: 8px;
}

.wb-active-section { display: flex; flex-direction: column; gap: 10px; }
.wb-active-tags {
  display: flex; flex-wrap: nowrap; gap: 6px;
  overflow-x: auto; padding-bottom: 4px; scrollbar-width: none;
}
.wb-active-tags::-webkit-scrollbar { display: none; }
.wb-tag {
  padding: 4px 10px; border-radius: 12px; font-size: 12px; cursor: pointer; transition: all .15s;
  font-weight: 500; letter-spacing: -0.2px; white-space: nowrap; flex-shrink: 0;
}
.wb-tag-global { background: var(--lore-danger-bg); color: var(--lore-danger); }
.wb-tag-char { background: var(--lore-accent-bg); color: var(--lore-accent); }
.wb-tag-chat { background: var(--lore-success-bg); color: var(--lore-success); }
.wb-tag:hover { filter: contrast(1.2); }

/* 下拉选择器 */
.wb-select-section { display: flex; flex-direction: column; gap: 10px; }
.wb-select {
  width: 100%; padding: 10px 14px; border-radius: var(--lore-radius-md);
  border: 1px solid var(--lore-border-light); background: var(--lore-bg-secondary);
  color: var(--lore-text-primary); font-size: 15px; cursor: pointer;
  outline: none; transition: border-color 0.2s; min-height: 44px;
  appearance: auto;
}
.wb-select:focus { border-color: var(--lore-accent); }

/* 条目 */
.wb-entries {
  display: flex; flex-direction: column; gap: 10px;
  max-height: 30vh; overflow-y: auto; padding-right: 4px;
}
.wb-entry {
  padding: 12px; border-radius: var(--lore-radius-md); background: var(--lore-bg-secondary);
  transition: all .12s; border: 1px solid transparent;
}
.wb-entry.disabled { opacity: 0.5; }
.wb-entry-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.wb-entry-strategy { font-size: 12px; flex-shrink: 0; }
.wb-entry-name { font-size: 15px; font-weight: 500; color: var(--lore-text-primary); flex: 1; letter-spacing: -0.2px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-entry-uid { font-size: 11px; color: var(--lore-text-secondary); font-family: -apple-system, monospace; flex-shrink: 0; }
.wb-entry-content {
  font-size: 13px; color: var(--lore-text-secondary); line-height: 1.4;
  word-break: break-word; overflow-wrap: break-word;
}

.wb-empty { font-size: 14px; color: var(--lore-text-secondary); text-align: center; padding: 20px; }
.wb-loading { font-size: 14px; color: var(--lore-text-secondary); text-align: center; padding: 16px; }

/* 备份管理 */
.wb-section { margin-bottom: 12px; }
.wb-section-header {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  padding: 10px 12px; border-radius: var(--lore-radius-sm);
  background: var(--lore-bg-secondary); border: 1px solid var(--lore-border-light);
  transition: background 0.15s; min-height: 44px;
}
.wb-section-header:hover { background: var(--lore-bg-tertiary); }
.wb-backup-badge {
  background: var(--lore-accent); color: #fff; font-size: 11px; font-weight: 700;
  padding: 1px 7px; border-radius: 10px; margin-left: auto;
}
.wb-backup-body { padding: 10px 0; }
.wb-backup-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.wb-btn-danger { border-color: var(--lore-danger); color: var(--lore-danger); }
.wb-btn-danger:hover { background: var(--lore-danger-bg); }
.wb-backup-list { display: flex; flex-direction: column; gap: 6px; }
.wb-backup-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-radius: var(--lore-radius-sm);
  background: var(--lore-bg-primary); border: 1px solid var(--lore-border-light);
  gap: 10px;
}
.wb-backup-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.wb-backup-name { font-size: 13px; font-weight: 500; color: var(--lore-text-primary); }
.wb-backup-meta { font-size: 11px; color: var(--lore-text-tertiary); }
.wb-backup-actions { display: flex; gap: 4px; flex-shrink: 0; }
.wb-mini-btn {
  padding: 4px 8px; border: 1px solid var(--lore-border-light);
  border-radius: 4px; background: var(--lore-bg-secondary); cursor: pointer;
  font-size: 13px; min-width: 32px; min-height: 32px;
  display: flex; align-items: center; justify-content: center;
  color: var(--lore-text-primary); transition: background 0.15s;
}
.wb-mini-btn:hover { background: var(--lore-bg-tertiary); }
.wb-mini-danger:hover { background: var(--lore-danger-bg); color: var(--lore-danger); }

/* 还原确认弹窗 */
.wb-confirm-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,0.5); z-index: 100002;
  display: flex; justify-content: center; align-items: center;
}
.wb-confirm-box {
  background: var(--lore-glass-bg); backdrop-filter: blur(20px);
  border-radius: var(--lore-radius-lg); border: 1px solid var(--lore-border-light);
  padding: 24px; max-width: 360px; width: 90vw;
  box-shadow: 0 16px 48px rgba(0,0,0,0.3);
}
.wb-confirm-title { font-size: 16px; font-weight: 600; color: var(--lore-text-primary); margin-bottom: 10px; }
.wb-confirm-text { font-size: 13px; color: var(--lore-text-secondary); line-height: 1.5; margin-bottom: 16px; }
.wb-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
