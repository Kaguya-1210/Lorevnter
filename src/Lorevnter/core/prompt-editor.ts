// ============================================================
// Lorevnter - 提示词编辑器（独立弹窗，不依赖酒馆 callGenericPopup）
// 参考 SoliUmbra 数据库脚本的独立窗口方案
// ============================================================

import { useSettingsStore, type PromptItem } from '../settings';

const POPUP_ID = 'lorevnter-prompt-editor-popup';

/** 打开提示词编辑器弹窗 */
export function openPromptEditor(): void {
  toastr.info('正在打开提示词编辑器...', 'Lorevnter');

  // 已打开则聚焦
  if ($(`#${POPUP_ID}`).length) { $(`#${POPUP_ID}`).css('z-index', '100010'); return; }

  toastr.info(`jQuery $: ${typeof $}, body: ${$('body').length}`, 'Lorevnter-debug');

  const { settings } = useSettingsStore();

  // 工作副本
  const workList: PromptItem[] = JSON.parse(JSON.stringify(settings.lore_ai_prompt_list));

  injectStyles();

  // 挂载弹窗 DOM
  const $overlay = $(`<div class="lpe-overlay" id="${POPUP_ID}-overlay"></div>`);
  const $popup = $(`
    <div class="lpe-popup" id="${POPUP_ID}">
      <div class="lpe-header">
        <span class="lpe-title">📝 提示词编辑器</span>
        <div class="lpe-header-actions">
          <button class="lpe-hbtn lpe-save-btn" title="保存并关闭">保存</button>
          <button class="lpe-hbtn lpe-close-btn" title="取消">✕</button>
        </div>
      </div>
      <div class="lpe-toolbar">
        <button class="lpe-btn" id="lpe-add">＋ 添加</button>
        <select class="lpe-select" id="lpe-preset-select">
          <option value="">— 预设 —</option>
        </select>
        <button class="lpe-btn" id="lpe-preset-load">加载</button>
        <button class="lpe-btn" id="lpe-preset-save">💾</button>
        <button class="lpe-btn" id="lpe-preset-del">🗑</button>
      </div>
      <div class="lpe-body">
        <div class="lpe-list"></div>
      </div>
    </div>
  `);

  $('body').append($overlay).append($popup);

  // ── 渲染 ──
  function render() {
    const $list = $popup.find('.lpe-list');
    $list.empty();

    // 更新预设下拉
    const $select = $popup.find('#lpe-preset-select');
    $select.find('option:not(:first)').remove();
    for (const p of settings.lore_prompt_presets) {
      $select.append(`<option value="${p.name}">${p.name}</option>`);
    }

    if (workList.length === 0) {
      $list.html('<div class="lpe-empty">暂无提示词，点击上方「＋ 添加」创建</div>');
      return;
    }

    for (let i = 0; i < workList.length; i++) {
      const item = workList[i];
      const $item = $(`
        <div class="lpe-item ${item.enabled ? '' : 'lpe-item-off'}" data-i="${i}">
          <span class="lpe-role lpe-role-${item.role}">${item.role.toUpperCase()}</span>
          <span class="lpe-name">${item.name || '(未命名)'}</span>
          <span class="lpe-preview">${(item.content || '').slice(0, 50).replace(/</g, '&lt;')}${item.content.length > 50 ? '…' : ''}</span>
          <div class="lpe-item-actions">
            <input type="checkbox" ${item.enabled ? 'checked' : ''} data-act="toggle" data-i="${i}" />
            <button data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button data-act="down" data-i="${i}" ${i === workList.length - 1 ? 'disabled' : ''}>↓</button>
            <button data-act="edit" data-i="${i}">✏</button>
            <button data-act="del" data-i="${i}" class="lpe-del">✕</button>
          </div>
        </div>
      `);
      $list.append($item);
    }
  }

  render();

  // ── 事件委托 ──
  $popup.on('click', '[data-act="edit"]', function () {
    const i = parseInt($(this).attr('data-i')!);
    openEditPopup(workList[i], (edited) => { workList[i] = edited; render(); });
  });

  $popup.on('click', '[data-act="del"]', function () {
    const i = parseInt($(this).attr('data-i')!);
    if (confirm(`确定删除「${workList[i].name || '未命名'}」？`)) {
      workList.splice(i, 1);
      render();
    }
  });

  $popup.on('change', '[data-act="toggle"]', function () {
    const i = parseInt($(this).attr('data-i')!);
    workList[i].enabled = (this as HTMLInputElement).checked;
    render();
  });

  $popup.on('click', '[data-act="up"]', function () {
    const i = parseInt($(this).attr('data-i')!);
    if (i > 0) { [workList[i], workList[i - 1]] = [workList[i - 1], workList[i]]; render(); }
  });

  $popup.on('click', '[data-act="down"]', function () {
    const i = parseInt($(this).attr('data-i')!);
    if (i < workList.length - 1) { [workList[i], workList[i + 1]] = [workList[i + 1], workList[i]]; render(); }
  });

  // 添加
  $popup.on('click', '#lpe-add', () => {
    openEditPopup(null, (item) => { workList.push(item); render(); });
  });

  // 预设操作
  $popup.on('click', '#lpe-preset-load', () => {
    const name = $popup.find('#lpe-preset-select').val() as string;
    if (!name) return;
    const preset = settings.lore_prompt_presets.find(p => p.name === name);
    if (preset) {
      workList.splice(0, workList.length, ...JSON.parse(JSON.stringify(preset.items)));
      render();
      toastr.success(`已加载预设: ${name}`, 'Lorevnter');
    }
  });

  $popup.on('click', '#lpe-preset-save', () => {
    const name = prompt('输入预设名称：');
    if (!name) return;
    const idx = settings.lore_prompt_presets.findIndex(p => p.name === name);
    const preset = { name, description: '', createdAt: new Date().toISOString(), items: JSON.parse(JSON.stringify(workList)) };
    if (idx >= 0) settings.lore_prompt_presets[idx] = preset;
    else settings.lore_prompt_presets.push(preset);
    toastr.success(`预设已保存: ${name}`, 'Lorevnter');
    render();
  });

  $popup.on('click', '#lpe-preset-del', () => {
    const name = $popup.find('#lpe-preset-select').val() as string;
    if (!name) return;
    const idx = settings.lore_prompt_presets.findIndex(p => p.name === name);
    if (idx >= 0) {
      settings.lore_prompt_presets.splice(idx, 1);
      toastr.info(`已删除预设: ${name}`, 'Lorevnter');
      render();
    }
  });

  // 保存 & 关闭
  $popup.on('click', '.lpe-save-btn', () => {
    settings.lore_ai_prompt_list.splice(0, settings.lore_ai_prompt_list.length, ...workList);
    toastr.success('提示词已保存', 'Lorevnter');
    closePopup();
  });

  $popup.on('click', '.lpe-close-btn', closePopup);
  $overlay.on('click', closePopup);

  function closePopup() {
    $popup.remove();
    $overlay.remove();
  }
}

