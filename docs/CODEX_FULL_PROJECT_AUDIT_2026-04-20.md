# CODEX 全面项目审查文档

日期：2026-04-20  
审查对象：`Lorevnter` 当前工作区源码 + 根目录 `Bug/` 历史问题文档  
审查方式：规则文件核对 + 静态代码审查 + 构建/ lint 验证 + Bug 文档对照复核  
用途：交给 Claude 4.6 Opus 作为后续整改与复核依据

---

## 1. 审查范围

本次审查覆盖以下维度：

- 项目架构与酒馆助手脚本兼容性
- 功能与功能之间的公共逻辑是否闭环
- 潜在 bug 与高风险逻辑分支
- 审核、约束、条目过滤、测试模式、备份、预设、API 配置之间的联动关系
- 移动端适配是否真正完成
- UI 风格是否统一
- 输入框、选择器、弹窗、按钮等基础控件是否统一
- `Bug/` 历史问题是否真的修复

---

## 2. 本次核查依据

### 2.1 规则与宿主边界

- `CLAUDE.md`
- `rules/项目基本概念.mdc`
- `rules/酒馆助手接口.mdc`
- `rules/酒馆变量.mdc`
- `rules/前端界面.mdc`
- `rules/脚本.mdc`

### 2.2 重点核查源码

- `src/Lorevnter/index.ts`
- `src/Lorevnter/settings.ts`
- `src/Lorevnter/core/update-pipeline.ts`
- `src/Lorevnter/core/ai-engine.ts`
- `src/Lorevnter/core/constraints.ts`
- `src/Lorevnter/core/worldbook-context.ts`
- `src/Lorevnter/core/context-extractor.ts`
- `src/Lorevnter/core/backup-manager.ts`
- `src/Lorevnter/core/test-mode.ts`
- `src/Lorevnter/core/review-editor.ts`
- `src/Lorevnter/core/prompt-editor.ts`
- `src/Lorevnter/window/LorevnterWindow.vue`
- `src/Lorevnter/window/components/ContextBar.vue`
- `src/Lorevnter/window/tabs/AiConfigTab.vue`
- `src/Lorevnter/window/tabs/ConstraintsTab.vue`
- `src/Lorevnter/window/tabs/DebugTab.vue`
- `src/Lorevnter/window/tabs/SettingsTab.vue`
- `src/Lorevnter/window/tabs/WorldbooksTab.vue`
- `src/Lorevnter/window/tabs/PresetsTab.vue`
- `src/Lorevnter/styles/lorevnter.scss`

### 2.3 复核的 Bug 文档

- `Bug/CODEX_PROJECT_AUDIT_2026-04-19.md`
- `Bug/DEFERRED_ISSUES.md`

---

## 3. 命令验证结果

### 3.1 lint

执行：`pnpm lint src`

结果：

- 失败
- 当前为 `2` 个 error、`46` 个 warning
- 当前明确仍未清掉的硬错误：
  - `src/Lorevnter/core/review-editor.ts:43`

判断：

- 当前 lint 仍未恢复为可依赖的质量门
- Vue 属性顺序类 warning 很多，说明前端规范执行仍然松散

### 3.2 build

执行：`pnpm build`

结果：

- 在沙箱内会因 `webpack.config.ts` 触发 `spawn` 失败
- 放宽限制后构建成功
- 主包 `Lorevnter.js` 当前约 `412 KiB`
- 仍有 webpack 体积告警

判断：

- 工程当前可构建
- 但包体积继续上升，且调试能力仍被同步打入主包

### 3.3 测试

未发现正式自动化测试文件。

判断：

- 当前质量仍主要依赖手工调试、审核弹窗和 build/lint

---

## 4. 总体结论

当前项目不是“不能用”，而是**主链路基本跑通，但多个子系统之间的身份模型、作用域模型、UI 语言和移动端策略没有统一收口**。

一句话结论：

**Lorevnter 现在最大的风险不是单点功能坏掉，而是“功能各自能跑，但彼此使用的身份、范围、界面语义并不完全一致”。**

这会直接带来三类问题：

