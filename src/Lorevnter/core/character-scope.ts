// ============================================================
// Lorevnter - 当前角色作用域标识
// 为局部约束、角色切换检测等场景提供稳定于显示名的角色键
// ============================================================

/**
 * 获取当前角色的稳定作用域键。
 * 优先级：
 * 1. avatar id（最稳定）
 * 2. primary worldbook 名称
 * 3. 角色显示名
 */
export function detectCurrentCharacterScopeKey(
  fallbackPrimary?: string | null,
  fallbackName?: string | null,
): string {
  try {
    const charData = getCharData('current');
    if (charData) {
      try {
        const raw = new RawCharacter(charData);
        const avatarId = raw.getAvatarId?.();
        if (avatarId) return `avatar:${avatarId}`;

        const worldName = raw.getWorldName?.();
        if (worldName) return `world:${worldName}`;
      } catch {
        // 回退到后备来源
      }
    }
  } catch {
    // 忽略，继续回退
  }

  if (fallbackPrimary) return `world:${fallbackPrimary}`;
  if (fallbackName) return `name:${fallbackName}`;
  return '';
}