// ── 编辑单条提示词子弹窗 ──

function openEditPopup(existing: PromptItem | null, onSave: (item: PromptItem) => void) {
  const item: PromptItem = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role: 'system', content: '', enabled: true, name: '' };

  const $overlay = $('<div class="lpe-overlay" style="z-index:100020"></div>');
  const $popup = $(`
    <div class="lpe-edit-popup" style="z-index:100021">
      <div class="lpe-header">
        <span class="lpe-title">${existing ? '编辑提示词' : '添加提示词'}</span>
        <button class="lpe-hbtn lpe-close-btn">✕</button>
      </div>
      <div class="lpe-edit-body">
        <div class="lpe-field">
          <label>名称</label>
          <input type="text" class="lpe-input" id="lpe-e-name" value="${item.name}" placeholder="提示词名称（可选）" />
        </div>
        <div class="lpe-field">
          <label>角色</label>
          <select class="lpe-select" id="lpe-e-role">
            <option value="system" ${item.role === 'system' ? 'selected' : ''}>System</option>
            <option value="user" ${item.role === 'user' ? 'selected' : ''}>User</option>
            <option value="assistant" ${item.role === 'assistant' ? 'selected' : ''}>Assistant</option>
          </select>
        </div>
        <div class="lpe-field">
          <label>内容</label>
          <textarea class="lpe-textarea" id="lpe-e-content" rows="8" placeholder="输入提示词内容...">${item.content}</textarea>
        </div>
        <div class="lpe-edit-actions">
          <button class="lpe-btn lpe-btn-cancel">取消</button>
          <button class="lpe-btn lpe-btn-confirm">${existing ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  `);

  $('body').append($overlay).append($popup);
  $popup.find('#lpe-e-name').trigger('focus');

  function close() { $popup.remove(); $overlay.remove(); }

  $popup.on('click', '.lpe-btn-confirm', () => {
    item.name = $popup.find('#lpe-e-name').val() as string;
    item.role = $popup.find('#lpe-e-role').val() as 'system' | 'user' | 'assistant';
    item.content = $popup.find('#lpe-e-content').val() as string;
    onSave(item);
    close();
  });

  $popup.on('click', '.lpe-btn-cancel', close);
  $popup.on('click', '.lpe-close-btn', close);
  $overlay.on('click', close);
}

// ── 样式注入 ──

