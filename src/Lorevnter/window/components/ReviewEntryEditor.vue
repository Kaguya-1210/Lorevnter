<template>
  <div class="review-editor">
    <!-- Diff 视图：红删绿增，绿区可编辑 -->
    <div class="diff-container">
      <div v-for="(line, i) in diffLines" :key="i" class="diff-line" :class="line.type">
        <span class="diff-gutter">{{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ' }}</span>
        <span v-if="line.type === 'add'" class="diff-content diff-editable" contenteditable="true"
          @blur="onEditLine(i, $event)"
        >{{ line.text }}</span>
        <span v-else class="diff-content">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  original: string;
  modified: string;
}>();

const emit = defineEmits<{
  (e: 'update:modified', value: string): void;
}>();

interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

const diffLines = computed<DiffLine[]>(() => {
  const origLines = props.original.split('\n');
  const modLines = props.modified.split('\n');

  const result: DiffLine[] = [];

  // 简单 LCS diff
  const maxLen = Math.max(origLines.length, modLines.length);
  let oi = 0;
  let mi = 0;

  while (oi < origLines.length || mi < modLines.length) {
    if (oi < origLines.length && mi < modLines.length && origLines[oi] === modLines[mi]) {
      result.push({ type: 'same', text: origLines[oi] });
      oi++;
      mi++;
    } else if (oi < origLines.length && (mi >= modLines.length || !modLines.includes(origLines[oi], mi))) {
      result.push({ type: 'del', text: origLines[oi] });
      oi++;
    } else if (mi < modLines.length) {
      result.push({ type: 'add', text: modLines[mi] });
      mi++;
    }
  }

  return result;
});

function onEditLine(lineIndex: number, event: Event) {
  const target = event.target as HTMLElement;
  const newText = target.textContent || '';

  // 重建 modified 文本
  const modLines = props.modified.split('\n');
  // 找到这个 add 行在 modLines 中的位置
  let addIdx = 0;
  for (let i = 0; i < diffLines.value.length; i++) {
    if (diffLines.value[i].type === 'add') {
      if (i === lineIndex) {
        modLines[addIdx] = newText;
        break;
      }
      addIdx++;
    } else if (diffLines.value[i].type === 'same') {
      addIdx++;
    }
  }

  emit('update:modified', modLines.join('\n'));
}
</script>

<style scoped>
.review-editor {
  border: 1px solid var(--lore-border, #333);
  border-radius: var(--lore-radius-sm, 8px);
  overflow: hidden;
}

.diff-container {
  max-height: 250px;
  overflow-y: auto;
  font-family: var(--lore-font-mono, 'SF Mono', 'Menlo', monospace);
  font-size: 12px;
  line-height: 1.6;
}

.diff-line {
  display: flex;
  padding: 0 8px;
  min-height: 20px;
}
.diff-line.add {
  background: rgba(52, 199, 89, 0.1);
}
.diff-line.del {
  background: rgba(255, 59, 48, 0.1);
  text-decoration: line-through;
  opacity: 0.65;
}

.diff-gutter {
  width: 20px;
  flex-shrink: 0;
  text-align: center;
  color: var(--lore-text-tertiary, #666);
  user-select: none;
}
.diff-line.add .diff-gutter { color: #34c759; }
.diff-line.del .diff-gutter { color: #ff3b30; }

.diff-content {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--lore-text);
}

.diff-editable {
  cursor: text;
  outline: none;
  border-bottom: 1px dashed rgba(52, 199, 89, 0.3);
}
.diff-editable:focus {
  border-bottom-color: #34c759;
  background: rgba(52, 199, 89, 0.05);
}
</style>
