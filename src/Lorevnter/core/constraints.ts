// ============================================================
// Lorevnter - 约束系统
// 约束 = 条目级别的提示词模板（可含宏）
// 多个条目可共用同一约束，绑定关系存在 entry.extra
// ============================================================

import { createLogger } from '../logger';
import { useSettingsStore, type LoreConstraint } from '../settings';
import { useContextStore } from './worldbook-context';

const logger = createLogger('constraints');

/** 获取当前角色卡标识（用于局约束隔离） */
function getCurrentCharacterId(): string {
  try {
    const ctx = useContextStore();
    return ctx.context.characterScopeKey ?? '';
  } catch {
    return '';
  }
}

// ── 约束 CRUD ──

/** 创建新约束 */
export function createConstraint(
  name: string,
  type: LoreConstraint['type'],
  instruction: string = '',
  scope: 'global' | 'local' = 'global',
): LoreConstraint {
  const { settings } = useSettingsStore();
  const constraint: LoreConstraint = {
    id: crypto.randomUUID(),
    name,
    type,
    scope,
    instruction,
    enabled: true,
  };
  settings.lore_constraints.push(constraint);
  logger.info(`约束已创建: ${name} (${type}, ${scope})`);
  toastr.success(`约束已创建: ${name}`, 'Lorevnter');
  return constraint;
}

/** 更新约束 */
export function updateConstraint(id: string, patch: Partial<Omit<LoreConstraint, 'id'>>): boolean {
  const { settings } = useSettingsStore();
  const idx = settings.lore_constraints.findIndex(c => c.id === id);
  if (idx === -1) {
    logger.warn(`约束不存在: ${id}`);
    return false;
  }
  Object.assign(settings.lore_constraints[idx], patch);
  logger.info(`约束已更新: ${settings.lore_constraints[idx].name}`);
  return true;
}

/** 删除约束 */
export function deleteConstraint(id: string): boolean {
  const { settings } = useSettingsStore();
  const idx = settings.lore_constraints.findIndex(c => c.id === id);
  if (idx === -1) return false;
  const name = settings.lore_constraints[idx].name;
  settings.lore_constraints.splice(idx, 1);
  logger.info(`约束已删除: ${name}`);
  toastr.info(`约束已删除: ${name}`, 'Lorevnter');
  return true;
}

/** 列出所有约束 */
export function listConstraints(): LoreConstraint[] {
  const { settings } = useSettingsStore();
  return settings.lore_constraints;
}

/** 根据 ID 获取约束 */
export function getConstraintById(id: string): LoreConstraint | null {
  const { settings } = useSettingsStore();
  return settings.lore_constraints.find(c => c.id === id) ?? null;
}

/** 统计某约束被引用的条目数 */
export function countConstraintRefs(_constraintId: string): number {
  // TODO: 后续遍历活跃世界书的条目统计引用次数
  return 0;
}

// ── 条目绑定 ──

/** 绑定约束到条目 */
export async function bindConstraintToEntries(
  worldbookName: string,
  entryUids: number[],
  constraintId: string,
): Promise<void> {
  logger.info(`绑定约束 ${constraintId} 到 ${worldbookName} 的 ${entryUids.length} 个条目`);
  try {
    await updateWorldbookWith(worldbookName, (entries) =>
      entries.map((entry) => {
        if (entryUids.includes(entry.uid)) {
          return {
            ...entry,
            extra: { ...entry.extra, lore_constraint_id: constraintId },
          };
        }
        return entry;
      }),
    );
    toastr.success(`已为 ${entryUids.length} 个条目绑定约束`, 'Lorevnter');
  } catch (e) {
    logger.error(`绑定约束失败: ${(e as Error).message}`);
    toastr.error('绑定约束失败', 'Lorevnter');
    throw e;
  }
}

/** 解绑条目的约束 */
export async function unbindConstraintFromEntries(
  worldbookName: string,
  entryUids: number[],
): Promise<void> {
  logger.info(`解绑 ${worldbookName} 的 ${entryUids.length} 个条目的约束`);
  try {
    await updateWorldbookWith(worldbookName, (entries) =>
      entries.map((entry) => {
        if (entryUids.includes(entry.uid) && entry.extra?.lore_constraint_id) {
          const { lore_constraint_id: _, ...restExtra } = entry.extra;
          return { ...entry, extra: restExtra };
        }
        return entry;
      }),
    );
    toastr.info(`已解除 ${entryUids.length} 个条目的约束`, 'Lorevnter');
  } catch (e) {
    logger.error(`解绑约束失败: ${(e as Error).message}`);
    toastr.error('解绑约束失败', 'Lorevnter');
    throw e;
  }
}