1. 用户看到的语义和真实执行目标不完全一致
2. 某些功能看起来已修复，实际上只是修了表层
3. 新功能继续往现有结构上叠时，维护成本会越来越高

---

## 5. 最高优先级发现

### 5.1 现有更新写回仍然按 `entry.name` 定位，存在误写回高风险

相关位置：

- `src/Lorevnter/core/update-pipeline.ts:259`
- `src/Lorevnter/core/update-pipeline.ts:300`
- `src/Lorevnter/core/update-pipeline.ts:304`
- `src/Lorevnter/core/update-pipeline.ts:326`
- `src/Lorevnter/core/update-pipeline.ts:353`
- `src/Lorevnter/core/update-pipeline.ts:430`
- `src/Lorevnter/core/worldbook-api.ts:76`

问题说明：

- `findWorldbookForEntry()` 仍按 `entry.name` 查找目标条目
- 审核写回与直接写回都按 `e.name === update.entryName` 替换内容
- 但底层 API 明明已经有 `updateEntry(name, uid, patch)` 可用

风险：

- 同名条目会撞车
- 跨世界书同名条目会误写回
- 审核看的是一条，实际可能改到另一条

结论：

- 这是当前全项目最危险的逻辑问题
- 它影响审核、直接写回、Bug 排查、用户信任

### 5.2 条目处理范围的 UI 作用域和实际管线作用域不一致

相关位置：

- `src/Lorevnter/window/tabs/AiConfigTab.vue:452`
- `src/Lorevnter/window/tabs/AiConfigTab.vue:455`
- `src/Lorevnter/window/tabs/AiConfigTab.vue:456`
- `src/Lorevnter/core/worldbook-context.ts:115`
- `src/Lorevnter/core/worldbook-context.ts:116`
- `src/Lorevnter/core/worldbook-context.ts:121`
- `src/Lorevnter/core/worldbook-context.ts:126`
- `src/Lorevnter/core/update-pipeline.ts:177`
- `src/Lorevnter/core/update-pipeline.ts:199`
- `src/Lorevnter/core/update-pipeline.ts:201`

问题说明：

- `AiConfigTab` 的条目选择器只允许用户选择“角色卡 primary + additional 世界书”
- 但主管线真正分析的世界书集合来自 `ctx.getActiveWorldbookNames()`
- 这个集合还包含：
  - 聊天绑定世界书
  - 设置里的额外世界书

实际后果：

- `include` 模式下，聊天绑定世界书和额外世界书没有选项可选，结果会被静默排除
- `exclude` 模式下，聊天绑定世界书和额外世界书没有选项可排，结果会被静默保留

结论：

- 这是非常典型的“UI 看起来有控制权，实际控制范围不完整”
- 也正是功能与功能之间公共逻辑不一致的代表问题

### 5.3 局约束虽然加入了 `characterId`，但绑定 UI 的读写仍然没有真正按角色隔离

相关位置：

- `src/Lorevnter/settings.ts:23`
- `src/Lorevnter/settings.ts:28`
- `src/Lorevnter/core/constraints.ts:13`
- `src/Lorevnter/core/constraints.ts:17`
- `src/Lorevnter/core/constraints.ts:197`
- `src/Lorevnter/core/constraints.ts:200`
- `src/Lorevnter/window/tabs/ConstraintsTab.vue:223`
- `src/Lorevnter/window/tabs/ConstraintsTab.vue:260`
- `src/Lorevnter/window/tabs/ConstraintsTab.vue:277`
- `src/Lorevnter/window/tabs/ConstraintsTab.vue:293`
- `src/Lorevnter/window/tabs/ConstraintsTab.vue:307`
- `src/Lorevnter/window/tabs/ConstraintsTab.vue:320`

问题说明：

- `ConstraintBindingSchema` 已加入 `characterId`
- `getEntryConstraints()` 读取时也会按 `characterId` 过滤
- 但 `ConstraintsTab` 里：
  - 计数不看 `characterId`
  - 是否已绑定不看 `characterId`
  - 全选/清空/反选/切换绑定时也不看 `characterId`

这意味着：

