<template>
  <div class="ct-tab">
    <!-- 约束列表 -->
    <div class="ct-section">
      <div class="ct-section-title">约束列表</div>
      <div class="ct-list">
        <div
          v-for="c in constraints"
          :key="c.id"
          class="ct-card"
          :class="{ active: selectedId === c.id, disabled: !c.enabled }"
          @click="selectedId = c.id"
        >
          <div class="ct-card-header">
            <span class="ct-card-icon">{{ c.type === 'skip' ? '🚫' : '🏷' }}</span>
            <span class="ct-card-name">{{ c.name }}</span>
            <span class="ct-card-scope" :class="c.scope ?? 'global'">{{ (c.scope ?? 'global') === 'global' ? '全局' : '局部' }}</span>
          </div>
          <div v-if="c.type === 'prompt' && c.instruction" class="ct-card-preview">
            {{ c.instruction.slice(0, 60) }}{{ c.instruction.length > 60 ? '…' : '' }}
          </div>
          <div v-else-if="c.type === 'skip'" class="ct-card-preview ct-skip-hint">
            标记为跳过的条目不会发给 AI
          </div>
        </div>
        <div v-if="constraints.length === 0" class="ct-empty">暂无约束，点击下方按钮创建</div>
      </div>
      <div class="ct-actions">
        <button class="ct-btn ct-btn-accent" @click="showCreateDialog = true">+ 新建约束</button>
      </div>
    </div>

    <!-- 编辑选中的约束 -->
    <template v-if="selected">
      <div class="ct-section">
        <div class="ct-section-title">编辑约束</div>
        <div class="ct-form">
          <label class="ct-label">
            名称
            <input v-model="selected.name" class="ct-input" placeholder="约束名称" />
          </label>
          <label class="ct-label">
            类型
            <select v-model="selected.type" class="ct-select">
              <option value="prompt">🏷 提示词</option>
              <option value="skip">🚫 跳过</option>
            </select>
          </label>
          <label class="ct-label">
            作用域
            <select v-model="selected.scope" class="ct-select">
              <option value="global">🌐 全局（跨角色卡复用）</option>
              <option value="local">📌 局部（仅当前角色卡）</option>
            </select>
          </label>
          <label v-if="selected.type === 'prompt'" class="ct-label">
            提示词模板
            <textarea
              v-model="selected.instruction"
              class="ct-textarea"
              placeholder="支持宏: {{entry_name}} {{entry_content}} {{char}} 等"
              rows="4"
            />
          </label>
          <label class="ct-label ct-toggle-label">
            <span>启用约束</span>
            <input v-model="selected.enabled" type="checkbox" class="ios-toggle" />
          </label>
          <label v-if="selected.type === 'prompt'" class="ct-label ct-toggle-label">
            <span>绑定到用户人设</span>
            <input type="checkbox" :checked="isPersonaBound" class="ios-toggle" @change="onTogglePersonaBind" />
          </label>
          <div class="ct-form-actions">
            <button class="ct-btn ct-btn-danger" @click="onDelete">🗑 删除</button>
          </div>
        </div>
      </div>

      <!-- 条目绑定 -->
      <div class="ct-section">
        <div class="ct-section-title">
          条目绑定
          <span v-if="bindWorldbook" class="ct-bind-wb-label">{{ bindWorldbook }}</span>
        </div>
        <div v-if="!bindWorldbook" class="ct-empty">请先打开角色卡</div>
        <template v-else>
          <!-- 搜索 + 操作栏 -->
          <div class="entry-popup-toolbar" style="padding: 0 0 8px 0; border: none;">
            <input
              v-model="bindSearchQuery"
              type="text"
              class="entry-popup-search"
              placeholder="🔍 搜索条目..."
            />
            <div class="entry-popup-actions">
              <span class="entry-filter-stat">已绑 {{ bindSelectedCount }} / 全部 {{ bindEntries.length }}</span>
              <button class="entry-filter-btn" @click="onBindSelectAll">全选</button>
              <button class="entry-filter-btn" @click="onBindClearAll">清空</button>
              <button class="entry-filter-btn" @click="onBindInvert">反选</button>
            </div>
          </div>

          <!-- 条目列表 -->
          <div v-if="bindLoading" class="ct-loading">加载中...</div>
          <div v-else class="ct-bind-entries">
            <div v-if="filteredBindEntries.length === 0" class="ct-empty">
              {{ bindEntries.length === 0 ? '该世界书无条目' : '无匹配条目' }}
            </div>
            <label
              v-for="entry in filteredBindEntries"
              :key="entry.uid"
              class="ct-bind-entry"
              :class="{ 'ct-bind-entry-bound': isEntryBound(entry) }"
            >
              <input
                type="checkbox"
                class="entry-filter-checkbox"
                :checked="isEntryBound(entry)"
                @change="onToggleBind(entry, $event)"
              />
              <span class="ct-bind-entry-name">{{ entry.name || '(未命名)' }}</span>
              <span v-if="isBoundToOther(entry)" class="ct-bind-entry-other">
                (已绑定其他)
              </span>
            </label>
          </div>
        </template>
      </div>
    </template>

    <!-- 新建对话框 -->
    <div v-if="showCreateDialog" class="ct-dialog-overlay" @click.self="showCreateDialog = false">
      <div class="ct-dialog">
        <div class="ct-dialog-title">新建约束</div>
        <label class="ct-label">
          名称
          <input v-model="newName" class="ct-input" placeholder="约束名称" />
        </label>
        <label class="ct-label">
          类型
          <select v-model="newType" class="ct-select">
            <option value="prompt">🏷 提示词</option>
            <option value="skip">🚫 跳过</option>
          </select>
        </label>
        <label class="ct-label">
          作用域
          <select v-model="newScope" class="ct-select">
            <option value="global">🌐 全局（跨角色卡复用）</option>
            <option value="local">📌 局部（仅当前角色卡）</option>
          </select>
        </label>
        <div class="ct-dialog-actions">
          <button class="ct-btn" @click="showCreateDialog = false">取消</button>
          <button class="ct-btn ct-btn-accent" :disabled="!newName.trim()" @click="onCreate">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore, type LoreConstraint } from '../../settings';
