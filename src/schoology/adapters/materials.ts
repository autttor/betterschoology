import { SGY, queryAll, queryFirst } from '../selectors';
import { textWithoutHiddenNodes } from './course';

/**
 * Course materials parsing.
 *
 * Rows are read, never cloned. `sCourseMaterialsFolders` binds folder
 * expanders, completion tracking and lock behavior directly to these nodes, so
 * a clone would look right and silently do nothing.
 */
export interface MaterialItem {
  /** Node ID from the `n-<id>` row ID convention. */
  nodeId: string;
  title: string;
  href?: string;
  /** Schoology's own `type-*` class, e.g. `assignment`. */
  type: string;
  subtitle?: string;
  displayWeight?: number;
}

export interface MaterialFolder {
  folderId: string;
  title: string;
  href?: string;
  displayWeight?: number;
}

const FOLDER_ID_RE = /^f-(\d+)$/;
const MATERIAL_ID_RE = /^n-(\d+)$/;
const TYPE_CLASS_RE = /(?:^|\s)type-([a-z0-9_-]+)/i;

export function parseMaterialFolders(root: ParentNode): MaterialFolder[] {
  const folders: MaterialFolder[] = [];

  for (const row of queryAll(root, SGY.materials.folderRow)) {
    const folderId = row.id.match(FOLDER_ID_RE)?.[1];
    if (!folderId) continue;

    const titleEl = queryFirst(row, SGY.materials.folderTitle);
    const anchor = titleEl?.querySelector<HTMLAnchorElement>('a[href]') ?? null;
    const title = titleEl ? textWithoutHiddenNodes(titleEl) : '';
    if (!title) continue;

    folders.push({
      folderId,
      title,
      ...(anchor?.getAttribute('href') ? { href: anchor.getAttribute('href')! } : {}),
      ...(displayWeight(row) !== undefined ? { displayWeight: displayWeight(row)! } : {}),
    });
  }

  return folders;
}

export function parseMaterialItems(root: ParentNode): MaterialItem[] {
  const items: MaterialItem[] = [];

  for (const row of queryAll(root, SGY.materials.materialRow)) {
    const nodeId = row.id.match(MATERIAL_ID_RE)?.[1];
    if (!nodeId) continue;

    const titleEl = queryFirst(row, SGY.materials.itemTitle);
    const anchor = titleEl?.querySelector<HTMLAnchorElement>('a[href]') ?? null;
    const title = titleEl ? textWithoutHiddenNodes(titleEl) : '';
    if (!title) continue;

    const subtitleEl = queryFirst(row, SGY.materials.itemSubtitle);
    const subtitle = subtitleEl ? textWithoutHiddenNodes(subtitleEl) : '';
    const className = typeof row.className === 'string' ? row.className : '';

    items.push({
      nodeId,
      title,
      ...(anchor?.getAttribute('href') ? { href: anchor.getAttribute('href')! } : {}),
      type: className.match(TYPE_CLASS_RE)?.[1] ?? 'unknown',
      ...(subtitle ? { subtitle } : {}),
      ...(displayWeight(row) !== undefined ? { displayWeight: displayWeight(row)! } : {}),
    });
  }

  return items;
}

/** Native ordering metadata carried on material/folder rows. */
function displayWeight(row: Element): number | undefined {
  const raw = row.getAttribute('display_weight');
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