- 局约束在 UI 层可能会被误判为“已经绑定”
- 清空或反选可能删除掉其他角色作用域下的局约束绑定
- 写和读用的不是同一套隔离条件

额外风险：

- `getCurrentCharacterId()` 实际取的是 `ctx.context.characterName`，见 `constraints.ts:17`
- 这更像角色显示名，而不是稳定的角色卡唯一标识

结论：

- “局约束已修好”这个说法现在还不成立
- 目前只是数据结构往前走了，但 UI 读写逻辑没有彻底跟上

### 5.4 审核模式 `append / modify` 分类器仍然是高误判实现

相关位置：

- `src/Lorevnter/core/update-pipeline.ts:85`
- `src/Lorevnter/core/update-pipeline.ts:90`
- `src/Lorevnter/core/update-pipeline.ts:94`
- `src/Lorevnter/core/update-pipeline.ts:267`
- `src/Lorevnter/core/review-editor.ts:293`

问题说明：

- 现在分类逻辑仍然是 `trimNew.startsWith(trimOrig)`
- 新内容以原文开头就判追加，否则判修改

影响：

- 段落重排、头部插入、空白压缩、中段替换都可能误判
- 审核弹窗 badge 的语义会出错

结论：

- 这个问题依然没有修
- `Bug/DEFERRED_ISSUES.md` 对它的“暂缓”判断是成立的，但风险级别不能降

### 5.5 测试模式的底层动作类型虽然补了 `append`，但 UI 展示仍把 `append` 误显示为“新增”

相关位置：

- `src/Lorevnter/core/test-mode.ts:28`
- `src/Lorevnter/core/test-mode.ts:148`
- `src/Lorevnter/core/test-mode.ts:203`
- `src/Lorevnter/window/tabs/DebugTab.vue:351`

问题说明：

- `TestActionResult.action` 已经包含 `'append'`
- `test-mode.ts` 记录结果时也会保留 `'append'`
- 但 `DebugTab` 结果列表里仍写的是：
  - `modify` → “修改”
  - 其它全部 → “新增”

结论：

- `Bug` 文档里这项不能算“完全修复”
- 更准确的说法应该是：**类型层修了，调试展示层没修完**

---

## 6. 中高优先级发现

### 6.1 条目过滤模式在角色切换时只重置 mode，不清理 map，存在隐性旧状态

相关位置：

- `src/Lorevnter/index.ts:104`
- `src/Lorevnter/index.ts:133`
- `src/Lorevnter/index.ts:134`
- `src/Lorevnter/settings.ts:189`
- `src/Lorevnter/settings.ts:191`

问题说明：

- 角色切换时会把 `lore_entry_filter_mode` 重置为 `all`
- 但 `lore_entry_filter_map` 仍保留

影响：

- 用户表面上看像是“恢复默认”
- 实际旧选择还在底层挂着
- 当再次切回 `include/exclude` 时，旧配置会突然复活

结论：

- 这属于典型的隐性状态问题

### 6.2 宏渲染链已经前进了一步，但身份层仍停留在旧模型

相关位置：

- `src/Lorevnter/core/ai-engine.ts:224`
- `src/Lorevnter/core/ai-engine.ts:240`
- `src/Lorevnter/core/update-pipeline.ts:259`
- `src/Lorevnter/core/update-pipeline.ts:300`
- `src/Lorevnter/core/update-pipeline.ts:326`

问题说明：

- 世界书正文送入 AI 前现在会经过 `substitudeMacros()`
- 这说明 `{{user}}` / `{{char}}` 进入 AI 的问题确实在往正确方向修
- 但后面的写回定位仍按名字，不按稳定身份

结论：

- 输入层和写回层目前不对称
- 这会让“看起来修好了”的功能继续在下游冒 bug

### 6.3 预设快照继续混入作用域数据，业务边界仍然不清晰

相关位置：

- `src/Lorevnter/settings.ts:52`
- `src/Lorevnter/settings.ts:55`
- `src/Lorevnter/settings.ts:57`
- `src/Lorevnter/settings.ts:65`
- `src/Lorevnter/settings.ts:68`
- `src/Lorevnter/settings.ts:198`
- `src/Lorevnter/settings.ts:210`