/** 设置条目的宏别名 */
export async function setEntryMacro(
  worldbookName: string,
  entryUid: number,
  macro: string | null,
): Promise<void> {
  logger.info(`设置宏: ${worldbookName} uid=${entryUid} → ${macro ?? '(清除)'}`);
  try {
    await updateWorldbookWith(worldbookName, (entries) =>
      entries.map((entry) => {
        if (entry.uid === entryUid) {
          const extra = { ...entry.extra };
          if (macro) {
            extra.lore_macro = macro;
          } else {
            delete extra.lore_macro;
          }
          return { ...entry, extra };
        }
        return entry;
      }),
    );
    if (macro) {
      toastr.success(`宏已设置: {{${macro}}}`, 'Lorevnter');
    } else {
      toastr.info('宏已清除', 'Lorevnter');
    }
  } catch (e) {
    logger.error(`设置宏失败: ${(e as Error).message}`);
    toastr.error('设置宏失败', 'Lorevnter');
    throw e;
  }
}

/** 从条目获取其绑定的约束（兼容旧 entry.extra + 新绑定表） */
export function getEntryConstraint(entry: WorldbookEntry, worldbookName?: string): LoreConstraint | null {
  const constraints = getPromptConstraints(entry, worldbookName);
  // 返回第一个（向后兼容：旧代码期望单条约束）
  return constraints.length > 0 ? constraints[0] : null;
}

export function getPromptConstraints(entry: WorldbookEntry, worldbookName?: string): LoreConstraint[] {
  return getEntryConstraints(entry, worldbookName).filter(c => c.type === 'prompt');
}

export function hasSkipConstraint(entry: WorldbookEntry, worldbookName?: string): boolean {
  return getEntryConstraints(entry, worldbookName).some(c => c.type === 'skip');
}

/**
 * 从绑定表 + 旧 extra 获取条目的所有约束（去重）
 * 优先级：新绑定表 > 旧 entry.extra.lore_constraint_id
 */
export function getEntryConstraints(entry: WorldbookEntry, worldbookName?: string): LoreConstraint[] {
  const { settings } = useSettingsStore();
  const ids = new Set<string>();

  // 获取当前角色卡标识（用于局约束隔离）
  const currentCharId = getCurrentCharacterId();

  // 新绑定表
  if (worldbookName) {
    for (const b of settings.lore_constraint_bindings) {
      if (b.worldbook === worldbookName && b.entryUid === entry.uid) {
        // 局约束隔离：如果绑定记录有 characterId，只有匹配当前角色卡才纳入
        if (b.characterId && b.characterId !== currentCharId) continue;
        ids.add(b.constraintId);
      }
    }
  }

  // 旧 entry.extra 兼容回退
  const legacyId = entry.extra?.lore_constraint_id;
  if (legacyId) ids.add(legacyId);

  const result: LoreConstraint[] = [];
  for (const id of ids) {
    const c = getConstraintById(id);
    if (c && c.enabled) result.push(c);
  }
  return result;
}

/**
 * 收集本轮所有命中条目涉及的约束（去重）
 * 返回 { constraint, boundEntryNames[] } 用于提示词约束定义块
 */
export function collectActiveConstraints(
  entries: Array<{ entry: WorldbookEntry; worldbookName?: string }>,
): Array<{ constraint: LoreConstraint; entryNames: string[] }> {
  const map = new Map<string, { constraint: LoreConstraint; entryNames: string[] }>();

  for (const { entry, worldbookName } of entries) {
    const constraints = getPromptConstraints(entry, worldbookName);
    for (const c of constraints) {
      if (!map.has(c.id)) {
        map.set(c.id, { constraint: c, entryNames: [] });
      }
      map.get(c.id)!.entryNames.push(entry.name);
    }
  }

  return Array.from(map.values());
}

/** 获取条目的宏别名 */
export function getEntryMacro(entry: WorldbookEntry): string | null {
  return entry.extra?.lore_macro ?? null;
}

// ── 宏解析 ──

/**
 * 解析文本中的宏
 * 1. 先解析条目宏 {{macro}} → 条目 content
 * 2. 再解析酒馆自带宏 {{char}} {{user}} 等
 */
export function resolveMacros(template: string, allEntries: WorldbookEntry[]): string {
  let result = template;

  // 解析条目宏
  for (const entry of allEntries) {
    const macro = getEntryMacro(entry);
    if (macro) {
      result = result.replaceAll(`{{${macro}}}`, entry.content);
    }
  }

  // 解析酒馆自带宏
  result = substitudeMacros(result);

  return result;
}

/**
 * 解析 Lorevnter 专属数据宏
 * {{lore_worldbook}} → 命中的世界书条目文本
 * {{lore_context}}   → 上下文正文
 * {{lore_max_context}} → 上下文数量设置值
 * {{lore_entry_count}} → 分析条目数量
 */
export function resolveLoreMacros(template: string, macros: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(macros)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
