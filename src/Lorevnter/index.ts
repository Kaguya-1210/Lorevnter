// ============================================================
// Lorevnter - 入口文件
// 功能: SillyTavern 世界书管理插件
// ============================================================

import { createLogger, setDebugMode } from './logger';
import { useRuntimeStore, type TabName } from './state';
import { useSettingsStore } from './settings';
import { useContextStore } from './core/worldbook-context';
import { createScriptIdDiv, teleportStyle } from '@util/script';
import { incrementAndCheckAutoScan, runUpdatePipeline, resetMessageCount, setCurrentChatId } from './core/update-pipeline';
import { setCacheChatId, onScanDone, getStaleChats, clearCacheForChat } from './core/scan-cache';
import LorevnterWindow from './window/LorevnterWindow.vue';

// 导入样式
import './styles/lorevnter.scss';

const logger = createLogger('index');

/** 窗口管理 */
let app: ReturnType<typeof createApp> | null = null;
let $appEl: JQuery | null = null;
let styleDestroy: (() => void) | null = null;

function showWindow(targetTab?: TabName) {
  const runtime = useRuntimeStore();
  if (targetTab) runtime.currentTab = targetTab;

  if (!app) {
    mountApp();
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      runtime.windowVisible = true;
    });
  });
}

function hideWindow() {
  const runtime = useRuntimeStore();
  runtime.windowVisible = false;
}

function toggleWindow() {
  const runtime = useRuntimeStore();
  if (runtime.windowVisible) {
    hideWindow();
  } else {
    showWindow();
  }
}

function mountApp() {
  if (app) return;

  const pinia = createPinia();
  app = createApp(LorevnterWindow).use(pinia);

  const { destroy } = teleportStyle();
  styleDestroy = destroy;

  $appEl = createScriptIdDiv().appendTo('body');
  app.mount($appEl[0]);

  logger.info('窗口 Vue app 已挂载');

  const { settings } = useSettingsStore();
  setDebugMode(settings.lore_debug_mode);
  watch(() => settings.lore_debug_mode, (val) => {
    setDebugMode(val);
    logger.info('🔍 调试模式: ' + (val ? '开启' : '关闭'));
  });
}

function unmountApp() {
  if (app) {
    app.unmount();
    app = null;
  }
  if ($appEl) {
    $appEl.remove();
    $appEl = null;
  }
  if (styleDestroy) {
    styleDestroy();
    styleDestroy = null;
  }
}