问题说明：

- 预设现在不仅存 AI 行为
- 还存：
  - 目标世界书
  - 约束
  - 条目处理范围
  - 约束绑定表

影响：

- preset 越来越像“半套业务状态导出”
- 角色作用域、业务绑定、AI 行为模板混在一起

结论：

- 这会持续拖累后续的局约束、角色隔离和 UI 解释成本

### 6.4 备份导入校验依旧偏弱

相关位置：

- `src/Lorevnter/core/backup-manager.ts:16`
- `src/Lorevnter/core/backup-manager.ts:20`
- `src/Lorevnter/core/backup-manager.ts:78`
- `src/Lorevnter/core/backup-manager.ts:79`
- `src/Lorevnter/core/backup-manager.ts:169`
- `src/Lorevnter/core/backup-manager.ts:180`
- `src/Lorevnter/core/backup-manager.ts:192`

问题说明：

- `entries` 仍然是 `any[]`
- 导入只校顶层结构，不校条目内部 schema
- 差异检测只比较 `name + content`

结论：

- `Bug/DEFERRED_ISSUES.md` 对这项“可延期”的判断成立
- 但当前仍不能说“备份系统已稳”

### 6.5 API Key 的持久化边界依旧没有隔离

相关位置：

- `src/Lorevnter/settings.ts:151`
- `src/Lorevnter/settings.ts:153`
- `src/Lorevnter/settings.ts:238`
- `src/Lorevnter/settings.ts:241`

问题说明：

- 虽然预设导出明确排除了 `lore_api_key`
- 但 `watchEffect` 依旧对整份 `settings` 做 `klona` 后全量写回脚本变量

结论：

- 这项仍属于“未修，只是没爆”

---

## 7. UI 统一性审查结论

### 7.1 当前并没有形成真正统一的基础控件体系

已确认存在的输入系统至少包括：

- 全局 `st-input / st-select / st-textarea / st-number`
- `ConstraintsTab` 自己的一套 `ct-input / ct-select / ct-textarea`
- `PresetsTab` 自己的一套 `preset-input`
- `WorldbooksTab` 自己的一套 `wb-select`
- 条目弹层自己的 `entry-popup-search`
- `prompt-editor.ts` 自己注入的 `lpe-input`
- `review-editor.ts` 的 `contenteditable` 编辑区
- `AiConfigTab.vue:617` 开始的提取预览弹窗行内样式

结论：

- 当前“所有输入框都统一”这个目标还没有达成
- 现在更接近“每个功能自己长一套输入壳子”

### 7.2 风格统一问题不再只是单个按钮，而是系统性问题

关键证据：

- `src/Lorevnter/styles/lorevnter.scss:236`
- `src/Lorevnter/window/tabs/ConstraintsTab.vue:392`
- `src/Lorevnter/window/tabs/PresetsTab.vue:159`
- `src/Lorevnter/core/prompt-editor.ts:527`
- `src/Lorevnter/core/review-editor.ts:131`
- `src/Lorevnter/styles/lorevnter.scss:304`

问题说明：

- 全局主界面走 `--lore-*`
- 多个弹窗和编辑器继续走 `--SmartTheme*`
- 结果是：
  - 主窗口像 Lorevnter 自己的产品
  - 弹窗、搜索框、编辑器又像宿主原生浮层

结论：

- `Bug` 文档里“debug-action-btn 跨组件样式失效”那一个点虽已修
- 但整个 UI 风格一致性问题远没结束

### 7.3 条目选择器与主面板风格仍然割裂

相关位置：

- `src/Lorevnter/styles/lorevnter.scss:297`
- `src/Lorevnter/styles/lorevnter.scss:303`
- `src/Lorevnter/styles/lorevnter.scss:304`
- `src/Lorevnter/styles/lorevnter.scss:318`

问题说明：

- 主窗口是底部 panel 语言
- 但条目弹层仍是居中 modal 语义
- 并且大量依赖 `SmartTheme` 颜色变量

结论：

- 这仍然不是完全统一的交互语言

### 7.4 正式界面、调试界面、原生 DOM 弹窗之间还没有统一风格策略

