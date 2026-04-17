// ============================================================
// Lorevnter - 审核弹窗
// 纯原生 DOM 实现（与 prompt-editor 同模式）
// 脚本运行在 iframe 中，DOM 必须挂载到主窗口（window.parent）
// ============================================================

import { createLogger } from '../logger';
import type { ReviewUpdate } from './review-types';

const logger = createLogger('review-editor');

const POPUP_ID = 'lorevnter-review-editor';
const STYLE_ID = 'lorevnter-review-styles';

function getTopDoc(): Document {
  return (typeof window.parent !== 'undefined' ? window.parent : window).document;
}

// ── 样式注入 ──

function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
/* Lorevnter Review Editor */
.lre-bg {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  z-index: 100000; background: rgba(0,0,0,0.5);
}

.lre-popup {
  position: fixed; z-index: 100001;
  bottom: 0; left: 50%; transform: translateX(-50%);
  width: min(100vw, 560px); max-height: 85vh;
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

.lre-header {
  padding: 8px 18px 12px;
  border-bottom: 1px solid var(--SmartThemeBorderColor,#333);
}
.lre-title { margin: 0; font-size: 18px; font-weight: 600; }
.lre-subtitle { font-size: 13px; color: #888; }

.lre-list { flex: 1; overflow-y: auto; padding: 0; }

/* 条目 */
.lre-item { border-bottom: 1px solid var(--SmartThemeBorderColor,#333); }
.lre-item.lre-approved { border-left: 3px solid #34c759; }
.lre-item.lre-rejected { border-left: 3px solid #ff3b30; opacity: 0.55; }

.lre-item-header {
  display: flex; align-items: center; padding: 10px 18px; gap: 8px;
  cursor: pointer; transition: background 0.15s;
}
.lre-item-header:hover { background: rgba(255,255,255,0.04); }

.lre-item-badge {
  display: inline-block; padding: 2px 6px; border-radius: 4px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
}
.lre-badge-update { background: rgba(0,122,255,0.2); color: #0a84ff; }
.lre-badge-create { background: rgba(52,199,89,0.2); color: #34c759; }

.lre-item-name {
  flex: 1; font-weight: 500; font-size: 14px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lre-item-reason {
  font-size: 11px; color: #888; max-width: 35%; text-align: right;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lre-item-actions { display: flex; gap: 4px; }

.lre-btn-sm {
  width: 30px; height: 30px; border: 1px solid var(--SmartThemeBorderColor,#444); border-radius: 8px;
  background: transparent; cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; color: var(--SmartThemeBodyColor,#ccc);
}
.lre-btn-sm:hover { border-color: #888; }
.lre-btn-approve.lre-active { background: rgba(52,199,89,0.2); color: #34c759; border-color: #34c759; }
.lre-btn-reject.lre-active { background: rgba(255,59,48,0.2); color: #ff3b30; border-color: #ff3b30; }

/* Diff 面板 */
.lre-diff-panel { padding: 0 18px 12px; max-height: 250px; overflow-y: auto; }
.lre-diff-wrap {
  border: 1px solid var(--SmartThemeBorderColor,#333); border-radius: 8px; overflow: hidden;
  font-family: monospace; font-size: 12px; line-height: 1.6;
}
.lre-diff-line { display: flex; padding: 0 8px; min-height: 20px; }
.lre-diff-line.lre-diff-add { background: rgba(52,199,89,0.1); }
.lre-diff-line.lre-diff-del { background: rgba(255,59,48,0.1); text-decoration: line-through; opacity: 0.6; }
.lre-diff-gutter { width: 20px; flex-shrink: 0; text-align: center; color: #666; user-select: none; }
.lre-diff-line.lre-diff-add .lre-diff-gutter { color: #34c759; }
.lre-diff-line.lre-diff-del .lre-diff-gutter { color: #ff3b30; }
.lre-diff-content { flex: 1; white-space: pre-wrap; word-break: break-all; }

/* 底部按钮栏 */
.lre-footer {
  display: flex; gap: 8px; padding: 12px 18px;
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
  (doc.head || doc.documentElement).appendChild(style);
}

// ── Diff 渲染 ──

function buildDiffHtml(original: string, modified: string): string {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const lines: string[] = [];

  let oi = 0;
  let mi = 0;
  while (oi < origLines.length || mi < modLines.length) {
    if (oi < origLines.length && mi < modLines.length && origLines[oi] === modLines[mi]) {
      lines.push(`<div class="lre-diff-line"><span class="lre-diff-gutter"> </span><span class="lre-diff-content">${esc(origLines[oi])}</span></div>`);
      oi++; mi++;
    } else if (oi < origLines.length && (mi >= modLines.length || !modLines.includes(origLines[oi], mi))) {
      lines.push(`<div class="lre-diff-line lre-diff-del"><span class="lre-diff-gutter">-</span><span class="lre-diff-content">${esc(origLines[oi])}</span></div>`);
      oi++;
    } else if (mi < modLines.length) {
      lines.push(`<div class="lre-diff-line lre-diff-add"><span class="lre-diff-gutter">+</span><span class="lre-diff-content">${esc(modLines[mi])}</span></div>`);
      mi++;
    }
  }

  return `<div class="lre-diff-wrap">${lines.join('')}</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── 公共 API ──

export type ReviewExecuteCallback = (approved: ReviewUpdate[]) => void;

/**
 * 打开审核弹窗。
 * @param updates 待审核条目列表
 * @param onExecute 用户点击「执行」后回调（传入已通过的条目）
 */
export function openReviewEditor(
  updates: ReviewUpdate[],
  onExecute: ReviewExecuteCallback,
): void {
  const doc = getTopDoc();

  // 防重复打开
  if (doc.getElementById(POPUP_ID)) {
    logger.warn('审核弹窗已打开，忽略重复调用');
    return;
  }

  injectStyles(doc);

  // 内部状态
  let expandedIdx = -1;

  // ── 创建 DOM ──
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

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function getApprovedCount(): number {
    return updates.filter(u => u.approved === true).length;
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
          <div class="lre-item ${item.approved === true ? 'lre-approved' : ''} ${item.approved === false ? 'lre-rejected' : ''}" data-idx="${idx}">
            <div class="lre-item-header" data-action="toggle" data-idx="${idx}">
              <span class="lre-item-badge ${item.action === 'create' ? 'lre-badge-create' : 'lre-badge-update'}">
                ${item.action === 'create' ? '新增' : '修改'}
              </span>
              <span class="lre-item-name">${esc(item.entryName)}</span>
              <span class="lre-item-reason">${esc(item.reason)}</span>
              <div class="lre-item-actions">
                <button class="lre-btn-sm lre-btn-approve ${item.approved === true ? 'lre-active' : ''}" data-action="approve" data-idx="${idx}" title="通过">✓</button>
                <button class="lre-btn-sm lre-btn-reject ${item.approved === false ? 'lre-active' : ''}" data-action="reject" data-idx="${idx}" title="拒绝">✕</button>
              </div>
            </div>
            ${expandedIdx === idx ? `
              <div class="lre-diff-panel">
                ${buildDiffHtml(item.originalContent, item.newContent)}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      <div class="lre-footer">
        <button class="lre-footer-btn" data-action="approve-all">全部通过</button>
        <button class="lre-footer-btn lre-primary" data-action="execute" ${getApprovedCount() === 0 ? 'disabled' : ''}>
          执行 (${getApprovedCount()})
        </button>
        <button class="lre-footer-btn" data-action="cancel">取消</button>
      </div>
    `;
  }

  render();

  // ── 事件代理 ──
  popup.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;
    const idx = target.dataset.idx !== undefined ? parseInt(target.dataset.idx, 10) : -1;

    switch (action) {
      case 'toggle':
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
        for (const u of updates) u.approved = true;
        render();
        break;
      case 'execute': {
        const approved = updates.filter(u => u.approved === true);
        if (approved.length === 0) return;
        close();
        onExecute(approved);
        break;
      }
      case 'cancel':
        close();
        break;
    }
  });

  doc.body.appendChild(overlay);
  doc.body.appendChild(popup);

  logger.info(`审核弹窗已打开: ${updates.length} 条待审核`);
}