import * as Constraints from '../../core/constraints';
import * as WorldbookAPI from '../../core/worldbook-api';
import { useContextStore } from '../../core/worldbook-context';

const { settings } = useSettingsStore();
const ctx = useContextStore();

// ── 约束列表 ──
const constraints = computed(() => settings.lore_constraints);
const selectedId = ref<string | null>(null);
const selected = computed(() =>
  selectedId.value ? constraints.value.find(c => c.id === selectedId.value) ?? null : null,
);

// ── 新建 ──
const showCreateDialog = ref(false);
const newName = ref('');
const newType = ref<LoreConstraint['type']>('prompt');
const newScope = ref<'global' | 'local'>('global');

function onCreate() {
  if (!newName.value.trim()) return;
  const c = Constraints.createConstraint(newName.value.trim(), newType.value, '', newScope.value);
  selectedId.value = c.id;
  showCreateDialog.value = false;
  newName.value = '';
  newType.value = 'prompt';
  newScope.value = 'global';
}

function onDelete() {
  if (!selected.value) return;
  const name = selected.value.name;
  if (!confirm(`确认删除约束「${name}」？`)) return;
  // 如果删除的约束绑定了人设，同时清空绑定
  if (settings.lore_persona_constraint_id === selected.value.id) {
    settings.lore_persona_constraint_id = '';
    settings.lore_persona_constraint_character_id = '';
  }
  Constraints.deleteConstraint(selected.value.id);
  selectedId.value = null;
}

// ── 人设绑定 ──
const isPersonaBound = computed(() =>
  selected.value
    ? settings.lore_persona_constraint_id === selected.value.id
      && (
        (selected.value.scope ?? 'global') !== 'local'
        || settings.lore_persona_constraint_character_id === (ctx.context.characterScopeKey ?? '')
      )
    : false,
);