相关位置：

- `src/Lorevnter/window/tabs/DebugTab.vue`
- `src/Lorevnter/core/review-editor.ts`
- `src/Lorevnter/core/prompt-editor.ts`
- `src/Lorevnter/window/tabs/AiConfigTab.vue:618`

结论：

- 当前存在至少三套 UI 叙事：
  - Vue 主面板风格
  - Debug/工具风格
  - 原生 DOM 注入弹窗风格

---

## 8. 移动端适配审查结论

### 8.1 当前移动端更像“能用”，不是“真正为手机设计”

关键证据：

- `src/Lorevnter/window/LorevnterWindow.vue:191`
- `src/Lorevnter/window/components/ContextBar.vue:92`
- `src/Lorevnter/window/tabs/WorldbooksTab.vue:373`
- `src/Lorevnter/styles/lorevnter.scss:328`

问题说明：

- 很多地方依靠 `overflow-x: auto`
- Tab、标签、chip、工具栏更像“允许横滑”，而不是“重排过”

结论：

- 当前移动端策略更多是容错，不是响应式收口

### 8.2 触控尺寸仍不统一

关键证据：

- `src/Lorevnter/window/components/ContextBar.vue:73`
- `src/Lorevnter/window/components/ContextBar.vue:122`
- `src/Lorevnter/styles/lorevnter.scss:278`
- `src/Lorevnter/styles/lorevnter.scss:322`
- `src/Lorevnter/window/tabs/WorldbooksTab.vue:449`
- `src/Lorevnter/window/tabs/SettingsTab.vue:132`

问题说明：

- 有的地方按 44px 设计
- 有的按钮还是 32px / 36px / 40px

结论：

- 触控目标没有统一
- “任何按钮、任何输入框都统一”的要求目前还没达成

### 8.3 弹窗移动端策略不统一

关键证据：

- `src/Lorevnter/core/review-editor.ts:127`
- `src/Lorevnter/core/review-editor.ts:283`
- `src/Lorevnter/core/prompt-editor.ts:510`
- `src/Lorevnter/core/prompt-editor.ts:557`
- `src/Lorevnter/styles/lorevnter.scss:303`

结论：

- 审核弹窗偏 bottom sheet
- Prompt 编辑器是全屏 modal
- 条目选择器是居中 modal

这说明：

- 移动端弹层没有统一方法论

---

## 9. 功能联动与公共逻辑判断

### 9.1 审核链路

链路：

- AI 输出 → `reviewUpdates` → `openReviewEditor()` → 用户通过后写回

判断：

- 链路是通的
- 但变更类型判定不稳定，且写回定位仍按名字

结论：

- “流程存在”不等于“语义稳定”

### 9.2 条目处理范围链路

链路：

- `AiConfigTab` 配置 → `settings` → `update-pipeline` / `buildAnalysisRequest`

判断：

- 配置确实进了主管线
- 预览和真实执行也共用了一套过滤逻辑

但问题在于：

- UI 只给用户暴露了角色卡世界书
- 主管线实际处理的是更大的 active worldbook 集合

结论：

- 这条链是“技术接通，但业务边界没对齐”

### 9.3 正文提取链路

链路：

- `AiConfigTab` → `settings.lore_context_include_tag / exclude_tags` → `getRecentChatMessages()` → `extractContent()`

相关位置：

- `src/Lorevnter/core/update-pipeline.ts:409`
- `src/Lorevnter/core/update-pipeline.ts:418`
- `src/Lorevnter/core/context-extractor.ts:19`

判断：

- 这条链当前是接通的
- “规则完全无效”已不符合当前代码现状

但仍有潜在问题：

- 算法依赖消息里真的存在成对标签
- 未命中包含标签时直接返回空字符串

结论：

- 现在更像“算法匹配问题”，而不是“配置没传进去”

### 9.4 约束链路

链路：

- `ConstraintsTab` 绑定 → `settings.lore_constraint_bindings` → `getEntryConstraints()` → AI 构造 prompt / pipeline skip

判断：

- 新绑定表已经进入实际运行链路
- 但 UI 读写与运行读取没有完全使用相同隔离条件

