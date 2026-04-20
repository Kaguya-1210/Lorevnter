// ============================================================
// Lorevnter - 审核弹窗（内联 Diff 高亮版）
// 核心思路参照 st-persona-weaver 的 LCS diff 方案:
//   1. computeDiffBlocks(old, new) 基于 LCS 拆分为 equal/diff 块
//   2. 在一个连续文本流中渲染：
//      - equal 块：普通白色文字
//      - diff 块：红色(旧版,删除线) + 绿色(新版,高亮)
//   3. 点击旧版块 → 切换为选中(恢复原文)
//      点击新版块 → 切换为选中(采用新版)
//   4. 选中的块可 contenteditable 直接编辑
//   5. assembleDiffResult() 根据 active 拼接最终文本
// ============================================================

import { createLogger } from '../logger';
import type { ReviewUpdate } from './review-types';
import { useRuntimeStore } from '../state';

const logger = createLogger('review-editor');

const POPUP_ID = 'lorevnter-review-editor';
const STYLE_ID = 'lorevnter-review-styles';

function getTopDoc(): Document {
  return (typeof window.parent !== 'undefined' ? window.parent : window).document;
}

// ── LCS Diff 算法 ──

interface DiffToken { type: 'equal' | 'delete' | 'insert'; value: string }
interface DiffBlock {
  type: 'equal' | 'diff';
  value?: string;      // equal 时用
  oldText?: string;    // diff 时用
  newText?: string;    // diff 时用
  active?: 'old' | 'new'; // diff 时：当前选中哪个版本
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if (/[，。！？；\n,.!?;：、（）「」『』""''《》【】\-()]/.test(text[i])) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function computeDiffBlocks(oldText: string, newText: string): DiffBlock[] {
  const oldArr = tokenize(oldText);
  const newArr = tokenize(newText);
  const m = oldArr.length, n = newArr.length;

  // LCS DP
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldArr[i - 1] === newArr[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // 回溯
  let i = m, j = n;
  const result: DiffToken[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldArr[i - 1] === newArr[j - 1]) {
      result.unshift({ type: 'equal', value: oldArr[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'insert', value: newArr[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'delete', value: oldArr[i - 1] });
      i--;
    }
  }

  // 合并为块
  const blocks: DiffBlock[] = [];
  let currentBlock: DiffBlock | null = null;
  result.forEach(r => {
    if (r.type === 'equal') {
      if (currentBlock) { blocks.push(currentBlock); currentBlock = null; }
      blocks.push({ type: 'equal', value: r.value });
    } else {
      if (!currentBlock) currentBlock = { type: 'diff', oldText: '', newText: '', active: 'new' };
      if (r.type === 'delete') currentBlock.oldText += r.value;
      if (r.type === 'insert') currentBlock.newText += r.value;
    }
  });
  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}

function assembleDiffResult(blocks: DiffBlock[]): string {
  let text = '';
  blocks.forEach(block => {
    if (block.type === 'equal') text += block.value;
    else if (block.active === 'old') text += block.oldText;
    else text += block.newText;
  });
  return text;
}

// ── 样式 ──

function injectStyles(doc: Document): void {
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    (doc.head || doc.documentElement).appendChild(style);
  }
  // 每次都更新内容，防止旧版 CSS 缓存导致新 class 无样式
  style.textContent = `
/* ==========================================
   Lorevnter Review Editor
   ========================================== */
.lre-bg {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  z-index: 100010; background: rgba(0,0,0,0.5);
}
.lre-popup {
  position: fixed; z-index: 100011;
  bottom: 0; left: 50%; transform: translateX(-50%);
  width: min(100vw, 620px); max-height: 85vh;
  background: var(--SmartThemeBlurTintColor,#1e1e2e);
  border: 1px solid var(--SmartThemeBorderColor,#333);
  border-radius: 16px 16px 0 0;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
  color: var(--SmartThemeBodyColor,#ccc);
  animation: lre-slide-up 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}
@keyframes lre-slide-up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
.lre-grabber { display: flex; justify-content: center; padding: 8px 0 4px; }
.lre-grabber-bar { width: 36px; height: 5px; background: var(--SmartThemeBorderColor,#555); border-radius: 3px; }
.lre-header { padding: 8px 18px 12px; border-bottom: 1px solid var(--SmartThemeBorderColor,#333); }
.lre-title { margin: 0; font-size: 18px; font-weight: 600; }
.lre-subtitle { font-size: 13px; color: #888; }
.lre-list { flex: 1; overflow-y: auto; padding: 0; }

/* 条目头 */
.lre-item { border-bottom: 1px solid var(--SmartThemeBorderColor,#333); }
.lre-item.lre-approved { border-left: 3px solid #5cb85c; }
.lre-item.lre-rejected { border-left: 3px solid #d9534f; opacity: 0.55; }
.lre-item-header {
  display: flex; align-items: center; padding: 10px 18px; gap: 8px;
  cursor: pointer; transition: background 0.15s;
}
.lre-item-header:hover { background: rgba(255,255,255,0.04); }
.lre-item-badge {
  display: inline-block; padding: 2px 6px; border-radius: 4px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
}
.lre-badge-modify { background: rgba(0,122,255,0.2); color: #0a84ff; }
.lre-badge-append { background: rgba(255,159,10,0.2); color: #ff9f0a; }
.lre-badge-create { background: rgba(52,199,89,0.2); color: #34c759; }
.lre-item-name { flex: 1; font-weight: 500; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lre-item-reason { font-size: 11px; color: #888; max-width: 35%; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lre-item-actions { display: flex; gap: 4px; }
.lre-btn-sm {
  width: 30px; height: 30px; border: 1px solid var(--SmartThemeBorderColor,#444); border-radius: 8px;
  background: transparent; cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; color: var(--SmartThemeBodyColor,#ccc);
}
.lre-btn-sm:hover { border-color: #888; }
.lre-btn-approve.lre-active { background: rgba(92,184,92,0.2); color: #5cb85c; border-color: #5cb85c; }
.lre-btn-reject.lre-active { background: rgba(217,83,79,0.2); color: #d9534f; border-color: #d9534f; }

/* ── 内联 Diff 内容面板 ── */
.lre-diff-panel {
  padding: 8px 18px 12px;
}
.lre-diff-content {
  border: 1px solid var(--SmartThemeBorderColor,#333);
  border-radius: 8px;
  padding: 12px;
  background: rgba(0,0,0,0.15);
  line-height: 1.8;
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  font-size: 0.95em;
  max-height: 300px;
  overflow-y: auto;
}
/* equal 文字 */
.lre-diff-content > span { display: inline; }
/* diff 组 */
.lre-diff-group { display: inline; }

/* 旧版(红色) 和 新版(绿色) */
.lre-idiff-old, .lre-idiff-new {
  cursor: pointer;
  border-radius: 3px;
  padding: 1px 2px;
  transition: background 0.15s, opacity 0.15s;
  display: inline;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.lre-idiff-old { color: #ff8a80; background: rgba(217,83,79,0.25); }
.lre-idiff-new { color: #69f0ae; background: rgba(92,184,92,0.25); }

/* inactive(未选中) → 删除线 + 半透明 */
.lre-idiff-old.lre-inactive, .lre-idiff-new.lre-inactive {
  text-decoration: line-through;
  opacity: 0.4;
  background: rgba(217,83,79,0.12);
  cursor: pointer;
}
.lre-idiff-new.lre-inactive {
  background: rgba(92,184,92,0.08);
}
.lre-idiff-old.lre-inactive:hover, .lre-idiff-new.lre-inactive:hover { opacity: 0.7; }

/* active(选中) → 明显高亮背景 */
.lre-idiff-old.lre-active {
  background: rgba(217,83,79,0.35);
  color: #ff8a80;
  border-bottom: 2px solid rgba(217,83,79,0.6);
}
.lre-idiff-new.lre-active {
  background: rgba(92,184,92,0.35);
  color: #69f0ae;
  border-bottom: 2px solid rgba(92,184,92,0.6);
}

/* contenteditable 聚焦 */
.lre-idiff-old.lre-active[contenteditable]:focus,
.lre-idiff-new.lre-active[contenteditable]:focus {
  outline: none;
  background: rgba(128,128,128,0.2);
  border-bottom-style: solid;
}

/* 新增条目的编辑区 */
.lre-create-editor {
  border: 1px solid var(--SmartThemeBorderColor,#333);
  border-radius: 8px;
  padding: 12px;
  background: rgba(92,184,92,0.05);
  color: #5cb85c;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
  outline: none;
  min-height: 60px;
  max-height: 300px;
  overflow-y: auto;
  font-size: 0.95em;
}
.lre-create-editor:focus {
  box-shadow: inset 0 0 0 1px rgba(92,184,92,0.3);
}

.lre-diff-hint {
  font-size: 11px; color: #666; margin-top: 6px;
}
.lre-think-box {
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--SmartThemeBorderColor,#333);
  border-radius: 8px;
  background: rgba(10,132,255,0.08);
}
.lre-think-title {
  font-size: 11px;
  font-weight: 600;
  color: #7fb7ff;
  margin-bottom: 4px;
}
.lre-think-text {
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 底部 */
.lre-footer {
  display: flex; gap: 8px; padding: 12px 18px;
  padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
  border-top: 1px solid var(--SmartThemeBorderColor,#333);
}
.lre-footer-btn {
  flex: 1; padding: 10px 0; border: 1px solid var(--SmartThemeBorderColor,#444); border-radius: 10px;
  background: transparent; color: var(--SmartThemeBodyColor,#ccc); font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 0.2s; text-align: center;
}
.lre-footer-btn:hover { background: rgba(255,255,255,0.06); }
.lre-footer-btn.lre-primary { background: #0a84ff; border-color: #0a84ff; color: #fff; }
.lre-footer-btn.lre-primary:hover { background: #0070e0; }
.lre-footer-btn.lre-primary:disabled { background: #333; border-color: #333; color: #666; cursor: default; }

@media(max-width:600px){
  .lre-popup { width: 100vw; max-height: 100vh; border-radius: 0; }
}
`;
}

// ── 工具 ──
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function getBadge(action: string): { cls: string; label: string } {
  switch (action) {
    case 'create': return { cls: 'lre-badge-create', label: '新增' };
    case 'append': return { cls: 'lre-badge-append', label: '追加' };
    default: return { cls: 'lre-badge-modify', label: '修改' };
  }
}

// ── 每个条目的 diff 块缓存 ──
let itemDiffBlocks: Map<number, DiffBlock[]> = new Map();

// ── 公共 API ──
export type ReviewExecuteCallback = (approved: ReviewUpdate[]) => void;
export type ReviewCancelCallback = () => void;

/**
 * 打开审核弹窗。
 *
 * 内联 Diff 高亮：
 * - 未变更的文字：白色
 * - 删除的文字：红色 + 删除线（点击可切换为选中/恢复原文）
 * - 新增的文字：绿色高亮（点击可切换；选中状态下 contenteditable 可直接编辑）
 *
 * 不可通过遮罩或 ESC 关闭。
 */
export function openReviewEditor(
  updates: ReviewUpdate[],
  onExecute: ReviewExecuteCallback,
  onCancel?: ReviewCancelCallback,
): void {
  const doc = getTopDoc();
  if (doc.getElementById(POPUP_ID)) {
    logger.warn('审核弹窗已打开，忽略重复调用');
    return;
  }
  injectStyles(doc);

  // 为每个 modify/append 条目计算 diff blocks
  itemDiffBlocks = new Map();
  updates.forEach((item, idx) => {
    if (item.action !== 'create' && item.originalContent) {
      itemDiffBlocks.set(idx, computeDiffBlocks(item.originalContent, item.newContent));
    }
  });

  let expandedIdx = -1;

  const overlay = doc.createElement('div');
  overlay.id = `${POPUP_ID}-bg`;
  overlay.className = 'lre-bg';

  const popup = doc.createElement('div');
  popup.id = POPUP_ID;
  popup.className = 'lre-popup';

  function close() {
    overlay.remove();
    popup.remove();
  }

  function getApprovedCount(): number {
    return updates.filter(u => u.approved === true).length;
  }

  /** 保存编辑中的内容（从 diff blocks 或 create editor 中同步） */
  function saveEditable() {
    if (expandedIdx < 0) return;
    const item = updates[expandedIdx];
    if (item.action === 'create') {
      const el = popup.querySelector(`[data-create-idx="${expandedIdx}"]`) as HTMLElement | null;
      if (el) item.newContent = el.innerText;
    } else {
      // 从 diff blocks 中同步 contenteditable 的改动
      const blocks = itemDiffBlocks.get(expandedIdx);
      if (blocks) {
        blocks.forEach((block, bi) => {
          if (block.type !== 'diff') return;
          const activeEl = popup.querySelector(
            `.lre-idiff-${block.active}.lre-active[data-item="${expandedIdx}"][data-block="${bi}"]`
          ) as HTMLElement | null;
          if (activeEl) {
            if (block.active === 'old') block.oldText = activeEl.innerText;
            else block.newText = activeEl.innerText;
          }
        });
        item.newContent = assembleDiffResult(blocks);
      }
    }
  }

  /** 渲染内联 diff 面板 */
  function buildDiffPanel(idx: number): string {
    const item = updates[idx];
    const thinkBlock = item.think?.trim()
      ? `
        <div class="lre-think-box">
          <div class="lre-think-title">AI THINK</div>
          <div class="lre-think-text">${esc(item.think)}</div>
        </div>`
      : '';

    if (item.action === 'create') {
      return `
        <div class="lre-diff-panel">
          ${thinkBlock}
          <div class="lre-create-editor" contenteditable="true" data-create-idx="${idx}">${esc(item.newContent)}</div>
          <div class="lre-diff-hint">💡 新建条目，直接编辑上方内容</div>
        </div>`;
    }

    const blocks = itemDiffBlocks.get(idx);
    if (!blocks) return '';

    let html = `<div class="lre-diff-panel">${thinkBlock}<div class="lre-diff-content">`;
    const changeCount = blocks.filter(b => b.type === 'diff').length;

    blocks.forEach((block, bi) => {
      if (block.type === 'equal') {
        html += `<span>${esc(block.value!)}</span>`;
      } else {
        const isActiveOld = block.active === 'old';
        const isActiveNew = block.active === 'new';

        html += `<span class="lre-diff-group">`;
        if (block.oldText) {
          html += `<span class="lre-idiff-old ${isActiveOld ? 'lre-active' : 'lre-inactive'}" `
            + `${isActiveOld ? 'contenteditable="true"' : ''} `
            + `data-item="${idx}" data-block="${bi}" `
            + `title="点击保留旧版">${esc(block.oldText)}</span>`;
        }
        if (block.newText) {
          html += `<span class="lre-idiff-new ${isActiveNew ? 'lre-active' : 'lre-inactive'}" `
            + `${isActiveNew ? 'contenteditable="true"' : ''} `
            + `data-item="${idx}" data-block="${bi}" `
            + `title="点击保留新版">${esc(block.newText)}</span>`;
        }
        html += `</span>`;
      }
    });

    html += '</div>';
    html += `<div class="lre-diff-hint">🔴 红色=原版(删除线) · 🟢 绿色=新版(高亮) · 点击切换选择 · 选中后可直接编辑 · ${changeCount} 处变更</div>`;
    html += '</div>';
    return html;
  }

  function render() {
    popup.innerHTML = `
      <div class="lre-grabber"><span class="lre-grabber-bar"></span></div>
      <div class="lre-header">
        <h3 class="lre-title">📋 审核修改</h3>
        <span class="lre-subtitle">${updates.length} 条更新待审核 · 已通过 ${getApprovedCount()}</span>
      </div>
      <div class="lre-list">
        ${updates.map((item, idx) => `
          <div class="lre-item ${item.approved === true ? 'lre-approved' : ''} ${item.approved === false ? 'lre-rejected' : ''}">
            <div class="lre-item-header" data-action="toggle" data-idx="${idx}">
              <span class="lre-item-badge ${getBadge(item.action).cls}">${getBadge(item.action).label}</span>
              <span class="lre-item-name">${esc(item.entryName)}</span>
              <span class="lre-item-reason" title="${esc(item.reason)}">${esc(item.reason)}</span>
              <div class="lre-item-actions">
                <button class="lre-btn-sm lre-btn-approve ${item.approved === true ? 'lre-active' : ''}" data-action="approve" data-idx="${idx}" title="通过">✓</button>
                <button class="lre-btn-sm lre-btn-reject ${item.approved === false ? 'lre-active' : ''}" data-action="reject" data-idx="${idx}" title="拒绝">✕</button>
              </div>
            </div>
            ${expandedIdx === idx ? buildDiffPanel(idx) : ''}
          </div>
        `).join('')}
      </div>
      <div class="lre-footer">
        <button class="lre-footer-btn" data-action="approve-all">全部通过</button>
        <button class="lre-footer-btn lre-primary" data-action="execute" ${getApprovedCount() === 0 ? 'disabled' : ''}>执行 (${getApprovedCount()})</button>
        <button class="lre-footer-btn" data-action="cancel">取消</button>
      </div>
    `;
  }

  render();

  // ── 事件代理 ──
  popup.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) {
      // 检查是否点击了 diff 块（切换 active）
      const diffEl = (e.target as HTMLElement).closest('.lre-idiff-old, .lre-idiff-new') as HTMLElement | null;
      if (diffEl && diffEl.classList.contains('lre-inactive')) {
        const itemIdx = parseInt(diffEl.dataset.item!, 10);
        const blockIdx = parseInt(diffEl.dataset.block!, 10);
        const blocks = itemDiffBlocks.get(itemIdx);
        if (!blocks) return;
        const block = blocks[blockIdx];

        // 先同步当前 active 的编辑内容
        const currentActiveEl = popup.querySelector(
          `.lre-idiff-${block.active}.lre-active[data-item="${itemIdx}"][data-block="${blockIdx}"]`
        ) as HTMLElement | null;
        if (currentActiveEl) {
          if (block.active === 'old') block.oldText = currentActiveEl.innerText;
          else block.newText = currentActiveEl.innerText;
        }

        // 切换 active
        const isOld = diffEl.classList.contains('lre-idiff-old');
        block.active = isOld ? 'old' : 'new';

        // 更新 DOM（不完全 re-render，只更新这一对）
        diffEl.classList.remove('lre-inactive');
        diffEl.classList.add('lre-active');
        diffEl.setAttribute('contenteditable', 'true');

        const sibling = diffEl.parentElement?.querySelector(
          isOld ? '.lre-idiff-new' : '.lre-idiff-old'
        ) as HTMLElement | null;
        if (sibling) {
          sibling.classList.remove('lre-active');
          sibling.classList.add('lre-inactive');
          sibling.removeAttribute('contenteditable');
        }
      }
      return;
    }

    const action = target.dataset.action;
    const idx = target.dataset.idx !== undefined ? parseInt(target.dataset.idx, 10) : -1;

    switch (action) {
      case 'toggle':
        saveEditable();
        expandedIdx = expandedIdx === idx ? -1 : idx;
        render();
        break;
      case 'approve':
        if (idx >= 0) { updates[idx].approved = true; render(); }
        break;
      case 'reject':
        if (idx >= 0) { updates[idx].approved = false; render(); }
        break;
      case 'approve-all':
        saveEditable();
        for (const u of updates) u.approved = true;
        render();
        break;
      case 'execute': {
        saveEditable();
        const approved = updates.filter(u => u.approved === true);
        if (approved.length === 0) return;
        close();
        onExecute(approved);
        const store1 = useRuntimeStore();
        store1.pipelineStatus = 'done';
        store1.pipelineLastMessage = `已写入 ${approved.length} 条`;
        break;
      }
      case 'cancel': {
        close();
        const store2 = useRuntimeStore();
        store2.pipelineStatus = 'idle';
        store2.pipelineLastMessage = '用户取消审核';
        if (onCancel) onCancel();
        break;
      }
    }
  });

  // 监听 contenteditable 的 input 事件，实时同步到 blocks
  popup.addEventListener('input', (e) => {
    const el = e.target as HTMLElement;
    if (el.classList.contains('lre-idiff-old') && el.classList.contains('lre-active')) {
      const itemIdx = parseInt(el.dataset.item!, 10);
      const blockIdx = parseInt(el.dataset.block!, 10);
      const blocks = itemDiffBlocks.get(itemIdx);
      if (blocks) blocks[blockIdx].oldText = el.innerText;
    }
    if (el.classList.contains('lre-idiff-new') && el.classList.contains('lre-active')) {
      const itemIdx = parseInt(el.dataset.item!, 10);
      const blockIdx = parseInt(el.dataset.block!, 10);
      const blocks = itemDiffBlocks.get(itemIdx);
      if (blocks) blocks[blockIdx].newText = el.innerText;
    }
  });

  doc.body.appendChild(overlay);
  doc.body.appendChild(popup);

  logger.info(`审核弹窗已打开: ${updates.length} 条待审核`);
}
