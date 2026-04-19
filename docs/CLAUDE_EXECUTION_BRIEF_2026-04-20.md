# Claude 执行与全面审查总方案

日期：2026-04-20  
用途：交给 Claude 4.6 Opus 作为本项目的唯一主方案输入  
定位：本文件同时承担三件事

- 架构摸底
- 全面自查
- 后续执行边界与实施方向

目标：在不破坏酒馆助手脚本兼容性的前提下，对 Lorevnter 当前项目做一次真正“收口式”的审查与实施规划，让 Claude 后续不是零碎修补，而是在理解架构、作用域、数据流、UI 一致性和人性化交互之后再动手。

---

## 1. 本次方案的依据

这份方案不是只看几个 Vue 文件写出来的，而是基于以下几类信息综合判断。

### 1.1 宿主与规则文件

- [CLAUDE.md](</F:/Project/Insvnter/Lorevnter/CLAUDE.md>)
- [rules/项目基本概念.mdc](</F:/Project/Insvnter/Lorevnter/rules/项目基本概念.mdc>)
- [rules/酒馆助手接口.mdc](</F:/Project/Insvnter/Lorevnter/rules/酒馆助手接口.mdc>)
- [rules/酒馆变量.mdc](</F:/Project/Insvnter/Lorevnter/rules/酒馆变量.mdc>)
- [rules/前端界面.mdc](</F:/Project/Insvnter/Lorevnter/rules/前端界面.mdc>)
- [rules/脚本.mdc](</F:/Project/Insvnter/Lorevnter/rules/脚本.mdc>)

### 1.2 核心代码链路

- [src/Lorevnter/index.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/index.ts>)
- [src/Lorevnter/settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts>)
- [src/Lorevnter/state.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/state.ts>)
- [src/Lorevnter/core/worldbook-context.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/worldbook-context.ts>)
- [src/Lorevnter/core/update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts>)
- [src/Lorevnter/core/ai-engine.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/ai-engine.ts>)
- [src/Lorevnter/core/constraints.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/constraints.ts>)
- [src/Lorevnter/core/backup-manager.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/backup-manager.ts>)

### 1.3 主要 UI 结构

- [src/Lorevnter/window/LorevnterWindow.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/LorevnterWindow.vue>)
- [src/Lorevnter/window/components/ContextBar.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/components/ContextBar.vue>)
- [src/Lorevnter/window/tabs/AiConfigTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/AiConfigTab.vue>)
- [src/Lorevnter/window/tabs/ConstraintsTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/ConstraintsTab.vue>)
- [src/Lorevnter/window/tabs/SettingsTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/SettingsTab.vue>)
- [src/Lorevnter/window/tabs/WorldbooksTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/WorldbooksTab.vue>)
- [src/Lorevnter/window/tabs/PresetsTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/PresetsTab.vue>)
- [src/Lorevnter/styles/lorevnter.scss](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/styles/lorevnter.scss>)

### 1.4 工程检查结果

- `pnpm build`：通过，但产物 `Lorevnter.js` 约 `404 KiB`，已触发 webpack performance warning
- `pnpm lint`：失败，报出 `1801` 个问题，当前 lint 噪声极高，已经不能充当可靠质量门

---

## 2. 已确认的项目架构事实

Lorevnter 当前不是普通单页应用，而是一个运行在酒馆助手宿主环境中的脚本项目。

其真实运行方式是：

1. [index.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/index.ts>) 在脚本环境中启动
2. 通过 `createScriptIdDiv()` 把 Vue 应用挂到宿主页面 `body`
3. 通过 `teleportStyle()` 把样式传送到宿主页面
4. 设置数据主要存于脚本变量
5. 运行期临时状态由 Pinia store 管理
6. 备份数据主要存于 `localStorage`
7. 世界书上下文由 [worldbook-context.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/worldbook-context.ts>) 动态探测
8. 主执行链路由 [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts>) 串联：
   - 读取上下文
   - 读取世界书
   - 做 skip / cache / entry filter
   - 收集聊天上下文
   - 调用 AI
   - 进入审核或直接写回

结论很明确：

- 这个项目已经有完整骨架，不是从零设计
- 后续所有方案都必须以“兼容酒馆助手宿主脚本模型”为前提
- 任何看似漂亮、但会破坏宿主边界的重构，都不算最优解

