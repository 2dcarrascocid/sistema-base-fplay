import type { ConfigMenu } from '../services/types';

export interface MenuTreeNode extends ConfigMenu {
  depth: number;
  children: MenuTreeNode[];
}

/** Builds the module > menu > submenu tree from the flat list, siblings by sort_order then code. */
export function buildMenuTree(menus: ConfigMenu[]): MenuTreeNode[] {
  const byParent = new Map<string | null, ConfigMenu[]>();
  for (const menu of menus) byParent.set(menu.parent_id, [...(byParent.get(menu.parent_id) ?? []), menu]);
  const build = (parentId: string | null, depth: number): MenuTreeNode[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
      .map((menu) => ({ ...menu, depth, children: build(menu.id, depth + 1) }));
  return build(null, 0);
}

/** Depth-first list for rendering rows. */
export function flattenTree(nodes: MenuTreeNode[]): MenuTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/** Sibling ids after moving one up (-1) or down (+1); null when it cannot move. */
export function moveSibling(menus: ConfigMenu[], menuId: string, direction: -1 | 1): { parentId: string | null; orderedIds: string[] } | null {
  const menu = menus.find((m) => m.id === menuId);
  if (!menu) return null;
  const siblings = menus
    .filter((m) => m.parent_id === menu.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
    .map((m) => m.id);
  const index = siblings.indexOf(menuId);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return null;
  [siblings[index], siblings[target]] = [siblings[target]!, siblings[index]!];
  return { parentId: menu.parent_id, orderedIds: siblings };
}

/** Level a new child of this parent would have (null when the parent is a submenu). */
export function childKind(parent: ConfigMenu | null): ConfigMenu['kind'] | null {
  if (!parent) return 'module';
  return parent.kind === 'module' ? 'menu' : parent.kind === 'menu' ? 'submenu' : null;
}
