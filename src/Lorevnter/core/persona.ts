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

    const result = `用户名: ${name || '用户'}\n${desc.trim()}`;
    logger.debug(`用户人设已提取 (${desc.trim().length} 字符)`);
    return result;
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

/** 获取原始人设文本（用于备份还原） */
export function getPersonaRaw(): string {
  try {
    const powerUser = SillyTavern.powerUserSettings as Record<string, any> | undefined;
    return (powerUser?.persona_description as string) ?? '';
  } catch {
    return '';
  }
}

/**
 * 写入用户人设文本。
 * 参照 st-persona-weaver 的 forceSavePersona:
 *   1. 修改 powerUserSettings.persona_description（内存）
 *   2. 操作父窗口 DOM #persona_description 并 trigger input/change（使酒馆 UI 识别变更）
 *   3. 调用 saveSettingsDebounced 持久化
 *
 * 注意：我们运行在酒馆助手 iframe 中，需要通过 window.parent 访问酒馆主窗口。
 * @returns 是否写入成功
 */
export function setUserPersona(description: string): boolean {
  try {
    const powerUser = SillyTavern.powerUserSettings as Record<string, any> | undefined;
    if (!powerUser) {
      logger.error('powerUserSettings 不可用，无法写入人设');
      return false;
    }

    // 1. 修改内存中的人设数据
    powerUser.persona_description = description;

    // 2. 操作父窗口 DOM，使酒馆 UI 识别该变更
    try {
      const parentWin = window.parent || window;
      const parentDoc = parentWin.document;
      const descEl = parentDoc.querySelector('#persona_description') as HTMLTextAreaElement | null;
      if (descEl) {
        descEl.value = description;
        // 触发 jQuery 事件（酒馆 UI 监听的是 jQuery 事件）
        const $ = (parentWin as any).jQuery || (parentWin as any).$;
        if ($ && $(descEl).length) {
          $(descEl).trigger('input').trigger('change');
          logger.debug('已通过父窗口 jQuery 触发 input/change 事件');
        } else {
          // 降级：原生事件
          descEl.dispatchEvent(new Event('input', { bubbles: true }));
          descEl.dispatchEvent(new Event('change', { bubbles: true }));
          logger.debug('已通过原生 Event 触发 input/change 事件');
        }
      } else {
        logger.warn('父窗口中未找到 #persona_description 元素，仅修改了内存');
      }
    } catch (domErr) {
      logger.warn(`操作父窗口 DOM 失败 (跨域?): ${(domErr as Error).message}`);
    }

    // 3. 持久化到服务端
    SillyTavern.saveSettingsDebounced();
    logger.info(`用户人设已写入 (${description.length} 字符)`);
    return true;
  } catch (e) {
    logger.error(`写入用户人设失败: ${(e as Error).message}`);
    return false;
  }
}