---

## 3. 当前产品定位的正确收口

Lorevnter 当前最清晰、最有价值的定位应该收口为：

**根据剧情上下文与酒馆命中信息，决定哪些世界书条目需要参与 AI 分析与更新。**

这意味着产品优先级应当是：

- 条目是否参与分析
- 条目是否允许被更新
- 审核流程是否准确、可解释、可控
- UI 是否让用户快速理解“这次会动哪些条目”

而不应继续优先扩张：

- 世界书编辑器倾向的扩展能力
- 要求用户理解过多中间概念的配置
- 与主线关系弱、维护成本高的附属系统心智

这也是后文所有判断的总前提。

---

## 4. 已确认的关键数据与功能现状

### 4.1 设置与预设的当前形态

核心定义在 [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts>)。

当前已确认：

- `lore_constraints` 是脚本级设置
- `lore_prompt_presets` 是脚本级数据
- `lore_target_worldbooks` 也是脚本级额外世界书列表
- 当前“预设”与“约束”默认都不是按角色卡隔离

这意味着：

- “角色卡默认世界书”不适合被做成 preset 概念
- 每张角色卡自己的默认世界书，应来自当前上下文动态探测，而不是用户再手动保存一份角色卡预设

### 4.2 当前活跃世界书的来源

当前活跃世界书由 [worldbook-context.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/worldbook-context.ts>) 动态汇总，来源包括：

- 角色卡主世界书
- 角色卡附加世界书
- 聊天绑定世界书
- 设置中手动添加的额外世界书 `lore_target_worldbooks`

结论：

- “角色卡默认世界书”现在已经有动态来源
- 不应该再做成新的 preset
- 真正该补的是 UI 表述与作用域边界，而不是再加一个新的概念层

### 4.3 当前提示词结构

当前提示词不是单段字符串，而是“多条 role prompt 顺序拼接”的结构，相关文件：

- [src/Lorevnter/core/prompt-editor.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/prompt-editor.ts>)
- [src/Lorevnter/core/ai-engine.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/ai-engine.ts>)

当前默认结构大致是：

1. `system`：总规则、步骤、JSON 输出格式
2. `user`：世界书条目块
3. `user`：聊天上下文块
4. `user`：执行指令块
5. `assistant`：`{"updates": [` 这种 prefill 锚定

结论：

- 当前不是“一个总 prompt 字符串”
- 而是“可编辑的多段 prompt 流”
- 真正该改的是数据注入结构，不是把整个提示词编辑器推倒

### 4.4 当前约束系统的真实状态

约束核心在 [constraints.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/constraints.ts>)。

当前现状：

- 约束定义存于 `settings.lore_constraints`
- 历史绑定关系写在 `entry.extra.lore_constraint_id`
- `bindConstraintToEntries()` 已具备“一条约束绑定多个条目”的半成品能力

但仍存在两个结构限制：

1. 约束绑定依然依附在世界书条目 `extra` 中
2. 单个条目当前只有一个 `lore_constraint_id`

这意味着：

- “一条约束绑多个条目”已经部分成立
- 但“局约束 / 全局约束”还没有真正边界
- 如果继续把作用域写死在 `entry.extra`，局约束会污染共享世界书

### 4.5 当前宏处理并没有完整覆盖条目正文

已确认：

- `resolveMacros()` 会处理模板字符串和约束字符串中的宏
- 但历史上 `formatWorldbookEntries()` 会直接把 `ae.entry.content` 原样塞进 prompt
- 这正是 `{{user}}`、`{{char}}` 进入 AI 的根源

结论：

- Lorevnter 需要“分析视图层”
- 不是改世界书本体
- 而是只在送入 AI 前渲染一份分析用文本

---

## 5. 全面自查结论：高优先级问题

### 5.1 条目标识仍主要靠 `entry.name`，存在误写回风险

相关位置：

- [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts:178>)
- [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts:241>)
- [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts:281>)
- [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts:332>)
- [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts:402>)

问题表现：

- 命中过滤按名字判断
- 审核前查找原条目按名字判断
- 最终写回也按名字替换

风险：

- 不同世界书的同名条目会撞车
- 同一本世界书内存在历史重名条目也可能撞车
- AI 返回的更新可能写到错误条目
- 极端情况下会出现多条同名内容被错误覆盖

