// ============================================================
// Lorevnter - 提示词编辑器
// 核心要点：脚本运行在 iframe 中，DOM 必须挂载到主窗口（window.parent）
// ============================================================

import { useSettingsStore, type PromptItem, type PromptPreset } from '../settings';

const POPUP_ID = 'lorevnter-prompt-editor';

// ── 内置 default 预设 ──

/** 更新阶段（一次调用 / twopass 第2次调用） */
export const BUILTIN_UPDATE_PRESET: PromptItem[] = [
  {
    id: 'builtin_update_sys',
    role: 'system',
    name: '[更新] 系统指令',
    enabled: true,
    content: `<role>你是 Lorevnter 世界书条目更新引擎。你不是对话参与者，你是一个数据处理管线。</role>

<task>分析对话内容，判断世界书条目是否需要更新，输出 JSON 结果。</task>

<analysis_steps>
按以下步骤逐条分析每个条目：
1. 读取条目当前内容，提取其中记录的关键事实点
2. 扫描最近对话内容，查找与该条目事实点直接相关的新信息
3. 判断：对话中是否存在与条目内容矛盾的事实，或需要补充的新事实？
4. 若是 → 生成 update：newContent 必须是更新后的完整内容
5. 若条目附带 constraint（约束指令）→ 严格按约束条件判断更新方式
6. 若无相关变化 → 跳过该条目，不输出任何内容
</analysis_steps>

<rules>
<rule id="R1" priority="critical">仅关注事实性变化：对话中必须存在与条目内容直接矛盾或需要补充的新事实。</rule>
<rule id="R2" priority="critical">完整替换：newContent 是条目完整内容，不是增量补丁。</rule>
<rule id="R3" priority="high">保留原有结构：延续条目原有的格式、分段、标记风格。</rule>
<rule id="R4" priority="high">禁止推测：对话中没有直接涉及的条目「不需要更新」。</rule>
<rule id="R5" priority="high">约束优先：条目附带 constraint 时，严格遵循约束格式和更新条件。</rule>
<rule id="R6" priority="critical">纯 JSON 输出：只输出 JSON 对象，不输出任何前缀、后缀、解释、markdown 代码块。</rule>
</rules>

<output_schema>
{
  "updates": [
    {
      "entryName": "条目名称（必须与输入完全匹配）",
      "newContent": "更新后的完整内容",
      "reason": "简洁更新理由（一句话）"
    }
  ]
}
无需更新时返回：{"updates": []}
</output_schema>`,
  },
  {
    id: 'builtin_update_ast',
    role: 'assistant',
    name: '[更新] CoT 锚定',
    enabled: true,
    content: `{"updates": [`,
  },
];

/** 筛选阶段（twopass 第1次调用） */
export const BUILTIN_TRIAGE_PRESET: PromptItem[] = [
  {
    id: 'builtin_triage_sys',
    role: 'system',
    name: '[筛选] 系统指令',
    enabled: true,
    content: `<role>你是 Lorevnter 世界书条目筛选器。你不参与对话，你是一个过滤管线。</role>

<task>从条目名称列表中筛选出可能需要更新的条目。</task>

<analysis_steps>
1. 逐一检查每个条目名称
2. 对比对话内容，判断是否有信息可能影响该条目记录的状态
3. 有关联 → 选入；不确定 → 也选入（宁多勿漏）
4. 无关 → 不选
</analysis_steps>

<rules>
<rule id="T1" priority="critical">对话中直接提及或暗示了该条目记录的状态发生变化 → 选入。</rule>
<rule id="T2" priority="high">不确定时宁可多选。后续更新阶段会精确判断。</rule>
<rule id="T3" priority="critical">纯 JSON 数组输出：只输出条目名称数组。</rule>
</rules>

<output_schema>
["条目名称1", "条目名称2"]
无需检查时返回：[]
</output_schema>`,
  },
  {
    id: 'builtin_triage_ast',
    role: 'assistant',
    name: '[筛选] CoT 锚定',
    enabled: true,
    content: `[`,
  },
];

/** 构造 default 虚拟预设对象 */
function makeDefaultPreset(): PromptPreset {
  return {
    name: 'default',
    description: '内置默认预设',
    createdAt: '',
    update_items: JSON.parse(JSON.stringify(BUILTIN_UPDATE_PRESET)),
    triage_items: JSON.parse(JSON.stringify(BUILTIN_TRIAGE_PRESET)),
  };
}

