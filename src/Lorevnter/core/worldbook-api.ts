// ============================================================
// Lorevnter - 世界书 API 封装层（核心底层）
// 对酒馆原生世界书 API 的统一封装，所有操作自动带日志
// ============================================================

import { createLogger } from '../logger';

const logger = createLogger('core');

// ────────────────────────────────────
// 查询类
// ────────────────────────────────────

/** 列出所有世界书名称 */
export function listAll(): string[] {
  const names = getWorldbookNames();
  logger.debug(`列出所有世界书: ${names.length} 个`, names);
  return names;
}

/** 获取当前激活的世界书（全局 + 角色 + 聊天） */
export function getActive(): {
  global: string[];
  character: { primary: string | null; additional: string[] };
  chat: string | null;
} {
  let global: string[] = [];
  let character: { primary: string | null; additional: string[] } = { primary: null, additional: [] };
  let chat: string | null = null;

  try { global = getGlobalWorldbookNames(); } catch (e) {
    logger.debug('获取全局世界书失败（可能无全局世界书）: ' + (e as Error).message);
  }
  try { character = getCharWorldbookNames('current'); } catch (e) {
    logger.debug('获取角色世界书失败（可能无角色卡）: ' + (e as Error).message);
  }
  try { chat = getChatWorldbookName('current'); } catch (e) {
    logger.debug('获取聊天世界书失败（可能无活跃聊天）: ' + (e as Error).message);
  }

  logger.debug('当前激活世界书', { global, character, chat });

  return { global, character, chat };
}

/** 获取世界书条目 */
export async function fetch(name: string): Promise<WorldbookEntry[]> {
  logger.info(`获取世界书: ${name}`);
  try {
    const entries = await getWorldbook(name);
    logger.info(`世界书已获取: ${name} (${entries.length} 条条目)`);
    return entries;
  } catch (e) {
    logger.error(`获取世界书失败: ${name} — ${(e as Error).message}`);
    throw e;
  }
}

// ────────────────────────────────────
// 写入类
// ────────────────────────────────────

/** 写回整个世界书 */
export async function save(name: string, entries: PartialDeep<WorldbookEntry>[]): Promise<void> {
  logger.info(`保存世界书: ${name} (${entries.length} 条条目)`);
  try {
    await replaceWorldbook(name, entries);
    logger.info(`世界书已保存: ${name}`);
  } catch (e) {
    logger.error(`保存世界书失败: ${name} — ${(e as Error).message}`);
    throw e;
  }
}

/** 更新单条条目（部分字段） */
export async function updateEntry(
  name: string,
  uid: number,
  patch: PartialDeep<WorldbookEntry>,
): Promise<WorldbookEntry[]> {
  logger.info(`更新条目: ${name} uid=${uid}`, patch);
  try {
    const result = await updateWorldbookWith(name, (entries) =>
      entries.map((entry) => (entry.uid === uid ? { ...entry, ...patch } : entry)),
    );
    logger.info(`条目已更新: ${name} uid=${uid}`);
    return result;
  } catch (e) {
    logger.error(`更新条目失败: ${name} uid=${uid} — ${(e as Error).message}`);
    throw e;
  }
}

/** 新增条目 */
export async function createEntries(
  name: string,
  newEntries: PartialDeep<WorldbookEntry>[],
): Promise<{ worldbook: WorldbookEntry[]; new_entries: WorldbookEntry[] }> {
  logger.info(`新增条目: ${name} (${newEntries.length} 条)`);
  try {
    const result = await createWorldbookEntries(name, newEntries);
    logger.info(`条目已新增: ${name} (${result.new_entries.length} 条)`);
    return result;
  } catch (e) {
    logger.error(`新增条目失败: ${name} — ${(e as Error).message}`);
    throw e;
  }
}

/** 按条件删除条目 */
export async function deleteEntries(
  name: string,
  predicate: (entry: WorldbookEntry) => boolean,
): Promise<{ worldbook: WorldbookEntry[]; deleted_entries: WorldbookEntry[] }> {
  logger.info(`删除条目: ${name}`);
  try {
    const result = await deleteWorldbookEntries(name, predicate);
    logger.info(`条目已删除: ${name} (${result.deleted_entries.length} 条)`);
    return result;
  } catch (e) {
    logger.error(`删除条目失败: ${name} — ${(e as Error).message}`);
    throw e;
  }
}

// ────────────────────────────────────
// 世界书级别操作
// ────────────────────────────────────

/** 创建新世界书 */
export async function create(name: string, entries?: WorldbookEntry[]): Promise<boolean> {
  logger.info(`创建世界书: ${name}`);
  try {
    const isNew = await createWorldbook(name, entries);
    logger.info(`世界书${isNew ? '已创建' : '已替换'}: ${name}`);
    return isNew;
  } catch (e) {
    logger.error(`创建世界书失败: ${name} — ${(e as Error).message}`);
    throw e;
  }
}

/** 删除世界书 */
export async function remove(name: string): Promise<boolean> {
  logger.info(`删除世界书: ${name}`);
  try {
    const success = await deleteWorldbook(name);
    if (success) {
      logger.info(`世界书已删除: ${name}`);
    } else {
      logger.warn(`世界书删除失败（可能不存在）: ${name}`);
    }
    return success;
  } catch (e) {
    logger.error(`删除世界书失败: ${name} — ${(e as Error).message}`);
    throw e;
  }
}
