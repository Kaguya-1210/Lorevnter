// ============================================================
// Lorevnter - 提示词编辑器（纯 DOM 弹窗，不依赖 jQuery 和 callGenericPopup）
// ============================================================

import { useSettingsStore, type PromptItem } from '../settings';

const POPUP_ID = 'lorevnter-prompt-editor';

/** 打开提示词编辑器弹窗 */
export function openPromptEditor(): void {
  // 已打开则聚焦
  if (document.getElementById(POPUP_ID)) return;

  const { settings } = useSettingsStore();
  const workList: PromptItem[] = JSON.parse(JSON.stringify(settings.lore_ai_prompt_list));

  // ── 创建弹窗 ──
  const overlay = createElement('div', { id: `${POPUP_ID}-bg`, className: 'lpe-bg' });
  const popup = createElement('div', { id: POPUP_ID, className: 'lpe-popup' });
  popup.innerHTML = `
    <div class="lpe-header">
      <span class="lpe-title">📝 提示词编辑器</span>
      <div class="lpe-hgroup">
        <button class="lpe-hsave">保存</button>
        <button class="lpe-hclose">✕</button>
      </div>
    </div>
    <div class="lpe-toolbar">
      <button class="lpe-btn" id="lpe-add-btn">＋ 添加</button>
      <select class="lpe-sel" id="lpe-preset-sel"><option value="">— 预设 —</option></select>
      <button class="lpe-btn" id="lpe-pload">加载</button>
      <button class="lpe-btn" id="lpe-psave">💾</button>
      <button class="lpe-btn" id="lpe-pdel">🗑</button>
    </div>
    <div class="lpe-body"><div class="lpe-list"></div></div>
  `;

  injectStyles();
  document.body.appendChild(overlay);
  document.body.appendChild(popup);

  // ── 渲染列表 ──
  function render() {
    const list = popup.querySelector('.lpe-list')!;
    list.innerHTML = '';

    // 更新预设下拉
    const sel = popup.querySelector('#lpe-preset-sel') as HTMLSelectElement;
    sel.innerHTML = '<option value="">— 预设 —</option>';
    for (const p of settings.lore_prompt_presets) {
      const opt = document.createElement('option');
      opt.value = p.name; opt.textContent = p.name;
      sel.appendChild(opt);
    }

    if (workList.length === 0) {
      list.innerHTML = '<div class="lpe-empty">暂无提示词，点击上方「＋ 添加」创建</div>';
      return;
    }

    for (let i = 0; i < workList.length; i++) {
      const item = workList[i];
      const row = createElement('div', { className: `lpe-item ${item.enabled ? '' : 'lpe-item-off'}` });
      row.innerHTML = `
        <span class="lpe-role lpe-role-${item.role}">${item.role.toUpperCase()}</span>
        <span class="lpe-name">${esc(item.name || '(未命名)')}</span>
        <span class="lpe-preview">${esc((item.content || '').slice(0, 50))}${item.content.length > 50 ? '…' : ''}</span>
        <div class="lpe-acts">
          <input type="checkbox" ${item.enabled ? 'checked' : ''} data-i="${i}" data-a="tog" />
          <button data-i="${i}" data-a="up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button data-i="${i}" data-a="dn" ${i === workList.length - 1 ? 'disabled' : ''}>↓</button>
          <button data-i="${i}" data-a="edit">✏</button>
          <button data-i="${i}" data-a="del" class="lpe-danger">✕</button>
        </div>
      `;
      list.appendChild(row);
    }
  }

  render();

  // ── 事件（委托到 popup） ──
  popup.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!t) return;
    const action = t.dataset.a;
    const i = parseInt(t.dataset.i || '0');

    if (action === 'edit') {
      openEditDialog(workList[i], (edited) => { workList[i] = edited; render(); });
    } else if (action === 'del') {
      if (confirm(`确定删除「${workList[i].name || '未命名'}」？`)) { workList.splice(i, 1); render(); }
    } else if (action === 'up' && i > 0) {
      [workList[i], workList[i - 1]] = [workList[i - 1], workList[i]]; render();
    } else if (action === 'dn' && i < workList.length - 1) {
      [workList[i], workList[i + 1]] = [workList[i + 1], workList[i]]; render();
    }
  });

  popup.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset?.a === 'tog') {
      const i = parseInt(t.dataset.i || '0');
      workList[i].enabled = (t as HTMLInputElement).checked;
      render();
    }
  });

  // 添加按钮
  popup.querySelector('#lpe-add-btn')!.addEventListener('click', () => {
    openEditDialog(null, (item) => { workList.push(item); render(); });
  });

  // 预设：加载
  popup.querySelector('#lpe-pload')!.addEventListener('click', () => {
    const name = (popup.querySelector('#lpe-preset-sel') as HTMLSelectElement).value;
    if (!name) return;
    const preset = settings.lore_prompt_presets.find(p => p.name === name);
    if (preset) {
      workList.splice(0, workList.length, ...JSON.parse(JSON.stringify(preset.items)));
      render();
      toastr.success(`已加载预设: ${name}`, 'Lorevnter');
    }
  });

  // 预设：保存
  popup.querySelector('#lpe-psave')!.addEventListener('click', () => {
    const name = prompt('输入预设名称：');
    if (!name) return;
    const idx = settings.lore_prompt_presets.findIndex(p => p.name === name);
    const preset = { name, description: '', createdAt: new Date().toISOString(), items: JSON.parse(JSON.stringify(workList)) };
    if (idx >= 0) settings.lore_prompt_presets[idx] = preset;
    else settings.lore_prompt_presets.push(preset);
    toastr.success(`预设已保存: ${name}`, 'Lorevnter');
    render();
  });

  // 预设：删除
  popup.querySelector('#lpe-pdel')!.addEventListener('click', () => {
    const name = (popup.querySelector('#lpe-preset-sel') as HTMLSelectElement).value;
    if (!name) return;
    const idx = settings.lore_prompt_presets.findIndex(p => p.name === name);
    if (idx >= 0) {
      settings.lore_prompt_presets.splice(idx, 1);
      toastr.info(`已删除预设: ${name}`, 'Lorevnter');
      render();
    }
  });

  // 保存
  popup.querySelector('.lpe-hsave')!.addEventListener('click', () => {
    settings.lore_ai_prompt_list.splice(0, settings.lore_ai_prompt_list.length, ...workList);
    toastr.success('提示词已保存', 'Lorevnter');
    close();
  });

  // 关闭
  popup.querySelector('.lpe-hclose')!.addEventListener('click', close);
  overlay.addEventListener('click', close);

  function close() {
    popup.remove();
    overlay.remove();
  }
}

