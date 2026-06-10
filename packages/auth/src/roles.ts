import type { CmsRole } from './verify.js';

const EDIT_ROLES: CmsRole[] = ['cms-admin', 'cms-editor'];

export function canEdit(roles: CmsRole[]): boolean {
  return roles.some((r) => EDIT_ROLES.includes(r));
}

export function canPublish(roles: CmsRole[]): boolean {
  return canEdit(roles);
}

export interface PuckPermissions {
  edit: boolean;
  insert: boolean;
  delete: boolean;
  drag: boolean;
  duplicate: boolean;
}

/** Maps CMS roles onto Puck's global Permissions API flags. */
export function puckPermissionsFor(roles: CmsRole[]): PuckPermissions {
  const editable = canEdit(roles);
  return {
    edit: editable,
    insert: editable,
    delete: editable,
    drag: editable,
    duplicate: editable,
  };
}