function onTogglePersonaBind() {
  if (!selected.value) return;
  if (isPersonaBound.value) {
    // 解绑
    settings.lore_persona_constraint_id = '';
    settings.lore_persona_constraint_character_id = '';
    toastr.info(`已解除约束「${selected.value.name}」与人设的绑定`, 'Lorevnter');
  } else {
    if ((selected.value.scope ?? 'global') === 'local' && !ctx.context.characterScopeKey) {
      toastr.warning('当前未识别到角色作用域，无法绑定局部人设约束', 'Lorevnter');
      return;
    }
    // 绑定（互斥：覆盖之前的绑定）
    settings.lore_persona_constraint_id = selected.value.id;
    settings.lore_persona_constraint_character_id =
      (selected.value.scope ?? 'global') === 'local'
        ? (ctx.context.characterScopeKey ?? '')
        : '';
    toastr.success(`约束「${selected.value.name}」已绑定到用户人设`, 'Lorevnter');
  }
}

// ── 引用计数（待实现） ──
function getRefCount(_constraintId: string): number {
  // TODO: 后续从世界书条目中统计引用次数
  return 0;
}

// ── 条目绑定 ──
const bindWorldbook = ref<string | null>(null);
const bindEntries = ref<WorldbookEntry[]>([]);
const bindLoading = ref(false);
const bindSearchQuery = ref('');

/** 搜索过滤后的条目 */
const filteredBindEntries = computed(() => {
  const q = bindSearchQuery.value.trim().toLowerCase();
  if (!q) return bindEntries.value;
  return bindEntries.value.filter(e =>
    (e.name || `uid_${e.uid}`).toLowerCase().includes(q)
  );
});

/** 获取当前约束对应的 characterId 过滤值 */
function getBindCharId(): string {
  if (!selected.value) return '';
  return (selected.value.scope ?? 'global') === 'local'
    ? (ctx.context.characterScopeKey ?? '')
    : '';
}

/** 已绑定数量 */
const bindSelectedCount = computed(() => {
  if (!selected.value || !bindWorldbook.value) return 0;
  const cId = selected.value.id;
  const wb = bindWorldbook.value;
  const charId = getBindCharId();
  return settings.lore_constraint_bindings.filter(
    b => b.constraintId === cId && b.worldbook === wb && b.characterId === charId
  ).length;
});

onMounted(async () => {
  // 自动绑定角色卡主世界书
  const ctx = useContextStore();
  const primaryWb = ctx.context.character?.primary;
  if (primaryWb) {
    await loadBindWorldbook(primaryWb);
  }
});

async function loadBindWorldbook(name: string) {
  bindWorldbook.value = name;
  bindLoading.value = true;
  try {
    bindEntries.value = await WorldbookAPI.fetch(name);
  } catch {
    bindEntries.value = [];
    toastr.error(`加载失败: ${name}`, 'Lorevnter');
  } finally {
    bindLoading.value = false;
  }
}

/** 全选（基于 filteredBindEntries 智能适配搜索） */
function onBindSelectAll() {
  if (!selected.value || !bindWorldbook.value) return;
  const cId = selected.value.id;
  const wb = bindWorldbook.value;
  const charId = getBindCharId();

  for (const entry of filteredBindEntries.value) {
    const exists = settings.lore_constraint_bindings.some(
      b => b.constraintId === cId && b.worldbook === wb && b.entryUid === entry.uid && b.characterId === charId
    );
    if (!exists) {
      settings.lore_constraint_bindings.push({ constraintId: cId, worldbook: wb, entryUid: entry.uid, characterId: charId });
    }
  }
  toastr.success(`已绑定 ${filteredBindEntries.value.length} 条`, 'Lorevnter');
}

/** 清空（基于 filteredBindEntries 智能适配搜索） */
function onBindClearAll() {
  if (!selected.value || !bindWorldbook.value) return;
  const cId = selected.value.id;
  const wb = bindWorldbook.value;
  const charId = getBindCharId();
  const removeUids = new Set(filteredBindEntries.value.map(e => e.uid));

  settings.lore_constraint_bindings = settings.lore_constraint_bindings.filter(
    b => !(b.constraintId === cId && b.worldbook === wb && b.characterId === charId && removeUids.has(b.entryUid))
  );
  toastr.info(`已解绑 ${removeUids.size} 条`, 'Lorevnter');
}

