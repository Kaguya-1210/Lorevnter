# Insvnter 插件文档

> **版本**: Phase 2 完成 (2026-04-03)
> **平台**: SillyTavern 酒馆助手扩展

---

## 一、项目概述

Insvnter 是一个 SillyTavern 提示词拦截与可视化编辑插件。在 AI 请求发送前拦截提示词，支持规则处理（捕获/替换/合并/移动/Tauri适配），并提供可视化编辑器进行实时编辑。

### 技术栈

- **前端框架**: Vue 3 + Pinia（酒馆助手模板）
- **构建工具**: Webpack 5
- **类型系统**: TypeScript + Zod Schema
- **通信机制**: BroadcastChannel（插件 ↔ 编辑器）

---

## 二、架构总览

```text
src/Insvnter/
├── index.ts              # 入口：注册斜杠命令 + 初始化
├── interceptor.ts        # 核心：Promise 阻塞拦截管线
├── processor.ts          # 引擎：捕获 → 替换 → Tauri → 移动 → 合并
├── settings.ts           # 设置：Pinia + Zod 校验 + 酒馆变量同步
├── state.ts              # 状态：运行时数据（提示词/Promise/编辑器）
├── logger.ts             # 日志：带缓冲区的分级日志系统
├── utils.ts              # 工具：deepClone/escapeHtml/clipboard
├── editor-channel.ts     # 通信：BroadcastChannel 消息分发
├── editor/
│   ├── editor-html.ts    # 编辑器 HTML 组装入口（?raw 导入）
│   ├── editor.css        # 编辑器独立样式（425行）
│   ├── editor-runtime.js # 编辑器运行时 JS（含 CRUD）
│   └── tag-parser.ts     # 解析器：HTML 标签树 + 身份系统
├── styles/               # 样式：CSS 变量 + 主题
└── window/
    ├── InsvnterWindow.vue   # 主窗口容器
    ├── components/          # 通用组件（SwitchBar, RuleCard 等）
    └── tabs/                # 标签页
        ├── PromptTab.vue    # 提示词查看
        ├── RulesTab.vue     # 规则管理 + 预设系统
        ├── EditorTab.vue    # 编辑器控制
        ├── SettingsTab.vue  # 设置 + Tauri + 日志
        └── MessageTab.vue   # 消息历史
```

---

## 三、功能说明

### 3.1 提示词拦截

**触发方式**: 用户在酒馆中发送消息 → `CHAT_COMPLETION_SETTINGS_READY` 事件触发

**流程**:

1. 保存原始 `completion.messages` 的深拷贝
2. 通过 `processMessages()` 执行规则管线
3. 清空 `completion.messages` + 返回 Promise 阻塞管线
4. 弹出 Insvnter 窗口，用户查看/编辑
5. 用户点击「确认发送」→ 写回消息 + resolve Promise
6. 用户点击「取消发送」→ reject Promise + 中断请求

**安全超时**: 5 分钟无操作自动取消

### 3.2 规则处理管线

处理顺序（跳过第 1 条系统消息）：

| 步骤 | 功能 | 说明 |
| ---- | ---- | ---- |
| 1 | 捕获规则 | 正则匹配 → 提取内容 → 存储到标记 |
| 2 | 标记替换 | 消息中的标记占位符 → 替换为捕获内容 |
| 2.5 | Tauri 适配 | 移除历史 User 消息（保留最新 + 白名单） |
| 3 | 移动规则 | 按索引移动消息位置 |
| 4 | 手动合并 | 将指定索引的消息合并为一条 |
| 5 | 自动合并 | 连续同角色消息自动合并 |

### 3.3 可视化编辑器

- **打开方式**: 新标签页 / iframe 嵌入（可配置）
- **通信**: 通过 BroadcastChannel 与插件实时同步
- **消息操作**: 拖拽排序、多选合并、批量删除、单条编辑
- **标签 CRUD**: 每条消息的 Tag 弹窗支持搜索/编辑/插入/删除/解包
- **标签身份**: 每个标签节点携带 `uid`/`srcStart`/`srcEnd`，支持精确定位

### 3.4 规则预设

在「规则」标签页中管理规则预设：