// ── 编辑单条提示词 ──

function openEditDialog(existing: PromptItem | null, onSave: (item: PromptItem) => void) {
  const item: PromptItem = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role: 'system', content: '', enabled: true, name: '' };

  const bg = createElement('div', { className: 'lpe-bg', style: 'z-index:100020' });
  const dlg = createElement('div', { className: 'lpe-edit-dlg', style: 'z-index:100021' });
  dlg.innerHTML = `
    <div class="lpe-header">
      <span class="lpe-title">${existing ? '编辑提示词' : '添加提示词'}</span>
      <button class="lpe-hclose">✕</button>
    </div>
    <div class="lpe-edit-body">
      <div class="lpe-field"><label>名称</label><input type="text" id="lpe-en" value="${esc(item.name)}" placeholder="提示词名称（可选）" /></div>
      <div class="lpe-field"><label>角色</label>
        <select id="lpe-er">
          <option value="system" ${item.role === 'system' ? 'selected' : ''}>System</option>
          <option value="user" ${item.role === 'user' ? 'selected' : ''}>User</option>
          <option value="assistant" ${item.role === 'assistant' ? 'selected' : ''}>Assistant</option>
        </select>
      </div>
      <div class="lpe-field"><label>内容</label><textarea id="lpe-ec" rows="8" placeholder="输入提示词内容...">${esc(item.content)}</textarea></div>
      <div class="lpe-eactions">
        <button class="lpe-btn lpe-cancel">取消</button>
        <button class="lpe-btn lpe-confirm">${existing ? '保存' : '添加'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(bg);
  document.body.appendChild(dlg);
  (dlg.querySelector('#lpe-en') as HTMLInputElement).focus();

  function close() { dlg.remove(); bg.remove(); }

  dlg.querySelector('.lpe-confirm')!.addEventListener('click', () => {
    item.name = (dlg.querySelector('#lpe-en') as HTMLInputElement).value;
    item.role = (dlg.querySelector('#lpe-er') as HTMLSelectElement).value as 'system' | 'user' | 'assistant';
    item.content = (dlg.querySelector('#lpe-ec') as HTMLTextAreaElement).value;
    onSave(item);
    close();
  });

  dlg.querySelector('.lpe-cancel')!.addEventListener('click', close);
  dlg.querySelector('.lpe-hclose')!.addEventListener('click', close);
  bg.addEventListener('click', close);
}

// ── 工具 ──

function createElement(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v);
  }
  return el;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 样式 ──

function injectStyles() {
  if (document.getElementById('lpe-css')) return;
  const s = document.createElement('style');
  s.id = 'lpe-css';
  s.textContent = `
