<template>
  <Teleport to="body">
    <Transition name="review-sheet">
      <div v-if="visible" class="review-overlay" @click.self="onClose">
        <div class="review-sheet">
          <!-- Grabber -->
          <div class="review-grabber"><span class="review-grabber-bar"></span></div>

          <!-- 标题栏 -->
          <div class="review-header">
            <h3 class="review-title">审核修改</h3>
            <span class="review-subtitle">{{ updates.length }} 条更新待审核</span>
          </div>

          <!-- 条目列表 -->
          <div class="review-list">
            <div
              v-for="(item, idx) in updates"
              :key="idx"
              class="review-item"
              :class="{ 'review-item-approved': item.approved, 'review-item-rejected': item.approved === false }"
            >
              <div class="review-item-header" @click="selectedIndex = selectedIndex === idx ? -1 : idx">
                <span class="review-item-name">{{ item.entryName }}</span>
                <span class="review-item-reason">{{ item.reason }}</span>
                <div class="review-item-actions">
                  <button class="review-btn review-btn-approve" @click.stop="item.approved = true" title="通过">✓</button>
                  <button class="review-btn review-btn-reject" @click.stop="item.approved = false" title="拒绝">✕</button>
                </div>
              </div>

              <!-- 展开 Diff 视图 -->
              <div v-if="selectedIndex === idx" class="review-diff-panel">
                <ReviewEntryEditor
                  :original="item.originalContent"
                  :modified="item.newContent"
                  @update:modified="val => item.newContent = val"
                />
              </div>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div class="review-footer">
            <button class="st-btn" @click="onApproveAll">全部通过</button>
            <button class="st-btn st-btn-primary" :disabled="approvedCount === 0" @click="onExecute">
              执行 ({{ approvedCount }})
            </button>
            <button class="st-btn" @click="onClose">取消</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import ReviewEntryEditor from './ReviewEntryEditor.vue';
import type { ReviewUpdate } from '../../core/review-types';

const props = defineProps<{
  visible: boolean;
  updates: ReviewUpdate[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'execute', approvedUpdates: ReviewUpdate[]): void;
}>();

const selectedIndex = ref(-1);

const approvedCount = computed(() =>
  props.updates.filter(u => u.approved === true).length,
);

function onApproveAll() {
  for (const u of props.updates) {
    u.approved = true;
  }
}

function onExecute() {
  const approved = props.updates.filter(u => u.approved === true);
  emit('execute', approved);
}

function onClose() {
  emit('close');
}
</script>

<style scoped>
/* ── Review Sheet (iOS 风格底部弹窗) ── */
.review-overlay {
  position: fixed;
  inset: 0;
  z-index: 10010;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.review-sheet {
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  background: var(--lore-surface, #1c1c1e);
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.review-grabber {
  display: flex;
  justify-content: center;
  padding: 8px 0 4px;
}
.review-grabber-bar {
  width: 36px;
  height: 5px;
  background: var(--lore-text-tertiary, #555);
  border-radius: 3px;
}

.review-header {
  padding: 8px 16px 12px;
  border-bottom: 1px solid var(--lore-border, #333);
}
.review-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--lore-text);
}
.review-subtitle {
  font-size: 13px;
  color: var(--lore-text-secondary);
}

.review-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.review-item {
  border-bottom: 1px solid var(--lore-border, #333);
}
.review-item-approved {
  border-left: 3px solid #34c759;
}
.review-item-rejected {
  border-left: 3px solid #ff3b30;
  opacity: 0.6;
}

.review-item-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  gap: 8px;
  cursor: pointer;
}
.review-item-header:hover {
  background: var(--lore-hover, rgba(255,255,255,0.05));
}
.review-item-name {
  font-weight: 500;
  font-size: 14px;
  flex: 1;
  color: var(--lore-text);
}
.review-item-reason {
  font-size: 12px;
  color: var(--lore-text-secondary);
  max-width: 40%;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-item-actions {
  display: flex;
  gap: 4px;
}
.review-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--lore-border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.review-btn-approve:hover, .review-item-approved .review-btn-approve {
  background: rgba(52, 199, 89, 0.2);
  color: #34c759;
  border-color: #34c759;
}
.review-btn-reject:hover, .review-item-rejected .review-btn-reject {
  background: rgba(255, 59, 48, 0.2);
  color: #ff3b30;
  border-color: #ff3b30;
}

.review-diff-panel {
  padding: 0 16px 12px;
}

.review-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--lore-border, #333);
}
.st-btn-primary {
  background: var(--lore-accent) !important;
  color: #fff !important;
}

/* 动画 */
.review-sheet-enter-active { transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1); }
.review-sheet-leave-active { transition: transform 0.25s ease-in; }
.review-sheet-enter-from,
.review-sheet-leave-to {
  transform: translateY(100%);
}
</style>
