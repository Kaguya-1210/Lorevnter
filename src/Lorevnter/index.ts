// ============================================================
// Lorevnter - 入口文件
// 功能: SillyTavern 世界书管理插件
// ============================================================

import { createLogger, setDebugMode } from './logger';
import { useRuntimeStore } from './state';
import { useSettingsStore } from './settings';
import { createScriptIdDiv, teleportStyle } from '@util/script';
import LorevnterWindow from './window/LorevnterWindow.vue';

// 导入样式
import './styles/lorevnter.scss';

const logger = createLogger('index');

/** 窗口管理 */
let app: ReturnType<typeof createApp> | null = null;
let $appEl: JQuery | null = null;
let styleDestroy: (() => void) | null = null;

function showWindow(targetTab?: string) {
  const runtime = useRuntimeStore();
  if (targetTab) runtime.currentTab = targetTab as any;

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
