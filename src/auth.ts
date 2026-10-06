import type { Classification } from './store';

export type Role = '审核组' | '复核员' | '导出员';

export type Permission = '查看' | '修改' | '导出';

/**
 * 角色权限矩阵：每个角色对不同密级文档的查看、修改、导出权限。
 * 权限不足时拒绝操作并写入审计日志。
 */
export const ROLE_PERMISSIONS: Record<Role, Record<Permission, Classification[]>> = {
  '审核组': {
    '查看': ['内部', '机密', '严格机密'],
    '修改': ['内部', '机密'],
    '导出': ['内部', '机密']
  },
  '复核员': {
    '查看': ['内部', '机密'],
    '修改': ['内部'],
    '导出': ['内部']
  },
  '导出员': {
    '查看': ['内部'],
    '修改': [],
    '导出': ['内部', '机密', '严格机密']
  }
};

export const ROLE_MEMBERS: Record<Role, string> = {
  '审核组': '林清',
  '复核员': '周叙',
  '导出员': '顾言'
};

export const ALL_ROLES: Role[] = ['审核组', '复核员', '导出员'];

export function can(role: Role, permission: Permission, classification: Classification): boolean {
  return ROLE_PERMISSIONS[role][permission].includes(classification);
}

export function actorName(role: Role): string {
  return ROLE_MEMBERS[role];
}