结论：

- 这是“半重构进行中”状态

### 9.5 测试模式链路

链路：

- `test-mode.ts` 构造假数据 → `review-editor` → 世界书写回 → 回档

判断：

- 主链路是通的
- 类型层也保留了 `append`

但问题：

- `DebugTab` 结果展示层仍把 append 归并错了

结论：

- 这条链目前是“执行正确，观测不完全正确”

---

## 10. Bug 文件夹复核结论

当前 `Bug/` 文档提到的问题，按当前源码复核如下：

| 编号 | 问题 | 当前状态 | 复核结论 |
|---|---|---|---|
| #1 | `append/modify` 误判 | 未修 | 仍然使用 `startsWith()`，高优先级继续成立 |
| #2 | `debug-action-btn` 跨组件样式失效 | 已修一部分 | 具体按钮复用问题已修到全局 `scss`，但 UI 统一性问题没有根治 |
| #3 | `PipelineResult` 返回 `undefined` | 已修 | 当前 `worldbookNames.length === 0` 已返回 `'failed'` |
| #4 | `worldbook-context ↔ update-pipeline` 循环依赖 | 已修 | 当前 `worldbook-context.ts` 已改为依赖 `scan-cache.getCurrentCacheChatId()` |
| #5 | API Key 持久化边界不一致 | 未修 | 仍是全量 settings 写回脚本变量 |
| #6 | 备份 entries 校验偏弱 | 未修 | `entries: any[]` 仍在，导入仍只校顶层 |
| #7 | 移动端响应式布局 | 未修 | 当前仍主要靠横向滚动兜底 |
| #8 | `TestActionResult.action` 丢失 `append` 语义 | 部分修复 | 类型和数据记录已修，但 `DebugTab.vue:351` 展示仍把 append 显示成“新增” |
| #9 | 包体积偏大 | 未修 | 当前主包反而上升到约 `412 KiB` |
| #10 | DOM + innerHTML 使用过多 | 未修 | `review-editor` / `prompt-editor` 仍是主要形态 |
| #11 | 深拷贝全量写回 | 未修 | `settings.ts:238-242` 仍然整体 `klona + insertOrAssignVariables` |
| #12 | 无自动化测试 | 未修 | 当前仍未建立正式测试基础设施 |

总结：

- 真正彻底修完的主要是 #3、#4
- #2 是“局部修复，系统问题仍在”
- #8 只能算“部分修复”
- 其余延期项整体仍然都在

---

## 11. 对后续整改的优先级建议

### 第一优先级：必须先收口的公共逻辑

1. 写回定位从 `entry.name` 收口到稳定身份
2. 条目处理范围 UI 与主管线作用域统一
3. 局约束绑定的 UI 读写条件与运行时条件统一
4. 审核分类器误判问题保持高优，不要降级

### 第二优先级：影响用户感知的一致性问题

1. 输入框、选择器、按钮、弹窗统一到一套公共控件语言
2. 条目选择器、提取预览、Prompt 编辑器、审核弹窗统一弹层策略
3. `DebugTab` 和正式界面减少风格割裂

### 第三优先级：结构性技术债

1. 备份 schema 校验
2. API Key 分层持久化
3. 构建拆包
4. 自动化测试

---

## 12. 最终判断

如果只问“功能是不是都坏了”，答案是否定的。  
如果问“功能与功能之间的公共逻辑是不是已经稳定”，答案是**还没有**。  

目前最需要 Claude 理解的不是某个单一 bug，而是下面这件事：

**Lorevnter 现在的主要问题是：每个功能局部都在往前走，但它们还没有完全共享同一套身份模型、作用域模型和界面语言。**

这也是为什么：

- 看起来修过的功能，仍然会在别的层重新露出问题
- 单独改 UI 没法真正解决逻辑混乱
- 单独改逻辑，也会被不一致的界面语义重新放大

因此，后续 Claude 的最佳工作方式不是“零碎修补”，而是围绕以下四个核心收口：

- 条目标识
- 局部 / 全局作用域
- 条目过滤与约束的公共逻辑
- UI / 输入控件 / 弹层的统一设计语言

