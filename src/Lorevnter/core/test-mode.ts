// ============================================================
// Lorevnter - 测试模式
// 调试 Tab 功能：写入假数据到世界书，走审核弹窗流程
// 用于测试审核/写入/修改/新增管线是否正常
// ============================================================

import { createLogger } from '../logger';
import * as wbApi from './worldbook-api';
import { openReviewEditor } from './review-editor';
import type { ReviewUpdate } from './review-types';

const logger = createLogger('test-mode');

/** 测试写入快照（用于一键回档） */
interface TestSnapshot {
  worldbookName: string;
  /** 修改前的条目快照（完整 entries array） */
  originalEntries: WorldbookEntry[];
  /** 新增条目数量 */
  createdCount: number;
  /** 修改条目数量 */
  modifiedCount: number;
  timestamp: number;
}

/** 单条测试操作的结果 */
export interface TestActionResult {
  action: 'modify' | 'create';
  entryName: string;
  uid: number | string;
  success: boolean;
  detail: string;
}

let activeSnapshot: TestSnapshot | null = null;

/** 是否有活跃的测试快照 */
export function hasActiveTestSnapshot(): boolean {
  return activeSnapshot !== null;
}

/** 获取活跃快照信息（UI 横幅用） */
export function getTestSnapshotInfo(): {
  worldbook: string;
  modifiedCount: number;
  createdCount: number;
  timestamp: number;
} | null {
  if (!activeSnapshot) return null;
  return {
    worldbook: activeSnapshot.worldbookName,
    modifiedCount: activeSnapshot.modifiedCount,
    createdCount: activeSnapshot.createdCount,
    timestamp: activeSnapshot.timestamp,
  };
}

/**
 * 获取可供测试的世界书列表。
 * 优先返回角色卡绑定的世界书，再加上所有世界书。
 */
export function getAvailableWorldbooks(): string[] {
  try {
    const active = wbApi.getActive();
    const names = new Set<string>();

    // 角色卡绑定世界书优先
    if (active.character.primary) names.add(active.character.primary);
    for (const n of active.character.additional) names.add(n);
    if (active.chat) names.add(active.chat);

    // 全部世界书补充
    const all = wbApi.listAll();
    for (const n of all) names.add(n);

    return [...names];
  } catch (e) {
    logger.error(`获取世界书列表失败: ${(e as Error).message}`);
    return [];
  }
}

/**
 * 执行测试写入：向指定世界书构造假数据，通过审核弹窗确认后写入。
 * 模拟操作：修改现有条目 + 追加内容 + 新增条目
 * 会先保存快照供回档使用。
 */
