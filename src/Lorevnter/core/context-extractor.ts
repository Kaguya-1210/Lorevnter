// ============================================================
// Lorevnter - 正文提取模块
// 支持 XML 标签级别的内容包含/排除
// ============================================================

import { createLogger } from '../logger';

const logger = createLogger('context-extractor');

/**
 * 从原始消息文本中提取内容。
 * 
 * 处理优先级：include → exclude
 * 
 * @param raw 原始消息文本
 * @param includeTag 包含标签名（空=全文）。如 "content" → 只取 <content>...</content>
 * @param excludeTags 排除标签名，逗号分隔。"*" = 排除所有标签内内容
 */
export function extractContent(raw: string, includeTag: string, excludeTags: string): string {
  let text = raw;

  // Step 1: include —— 只取指定标签内的内容
  if (includeTag.trim()) {
    const tag = includeTag.trim();
    const regex = new RegExp(`<${escapeRegex(tag)}>([\\s\\S]*?)</${escapeRegex(tag)}>`, 'gi');
    const matches = [...text.matchAll(regex)].map(m => m[1]);
    if (matches.length > 0) {
      text = matches.join('\n');
    } else {
      // 标签未匹配到内容，返回空（避免误用全文）
      logger.debug(`包含标签 <${tag}> 未在文本中找到`);
      text = '';
    }
  }

  // Step 2: exclude —— 去掉指定标签的内容
  const trimmedExclude = excludeTags.trim();
  if (trimmedExclude && text) {
    if (trimmedExclude === '*') {
      // 排除所有标签包裹的内容（贪婪匹配同名开闭标签）
      text = text.replace(/<([a-zA-Z_][\w-]*)>[\s\S]*?<\/\1>/g, '');
    } else {
      const tags = trimmedExclude.split(',').map(t => t.trim()).filter(Boolean);
      for (const tag of tags) {
        const regex = new RegExp(`<${escapeRegex(tag)}>[\\s\\S]*?</${escapeRegex(tag)}>`, 'gi');
        text = text.replace(regex, '');
      }
    }
  }

  return text.trim();
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 预览提取效果（供 UI "预览"按钮使用）。
 * 返回最近一条聊天消息经过提取后的结果。
 */
export function previewExtraction(includeTag: string, excludeTags: string): {
  original: string;
  extracted: string;
} | null {
  try {
    // 使用酒馆助手接口获取最后一条消息
    const msgs = getChatMessages(-1);
    if (!msgs || msgs.length === 0) return null;

    const msg = msgs[0];
    if (!msg.message || !msg.message.trim()) return null;

    const original = msg.message;
    const extracted = extractContent(original, includeTag, excludeTags);
    return { original, extracted };
  } catch (e) {
    logger.error(`提取预览失败: ${(e as Error).message}`);
    return null;
  }
}