这不是 UI 小问题，而是身份模型问题。

### 5.2 约束系统处于“半迁移”危险状态

相关位置：

- [constraints.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/constraints.ts:166>)
- [constraints.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/constraints.ts:174>)
- [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts:172>)
- [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts:468>)
- [ai-engine.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/ai-engine.ts:219>)

已确认现状：

- 新的 `lore_constraint_bindings` 已加入 settings
- 新的 `getEntryConstraints(entry, worldbookName)` 已能从绑定表取值
- 但主管线很多地方仍调用旧的 `getEntryConstraint(entry)`

后果：

- UI 看起来已支持新绑定模型
- 但主管线、skip 过滤、旧兼容路径并没有完全切过去
- 最终形成“UI 显示成功，运行时却未必按这个绑定执行”的断层

这是一种典型的半迁移风险，比纯旧实现更危险。

### 5.3 “局约束”当前并不真正成立

相关位置：

- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:10>)
- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:22>)
- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:50>)
- [constraints.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/constraints.ts:179>)

问题本质：

- `scope: local` 已存在
- 但绑定表只存了 `constraintId + worldbook + entryUid`
- 没有角色卡 ID、聊天 ID、角色作用域字段

所以现在所谓“局约束”只是名字叫 local，本质仍可能跨角色卡串味。

风险：

- 多张角色卡复用同一本世界书时会串规则
- preset 快照又会把这些绑定一起带走，进一步放大污染

这属于结构级逻辑 bug。

### 5.4 条目处理范围与作用域模型仍然冲突

相关位置：

- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:85>)
- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:183>)
- [index.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/index.ts:116>)

问题表现：

- 条目处理范围配置存于脚本全局 settings
- 切换聊天时又强制把 `lore_entry_filter_mode` 重置为 `all`
- 同时没有同步清掉 `lore_entry_filter_map`

这会导致：

- 用户以为配置还在
- 实际模式已经静默失效
- 留下不透明的历史状态

这不是单纯“默认友好”，而是状态模型和产品心智不一致。

---

## 6. 逻辑链路问题

### 6.1 宏渲染只修到了输入层，没闭环到身份层

相关位置：

- [ai-engine.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/ai-engine.ts:208>)
- [ai-engine.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/ai-engine.ts:222>)

已确认现状：

- 世界书正文在分析前会经过 `substitudeMacros()`
- 这能修掉 `{{user}} / {{char}}` 直接进入 AI 的问题

但当前仍不完整：

- 输入正文已经变成“分析视图”
- 写回目标却仍按名字识别

也就是说：

- 输入层已经开始升级
- 身份层还停留在旧模型

这是一种结构不对称，后续很容易继续冒出边界 bug。

### 6.2 preset 快照边界仍然混乱

相关位置：

- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:49>)
- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:192>)

当前 preset 已经不只快照 AI 行为，还把这些也纳入了：

- 目标世界书
- 约束列表
- 条目处理范围
- 约束绑定表

问题在于：

- 这些并不都是纯“AI 行为配置”
- 有些已经触及角色作用域与世界书绑定边界

结果：

- preset 既像“行为配置模板”
- 又像“半套业务状态导出”

这会让后续迁移与用户理解越来越困难。

### 6.3 备份系统校验仍然偏弱

相关位置：

- [backup-manager.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/backup-manager.ts>)

当前问题：

- `entries: any[]`
- 导入校验只校外层，不校条目结构
- 差异比较只对 `name + content` 做 hash

影响：

- 非法备份不一定会被正确拦截
- 丢字段、错字段、结构漂移未必能识别
- 恢复结果可能逻辑上不完整

这不是最急的爆炸点，但属于明显稳定性债务。

### 6.4 API Key 持久化仍偏弱

相关位置：

- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:143>)
- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:147>)
- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:204>)
- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts:221>)

当前现状：

- `lore_api_key` 仍以明文形式落在脚本变量存储体系中
- 虽然 snapshot/export 对敏感字段已有一定回避
- 但“敏感层”和“普通配置层”仍未彻底拆开

这在本地脚本环境里不算最高风险，但属于明确的安全与配置边界债务。

---

## 7. UI 一致性、人性化与移动端问题

### 7.1 条目选择弹层的视觉语义仍不统一

