import type { CatalogMenu, PermissionCatalog } from '../services/types';

/** One menu as a matrix row; cells are keyed by action code (missing = action not offered by the menu). */
export interface MatrixRow {
  id: string;
  code: string;
  depth: number;
  kind: CatalogMenu['kind'];
  name: CatalogMenu['name'];
  cells: Record<string, { menuActionId: string; grantable: boolean }>;
}

export interface MatrixColumn {
  code: string;
  name: CatalogMenu['name'];
}

/** Flattens the menu tree depth-first (module > menu > submenu). */
export function buildRows(menus: CatalogMenu[], depth = 0): MatrixRow[] {
  return menus.flatMap((menu) => [
    {
      id: menu.id,
      code: menu.code,
      depth,
      kind: menu.kind,
      name: menu.name,
      cells: Object.fromEntries(menu.actions.map((a) => [a.code, { menuActionId: a.menuActionId, grantable: a.grantable }])),
    },
    ...buildRows(menu.children, depth + 1),
  ]);
}

/** Standard actions first (catalog order), then special actions actually offered by some menu. */
export function buildColumns(catalog: PermissionCatalog, rows: MatrixRow[]): MatrixColumn[] {
  const used = new Set(rows.flatMap((row) => Object.keys(row.cells)));
  return catalog.actions
    .filter((action) => action.is_standard || used.has(action.code))
    .sort((a, b) => Number(b.is_standard) - Number(a.is_standard) || a.sort_order - b.sort_order)
    .map((action) => ({ code: action.code, name: action.name }));
}

export function toggle(selected: ReadonlySet<string>, menuActionId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(menuActionId)) next.delete(menuActionId);
  else next.add(menuActionId);
  return next;
}

/** Ticks or clears every grantable cell of a row (cells the actor cannot grant stay as they are). */
export function setRow(selected: ReadonlySet<string>, row: MatrixRow, checked: boolean): Set<string> {
  const next = new Set(selected);
  for (const cell of Object.values(row.cells)) {
    if (!cell.grantable) continue;
    if (checked) next.add(cell.menuActionId);
    else next.delete(cell.menuActionId);
  }
  return next;
}

export function rowState(selected: ReadonlySet<string>, row: MatrixRow): 'all' | 'some' | 'none' {
  const cells = Object.values(row.cells);
  const ticked = cells.filter((cell) => selected.has(cell.menuActionId)).length;
  if (ticked === 0) return 'none';
  return ticked === cells.length ? 'all' : 'some';
}

export function diff(original: ReadonlySet<string>, selected: ReadonlySet<string>): { added: string[]; removed: string[] } {
  return {
    added: [...selected].filter((id) => !original.has(id)),
    removed: [...original].filter((id) => !selected.has(id)),
  };
}