- **保存**: 将当前规则配置快照为预设（含名称和描述）
- **应用**: 一键加载预设覆盖当前配置
- **导出**: 下载为 `.json` 文件
- **导入**: 上传 `.json` + Zod schema 校验
- **删除**: 内联确认删除

预设包含：捕获规则、合并组、移动规则、合并/捕获开关、Tauri 配置。

### 3.5 Tauri 适配

针对 Tauri 封装的酒馆客户端，自动剥离历史 User 消息以减少 token：

- 仅保留最新一条 User 消息
- 支持白名单索引（保留特定位置的 User 消息）

---

## 四、斜杠命令

| 命令 | 功能 |
| ---- | ---- |
| `/W7` | 打开/关闭 Insvnter 窗口 |

---

## 五、配置参考

### 设置项

| 字段 | 类型 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `inv_plugin_enabled` | boolean | true | 总开关 |
| `inv_capture_enabled` | boolean | true | 捕获规则全局开关 |
| `inv_capture_rules` | array | [] | 捕获规则列表 |
| `inv_merge_enabled` | boolean | true | 自动合并开关 |
| `inv_merge_groups` | array | [] | 手动合并组列表 |
| `inv_move_rules` | array | [] | 移动规则列表 |
| `inv_intercept_only` | boolean | false | 仅拦截不处理 |
| `inv_skip_mvu` | boolean | true | 跳过 MVU 请求 |
| `inv_mvu_threshold` | number | 2 | MVU 检测阈值 |
| `inv_tauri_strip_user` | boolean | false | Tauri 剥离 User |
| `inv_tauri_user_whitelist` | number[] | [] | Tauri 白名单索引 |
| `inv_editor_open_mode` | 'tab'/'iframe' | 'tab' | 编辑器打开方式 |
| `inv_theme` | 'dark'/'light' | 'dark' | 主题 |
| `inv_presets` | array | [] | 规则预设列表 |

### 捕获规则格式

```json
{
  "enabled": true,
  "regex": "/pattern/flags",
  "tag": "<tag_name>",
  "updateMode": "replace"
}
```

### 预设格式

```json
{
  "name": "预设名称",
  "createdAt": "2026-04-03T12:00:00.000Z",
  "description": "描述文字",
  "rules": {
    "captureRules": [],
    "mergeGroups": [],
    "moveRules": [],
    "mergeEnabled": true,
    "captureEnabled": true,
    "tauriStripUser": false,
    "tauriUserWhitelist": []
  }
}
```

---

## 六、开发指南

### 环境准备

```bash
pnpm install
pnpm run watch   # 开发模式（热编译）
pnpm run build   # 生产构建
```

### 输出位置

构建产物位于 `dist/脚本示例/index.js`，酒馆自动加载。

### 编辑器架构

编辑器采用 CSS/JS/HTML 三层分离 + 构建时内联：

```text
editor.css          → 通过 ?raw 导入为字符串
editor-runtime.js   → 通过 ?raw 导入 + tag-parser 注入
editor-html.ts      → 组装入口（模板字符串拼接 CSS + JS + HTML）
```

构建后仍输出为单一 JS 文件，运行时完全兼容酒馆助手脚本。

---

## 七、开发记录

### Phase 1

1. 核心拦截管线: Promise 阻塞 + 消息写回 + 安全超时
2. 规则引擎: 捕获/替换/合并/移动/Tauri 五步管线
3. 可视化编辑器: 独立 HTML 页面 + BroadcastChannel 通信 + 标签浏览器
4. 插件 UI 窗口: 5 标签页，移动端适配
5. 主题系统: 深色/浅色切换
6. 标签解析器: 支持 HTML 属性、void 元素、深度嵌套
7. 全面代码审计: 12 项 bug/安全/质量问题修复

### Phase 2

1. **编辑器架构拆分**: `editor-html.ts` → `editor.css` + `editor-runtime.js` + 组装入口
2. **标签身份系统**: `uid/srcStart/srcEnd/parentUid`，基于字符偏移的唯一标识
3. **标签 CRUD**: 搜索过滤、删除/解包/插入/编辑，每个节点独立操作按钮
4. **规则预设系统**: 保存/应用/导出JSON/导入+Zod校验/删除，内联表单 + 确认操作

