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
            <span class="ct-card-refs">{{ getRefCount(c.id) }} 条引用</span>
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
            启用
            <input type="checkbox" v-model="selected.enabled" class="ct-toggle" />
          </label>
          <div class="ct-form-actions">
            <button class="ct-btn ct-btn-danger" @click="onDelete">🗑 删除</button>
          </div>
        </div>
      </div>

      <!-- 条目绑定 -->
      <div class="ct-section">
        <div class="ct-section-title">条目绑定</div>
        <div v-if="!bindWorldbook" class="ct-bind-select">
          <div class="ct-bind-hint">选择一个世界书来管理条目绑定</div>
          <div class="ct-bind-list">
            <button
              v-for="name in worldbookNames"
              :key="name"
              class="ct-btn ct-btn-outline"
              @click="onSelectBindWorldbook(name)"
            >
              {{ name }}
            </button>
          </div>
        </div>
        <template v-else>
          <div class="ct-bind-header">
            <span class="ct-bind-wb-name">{{ bindWorldbook }}</span>
            <button class="ct-btn ct-btn-small" @click="bindWorldbook = null">← 返回</button>
          </div>
          <div v-if="bindLoading" class="ct-loading">加载中...</div>
          <div v-else class="ct-bind-entries">
            <label
              v-for="entry in bindEntries"
              :key="entry.uid"
              class="ct-bind-entry"
            >
              <input
                type="checkbox"
                :checked="entry.extra?.lore_constraint_id === selected.id"
                @change="onToggleBind(entry, $event)"
              />
              <span class="ct-bind-entry-name">{{ entry.name || '(未命名)' }}</span>
              <span v-if="entry.extra?.lore_macro" class="ct-bind-entry-macro">{{ formatMacro(entry) }}</span>
              <span v-if="isBoundToOther(entry)" class="ct-bind-entry-other">
                (已绑定其他)
              </span>
            </label>
            <div v-if="bindEntries.length === 0" class="ct-empty">该世界书无条目</div>
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

const { settings } = useSettingsStore();

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

function onCreate() {
  if (!newName.value.trim()) return;
  const c = Constraints.createConstraint(newName.value.trim(), newType.value);
  selectedId.value = c.id;
  showCreateDialog.value = false;
  newName.value = '';
  newType.value = 'prompt';
}

function onDelete() {
  if (!selected.value) return;
  const name = selected.value.name;
  if (!confirm(`确认删除约束「${name}」？`)) return;
  Constraints.deleteConstraint(selected.value.id);
  selectedId.value = null;
}

// ── 引用计数（简化实现，从缓存统计） ──
function getRefCount(constraintId: string): number {
  // 从 runtime worldBookCache 统计
  const runtime = useSettingsStore(); // 暂用 settings，后续可改为 runtime
  // 简化：返回 0，实际会在 P7 补全
  return 0;
}

// ── 条目绑定 ──
const worldbookNames = ref<string[]>([]);
const bindWorldbook = ref<string | null>(null);
const bindEntries = ref<WorldbookEntry[]>([]);
const bindLoading = ref(false);

onMounted(() => {
  worldbookNames.value = WorldbookAPI.listAll();
});