/**
 * 获取当前激活预设的 items。
 * 返回深拷贝，调用方可安全修改。
 */
export function getActivePreset(): PromptPreset {
  const { settings } = useSettingsStore();
  const activeName = settings.lore_active_prompt_preset;

  if (activeName === 'default') {
    return makeDefaultPreset();
  }

  const found = settings.lore_prompt_presets.find(p => p.name === activeName);
  if (found) {
    return JSON.parse(JSON.stringify(found));
  }

  // 回退到 default
  return makeDefaultPreset();
}

// ── DOM 辅助 ──

function getTopWindow(): Window {
  return typeof window.parent !== 'undefined' ? window.parent : window;
}

function getTopDoc(): Document {
  return getTopWindow().document;
}

// ── 编辑器主体 ──

export function openPromptEditor(): void {
  const doc = getTopDoc();
  if (doc.getElementById(POPUP_ID)) return;

  const { settings } = useSettingsStore();

  // 当前激活预设
  let currentPresetName = settings.lore_active_prompt_preset || 'default';

  // 工作副本（从激活预设加载）
  let workUpdate: PromptItem[] = [];
  let workTriage: PromptItem[] = [];
  let activeTab: 'update' | 'triage' = 'update';

  // 脏检查快照（用于关闭时判断是否有未保存修改）
  let snapshotUpdate = '';
  let snapshotTriage = '';
  function takeSnapshot() {
    snapshotUpdate = JSON.stringify(workUpdate);
    snapshotTriage = JSON.stringify(workTriage);
  }
  function isDirty(): boolean {
    return JSON.stringify(workUpdate) !== snapshotUpdate || JSON.stringify(workTriage) !== snapshotTriage;
  }

  function loadPreset(name: string) {
    currentPresetName = name;
    settings.lore_active_prompt_preset = name;

    if (name === 'default') {
      workUpdate = JSON.parse(JSON.stringify(BUILTIN_UPDATE_PRESET));
      workTriage = JSON.parse(JSON.stringify(BUILTIN_TRIAGE_PRESET));
    } else {
      const found = settings.lore_prompt_presets.find(p => p.name === name);
      if (found) {
        workUpdate = JSON.parse(JSON.stringify(found.update_items));
        workTriage = JSON.parse(JSON.stringify(found.triage_items));
      } else {
        // 找不到 → 回退 default
        workUpdate = JSON.parse(JSON.stringify(BUILTIN_UPDATE_PRESET));
        workTriage = JSON.parse(JSON.stringify(BUILTIN_TRIAGE_PRESET));
        currentPresetName = 'default';
        settings.lore_active_prompt_preset = 'default';
      }
    }
  }

  // 初始加载
  loadPreset(currentPresetName);
  takeSnapshot();

  injectStyles(doc);

  // ── 创建弹窗 ──
  const overlay = doc.createElement('div');
  overlay.id = `${POPUP_ID}-bg`;
  overlay.className = 'lpe-bg';

  const popup = doc.createElement('div');
  popup.id = POPUP_ID;
  popup.className = 'lpe-popup';
  popup.innerHTML = `
    <div class="lpe-header">
      <span class="lpe-title">📝 提示词编辑器</span>
      <div class="lpe-hgroup">
        <button class="lpe-hsave">保存</button>
        <button class="lpe-hclose">✕</button>
      </div>
    </div>
    <div class="lpe-toolbar">
      <select class="lpe-sel" id="lpe-preset-sel"></select>
      <button class="lpe-btn" data-a="saveas">另存为</button>
      <button class="lpe-btn lpe-danger" data-a="pdel">删除</button>
    </div>
    <div class="lpe-body">
      <div class="lpe-list-header"><button class="lpe-btn" data-a="add">＋ 添加条目</button></div>
      <div class="lpe-list"></div>
    </div>
  `;

  doc.body.appendChild(overlay);
  doc.body.appendChild(popup);

  // Tab 切换
  popup.querySelectorAll('.lpe-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = (btn as HTMLElement).dataset.tab as 'update' | 'triage';
      popup.querySelectorAll('.lpe-tab').forEach(b => b.classList.remove('lpe-tab-active'));
      btn.classList.add('lpe-tab-active');
      render();
    });
  });

  function getActiveList(): PromptItem[] {
    return activeTab === 'triage' ? workTriage : workUpdate;
  }

  // ── 预设下拉（选即加载） ──
  const sel = popup.querySelector('#lpe-preset-sel') as HTMLSelectElement;

  function refreshPresetSelect() {
    sel.innerHTML = '';
    // default 始终在首位
    const defOpt = doc.createElement('option');
    defOpt.value = 'default';
    defOpt.textContent = 'default（内置）';
    sel.appendChild(defOpt);
    // 用户预设
    for (const p of settings.lore_prompt_presets) {
      const opt = doc.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      sel.appendChild(opt);
    }
    sel.value = currentPresetName;
  }

  sel.addEventListener('change', () => {
    const name = sel.value;
    if (name) {
      loadPreset(name);
      render();
    }
  });

  // ── 渲染 ──
  function render() {
    refreshPresetSelect();
    const list = popup.querySelector('.lpe-list')!;
    list.innerHTML = '';
    const items = getActiveList();

    if (items.length === 0) {
      list.innerHTML = `<div class="lpe-empty">暂无提示词条目，点击「＋ 添加」创建。</div>`;
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = doc.createElement('div');
      row.className = `lpe-item ${item.enabled ? '' : 'lpe-item-off'}`;
      row.innerHTML = `
        <span class="lpe-role lpe-role-${item.role}">${item.role.toUpperCase()}</span>
        <span class="lpe-name">${esc(item.name || '未命名')}</span>
        <span class="lpe-preview">${esc(item.content.slice(0, 60))}</span>
        <div class="lpe-acts">
          <input type="checkbox" data-a="tog" data-i="${i}" ${item.enabled ? 'checked' : ''} />
          <button data-a="edit" data-i="${i}">✎</button>
          <button data-a="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button data-a="dn" data-i="${i}" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button data-a="del" data-i="${i}" class="lpe-danger">✕</button>
        </div>
      `;
      list.appendChild(row);
    }
  }

  render();

  // ── 事件处理 ──
  popup.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!t) return;
    const action = t.dataset.a;
    const items = getActiveList();
    const i = parseInt(t.dataset.i || '0');

    switch (action) {
      case 'edit':
        openEditDialog(doc, items[i], (edited) => { items[i] = edited; render(); });
        break;
      case 'del':
        if (confirm(`确定删除「${items[i].name || '未命名'}」？`)) { items.splice(i, 1); render(); }
        break;
      case 'up':
        if (i > 0) { [items[i], items[i - 1]] = [items[i - 1], items[i]]; render(); }
        break;
      case 'dn':
        if (i < items.length - 1) { [items[i], items[i + 1]] = [items[i + 1], items[i]]; render(); }
        break;
      case 'add':
        openEditDialog(doc, null, (item) => { items.push(item); render(); });
        break;
      case 'saveas': {
        const rawName = prompt('输入新预设名称：');
        if (!rawName) return;
        const name = rawName.trim().slice(0, 30);
        if (!name) { toastr.warning('名称不能为空', 'Lorevnter'); return; }
        if (name === 'default') { toastr.warning('不能覆盖内置 default 预设', 'Lorevnter'); return; }
        const newPreset: PromptPreset = {
          name,
          description: '',
          createdAt: new Date().toISOString(),
          update_items: JSON.parse(JSON.stringify(workUpdate)),
          triage_items: JSON.parse(JSON.stringify(workTriage)),
        };
        const idx = settings.lore_prompt_presets.findIndex(p => p.name === name);
        if (idx >= 0) {
          if (!confirm(`预设「${name}」已存在，要覆盖吗？`)) return;
          settings.lore_prompt_presets[idx] = newPreset;
        } else {
          settings.lore_prompt_presets.push(newPreset);
        }
        currentPresetName = name;
        settings.lore_active_prompt_preset = name;
        toastr.success(`预设已保存: ${name}`, 'Lorevnter');
        render();
        break;
      }
      case 'pdel': {
        if (currentPresetName === 'default') {
          toastr.warning('内置 default 预设不可删除', 'Lorevnter');
          return;
        }
        if (!confirm(`确定删除预设「${currentPresetName}」？`)) return;
        const idx = settings.lore_prompt_presets.findIndex(p => p.name === currentPresetName);
        if (idx >= 0) {
          settings.lore_prompt_presets.splice(idx, 1);
          toastr.info(`已删除预设: ${currentPresetName}`, 'Lorevnter');
        }
        loadPreset('default');
        render();
        break;
      }
    }
  });

  popup.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset?.a === 'tog') {
      const items = getActiveList();
      const i = parseInt(t.dataset.i || '0');
      items[i].enabled = (t as HTMLInputElement).checked;
      render();
    }
  });

  // 保存
  popup.querySelector('.lpe-hsave')!.addEventListener('click', () => {
    if (currentPresetName === 'default') {
      // default 不可覆盖，引导另存为
      const rawName = prompt('内置预设不可覆盖，请输入新预设名称保存：');
      if (!rawName) return;
      const name = rawName.trim().slice(0, 30);
      if (!name || name === 'default') return;
      const newPreset: PromptPreset = {
        name,
        description: '',
        createdAt: new Date().toISOString(),
        update_items: JSON.parse(JSON.stringify(workUpdate)),
        triage_items: JSON.parse(JSON.stringify(workTriage)),
      };
      const idx = settings.lore_prompt_presets.findIndex(p => p.name === name);
      if (idx >= 0) settings.lore_prompt_presets[idx] = newPreset;
      else settings.lore_prompt_presets.push(newPreset);
      currentPresetName = name;
      settings.lore_active_prompt_preset = name;
      toastr.success(`已另存为预设: ${name}`, 'Lorevnter');
      takeSnapshot();
      popup.remove();
      overlay.remove();
    } else {
      // 覆盖当前预设
      const idx = settings.lore_prompt_presets.findIndex(p => p.name === currentPresetName);
      if (idx >= 0) {
        settings.lore_prompt_presets[idx].update_items = JSON.parse(JSON.stringify(workUpdate));
        settings.lore_prompt_presets[idx].triage_items = JSON.parse(JSON.stringify(workTriage));
        toastr.success(`预设已保存: ${currentPresetName}`, 'Lorevnter');
      }
      takeSnapshot();
      popup.remove();
      overlay.remove();
    }
  });

  // 关闭（含脏检查）
  function tryClose() {
    if (isDirty()) {
      if (!confirm('有未保存的修改，确定关闭？')) return;
    }
    popup.remove();
    overlay.remove();
  }
  popup.querySelector('.lpe-hclose')!.addEventListener('click', tryClose);
  overlay.addEventListener('click', tryClose);
}