export async function runTestWrite(worldbookName: string): Promise<{
  success: boolean;
  message: string;
  actions: TestActionResult[];
}> {
  logger.info(`开始测试写入: ${worldbookName}`);

  try {
    // 获取完整条目列表
    const entries = await wbApi.fetch(worldbookName);

    if (!entries || entries.length === 0) {
      return { success: false, message: '世界书中没有条目，无法执行修改测试', actions: [] };
    }

    // 保存原始快照（审核前就保存，确保可回档）
    activeSnapshot = {
      worldbookName,
      originalEntries: klona(entries),
      createdCount: 0,
      modifiedCount: 0,
      timestamp: Date.now(),
    };

    const timestamp = new Date().toLocaleString();

    // ── 构造 ReviewUpdate 数组 ──
    const reviewUpdates: ReviewUpdate[] = [];

    // 模拟修改：选取第 1 个条目，在内容中插入几个字（微小变更）
    if (entries.length >= 1) {
      const entry = entries[0];
      const name = entry.name || `uid_${entry.uid}`;
      const lines = entry.content.split('\n');
      // 在第一行末尾加几个字
      if (lines.length > 0) {
        lines[0] = lines[0] + `（测试修改 ${timestamp}）`;
      }
      reviewUpdates.push({
        entryName: name,
        originalContent: entry.content,
        newContent: lines.join('\n'),
        reason: '测试修改：在首行末尾加了几个字',
        approved: null,
        action: 'modify',
        uid: entry.uid,
        worldbook: worldbookName,
      });
    }

    // 模拟追加：选取第 2 个条目，在内容末尾追加一行
    if (entries.length >= 2) {
      const entry = entries[1];
      const name = entry.name || `uid_${entry.uid}`;
      reviewUpdates.push({
        entryName: name,
        originalContent: entry.content,
        newContent: entry.content + `\n最近发生了一些变化。（测试追加 ${timestamp}）`,
        reason: '测试追加：末尾追加了一句话',
        approved: null,
        action: 'append',
        uid: entry.uid,
        worldbook: worldbookName,
      });
    }

    // 模拟新增：创建一个带标题和关键词的测试条目
    reviewUpdates.push({
      entryName: `Lorevnter测试条目`,
      originalContent: '',
      newContent: `这是 Lorevnter 测试模式创建的条目。\n写入时间：${timestamp}\n\n如果看到这条说明新增功能正常，请使用「测试回档」删除。`,
      reason: '测试新增：验证条目创建功能',
      approved: null,
      action: 'create',
      uid: -1,
      worldbook: worldbookName,
    });

    // ── 通过审核弹窗确认 ──
    return new Promise((resolve) => {
      openReviewEditor(reviewUpdates, async (approved) => {
        const actions: TestActionResult[] = [];
        let modCount = 0;
        let crCount = 0;

        for (const update of approved) {
          try {
            if (update.action === 'create') {
              // 新增条目
              const result = await wbApi.createEntries(worldbookName, [{
                name: update.entryName,
                content: update.newContent,
                strategy: {
                  type: 'selective',
                  keys: [update.entryName, 'lorevnter_test'],
                },
                position: { order: 9999 },
                recursion: { prevent_incoming: true },
              }]);
              for (const ne of result.new_entries) {
                actions.push({
                  action: 'create',
                  entryName: update.entryName,
                  uid: ne.uid,
                  success: true,
                  detail: `uid: ${ne.uid}`,
                });
              }
              crCount++;
            } else {
              // 修改或追加（通过 uid 更新 content）
              await wbApi.updateEntry(worldbookName, update.uid, {
                content: update.newContent,
              });
              actions.push({
                action: 'modify',
                entryName: update.entryName,
                uid: update.uid,
                success: true,
                detail: `content 已更新`,
              });
              modCount++;
            }
          } catch (e) {
            actions.push({
              action: update.action === 'create' ? 'create' : 'modify',
              entryName: update.entryName,
              uid: update.uid,
              success: false,
              detail: (e as Error).message,
            });
          }
        }

        // 更新快照计数
        if (activeSnapshot) {
          activeSnapshot.modifiedCount = modCount;
          activeSnapshot.createdCount = crCount;
        }

        const failCount = actions.filter(a => !a.success).length;
        const msg = failCount === 0
          ? `测试写入成功！修改 ${modCount} 条，新增 ${crCount} 条。`
          : `测试部分完成：成功 ${actions.length - failCount}，失败 ${failCount}。`;

        logger.info(`测试写入完成: ${msg}`);
        resolve({ success: failCount === 0, message: msg, actions });
      }, () => {
        // onCancel: 用户点击取消，释放 Promise + 清除快照
        activeSnapshot = null;
        logger.info('用户取消测试写入审核');
        resolve({ success: false, message: '用户取消了审核', actions: [] });
      });
    });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(`测试写入失败: ${msg}`);
    activeSnapshot = null;
    return { success: false, message: `测试写入失败: ${msg}`, actions: [] };
  }
}

/**
 * 一键回档：用快照恢复世界书原始状态。
 */
export async function rollbackTestWrite(): Promise<{ success: boolean; message: string }> {
  if (!activeSnapshot) {
    return { success: false, message: '没有活跃的测试快照' };
  }

  logger.info(`开始回档: ${activeSnapshot.worldbookName}`);

  try {
    // 使用 replaceWorldbook 整体恢复
    await wbApi.save(activeSnapshot.worldbookName, activeSnapshot.originalEntries);

    const modCount = activeSnapshot.modifiedCount;
    const crCount = activeSnapshot.createdCount;
    const name = activeSnapshot.worldbookName;

    activeSnapshot = null;

    logger.info(`回档完成: ${name}`);
    return {
      success: true,
      message: `回档成功！${name} 已恢复（还原 ${modCount} 条修改，删除 ${crCount} 条新增）。`,
    };
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(`回档失败: ${msg}`);
    return { success: false, message: `回档失败: ${msg}` };
  }
}

/** 放弃快照（保留测试写入的数据） */
export function discardTestSnapshot(): void {
  if (activeSnapshot) {
    logger.info('用户选择保留测试数据，丢弃快照');
    activeSnapshot = null;
  }
}