相关位置：

- [AiConfigTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/AiConfigTab.vue:211>)
- [lorevnter.scss](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/styles/lorevnter.scss:294>)

问题：

- 主窗口整体是 iOS 风格 bottom panel
- 审核弹层也是底部上滑 panel 倾向
- 但条目选择器是居中 modal

结果：

- 同一产品内弹层语言不统一
- 手机端视觉割裂
- 像“临时补出来的工具弹窗”，不像插件内部一致组件

### 7.2 设计 token 体系混用

相关位置：

- [lorevnter.scss](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/styles/lorevnter.scss:5>)
- [lorevnter.scss](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/styles/lorevnter.scss:301>)

当前存在两套并行来源：

- 自己定义的 `--lore-*`
- 宿主依赖型的 `--SmartTheme*`

结果：

- 一部分面板更像 Lorevnter 本体
- 一部分弹层又明显偏宿主 SmartTheme
- 色彩、边框、层级与玻璃感不一致

这正是“有些地方像产品本体，有些地方像外挂补丁”的来源。

### 7.3 设置页仍把“额外世界书”暴露成主入口

相关位置：

- [SettingsTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/SettingsTab.vue:34>)

问题：

- 产品主流程正在向“默认服务角色卡内置世界书”收敛
- 但设置页仍完整暴露“额外世界书”作为主配置块

这会造成用户心智冲突：

- 一边告诉用户可以先不用理解额外世界书
- 一边又在设置页把它当核心入口展示

对普通用户来说，这就是不够人性化。

### 7.4 Debug 模式切页过于打断

相关位置：

- [LorevnterWindow.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/LorevnterWindow.vue:83>)

当前逻辑：

- 开启 debug mode 直接跳到调试页
- 关闭 debug mode 若仍在调试页，又切回设置页

问题：

- 用户只是在开关一个模式
- 界面却替用户做了跳转决定

这更像开发者工具，而不是用户产品。

### 7.5 Worldbooks 页承担职责过多

相关位置：

- [WorldbooksTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/WorldbooksTab.vue:2>)

当前这个页同时承担：

- 刷新世界书
- AI 分析入口
- 备份管理
- 激活状态展示
- 世界书浏览

结果：

- 页面信息密度高
- 心智偏后台控制台
- 用户很难一眼理解“我来这里是做什么的”

### 7.6 触控尺寸仍有明显不到位处

相关位置：

- [ContextBar.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/components/ContextBar.vue:14>)
- [ContextBar.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/components/ContextBar.vue:69>)
- [lorevnter.scss](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/styles/lorevnter.scss:316>)
- [SettingsTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/SettingsTab.vue:127>)

问题举例：

- `ContextBar` 外层 `min-height: 40px`
- 刷新按钮最小 32px
- 条目弹层关闭按钮最小 36px
- 世界书删除按钮最小 32px

而项目别处又明显已经朝 44px 触控区靠拢。

这说明：

- 移动端适配没有贯彻到底
- 某些区域只是“能点”，不是“好点”

### 7.7 条目弹层在手机端仍更像桌面 modal

相关位置：

- [lorevnter.scss](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/styles/lorevnter.scss:295>)

现状：

- 居中
- 固定最大高 `80vh`
- 没有明显 bottom sheet 语义
- safe area 优化不明确

在手机端的结果是：

- 与主界面风格割裂
- 顶部关闭与列表滚动操作成本偏高

### 7.8 页面信息密度仍偏桌面思路

尤其明显的区域：

- [WorldbooksTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/WorldbooksTab.vue:21>)
- [PresetsTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/PresetsTab.vue>)
- [AiConfigTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/AiConfigTab.vue>)

现状：

- 工具栏按钮多
- 配置块多
- 缺少“默认折叠次要内容”的分级策略

所以移动端适配不是单纯加几个 `@media` 就能解决，而是还存在信息优先级设计问题。

---

## 8. 宿主兼容性检查结论

### 8.1 做对了的地方

根据 [rules/脚本.mdc](</F:/Project/Insvnter/Lorevnter/rules/脚本.mdc>)，当前项目有几件事是做对的：

- 确实用脚本方式挂载 Vue 到宿主页面
- 确实使用了 `teleportStyle()` 处理样式
- 没有误走 iframe 独立应用路线
- 大部分设置也确实走脚本变量体系