// ── 编辑单条提示词子弹窗 ──

function openEditDialog(doc: Document, existing: PromptItem | null, onSave: (item: PromptItem) => void) {
  const item: PromptItem = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role: 'system', content: '', enabled: true, name: '' };

  const bg = doc.createElement('div');
  bg.className = 'lpe-bg';
  bg.style.zIndex = '100020';

  const dlg = doc.createElement('div');
  dlg.className = 'lpe-edit-dlg';
  dlg.style.zIndex = '100021';
  dlg.innerHTML = `
    <div class="lpe-header">
      <span class="lpe-title">${existing ? '编辑提示词' : '添加提示词'}</span>
      <button class="lpe-hclose">✕</button>
    </div>
    <div class="lpe-edit-body">
      <div class="lpe-field"><label>名称</label><input type="text" class="lpe-input" id="lpe-en" value="${esc(item.name)}" placeholder="提示词名称（可选）" /></div>
      <div class="lpe-field"><label>角色</label>
        <select class="lpe-input" id="lpe-er">
          <option value="system" ${item.role === 'system' ? 'selected' : ''}>System</option>
          <option value="user" ${item.role === 'user' ? 'selected' : ''}>User</option>
          <option value="assistant" ${item.role === 'assistant' ? 'selected' : ''}>Assistant</option>
        </select>
      </div>
      <div class="lpe-field"><label>内容</label><textarea class="lpe-input lpe-textarea" id="lpe-ec" rows="8" placeholder="输入提示词内容...">${esc(item.content)}</textarea></div>
      <div class="lpe-eactions">
        <button class="lpe-btn lpe-cancel">取消</button>
        <button class="lpe-btn lpe-confirm">${existing ? '保存' : '添加'}</button>
      </div>
    </div>
  `;

  doc.body.appendChild(bg);
  doc.body.appendChild(dlg);
  (dlg.querySelector('#lpe-en') as HTMLInputElement)?.focus();

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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 样式注入到主窗口 ──

