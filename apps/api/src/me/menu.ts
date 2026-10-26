import type { Role } from '@base/shared';
import type { ClientType } from '../lib/db-types.js';

export interface MenuRow {
  id: string;
  parent_id: string | null;
  kind: 'module' | 'menu' | 'submenu';
  code: string;
  name: { es: string; en: string };
  icon: string | null;
  route: string | null;
  sort_order: number;
  show_in_mobile: boolean;
}

export interface MenuNode {
  code: string;
  kind: MenuRow['kind'];
  name: { es: string; en: string };
  icon: string | null;
  route: string | null;
  children: MenuNode[];
}

/**
 * Builds the navigation tree the user may see: a menu with a route needs "<code>:view"
 * (superusers see everything); a node without a route is shown only if it has visible children.
 * Mobile only gets menus flagged show_in_mobile. Rows must be the effective (active) menus.
 */
export function buildMenuTree(rows: MenuRow[], role: Role, permissions: ReadonlySet<string>, client: ClientType): MenuNode[] {
  const byParent = new Map<string | null, MenuRow[]>();
  for (const row of [...rows].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))) {
    const siblings = byParent.get(row.parent_id) ?? [];
    siblings.push(row);
    byParent.set(row.parent_id, siblings);
  }

  const build = (parentId: string | null): MenuNode[] =>
    (byParent.get(parentId) ?? []).flatMap((row) => {
      if (client === 'mobile' && !row.show_in_mobile) return [];
      const children = build(row.id);
      const canOpen = row.route !== null && (role === 'superuser' || permissions.has(`${row.code}:view`));
      if (!canOpen && children.length === 0) return [];
      return [{ code: row.code, kind: row.kind, name: row.name, icon: row.icon, route: canOpen ? row.route : null, children }];
    });

  return build(null);
}