这说明项目**基本理解了酒馆助手宿主脚本边界**。

### 8.2 仍存在的偏差

但仍有几个问题：

- UI 层越来越多手工 DOM 弹层和风格混搭
- “局约束”没有真正落在角色隔离作用域
- 产品正在做“产品化”，数据层却还保留“全局脚本工具化”惯性

也就是说：

- 宿主兼容性方向理解到了
- 产品层作用域设计与数据边界还没完全跟上

---

## 9. 工程质量问题

### 9.1 build 能过，但 bundle 已偏大

已确认：

- `pnpm build` 通过
- `Lorevnter.js` 约 `404 KiB`

这不是当前最高优先级 bug，但已经是浮出水面的工程债。

### 9.2 lint 已失去质量门意义

已确认：

- `pnpm lint` 失败
- 报出 `1801` 个问题

问题不只是 warning 多，而是：

- 大量示例或历史脚本噪声把真实问题淹没了
- 当前 lint 已无法帮助主工程稳定防回归

---

## 10. 本轮需求的准确翻译

### 10.1 关于角色卡默认世界书

用户真实意图不是“给每张角色卡做一个手动 preset”，而是：

- 每张角色卡天然有不同的默认世界书集合
- 系统应自动识别并默认使用
- 来源应来自当前上下文，而不是再让用户配置一次

正确结论：

- 不要把角色卡默认世界书做成 preset
- 继续使用当前上下文动态探测
- 只在作用域与 UI 表达层把这件事讲清楚

### 10.2 关于条目处理范围

用户真实要的不是技术型筛选器，而是：

- 默认就能处理当前角色卡内置世界书
- 如果要精细控制，再用一个足够顺手的方式选择条目
- 必须支持多选、全选、反选、清空、搜索
- 必须足够人性化，而不是让用户先理解一堆概念

### 10.3 关于约束

用户表达虽然口语化，但核心需求很清楚：

- 一条约束要能绑定多个世界书条目
- 约束本质上更接近“弹性提示词规则”
- 需要区分局约束与全局约束
- 不应该继续用旧的“每条目一行内联提示”方式粗暴堆叠

---

## 11. 本轮最优执行方向

### 11.1 世界书宏处理的最优方案

问题本质不是“酒馆宏不会替换”，而是：

- Lorevnter 没有在“条目正文送入 AI 分析前”做宏展开

最优做法：

- 新增“条目分析视图层”
- 世界书原始文本保持不变
- 仅在送入 AI 前生成渲染后的分析文本
- AI 看见渲染结果
- 写回仍基于世界书原条目，不把展开结果反写回去

实现原则：

1. 优先复用酒馆助手现有宏替换能力
2. 先解决 `{{user}}`、`{{char}}` 这类真实 bug
3. 不顺手扩张成完整递归宏引擎

### 11.2 条目处理范围的最优产品方案

建议功能名：

- **条目处理范围**

不要命名为：

- 条目约束
- 条目宏规则
- 缓存筛选

功能目标：

- 明确控制哪些已有条目参与 AI 分析与更新

模式：

- `all`：处理全部候选条目
- `include`：仅处理选中条目
- `exclude`：排除选中条目

第一版边界：

- 只处理已有条目
- 不碰“是否允许新增条目”的判断

默认行为：

- 如果用户没配任何过滤规则，默认处理当前角色卡内置世界书中的全部条目
- 用户不需要先手动选世界书
- 用户不需要先理解“额外世界书”概念

### 11.3 条目处理范围的最优 UI 方案

建议放在：

- **AI 配置 Tab**

不要放在约束页，因为那会进一步混淆概念。

最优交互形态：

- 在 AI 配置页展示模式与摘要
- 点击“选择条目”后打开底部弹层 / Bottom Sheet

弹层内建议包含：

- 当前模式提示
- 当前作用世界书摘要
- 搜索
- 全选
- 清空
- 反选
- 已选数量摘要
- 大点击区域条目列表

如果当前角色卡有多本内置世界书：

- 默认先打开主世界书
- 顶部用轻量 tab 或 chip 切换
- 不要让用户先做世界书选择题，再进入下一层

### 11.4 额外世界书的当前策略

关于“额外世界书”：