async function onSelectBindWorldbook(name: string) {
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

async function onToggleBind(entry: WorldbookEntry, event: Event) {
  if (!selected.value || !bindWorldbook.value) return;
  const checked = (event.target as HTMLInputElement).checked;
  try {
    if (checked) {
      await Constraints.bindConstraintToEntries(bindWorldbook.value, [entry.uid], selected.value.id);
    } else {
      await Constraints.unbindConstraintFromEntries(bindWorldbook.value, [entry.uid]);
    }
    // 刷新条目列表
    bindEntries.value = await WorldbookAPI.fetch(bindWorldbook.value);
  } catch {
    // toast 已在 constraints.ts 中处理
  }
}

function formatMacro(entry: WorldbookEntry): string {
  return `{{${entry.extra?.lore_macro ?? ''}}}`;
}

function isBoundToOther(entry: WorldbookEntry): boolean {
  if (!selected.value) return false;
  const cid = entry.extra?.lore_constraint_id;
  return !!cid && cid !== selected.value.id;
}
</script>

<style scoped>
.ct-tab { display: flex; flex-direction: column; gap: 16px; }

.ct-section {
  background: var(--lore-bg-secondary);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid var(--lore-border);
}
.ct-section-title {
  font-size: 11px; font-weight: 600; color: var(--lore-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
}

/* 约束卡片列表 */
.ct-list { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; }
.ct-card {
  padding: 10px 12px; border-radius: 10px;
  background: var(--lore-bg-tertiary); border: 1px solid transparent;
  cursor: pointer; transition: all 0.2s ease-out;
}
.ct-card:hover { border-color: var(--lore-border); }
.ct-card.active { border-color: var(--lore-accent); background: var(--lore-accent-bg); }
.ct-card.disabled { opacity: 0.5; }
.ct-card-header { display: flex; align-items: center; gap: 6px; }
.ct-card-icon { font-size: 14px; }
.ct-card-name { font-size: 12px; font-weight: 600; color: var(--lore-text-primary); flex: 1; }
.ct-card-refs { font-size: 10px; color: var(--lore-text-secondary); }
.ct-card-preview { font-size: 11px; color: var(--lore-text-secondary); margin-top: 4px; line-height: 1.3; }
.ct-skip-hint { font-style: italic; }

.ct-actions { margin-top: 8px; }

/* 表单 */
.ct-form { display: flex; flex-direction: column; gap: 10px; }
.ct-label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--lore-text-secondary); }
.ct-input, .ct-select, .ct-textarea {
  padding: 8px 10px; border-radius: 8px; border: 1px solid var(--lore-border);
  background: var(--lore-bg-primary); color: var(--lore-text-primary);
  font-size: 12px; outline: none; transition: border-color 0.2s;
}
.ct-input:focus, .ct-select:focus, .ct-textarea:focus { border-color: var(--lore-accent); }
.ct-textarea { resize: vertical; font-family: 'Consolas', monospace; line-height: 1.4; }
.ct-toggle-label { flex-direction: row; align-items: center; gap: 8px; }
.ct-toggle { width: 36px; height: 20px; cursor: pointer; }
.ct-form-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* 条目绑定 */
.ct-bind-select { display: flex; flex-direction: column; gap: 8px; }
.ct-bind-hint { font-size: 11px; color: var(--lore-text-secondary); }
.ct-bind-list { display: flex; flex-wrap: wrap; gap: 4px; }
.ct-bind-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.ct-bind-wb-name { font-size: 12px; font-weight: 600; color: var(--lore-text-primary); }
.ct-bind-entries { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
.ct-bind-entry {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 8px; cursor: pointer; transition: background 0.15s;
  font-size: 12px; color: var(--lore-text-primary);
}
.ct-bind-entry:hover { background: var(--lore-bg-tertiary); }
.ct-bind-entry-name { flex: 1; }
.ct-bind-entry-macro { font-size: 10px; color: var(--lore-accent); font-family: monospace; }
.ct-bind-entry-other { font-size: 10px; color: var(--lore-text-secondary); font-style: italic; }

/* 按钮 */
.ct-btn {
  padding: 6px 14px; border-radius: 8px; border: 1px solid var(--lore-border);
  background: var(--lore-bg-secondary); color: var(--lore-text-secondary);
  font-size: 12px; cursor: pointer; transition: all 0.15s;
}
.ct-btn:hover { background: var(--lore-bg-tertiary); color: var(--lore-text-primary); }
.ct-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ct-btn-accent { border-color: var(--lore-accent); color: var(--lore-accent); }
.ct-btn-accent:hover { background: var(--lore-accent-bg); }
.ct-btn-outline { border-color: var(--lore-border); }
.ct-btn-danger { border-color: #e85050; color: #e85050; }
.ct-btn-danger:hover { background: rgba(232, 80, 80, 0.1); }
.ct-btn-small { padding: 4px 10px; font-size: 11px; }

/* 对话框 */
.ct-dialog-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.5); z-index: 100001;
  display: flex; align-items: center; justify-content: center;
}
.ct-dialog {
  background: var(--lore-bg-primary); border-radius: 14px;
  padding: 20px; width: min(90vw, 360px);
  border: 1px solid var(--lore-border);
  display: flex; flex-direction: column; gap: 12px;
}
.ct-dialog-title { font-size: 14px; font-weight: 700; color: var(--lore-text-primary); }
.ct-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }

.ct-empty { font-size: 12px; color: var(--lore-text-secondary); text-align: center; padding: 20px; }
.ct-loading { font-size: 12px; color: var(--lore-accent); text-align: center; padding: 16px; }
</style>
