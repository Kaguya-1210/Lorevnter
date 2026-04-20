// ============================================================
// Lorevnter - 提示词编辑器
// 核心要点：脚本运行在 iframe 中，DOM 必须挂载到主窗口（window.parent）
// ============================================================

import { useSettingsStore, type PromptItem, type PromptPreset } from '../settings';

const POPUP_ID = 'lorevnter-prompt-editor';

// ── 内置 default 预设 ──

/** 更新阶段（一次调用 / twopass 第2次调用） */
export const BUILTIN_UPDATE_PRESET: PromptItem[] = [
  // ── 顶部：强注意力区 → 角色定义 + 约束规则 ──
  {
    id: 'builtin_update_sys',
    role: 'system',
    name: '系统指令 + 约束',
    enabled: true,
    content: `<role>你是 Lorevnter 世界书条目更新引擎。你的职责是让世界书条目始终与剧情发展同步，保持信息精确、具体、完整。</role>

<constraints>
{{lore_constraints}}
</constraints>

<constraint_priority>
{{lore_constraint_policy}}
</constraint_priority>

<update_strategy>
你需要在以下情况更新条目：
1. 对话中出现了与条目内容矛盾的新事实
2. 对话中出现了条目未记录的新信息（新事件、新关系、状态变化等）
3. 条目中存在模糊/笼统的描述，而你能从对话或其他条目中找到具体信息来替换
   例：条目写"成员极少" → 交叉比对其他条目和对话，找到具体成员名单直接填入
4. 条目附带约束时，严格按约束规则执行
5. 涉及用户相关的条目（如与用户的关系、对用户的态度、共同经历等），需结合 <user_persona> 中的信息进行更新

你不应该更新的情况：
- 对话完全没有涉及该条目相关的内容
- 变化仅是措辞不同但含义相同
</update_strategy>

<output_rules>
<rule priority="critical">newContent 是完整替换内容，保留所有未变化的原有信息，不得丢失</rule>
<rule priority="critical">保留条目原有的格式和写作风格</rule>
<rule priority="critical">约束优先级高于一切默认策略</rule>
<rule priority="critical">思考结束后输出纯 JSON，不加额外文字</rule>
</output_rules>`,
  },
  // ── 中部：弱注意力区 → 数据块 ──
  {
    id: 'builtin_update_persona',
    role: 'user',
    name: '用户人设',
    enabled: true,
    content: `<user_persona>
{{lore_user_persona}}
</user_persona>`,
  },
  {
    id: 'builtin_update_entries',
    role: 'user',
    name: '条目数据',
    enabled: true,
    content: `<worldbook_entries count="{{lore_entry_count}}">
{{lore_entries}}
</worldbook_entries>`,
  },
  {
    id: 'builtin_update_ctx',
    role: 'user',
    name: '上下文正文',
    enabled: true,
    content: `<chat_context recent="{{lore_max_context}}">
{{lore_context}}
</chat_context>`,
  },
  // ── 底部：极强注意力区 → CoT 思考指令 + 输出格式 ──
  {
    id: 'builtin_update_task',
    role: 'user',
    name: 'CoT 思考指令',
    enabled: true,
    content: `<task>
分析对话和条目数据，判断哪些条目需要更新。

先在 <lore_think> 中思考，每条认真分析不许偷懒，想多少写多少！

<lore_think>
对每个条目自由分析，重点关注：
- 这个条目记录了什么？和最新剧情（<latest_context>）有关系吗？
- 对话中有没有新信息要补进去？有没有和现有内容矛盾的地方？
- 条目里有没有模糊的说法？（如"极少""一些""可能"等）能不能从对话或其他条目里找到具体信息替换掉？
- 这个条目和用户人设有关系吗？人设里提到了什么相关信息？
- 有约束吗？约束怎么说的？
- 要不要改？要改的话，改哪里？

最后分析用户人设本身：
- 对话中是否出现了与人设矛盾的信息？
- 是否有新的事实需要更新到人设中？
- 人设需要修改吗？
</lore_think>

想完了直接出 JSON。
</task>

<output_format>
{
  "updates": [
    {
      "entryName": "条目名（必须与输入完全匹配）",
      "entryUid": 条目uid数字（从entry标签的uid属性获取）,
      "newContent": "完整的新内容（保留未变化的部分）",
      "reason": "一句话理由"
    },
    {
      "entryName": "__persona__",
      "entryUid": -1,
      "newContent": "更新后的完整人设内容",
      "reason": "人设更新理由"
    }
  ]
}
没有要改的就返回：{"updates": []}
注意：更新用户人设时 entryName 必须为 "__persona__"，entryUid 为 -1
</output_format>

<final_reminder>
1. 逐条分析，不跳过
2. 模糊词必须精确化：交叉比对条目和对话找具体信息
3. 约束规则最优先
4. 用户人设也是分析目标，如有变化请用 entryName="__persona__" 输出
5. 思考完直接输出 JSON
</final_reminder>`,
  },
  {
    id: 'builtin_update_ast',
    role: 'assistant',
    name: 'CoT 锚定',
    enabled: true,
    content: `<lore_think>
我将逐条分析每个条目：

`,
  },
];


/** 构造 default 虚拟预设对象 */
function makeDefaultPreset(): PromptPreset {
  return {
    name: 'default',
    description: '内置默认预设',
    createdAt: '',
    update_items: JSON.parse(JSON.stringify(BUILTIN_UPDATE_PRESET)),
    triage_items: [],
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

  // 脏检查快照（用于关闭时判断是否有未保存修改）
  let snapshotUpdate = '';
  function takeSnapshot() {
    snapshotUpdate = JSON.stringify(workUpdate);
  }
  function isDirty(): boolean {
    return JSON.stringify(workUpdate) !== snapshotUpdate;
  }

  function loadPreset(name: string) {
    currentPresetName = name;
    settings.lore_active_prompt_preset = name;

    if (name === 'default') {
      workUpdate = JSON.parse(JSON.stringify(BUILTIN_UPDATE_PRESET));
    } else {
      const found = settings.lore_prompt_presets.find(p => p.name === name);
      if (found) {
        workUpdate = JSON.parse(JSON.stringify(found.update_items));
      } else {
        // 找不到 → 回退 default
        workUpdate = JSON.parse(JSON.stringify(BUILTIN_UPDATE_PRESET));
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

  // Tab 切换（当前只有 update）

  function getActiveList(): PromptItem[] {
    return workUpdate;
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
          triage_items: [],
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
        triage_items: [],
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
.lpe-bg{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.5);z-index:100010}
.lpe-popup,.lpe-edit-dlg{position:fixed;z-index:100011;background:var(--SmartThemeBlurTintColor,#1e1e2e);border:1px solid var(--SmartThemeBorderColor,#333);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;color:var(--SmartThemeBodyColor,#ccc);animation:lpe-in .2s ease-out}
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