- 底层能力先保留
- 本轮不作为条目处理范围的主流程入口开放给普通用户
- 设置页或主流程应弱化、隐藏或封印其显式入口

推荐占位文案：

- **额外世界书：功能暂时封印，未来再开**

### 11.5 缓存、宏、旧系统的策略

条目缓存：

- 不建议立刻删除底层缓存机制
- 可以逐步弱化“缓存管理”作为用户心智的显式入口

约束系统：

- 当前不要整套删除
- 但不要再把新需求粗暴塞进旧约束语义

条目宏：

- 不建议继续扩张为更复杂的编辑器式系统
- 本轮只修正“正文进入 AI 前的宏渲染问题”

---

## 12. 约束系统的最优重构方向

这轮不要再把“约束”当成混合概念，建议明确拆成三层。

### A. 约束定义

描述“规则本身是什么”，例如：

- 名称
- 说明文本
- 类型
- 作用域：`local` / `global`
- 启用状态

### B. 约束绑定

描述“这个规则作用于哪些条目”，例如：

- 约束 ID
- 世界书名
- 条目 UID
- 来源世界书类型

### C. 提示词注入

描述“这些规则最后怎么送进 AI”。

结论：

- 不要再让 UI 绑定逻辑直接等于 prompt 拼接逻辑

### 12.1 局约束与全局约束的推荐语义

全局约束适合：

- 跨世界书复用
- 通用业务规则
- 不依赖单一角色剧情阶段

局约束适合：

- 只在当前角色卡 / 当前作用域内成立
- 只对当前角色剧情有效
- 不应影响其他角色卡或共享世界书

### 12.2 关键结论

- 局约束不能继续默认写进世界书条目 `extra`
- 局约束必须拥有真实的角色隔离作用域
- 绑定表应独立于世界书条目本体

---

## 13. 提示词结构的最优调整方向

这里的结论不是“重写 prompt editor”，而是：

- **保留外层 prompt preset 容器**
- **重构内层数据注入结构**

### 13.1 当前问题

现在约束是以内联文本塞进条目块，类似：

- 条目 A
- 当前内容: ...
- 约束: ...

当变成：

- 一条约束作用多个条目
- 局约束与全局约束并存

就会出现：

1. 同一句约束文本被重复塞很多次
2. AI 很难看出哪些条目共享同一规则
3. 提示词越来越像糊出来的长文本，而不是结构化输入

### 13.2 最优三块式结构

#### 第一块：条目数据块

只描述：

- 条目名
- 当前内容
- 所属世界书
- 关联约束 ID 列表

概念示例：

```text
- 条目: 角色A
  世界书: 角色设定
  约束: [G1, L2]
  当前内容: ...
```

#### 第二块：约束定义块

单独列出本轮真正命中的约束：

```text
[G1][全局] 括号内内容必须满足条件后才可删除
[L2][局部] 失忆阶段未结束前，不要删除早期记忆片段
```

#### 第三块：执行规则块

明确告诉 AI：

- 输出格式必须遵守 JSON 结构
- 局约束优先于全局约束
- 全局约束优先于默认更新策略

### 13.3 推荐新增的 Lore 宏

为了兼容当前 prompt editor，建议新增：

- `{{lore_entries}}`
- `{{lore_constraints}}`
- `{{lore_constraint_policy}}`

同时保留兼容：

- `{{lore_worldbook}}`
- `{{lore_context}}`

最佳兼容策略：

- 新内置默认 prompt 逐步改用新宏
- 旧宏继续兼容
- 老用户自定义 preset 不强制迁移

---

## 14. 建议影响的模块范围

### 设置层

- [settings.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/settings.ts>)

需要处理：

- 条目处理范围 schema
- 约束新结构是否扩展
- 默认值
- 预设导入导出边界
- 旧配置兼容

### 分析管线

- [update-pipeline.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/update-pipeline.ts>)

需要处理：

- `runUpdatePipeline()` 中候选条目过滤
- 预览链路与真实执行链路统一使用同一套过滤逻辑
- 条目正文进入 AI 前的宏渲染层

### AI 引擎与 prompt 注入

- [ai-engine.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/ai-engine.ts>)
- [prompt-editor.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/prompt-editor.ts>)

需要处理：

- 条目数据块重组
- 约束定义块注入
- 新 Lore 宏
- 旧宏兼容

