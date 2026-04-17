// ============================================================
// Lorevnter - 用户人设提取
// 从酒馆获取用户 persona 并包裹为 XML 标签
// ============================================================

import { createLogger } from '../logger';

const logger = createLogger('persona');

/**
 * 获取用户人设文本，包裹在 <user_persona> 标签内。
 * 返回 null 表示无人设数据或获取失败。
 */
export function getUserPersona(): string | null {
  try {
    const name = SillyTavern.name1;
    const powerUser = SillyTavern.powerUserSettings as Record<string, any> | undefined;
    const desc = powerUser?.persona_description as string | undefined;

    if (!desc?.trim()) {
      logger.debug('用户人设为空');
      return null;
    }

    const wrapped = `<user_persona>\n用户名: ${name || '用户'}\n${desc.trim()}\n</user_persona>`;
    logger.debug(`用户人设已提取 (${desc.trim().length} 字符)`);
    return wrapped;
  } catch (e) {
    logger.error(`获取用户人设失败: ${(e as Error).message}`);
    return null;
  }
}

/** 获取原始人设数据（调试预览用） */
export function getPersonaPreview(): { name: string; description: string } | null {
  try {
    const name = SillyTavern.name1 || '用户';
    const powerUser = SillyTavern.powerUserSettings as Record<string, any> | undefined;
    const desc = powerUser?.persona_description as string | undefined;

    if (!desc?.trim()) return null;
    return { name, description: desc.trim() };
  } catch {
    return null;
  }
}