/** 反选（基于 filteredBindEntries 智能适配搜索） */
function onBindInvert() {
  if (!selected.value || !bindWorldbook.value) return;
  const cId = selected.value.id;
  const wb = bindWorldbook.value;
  const charId = getBindCharId();

  for (const entry of filteredBindEntries.value) {
    const idx = settings.lore_constraint_bindings.findIndex(
      b => b.constraintId === cId && b.worldbook === wb && b.entryUid === entry.uid && b.characterId === charId
    );
    if (idx >= 0) {
      settings.lore_constraint_bindings.splice(idx, 1);
    } else {
      settings.lore_constraint_bindings.push({ constraintId: cId, worldbook: wb, entryUid: entry.uid, characterId: charId });
    }
  }
}

/** 检查条目是否绑定到当前选中的约束（新绑定表 + characterId 隔离） */
function isEntryBound(entry: WorldbookEntry): boolean {
  if (!selected.value || !bindWorldbook.value) return false;
  const charId = getBindCharId();
  return settings.lore_constraint_bindings.some(
    b => b.constraintId === selected.value!.id && b.worldbook === bindWorldbook.value && b.entryUid === entry.uid && b.characterId === charId
  );
}

/** 切换绑定（新绑定表 + characterId 隔离） */
function onToggleBind(entry: WorldbookEntry, event: Event) {
  if (!selected.value || !bindWorldbook.value) return;
  const checked = (event.target as HTMLInputElement).checked;
  const wb = bindWorldbook.value;
  const cId = selected.value.id;
  const charId = getBindCharId();

  if (checked) {
    const exists = settings.lore_constraint_bindings.some(
      b => b.constraintId === cId && b.worldbook === wb && b.entryUid === entry.uid && b.characterId === charId
    );
    if (!exists) {
      settings.lore_constraint_bindings.push({ constraintId: cId, worldbook: wb, entryUid: entry.uid, characterId: charId });
    }
  } else {
    const idx = settings.lore_constraint_bindings.findIndex(
      b => b.constraintId === cId && b.worldbook === wb && b.entryUid === entry.uid && b.characterId === charId
    );
    if (idx >= 0) settings.lore_constraint_bindings.splice(idx, 1);
  }
}

/** 检查条目是否绑定到「其他」约束（绑定表 + 旧 extra 兼容） */
function isBoundToOther(entry: WorldbookEntry): boolean {
  if (!selected.value || !bindWorldbook.value) return false;
  const currentCharId = ctx.context.characterScopeKey ?? '';
  const otherBinding = settings.lore_constraint_bindings.some(
    (b) => {
      if (b.worldbook !== bindWorldbook.value || b.entryUid !== entry.uid || b.constraintId === selected.value!.id) {
        return false;
      }
      if (!b.characterId) return true;
      return b.characterId === currentCharId;
    }
  );
  if (otherBinding) return true;
  const legacyId = entry.extra?.lore_constraint_id;
  return !!legacyId && legacyId !== selected.value.id;
}
</script>

<style scoped>
.ct-tab { display: flex; flex-direction: column; gap: 16px; }

.ct-section {
  background: var(--lore-bg-secondary);
  border-radius: var(--lore-radius-lg);
  padding: 16px;
  border: 1px solid var(--lore-border-light);
}
.ct-section-title {
  font-size: 13px; font-weight: 500; color: var(--lore-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;
}

/* 约束卡片列表 - 堆叠效果 */
.ct-list { display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto; }
.ct-card {
  padding: 12px 14px; border-radius: var(--lore-radius-md);
  background: var(--lore-bg-primary); border: 2px solid transparent;
  cursor: pointer; transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  min-height: 44px; /* 触控最小区域 */
}
.ct-card:hover { transform: scale(0.99); }
.ct-card.active { border-color: var(--lore-accent); background: var(--lore-accent-bg); }
.ct-card.disabled { opacity: 0.5; }
.ct-card-header { display: flex; align-items: center; gap: 6px; }
.ct-card-icon { font-size: 16px; }
.ct-card-name { font-size: 15px; font-weight: 500; color: var(--lore-text-primary); flex: 1; letter-spacing: -0.2px; }
.ct-card-refs { font-size: 12px; color: var(--lore-text-secondary); }
.ct-card-scope {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
  text-transform: uppercase; letter-spacing: 0.3px; flex-shrink: 0;
}
.ct-card-scope.global { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }
.ct-card-scope.local { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
.ct-card-preview { font-size: 13px; color: var(--lore-text-secondary); margin-top: 6px; line-height: 1.4; }
.ct-skip-hint { font-style: italic; }

.ct-actions { margin-top: 12px; }

/* 表单 - iOS Inset 风格 */
.ct-form { display: flex; flex-direction: column; gap: 14px; }
.ct-label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--lore-text-secondary); font-weight: 500; }
.ct-input, .ct-select, .ct-textarea {
  padding: 10px 12px; border-radius: var(--lore-radius-sm); border: 1px solid var(--lore-border-light);
  background: var(--lore-bg-primary); color: var(--lore-text-primary);
  font-size: 15px; outline: none; transition: border-color 0.2s;
}
.ct-input:focus, .ct-select:focus, .ct-textarea:focus { border-color: var(--lore-accent); }
.ct-textarea { resize: vertical; font-family: -apple-system, monospace; line-height: 1.4; }
.ct-toggle-label { flex-direction: row; align-items: center; justify-content: space-between; font-size: 15px; color: var(--lore-text-primary); padding: 4px 0;}
.ct-form-actions { display: flex; justify-content: flex-end; margin-top: 4px; }

