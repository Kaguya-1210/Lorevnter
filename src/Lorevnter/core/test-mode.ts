// ============================================================
// Lorevnter - 测试模式
// 调试 Tab 功能：写入假数据到世界书，不走 API
// 用于测试写入/修改/新增管线是否正常
// ============================================================

import { createLogger } from '../logger';
import * as wbApi from './worldbook-api';

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
 * 执行测试写入：向指定世界书写入假数据。
 * 模拟操作：修改现有条目（uid 级别） + 新增条目
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

    // 保存原始快照
    const snapshot: TestSnapshot = {
      worldbookName,
      originalEntries: klona(entries),
      createdCount: 0,
      modifiedCount: 0,
      timestamp: Date.now(),
    };

    const actions: TestActionResult[] = [];
    const timestamp = new Date().toLocaleString();

    // ── 模拟修改：选取最多 2 个条目，通过 uid 修改 content ──
    const modifyCount = Math.min(2, entries.length);
    for (let i = 0; i < modifyCount; i++) {
      const entry = entries[i];
      const name = entry.comment || entry.name || `uid_${entry.uid}`;

      try {
        await wbApi.updateEntry(worldbookName, entry.uid, {
          content: entry.content + `\n\n<!-- [Lorevnter 测试] uid:${entry.uid} 修改于 ${timestamp} -->`,
        });

        actions.push({
          action: 'modify',
          entryName: name,
          uid: entry.uid,
          success: true,
          detail: `content 末尾追加测试标记`,
        });
        snapshot.modifiedCount++;
        logger.info(`测试修改成功: ${name} (uid: ${entry.uid})`);
      } catch (e) {
        actions.push({
          action: 'modify',
          entryName: name,
          uid: entry.uid,
          success: false,
          detail: (e as Error).message,
        });
        logger.error(`测试修改失败: ${name} (uid: ${entry.uid}) — ${(e as Error).message}`);
      }
    }

    // ── 模拟新增：创建一个测试条目 ──
    try {
      const result = await wbApi.createEntries(worldbookName, [{
        comment: `[Lorevnter 测试] ${timestamp}`,
        content: `这是 Lorevnter 测试模式自动创建的条目。\n写入时间: ${timestamp}\n\n如果你看到这条，说明新增功能正常！\n请使用「测试回档」功能删除此条目。`,
        key: ['lorevnter_test'],
        selective: true,
        constant: false,
        disable: false,
        order: 9999,
      }]);

      for (const ne of result.new_entries) {
        actions.push({
          action: 'create',
          entryName: ne.comment || '测试条目',
          uid: ne.uid,
          success: true,
          detail: `uid: ${ne.uid}`,
        });
      }
      snapshot.createdCount = result.new_entries.length;
      logger.info(`测试新增成功: ${result.new_entries.length} 条`);
    } catch (e) {
      actions.push({
        action: 'create',
        entryName: '测试条目',
        uid: -1,
        success: false,
        detail: (e as Error).message,
      });
      logger.error(`测试新增失败: ${(e as Error).message}`);
    }

    // 保存快照
    activeSnapshot = snapshot;

    const successCount = actions.filter(a => a.success).length;
    const failCount = actions.filter(a => !a.success).length;

    const msg = failCount === 0
      ? `测试写入成功！修改 ${snapshot.modifiedCount} 条，新增 ${snapshot.createdCount} 条。`
      : `测试部分完成：成功 ${successCount}，失败 ${failCount}。`;

    logger.info(`测试写入完成: ${msg}`);
    return { success: failCount === 0, message: msg, actions };
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(`测试写入失败: ${msg}`);
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