.lpe-bg{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.5);z-index:100000}
.lpe-popup,.lpe-edit-dlg{position:fixed;z-index:100001;background:var(--SmartThemeBlurTintColor,#1e1e2e);border:1px solid var(--SmartThemeBorderColor,#333);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;color:var(--SmartThemeBodyColor,#ccc);animation:lpe-in .2s ease-out}
.lpe-popup{top:50%;left:50%;transform:translate(-50%,-50%);width:min(95vw,560px);max-height:85vh}
.lpe-edit-dlg{top:50%;left:50%;transform:translate(-50%,-50%);width:min(90vw,480px);max-height:80vh}
@keyframes lpe-in{from{opacity:0;transform:translate(-50%,-50%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
.lpe-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--SmartThemeBorderColor,#333);flex-shrink:0}
.lpe-title{font-size:15px;font-weight:600}
.lpe-hgroup{display:flex;gap:6px}
.lpe-hsave,.lpe-hclose{padding:6px 14px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:transparent;color:var(--SmartThemeBodyColor,#ccc);cursor:pointer;font-size:13px;min-height:36px;min-width:36px}
.lpe-hsave{background:rgba(88,166,255,.15);color:#58a6ff;border-color:rgba(88,166,255,.3)}
.lpe-hsave:hover{background:rgba(88,166,255,.25)}
.lpe-hclose:hover{background:var(--SmartThemeBorderColor,#444)}
.lpe-toolbar{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px;border-bottom:1px solid var(--SmartThemeBorderColor,#333);flex-shrink:0}
.lpe-btn{padding:6px 12px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:transparent;color:var(--SmartThemeBodyColor,#ccc);cursor:pointer;font-size:13px;min-height:36px}
.lpe-btn:hover{background:var(--SmartThemeBorderColor,#444)}
.lpe-btn:disabled{opacity:.3;cursor:not-allowed}
.lpe-confirm{background:rgba(88,166,255,.15)!important;color:#58a6ff!important}
.lpe-sel,#lpe-en,#lpe-er,#lpe-ec{padding:6px 10px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:var(--SmartThemeBlurTintColor,#1e1e2e);color:var(--SmartThemeBodyColor,#ccc);font-size:13px;width:100%;box-sizing:border-box}
.lpe-sel{flex:1;min-width:80px;width:auto}
.lpe-body{flex:1;overflow-y:auto;padding:12px 18px;min-height:0}
.lpe-list{display:flex;flex-direction:column;gap:6px}
.lpe-empty{text-align:center;color:#888;padding:40px 0;font-size:14px}
.lpe-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--SmartThemeBorderColor,#333)}
.lpe-item-off{opacity:.4}
.lpe-role{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;flex-shrink:0}
.lpe-role-system{background:rgba(88,166,255,.15);color:#58a6ff}
.lpe-role-user{background:rgba(52,199,89,.15);color:#34c759}
.lpe-role-assistant{background:rgba(255,149,0,.15);color:#ff9500}
.lpe-name{font-size:13px;font-weight:500;flex-shrink:0}
.lpe-preview{font-size:12px;color:#888;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lpe-acts{display:flex;gap:4px;flex-shrink:0}
.lpe-acts button{padding:4px 8px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:4px;background:transparent;color:var(--SmartThemeBodyColor,#ccc);cursor:pointer;font-size:13px;min-width:30px;min-height:30px}
.lpe-acts button:hover{background:var(--SmartThemeBorderColor,#444)}
.lpe-acts button:disabled{opacity:.3}
.lpe-danger{color:#ff453a!important}
.lpe-acts input[type=checkbox]{width:16px;height:16px;cursor:pointer}
.lpe-edit-body{padding:18px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
.lpe-field{display:flex;flex-direction:column;gap:4px}
.lpe-field label{font-size:13px;font-weight:500}
#lpe-ec{font-family:monospace;resize:vertical;min-height:120px}
.lpe-eactions{display:flex;gap:8px;justify-content:flex-end}
@media(max-width:600px){
  .lpe-popup{top:0;left:0;right:0;bottom:0;transform:none;width:100vw;max-height:100vh;border-radius:0}
  .lpe-edit-dlg{width:100vw;max-height:100vh;top:0;left:0;right:0;bottom:0;transform:none;border-radius:0}
  @keyframes lpe-in{from{opacity:0}to{opacity:1}}
  .lpe-preview{display:none}
  .lpe-toolbar{padding:8px 12px}
  .lpe-body{padding:10px 12px}
}
  `;
  document.head.appendChild(s);
}
