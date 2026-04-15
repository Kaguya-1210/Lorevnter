# Lorevnter

AI 驱动的 SillyTavern 世界书自动管理插件。

## 简介

Lorevnter 是一款 SillyTavern 酒馆助手插件，通过 AI 自动读取聊天上下文、分析剧情推进，并根据用户定义的约束规则自动更新世界书条目，实现世界观数据的动态维护。

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

### AI 分析引擎

- **一次调用模式**：筛选与更新合一，适合简单场景
- **两次调用模式**：先筛选后更新，适合复杂场景
- 自动/手动触发两种方式
- JSON 容错解析，兼容 AI 输出格式偏差

### 调试面板

- 上下文状态快照
- AI 调用历史记录
- 操作日志（支持级别过滤）
- 一键导出调试信息

## 项目结构

```
src/Lorevnter/
├── index.ts                 # 插件入口
├── settings.ts              # 设置 Schema + Pinia Store
├── state.ts                 # 运行时状态
├── logger.ts                # 日志系统
│
├── core/
│   ├── worldbook-api.ts     # 世界书 CRUD API
│   ├── worldbook-context.ts # 上下文管理
│   ├── constraints.ts       # 约束 + 宏系统
│   ├── ai-engine.ts         # AI 调用封装
│   └── update-pipeline.ts   # 更新管线
│
├── styles/
│   └── lorevnter.scss       # 全局样式
│
└── window/
    ├── LorevnterWindow.vue   # 主窗口
    ├── components/
    │   └── ContextBar.vue    # 状态栏
    └── tabs/
        ├── WorldbooksTab.vue   # 世界书管理
        ├── ConstraintsTab.vue  # 约束管理
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
- **运行环境**: SillyTavern 酒馆助手脚本沙箱

## 许可证

[Aladdin](LICENSE)