/* 条目绑定 */
.ct-bind-wb-label { font-size: 11px; font-weight: 400; color: var(--lore-accent); background: var(--lore-accent-bg); padding: 2px 8px; border-radius: 8px; margin-left: 8px; text-transform: none; letter-spacing: 0; }
.ct-bind-entries { display: flex; flex-direction: column; max-height: 300px; overflow-y: auto; background: var(--lore-bg-primary); border-radius: var(--lore-radius-md); padding: 4px 0;}
.ct-bind-entry {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  cursor: pointer; transition: background 0.15s;
  font-size: 14px; color: var(--lore-text-primary);
  border-bottom: 1px solid var(--lore-border-light);
}
.ct-bind-entry:last-child { border-bottom: none; }
.ct-bind-entry:hover { background: var(--lore-bg-tertiary); }
.ct-bind-entry-bound { background: var(--lore-accent-bg); }
.ct-bind-entry-name { flex: 1; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ct-bind-entry-other { font-size: 12px; color: var(--lore-text-tertiary); font-style: italic; }

/* 按钮 */
.ct-btn {
  padding: 10px 16px; border-radius: var(--lore-radius-md); border: none;
  background: var(--lore-bg-tertiary); color: var(--lore-text-primary);
  font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.ct-btn:active { transform: scale(0.98); }
.ct-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ct-btn-accent { background: var(--lore-accent); color: #fff; }
.ct-btn-accent:active { filter: brightness(0.9); }
.ct-btn-outline { background: var(--lore-bg-primary); border: 1px solid var(--lore-border-light); }
.ct-btn-danger { color: var(--lore-danger); background: var(--lore-danger-bg); }
.ct-btn-small { padding: 6px 12px; font-size: 13px; border-radius: var(--lore-radius-sm); }

/* iOS Action Sheet 底部对话框 */
.ct-dialog-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: var(--lore-overlay); z-index: 10; /* 仅覆盖主面板内容，不遗挡酒馆 UI */
  display: flex; flex-direction: column; justify-content: flex-end;
  border-radius: var(--lore-radius-lg) var(--lore-radius-lg) 0 0;
  overflow: hidden; animation: lore-fade-in 0.2s ease-out;
}
.ct-dialog {
  background: var(--lore-bg-primary); border-radius: 20px 20px 0 0;
  padding: 24px 20px 40px; width: 100%;
  display: flex; flex-direction: column; gap: 16px;
  animation: lore-slide-up 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  box-shadow: 0 -10px 30px rgba(0,0,0,0.2);
}
.ct-dialog-title { font-size: 17px; font-weight: 600; color: var(--lore-text-primary); text-align: center; margin-bottom: 4px;}
.ct-dialog-actions { display: flex; gap: 12px; margin-top: 8px;}
.ct-dialog-actions .ct-btn { flex: 1; padding: 12px; font-size: 15px;}

.ct-empty { font-size: 14px; color: var(--lore-text-secondary); text-align: center; padding: 24px; }
.ct-loading { font-size: 14px; color: var(--lore-accent); text-align: center; padding: 20px; }
</style>