function injectStyles(doc: Document) {
  if (doc.getElementById('lpe-css')) return;
  const s = doc.createElement('style');
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
.lpe-hsave,.lpe-hclose{padding:6px 14px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:transparent;color:var(--SmartThemeBodyColor,#ccc);cursor:pointer;font-size:13px;min-height:36px;min-width:36px;transition:background .15s}
.lpe-hsave{background:rgba(88,166,255,.15);color:#58a6ff;border-color:rgba(88,166,255,.3)}
.lpe-hsave:hover{background:rgba(88,166,255,.25)}
.lpe-hclose:hover{background:var(--SmartThemeBorderColor,#444)}
.lpe-toolbar{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px;border-bottom:1px solid var(--SmartThemeBorderColor,#333);flex-shrink:0;align-items:center}
.lpe-btn{padding:6px 12px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:transparent;color:var(--SmartThemeBodyColor,#ccc);cursor:pointer;font-size:13px;min-height:36px;transition:background .15s}
.lpe-btn:hover{background:var(--SmartThemeBorderColor,#444)}
.lpe-btn:disabled{opacity:.3;cursor:not-allowed}
.lpe-confirm{background:rgba(88,166,255,.15)!important;color:#58a6ff!important}
.lpe-confirm:hover{background:rgba(88,166,255,.25)!important}
.lpe-sel{padding:6px 10px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:var(--SmartThemeBlurTintColor,#1e1e2e);color:var(--SmartThemeBodyColor,#ccc);font-size:13px;min-width:120px}
.lpe-input{padding:8px 12px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:var(--SmartThemeBlurTintColor,#1e1e2e);color:var(--SmartThemeBodyColor,#ccc);font-size:14px;width:100%;box-sizing:border-box}
.lpe-textarea{font-family:monospace;resize:vertical;min-height:120px;font-size:13px}
.lpe-body{flex:1;overflow-y:auto;padding:12px 18px;min-height:0}
.lpe-list{display:flex;flex-direction:column;gap:6px}
.lpe-list-header{display:flex;justify-content:flex-end;margin-bottom:6px}
.lpe-empty{text-align:center;color:#888;padding:40px 0;font-size:14px}
.lpe-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--SmartThemeBorderColor,#333);transition:background .15s}
.lpe-item:hover{background:rgba(255,255,255,.05)}
.lpe-item-off{opacity:.4}
.lpe-role{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;flex-shrink:0;text-transform:uppercase;letter-spacing:.5px}
.lpe-role-system{background:rgba(88,166,255,.15);color:#58a6ff}
.lpe-role-user{background:rgba(52,199,89,.15);color:#34c759}
.lpe-role-assistant{background:rgba(255,149,0,.15);color:#ff9500}
.lpe-name{font-size:13px;font-weight:500;flex-shrink:0}
.lpe-preview{font-size:12px;color:#888;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lpe-acts{display:flex;gap:4px;flex-shrink:0;margin-left:auto}
.lpe-acts button{padding:4px 8px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:4px;background:transparent;color:var(--SmartThemeBodyColor,#ccc);cursor:pointer;font-size:13px;min-width:30px;min-height:30px;transition:background .15s}
.lpe-acts button:hover{background:var(--SmartThemeBorderColor,#444)}
.lpe-acts button:disabled{opacity:.3}
.lpe-danger{color:#ff453a!important}
.lpe-danger:hover{background:rgba(255,69,58,.15)!important}
.lpe-acts input[type=checkbox]{width:16px;height:16px;cursor:pointer}
.lpe-edit-body{padding:18px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
.lpe-field{display:flex;flex-direction:column;gap:6px}
.lpe-field label{font-size:13px;font-weight:500;color:var(--SmartThemeBodyColor,#ccc)}
.lpe-eactions{display:flex;gap:8px;justify-content:flex-end;padding-top:4px}
.lpe-tabs{display:flex;gap:0;border-bottom:1px solid var(--SmartThemeBorderColor,#333);flex-shrink:0}
.lpe-tab{flex:1;padding:10px 16px;background:transparent;border:none;color:#888;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;border-bottom:2px solid transparent}
.lpe-tab:hover{color:var(--SmartThemeBodyColor,#ccc);background:rgba(255,255,255,.03)}
.lpe-tab-active{color:#58a6ff;border-bottom-color:#58a6ff}
@media(max-width:600px){
  .lpe-popup{top:0;left:0;right:0;bottom:0;transform:none;width:100vw;max-height:100vh;height:100vh;border-radius:0}
  .lpe-edit-dlg{width:100vw;max-height:100vh;height:100vh;top:0;left:0;right:0;bottom:0;transform:none;border-radius:0}
  @keyframes lpe-in{from{opacity:0}to{opacity:1}}
  .lpe-preview{display:none}
  .lpe-toolbar{padding:8px 12px}
  .lpe-body{padding:10px 12px}
  .lpe-header{padding:12px}
}
  `;
  (doc.head || doc.documentElement).appendChild(s);
}
