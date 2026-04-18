// ============================================================
// Lorevnter - 审核系统类型定义
// ============================================================

/** 单条审核条目 */
export interface ReviewUpdate {
  /** 条目名 */
  entryName: string;
  /** 修改前内容（create 时为空字符串） */
  originalContent: string;
  /** AI 生成的新内容 */
  newContent: string;
  /** AI 给出的修改理由 */
  reason: string;
  /** 审核状态：null=未决, true=通过, false=拒绝 */
  approved: boolean | null;
  /** 操作类型: create=新条目, append=追加内容, modify=修改内容 */
  action: 'create' | 'append' | 'modify';
  /** 条目 uid（update 时有值，create 时为 -1） */
  uid: number;
  /** 目标世界书名 */
  worldbook: string;
}
