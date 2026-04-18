// ============================================================
// Lorevnter - 世界书上下文管理
// 感知当前聊天状态、绑定的世界书、活跃模式
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';
import * as WorldbookAPI from './worldbook-api';
import { getCurrentChatId as getCurrentPipelineChatId } from './update-pipeline';

const logger = createLogger('context');

// ── 类型定义 ──

export type ContextMode = 'character' | 'global' | 'idle';

export interface WorldbookContext {
  /** 当前模式 */
  mode: ContextMode;
  /** 角色卡绑定的世界书 */
  character: CharWorldbooks;
  /** 全局世界书 */
  global: string[];
  /** 聊天绑定的世界书 */
  chat: string | null;
  /** 来源标签（UI 展示用） */
  sourceLabel: string;
  /** 当前角色名 */
  characterName: string | null;
  /** 当前聊天 ID */
  chatId: string | null;
  /** 上次刷新时间 */
  lastRefreshed: number;
}

function createDefaultContext(): WorldbookContext {
  return {
    mode: 'idle',
    character: { primary: null, additional: [] },
    global: [],
    chat: null,
    sourceLabel: '空闲',
    characterName: null,
    chatId: null,
    lastRefreshed: 0,
  };
}

// ── Store ──

export const useContextStore = defineStore('lorevnter_context', () => {
  const context = ref<WorldbookContext>(createDefaultContext());

  /** 是否正在刷新 */
  const refreshing = ref(false);

  /**
   * 重新探测当前世界书绑定状态
   * @returns 刷新后的上下文
   */
  function refresh(): WorldbookContext {
    refreshing.value = true;
    try {
      const active = WorldbookAPI.getActive();
      const charName = getCurrentCharacterName();
      const chatId = getCurrentPipelineChatId() || null;

      const ctx = context.value;
      ctx.character = active.character;
      ctx.global = active.global;
      ctx.chat = active.chat;
      ctx.characterName = charName;
      ctx.chatId = chatId;
      ctx.lastRefreshed = Date.now();

      // 判断模式
      if (active.character.primary) {
        ctx.mode = 'character';
        ctx.sourceLabel = `角色: ${charName ?? active.character.primary}`;
      } else if (active.global.length > 0) {
        ctx.mode = 'global';
        ctx.sourceLabel = '全局世界书';
      } else {
        ctx.mode = 'idle';
        ctx.sourceLabel = '空闲';
      }

      logger.info(`上下文已刷新: ${ctx.mode} — ${ctx.sourceLabel}`);
      logger.debug('上下文详情', {
        mode: ctx.mode,
        character: ctx.character,
        global: ctx.global,
        chat: ctx.chat,
        chatId: ctx.chatId,
      });

      return ctx;
    } catch (e) {
      logger.error(`上下文刷新失败: ${(e as Error).message}`);
      throw e;
    } finally {
      refreshing.value = false;
    }
  }

  /** 获取当前活跃的所有世界书名称列表（去重）。
   *  排除全局世界书（防止误修改跨角色共享数据），
   *  额外世界书（lore_target_worldbooks）始终包含。
   */
  function getActiveWorldbookNames(): string[] {
    const ctx = context.value;
    const names = new Set<string>();

    // 角色卡世界书
    if (ctx.character.primary) names.add(ctx.character.primary);
    for (const name of ctx.character.additional) names.add(name);

    // 全局世界书 —— 排除（用户可通过额外世界书手动添加）

    // 聊天世界书
    if (ctx.chat) names.add(ctx.chat);

    // 额外世界书（来自设置中用户手动指定）
    try {
      const { settings } = useSettingsStore();
      for (const name of settings.lore_target_worldbooks) names.add(name);
    } catch {
      // settings 可能尚未初始化，忽略
    }

    return [...names];
  }

  return {
    context: readonly(context),
    refreshing: readonly(refreshing),
    refresh,
    getActiveWorldbookNames,
  };
});