function injectStyles() {
  if (document.getElementById('lpe-styles')) return;
  const style = document.createElement('style');
  style.id = 'lpe-styles';
  style.textContent = `
    .lpe-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5); z-index: 100000;
    }
    .lpe-popup, .lpe-edit-popup {
      position: fixed; z-index: 100001;
      background: var(--SmartThemeBlurTintColor, #1e1e2e);
      border: 1px solid var(--SmartThemeBorderColor, #333);
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      display: flex; flex-direction: column;
      overflow: hidden;
      color: var(--SmartThemeBodyColor, #ccc);
    }
    .lpe-popup {
      top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(95vw, 560px); max-height: 85vh;
    }
    .lpe-edit-popup {
      top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(90vw, 480px); max-height: 80vh;
    }
    .lpe-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px; border-bottom: 1px solid var(--SmartThemeBorderColor, #333);
      flex-shrink: 0;
    }
    .lpe-title { font-size: 15px; font-weight: 600; }
    .lpe-header-actions { display: flex; gap: 6px; }
    .lpe-hbtn {
      padding: 6px 14px; border: 1px solid var(--SmartThemeBorderColor, #444);
      border-radius: 6px; background: transparent;
      color: var(--SmartThemeBodyColor, #ccc); cursor: pointer;
      font-size: 13px; min-height: 36px; min-width: 36px;
      transition: background 0.15s;
    }
    .lpe-hbtn:hover { background: var(--SmartThemeBorderColor, #444); }
    .lpe-save-btn { background: rgba(88,166,255,0.15); color: #58a6ff; border-color: rgba(88,166,255,0.3); }
    .lpe-save-btn:hover { background: rgba(88,166,255,0.25); }
    .lpe-toolbar {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 10px 18px; border-bottom: 1px solid var(--SmartThemeBorderColor, #333);
      flex-shrink: 0;
    }
    .lpe-btn {
      padding: 6px 12px; border: 1px solid var(--SmartThemeBorderColor, #444);
      border-radius: 6px; background: transparent;
      color: var(--SmartThemeBodyColor, #ccc); cursor: pointer;
      font-size: 13px; min-height: 36px;
      transition: background 0.15s;
    }
    .lpe-btn:hover { background: var(--SmartThemeBorderColor, #444); }
    .lpe-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .lpe-btn-confirm { background: rgba(88,166,255,0.15); color: #58a6ff; }
    .lpe-btn-confirm:hover { background: rgba(88,166,255,0.25); }
    .lpe-select {
      padding: 6px 10px; border: 1px solid var(--SmartThemeBorderColor, #444);
      border-radius: 6px; background: var(--SmartThemeBlurTintColor, #1e1e2e);
      color: var(--SmartThemeBodyColor, #ccc); font-size: 13px;
      flex: 1; min-width: 80px;
    }
    .lpe-body { flex: 1; overflow-y: auto; padding: 12px 18px; min-height: 0; }
    .lpe-list { display: flex; flex-direction: column; gap: 6px; }
    .lpe-empty { text-align: center; color: #888; padding: 40px 0; font-size: 14px; }
    .lpe-item {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 10px 12px; border-radius: 8px;
      background: rgba(255,255,255,0.03); border: 1px solid var(--SmartThemeBorderColor, #333);
    }
    .lpe-item-off { opacity: 0.4; }
    .lpe-role { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; flex-shrink: 0; }
    .lpe-role-system { background: rgba(88,166,255,0.15); color: #58a6ff; }
    .lpe-role-user { background: rgba(52,199,89,0.15); color: #34c759; }
    .lpe-role-assistant { background: rgba(255,149,0,0.15); color: #ff9500; }
    .lpe-name { font-size: 13px; font-weight: 500; flex-shrink: 0; }
    .lpe-preview { font-size: 12px; color: #888; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lpe-item-actions { display: flex; gap: 4px; flex-shrink: 0; }
    .lpe-item-actions button {
      padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor, #444);
      border-radius: 4px; background: transparent;
      color: var(--SmartThemeBodyColor, #ccc); cursor: pointer;
      font-size: 13px; min-width: 30px; min-height: 30px;
    }
    .lpe-item-actions button:hover { background: var(--SmartThemeBorderColor, #444); }
    .lpe-item-actions button:disabled { opacity: 0.3; }
    .lpe-del { color: #ff453a !important; }
    .lpe-del:hover { background: rgba(255,69,58,0.15) !important; }
    .lpe-item-actions input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }
    .lpe-edit-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
    .lpe-field { display: flex; flex-direction: column; gap: 4px; }
    .lpe-field label { font-size: 13px; font-weight: 500; }
    .lpe-input {
      padding: 8px 12px; border: 1px solid var(--SmartThemeBorderColor, #444);
      border-radius: 6px; background: var(--SmartThemeBlurTintColor, #1e1e2e);
      color: var(--SmartThemeBodyColor, #ccc); font-size: 14px;
    }
    .lpe-textarea {
      padding: 10px 12px; border: 1px solid var(--SmartThemeBorderColor, #444);
      border-radius: 6px; background: var(--SmartThemeBlurTintColor, #1e1e2e);
      color: var(--SmartThemeBodyColor, #ccc); font-size: 13px;
      font-family: monospace; resize: vertical; min-height: 120px;
    }
    .lpe-edit-actions { display: flex; gap: 8px; justify-content: flex-end; }
    @media (max-width: 600px) {
      .lpe-popup { top: 0; left: 0; right: 0; bottom: 0; transform: none; width: 100vw; max-height: 100vh; border-radius: 0; }
      .lpe-edit-popup { width: 100vw; max-height: 100vh; top: 0; left: 0; right: 0; bottom: 0; transform: none; border-radius: 0; }
      .lpe-preview { display: none; }
      .lpe-toolbar { padding: 8px 12px; }
      .lpe-body { padding: 10px 12px; }
      .lpe-header { padding: 12px; }
    }
  `;
  document.head.appendChild(style);
}
