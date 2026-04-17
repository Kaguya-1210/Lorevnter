# Lorevnter

AI 驱动的 SillyTavern 世界书自动管理插件。

## 简介

Lorevnter 是一款 SillyTavern 酒馆助手脚本插件，通过 AI 自动读取聊天上下文、分析剧情推进，并根据用户定义的约束规则自动更新世界书条目，实现世界观数据的动态维护。

## 开发进度

### ✅ Phase 1：基础架构（已完成）

| 模块 | 状态 | 说明 |
|------|:----:|------|
| 插件入口 & 生命周期 | ✅ | jQuery 加载/卸载、Vue 挂载、样式注入 |
| 设置系统 | ✅ | Zod Schema、Pinia Store、酒馆变量持久化 |
| 日志系统 | ✅ | 模块级 logger、级别过滤、缓冲区导出 |
| 世界书 CRUD API | ✅ | 条目读写、批量操作、世界书列表 |
| 上下文管理 | ✅ | 角色卡/全局/聊天 世界书自动探测 |
| 约束 & 宏系统 | ✅ | 提示词约束、跳过约束、条目级宏 |
| AI 引擎 | ✅ | API 代理调用、JSON 容错解析 |
| 更新管线 | ✅ | 自动/手动触发、计数器、分析请求构建 |
| 提示词编辑器 | ✅ | 原生 DOM 弹窗、预设 CRUD |
| UI 主窗口 | ✅ | iOS 风格 Tab 布局、六个功能页 |

### ✅ Phase 2：核心逻辑闭环（已完成）

| 模块 | 状态 | 说明 |
|------|:----:|------|
| 设置迁移（砍 twopass） | ✅ | 移除两次调用模式，统一为 onepass |
| 正文提取引擎 | ✅ | XML 标签级 include/exclude 提取 |
| 用户人设提取 | ✅ | 从酒馆预设中提取角色人设 |
| 扫描缓存 | ✅ | SCAN_DONE 缓存、过期检查、3 天提醒 |
| 审核系统 | ✅ | 原生 DOM 弹窗、逐条通过/拒绝、Diff 展示 |
| 测试模式 | ✅ | 模拟写入/修改/新增、快照回档 |
| AI 配置 UI | ✅ | 提取预览、世界书下拉、配置优化 |
| 调试面板 | ✅ | 缓存面板、操作结果列表、审核触发 |

### 🔜 Phase 3：全链路集成（进行中）

| 待办 | 说明 |
|------|------|
| 审核 → 写入闭环 | AI 分析结果 → 审核弹窗 → 确认后写入世界书 |
| 生产环境验证 | 真实聊天场景下的完整管线测试 |
| 弹窗兼容性修复 | 提取预览/审核弹窗在酒馆 iframe 中的显示 |

## 核心功能

### 上下文感知

- 自动识别角色卡绑定的世界书、全局世界书、聊天世界书
- 聊天切换时自动刷新世界书上下文
- 实时状态栏显示当前绑定信息

### 约束系统

- **提示词约束**：为条目设定 AI 处理规则（支持宏 `{{char}}` `{{user}}` 等）
- **跳过约束**：标记不需要 AI 处理的条目
- 多个条目可共用同一约束，灵活管理

### 宏系统

- 条目级别的短标签别名（如 `shr` → 沙赫尔）
- 在 AI 提示词模板中通过 `{{shr}}` 引用条目内容
- 兼容酒馆原生宏

### 正文提取引擎

- **include 标签**：只提取指定 XML 标签内的内容
- **exclude 标签**：排除指定标签（支持 `*` 排除所有）
- 实时预览提取效果

### AI 分析引擎

- 一次调用模式：筛选与更新合一
- 自动/手动触发两种方式
- JSON 容错解析，兼容 AI 输出格式偏差

### 审核系统

- 底部 Sheet 弹窗展示 AI 修改建议
- 逐条通过/拒绝，支持全部通过
- 展开查看行级 Diff 对比
- 确认后才执行写入（高敏感操作保护）

### 测试模式

- 模拟写入/修改/新增条目
- 快照机制：一键回档恢复
- 世界书下拉选择（优先角色卡绑定）

### 调试面板

- 上下文状态快照
- AI 调用历史记录
- 扫描缓存统计
- 操作日志（支持级别过滤）
- 一键导出调试信息

## 项目结构

```
src/Lorevnter/
├── index.ts                   # 插件入口
├── settings.ts                # 设置 Schema + Pinia Store
├── state.ts                   # 运行时状态
├── logger.ts                  # 日志系统
│
├── core/
│   ├── worldbook-api.ts       # 世界书 CRUD API
│   ├── worldbook-context.ts   # 上下文管理
│   ├── constraints.ts         # 约束 + 宏系统
│   ├── ai-engine.ts           # AI 调用封装
│   ├── update-pipeline.ts     # 更新管线
│   ├── context-extractor.ts   # 正文提取引擎
│   ├── persona.ts             # 用户人设提取
│   ├── scan-cache.ts          # 扫描缓存管理
│   ├── prompt-editor.ts       # 提示词编辑器
│   ├── review-editor.ts       # 审核弹窗
│   ├── review-types.ts        # 审核类型定义
│   └── test-mode.ts           # 测试模式
│
├── stores/
│   └── selfCheckStore.ts      # 自检结果状态
│
├── styles/
│   └── lorevnter.scss         # iOS 设计系统
│
└── window/
    ├── LorevnterWindow.vue     # 主窗口
    ├── components/
    │   ├── ContextBar.vue      # 状态栏
    │   ├── ReviewDialog.vue    # 审核弹窗（Vue 骨架/备用）
    │   └── ReviewEntryEditor.vue
    └── tabs/
        ├── WorldbooksTab.vue   # 世界书管理
        ├── ConstraintsTab.vue  # 约束管理
        ├── AiConfigTab.vue     # AI 配置
        ├── PresetsTab.vue      # 预设管理
        ├── SettingsTab.vue     # 设置页
        └── DebugTab.vue        # 调试面板
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式（热更新）
pnpm dev

# 生产构建
pnpm build
```

## 技术栈

- **框架**: Vue 3 + Pinia
- **构建**: Webpack 5 + TypeScript
- **UI 风格**: iOS-style（圆角卡片、柔和阴影、分组列表）
- **运行环境**: SillyTavern 酒馆助手脚本（无沙盒 iframe）

## 许可证

[Aladdin](LICENSE)