### 约束系统

- [constraints.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/constraints.ts>)
- [ConstraintsTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/ConstraintsTab.vue>)

需要处理：

- 从“旧单层语义”转向“定义 / 绑定 / 注入”分层
- 局约束 / 全局约束边界
- 旧数据迁移策略

### UI

- [AiConfigTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/AiConfigTab.vue>)

需要处理：

- “条目处理范围”功能块
- 模式摘要
- Bottom Sheet 选择器
- 搜索、多选、全选、清空、反选
- 额外世界书占位封印文案

### 世界书与上下文

- [worldbook-context.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/worldbook-context.ts>)
- [worldbook-api.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/worldbook-api.ts>)

重点不是重写接口，而是确认：

- 当前角色卡内置世界书的动态作用域
- 局约束隔离所需的角色上下文字段

### 本轮不建议顺手重构的模块

- [scan-cache.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/scan-cache.ts>)
- [SettingsTab.vue](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/window/tabs/SettingsTab.vue>)
- [review-editor.ts](</F:/Project/Insvnter/Lorevnter/src/Lorevnter/core/review-editor.ts>)

建议：

- 本轮只确认兼容性，不要顺手扩大任务面

---

## 15. 本轮明确不建议混做的事项

以下内容不要混在同一轮实现里：

- 删除整个缓存系统
- 删除整个约束系统
- 直接移除所有宏相关代码
- 审核模式三分类重构
- 大规模移动端重构
- 构建层拆包优化
- 整体重写 prompt editor

原因：

- 这些都属于结构性迭代
- 与“宏渲染修正 + 条目处理范围 + 约束分层”不是一个维度的工作
- 混做会显著扩大回归风险

---

## 16. Claude 的实施边界

### 可以做

- 实现“条目处理范围”完整功能
- 在分析前置统一过滤条目
- 补上世界书正文进入 AI 前的宏渲染层
- 重构约束注入方式
- 优化默认交互，让用户无需先手动选择世界书
- 补充必要的二次确认和状态反馈

### 不要做

- 不要把角色卡默认世界书做成 preset
- 不要继续把局约束默认写进世界书条目 `extra`
- 不要把新功能塞回旧约束系统语义
- 不要顺手删除 `scan-cache` 底层逻辑
- 不要重写整套审核系统
- 不要把本轮扩张成完整递归宏引擎
- 不要引入与现有插件不一致的新视觉体系
- 不要把额外世界书做成本轮主流程入口

---

## 17. 验收标准

### 功能正确性

- `all` 模式下行为与当前默认逻辑一致
- `include` 模式下仅选中条目进入分析
- `exclude` 模式下选中条目不进入分析
- 预览与真实执行使用同一套过滤规则
- 世界书正文中的酒馆宏在送入 AI 前已正确展开
- 宏展开结果不会被写回世界书本体

### 数据正确性

- 条目过滤配置按 `worldbook + uid` 持久化
- 切换聊天后仍能正确识别角色卡内置世界书
- 局约束不会串到其他角色卡
- 旧配置可正常加载
- 旧 prompt preset 可继续使用

### UI 正确性

- 新功能视觉语言与现有插件一致
- 默认进入时无需手动先选世界书
- 默认作用对象明确为当前角色卡内置世界书
- 支持多选、全选、清空、反选、搜索
- 弹层在桌面端与手机端都可用
- 有明确状态提示
- 额外世界书不会误导用户以为当前已经开放可用

### 风险控制

- 不影响现有缓存命中过滤
- 不影响现有 `skip` 约束
- 不影响审核写回主流程
- 不破坏酒馆助手脚本兼容性

---

## 18. Claude 开工前必须先回答的问题

在真正改代码前，Claude 应先明确回答：

1. 世界书正文“分析前宏渲染层”放在哪一层最不容易污染写回链路？
2. 条目处理范围弹层是否应抽成独立组件，而不是继续堆在 `AiConfigTab` 内？
3. 局约束最适合落在哪个作用域，才能避免角色卡串味？
4. 旧的 `entry.extra.lore_constraint_id` 如何兼容迁移？
5. 新增 Lore 宏是否要对旧预设保持完全兼容回退？
6. “额外世界书”本轮是否只保留底层，不进入主流程弹层？
7. 如何保证修改后是“复用酒馆助手宿主语义”，而不是重写一套自己的宿主语义？

