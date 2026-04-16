// ============================================================
// Lorevnter - 世界书备份管理器
// 使用 localStorage 存储备份，避免 extension_settings 膨胀
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore } from '../settings';
import * as WorldbookAPI from './worldbook-api';

const logger = createLogger('backup');

const STORAGE_KEY = 'lorevnter_worldbook_backups';

// ── 类型 ──

export interface BackupRecord {
  id: string;
  timestamp: number;
  worldbookName: string;
  entries: any[]; // WorldbookEntry[]
  entryCount: number;
  triggerType: 'auto' | 'manual';
}

// ── 存储层（localStorage） ──

function loadBackups(): BackupRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BackupRecord[];
  } catch (e) {
    logger.error(`读取备份失败: ${(e as Error).message}`);
    return [];
  }
}

function saveBackups(backups: BackupRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(backups));
  } catch (e) {
    logger.error(`保存备份失败: ${(e as Error).message}`);
    // localStorage 满了时静默忽略
  }
}

// ── 公共 API ──

/** 获取所有备份记录 */
export function getBackups(): BackupRecord[] {
  return loadBackups();
}

/** 获取指定世界书的备份 */
export function getBackupsForWorldbook(worldbookName: string): BackupRecord[] {
  return loadBackups().filter(b => b.worldbookName === worldbookName);
}

/** 创建备份 */
export async function createBackup(
  worldbookName: string,
  triggerType: 'auto' | 'manual' = 'manual',
): Promise<BackupRecord | null> {
  const { settings } = useSettingsStore();

  try {
    const entries = await WorldbookAPI.fetch(worldbookName);
    if (entries.length === 0) {
      logger.debug(`跳过备份: ${worldbookName} 无条目`);
      return null;
    }

    // 差异检测：与最新备份比较
    const existing = getBackupsForWorldbook(worldbookName);
    if (existing.length > 0) {
      const latest = existing[0]; // 按时间降序
      const currentHash = JSON.stringify(entries.map(e => ({ name: e.name, content: e.content })));
      const latestHash = JSON.stringify(latest.entries.map((e: any) => ({ name: e.name, content: e.content })));
      if (currentHash === latestHash) {
        logger.debug(`跳过备份: ${worldbookName} 内容无变化`);
        return null;
      }
    }

    const record: BackupRecord = {
      id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      worldbookName,
      entries: JSON.parse(JSON.stringify(entries)), // 深拷贝
      entryCount: entries.length,
      triggerType,
    };

    const backups = loadBackups();
    backups.unshift(record); // 最新的在前

    // 按世界书淘汰，保留 maxCount
    const maxCount = settings.lore_backup_max_count;
    const byWorldbook: Record<string, BackupRecord[]> = {};
    for (const b of backups) {
      if (!byWorldbook[b.worldbookName]) byWorldbook[b.worldbookName] = [];
      byWorldbook[b.worldbookName].push(b);
    }
    const trimmed: BackupRecord[] = [];
    for (const entries of Object.values(byWorldbook)) {
      trimmed.push(...entries.slice(0, maxCount));
    }
    trimmed.sort((a, b) => b.timestamp - a.timestamp);

    saveBackups(trimmed);
    logger.info(`备份已创建: ${worldbookName} (${record.entryCount} 条)`);
    return record;
  } catch (e) {
    logger.error(`创建备份失败: ${worldbookName} — ${(e as Error).message}`);
    return null;
  }
}

/** 还原备份 */
export async function restoreBackup(backupId: string): Promise<boolean> {
  const backups = loadBackups();
  const record = backups.find(b => b.id === backupId);
  if (!record) {
    logger.error(`备份不存在: ${backupId}`);
    return false;
  }

  try {
    await WorldbookAPI.save(record.worldbookName, record.entries);
    logger.info(`备份已还原: ${record.worldbookName} (${record.entryCount} 条)`);
    return true;
  } catch (e) {
    logger.error(`还原备份失败: ${(e as Error).message}`);
    return false;
  }
}

/** 删除单个备份 */
export function deleteBackup(backupId: string): void {
  const backups = loadBackups();
  const idx = backups.findIndex(b => b.id === backupId);
  if (idx >= 0) {
    backups.splice(idx, 1);
    saveBackups(backups);
    logger.info(`备份已删除: ${backupId}`);
  }
}

/** 清空所有备份 */
export function clearAllBackups(): void {
  saveBackups([]);
  logger.info('所有备份已清空');
}

/** 导出备份为 JSON 字符串 */
export function exportBackups(backupIds?: string[]): string {
  const backups = loadBackups();
  const data = backupIds
    ? backups.filter(b => backupIds.includes(b.id))
    : backups;
  return JSON.stringify(data, null, 2);
}

/** 导入备份 */
export function importBackups(jsonStr: string): number {
  try {
    const imported = JSON.parse(jsonStr) as BackupRecord[];
    if (!Array.isArray(imported)) throw new Error('格式错误');

    const backups = loadBackups();
    const existingIds = new Set(backups.map(b => b.id));
    let added = 0;
    for (const record of imported) {
      if (!record.id || !record.worldbookName || !record.entries) continue;
      if (existingIds.has(record.id)) continue;
      backups.push(record);
      added++;
    }
    backups.sort((a, b) => b.timestamp - a.timestamp);
    saveBackups(backups);
    logger.info(`已导入 ${added} 条备份`);
    return added;
  } catch (e) {
    logger.error(`导入备份失败: ${(e as Error).message}`);
    return 0;
  }
}

// ── 管线钩子 ──

/** 管线执行计数 */
let pipelineRunCount = 0;

/**
 * 在管线执行前调用，根据配置决定是否自动备份。
 * @param worldbookNames 当前活跃的世界书名称列表
 */
export async function autoBackupIfNeeded(worldbookNames: string[]): Promise<void> {
  const { settings } = useSettingsStore();
  if (!settings.lore_backup_enabled) return;

  pipelineRunCount++;
  if (pipelineRunCount % settings.lore_backup_interval !== 0) return;

  for (const name of worldbookNames) {
    await createBackup(name, 'auto');
  }
}