// --- 初始化 ---
$(() => {
  logger.info('脚本已加载');

  mountApp();

  // 初始化同步 chatId（热更新后 currentChatId 会丢失）
  try {
    const initChatId = SillyTavern.getCurrentChatId();
    if (initChatId) {
      setCurrentChatId(String(initChatId));
      setCacheChatId(String(initChatId));
      logger.info(`初始化 chatId: ${initChatId}`);
    }
  } catch (e) {
    logger.warn(`初始化 chatId 失败: ${(e as Error).message}`);
  }

  // ── 事件监听（世界书探测延迟到角色卡打开时） ──
  const ctx = useContextStore();
  const { settings } = useSettingsStore();
  logger.info('等待角色卡加载...');

  // 聊天切换后的冷却窗口（防止历史消息重放误触发自动分析）
  let chatChangeCooldown = false;
  // 追踪上一次角色作用域键，只有真正切换角色时才重置过滤模式
  let lastKnownCharacterScopeKey: string | null = null;

  // 监听聊天切换
  eventOn(tavern_events.CHAT_CHANGED, (chatFileName) => {
    // 空 chatFileName = 酒馆还没加载角色卡，静默跳过
    if (!chatFileName) {
      logger.debug('聊天切换: chatFileName 为空，跳过');
      return;
    }

    logger.info(`聊天已切换: ${chatFileName}`);
    const chatId = String(chatFileName);
    setCurrentChatId(chatId);
    setCacheChatId(chatId); // 同步缓存模块的 chatId

    // 设置冷却窗口：忽略切换后 2s 内的 MESSAGE_RECEIVED（酒馆历史加载）
    chatChangeCooldown = true;
    setTimeout(() => { chatChangeCooldown = false; }, 2000);

    try {
      ctx.refresh();
      const mode = ctx.context.mode;
      if (mode !== 'idle') {
        toastr.info(`已切换到: ${ctx.context.sourceLabel}`, 'Lorevnter');
      }

      // 只有角色卡真正变化时才重置过滤模式
      const currentCharacterScopeKey = ctx.context.characterScopeKey ?? null;
      if (
        lastKnownCharacterScopeKey !== null &&
        currentCharacterScopeKey !== lastKnownCharacterScopeKey
      ) {
        settings.lore_entry_filter_mode = 'all';
        settings.lore_entry_filter_map = {};
        logger.info(
          `角色卡切换 (${lastKnownCharacterScopeKey} → ${currentCharacterScopeKey})，已重置条目过滤`,
        );
      }
      lastKnownCharacterScopeKey = currentCharacterScopeKey;
    } catch (e) {
      logger.error('聊天切换后刷新上下文失败: ' + (e as Error).message);
    }

    // ── 检查过期缓存（3 天未更新 → 弹窗提醒） ──
    try {
      const staleChats = getStaleChats();
      if (staleChats.length > 0) {
        const chatNames = staleChats.join(', ');
        toastr.warning(
          `以下聊天的条目缓存已超过 3 天未更新，建议清理：\n${chatNames}`,
          'Lorevnter 缓存提醒',
          {
            timeOut: 0,
            extendedTimeOut: 0,
            closeButton: true,
            onclick: () => {
              // 用户点击 toastr → 清理所有过期缓存
              if (confirm(`确认清理以下聊天的过期缓存？\n${chatNames}\n\n⚠️ 此操作不可撤销！`)) {
                for (const id of staleChats) {
                  clearCacheForChat(id);
                }
                toastr.success(`已清理 ${staleChats.length} 个过期缓存`, 'Lorevnter');
              }
            },
          },
        );
        logger.info(`检测到 ${staleChats.length} 个过期缓存`);
      }
    } catch (e) {
      logger.error('过期缓存检查失败: ' + (e as Error).message);
    }
  });

  // 监听新消息（仅 AI 回复时计数，满足间隔则自动触发分析）
  eventOn(tavern_events.MESSAGE_RECEIVED, async () => {
    // 冷却窗口内忽略（聊天切换后历史消息重放）
    if (chatChangeCooldown) return;

    // 判断最后一条消息是否来自 AI
    const msgs = getChatMessages(-1);
    if (!msgs || msgs.length === 0) return;
    const lastMsg = msgs[0];
    if (lastMsg.role === 'user') return; // 用户消息不计数

    if (incrementAndCheckAutoScan()) {
      logger.info('自动触发 AI 分析（AI 回复计数达到间隔）');
      // fire-and-forget：不阻塞聊天，分析在后台异步执行
      runUpdatePipeline().catch(e => logger.error(`后台分析失败: ${(e as Error).message}`));
    }
  });

  // 监听 WORLDINFO_SCAN_DONE 事件 → 缓存激活条目名
  eventOn(tavern_events.WORLDINFO_SCAN_DONE, (eventData) => {
    try {
      onScanDone(eventData);
    } catch (e) {
      logger.error('SCAN_DONE 处理失败: ' + (e as Error).message);
    }
  });

  // 创建脚本按钮
  try {
    appendInexistentScriptButtons([{ name: 'Lorevnter', visible: true }]);
    eventOn(getButtonEvent('Lorevnter'), () => {
      logger.info('按钮点击: 切换窗口');
      toggleWindow();
    });
    logger.info('脚本按钮已注册');
  } catch (e) {
    logger.error('脚本按钮初始化失败: ' + (e as Error).message);
  }

  // 注册 /lore 斜杠命令
  SillyTavern.SlashCommandParser.addCommandObject(
    SillyTavern.SlashCommand.fromProps({
      name: 'lore',
      callback: () => {
        toggleWindow();
        return '';
      },
    }),
  );
  logger.info('/lore 命令已注册');

  // 关闭脚本时清理
  $(window).on('pagehide', () => {
    hideWindow();
    unmountApp();
    logger.info('脚本已卸载');
  });
});

/** 插件默认导出 */
export default {
  name: 'Lorevnter',
  version: '0.1.0',
  showWindow,
  hideWindow,
  toggleWindow,
} as const;