---

## 19. 可直接交给 Claude 的执行指令

```md
请基于当前 Lorevnter 项目执行以下方向，不要偏离：

1. 先完整理解当前项目是酒馆助手脚本项目，不是普通 SPA。
- 必须遵守现有宿主挂载、样式传送、脚本变量和上下文探测模型。
- 在改任何功能前，先列出受影响模块、状态、数据流和兼容性风险。

2. 产品定位必须收口。
- Lorevnter 的主目标是“根据剧情更新世界书”，不是“世界书编辑器”。
- 所以后续优先强化“哪些条目参与 AI 分析与更新”的能力，而不是继续扩展编辑器式能力。

3. 角色卡默认世界书不要做成 preset。
- 角色卡默认世界书应来自当前上下文动态探测。
- preset 继续只承担 AI 行为或业务配置快照，不承担角色默认世界书职责。

4. 世界书宏处理要修正，但不要过度扩张。
- 当前问题是世界书正文中的酒馆宏，如 {{user}}，没有在送入 AI 前展开。
- 只在分析链路中增加“分析视图层”。
- 不要把宏展开结果写回世界书本体。
- 必须优先复用酒馆助手 / 酒馆现有宏替换能力。
- 不要顺手扩张成完整递归宏引擎。

5. 实现“条目处理范围”作为核心功能。
- 模式：
  - all：处理全部候选条目
  - include：仅处理选中条目
  - exclude：排除选中条目
- 第一版只作用于已有条目，不控制新增条目。
- 第一版默认作用对象是当前角色卡内置世界书。
- 不要要求用户先手动选择世界书。

6. 条目处理范围的 UI 必须更人性化。
- 放在 AI 配置 Tab，而不是约束页。
- 改为 Bottom Sheet 或同等语义的底部弹层。
- 必须支持：
  - 多选
  - 全选
  - 清空
  - 反选
  - 搜索
- 默认直接服务当前角色卡内置世界书。
- 额外世界书本轮先弱化、隐藏或封印，不要做成主流程显式入口。

7. 约束系统必须按“定义 / 绑定 / 注入”三层拆开。
- 全局约束：可跨世界书复用。
- 局约束：只对当前角色卡 / 当前作用域生效。
- 不要继续把局约束默认写进世界书条目 extra。
- 局约束必须拥有真实角色隔离作用域。
- 绑定表应独立于世界书条目本体。

8. 提示词结构不要整套推倒，但必须重构数据注入层。
- 保留现有 prompt preset 容器。
- 约束不要继续逐条内联塞进每个条目文本。
- prompt 至少拆成三块：
  - 条目数据块
  - 约束定义块
  - 执行规则块
- 推荐新增 lore 宏：
  - {{lore_entries}}
  - {{lore_constraints}}
  - {{lore_constraint_policy}}
- 同时保留旧宏兼容，例如 {{lore_worldbook}}。

9. 本轮不要混做以下事项。
- 不要删除整个缓存系统
- 不要重写整个 prompt editor
- 不要重构整套审核系统
- 不要把本轮扩张成移动端整站重构或构建层优化

10. 修改时必须兼顾 UI 一致性与移动端体验。
- 沿用 Lorevnter 当前已有视觉语言，不要引入风格冲突的新体系。
- 注意触控尺寸、safe area、信息密度和弹层语义。
- 所有不可逆操作必须有明确二次确认与结果反馈。
```

---

## 20. 最终结论

Lorevnter 当前不是“乱到不能用”，而是已经进入一个非常关键的半过渡阶段：

- 方向是对的
- 功能骨架也有了
- 但数据身份、作用域边界、提示词注入结构、UI 一致性、移动端信息层级、工程质量门，还没有同步收口

最核心的问题可以压缩成一句话：

**Lorevnter 正在从“脚本工具”往“产品化插件”过渡，但数据身份模型、作用域边界与界面语言还停留在半过渡状态。**

因此，Claude 后续如果只修表面 UI，效果会很有限；如果只修逻辑，不统一作用域与产品心智，也会继续反复。

这轮最值得做的，不是继续打零碎补丁，而是围绕以下四个点做真正收口：

- 条目标识
- 局部 / 全局作用域
- 提示词注入结构
- 统一的人性化交互语言
