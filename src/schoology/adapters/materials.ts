import { SGY, queryAll, queryFirst } from '../selectors';
import { textWithoutHiddenNodes } from './course';

/**
 * Course materials parsing.
 *
 * Rows are read, never cloned. `sCourseMaterialsFolders` binds folder
 * expanders, completion tracking and lock behavior directly to these nodes, so
 * a clone would look right and silently do nothing. Better Materials therefore
 * restyles the native table and annotates its rows; it never rebuilds them.
 */
export interface MaterialItem {
  /** Node ID from the `n-<id>` row ID convention. */
  nodeId: string;
  title: string;
  href?: string;
  /** Schoology's own `type-*` class, e.g. `assignment`. */
  type: string;
  subtitle?: string;
  /** The due sentence Schoology renders in the subtitle, when there is one. */
  dueText?: string;
  /** Description body, when the material has one. */
  bodyText?: string;
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

/**
 * Schoology writes the due sentence as the first `.small.gray` span inside the
 * subtitle, followed by unrelated affordances (lesson plans, and on some rows
 * a comment count). Only the leading sentence is read, and only when it really
 * is a due sentence.
 */
const DUE_PREFIX_RE = /^\s*due\b/i;

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
    const bodyEl = queryFirst(row, SGY.materials.itemBody);
    const bodyText = bodyEl ? textWithoutHiddenNodes(bodyEl) : '';
    const className = typeof row.className === 'string' ? row.className : '';

    items.push({
      nodeId,
      title,
      ...(anchor?.getAttribute('href') ? { href: anchor.getAttribute('href')! } : {}),
      type: className.match(TYPE_CLASS_RE)?.[1] ?? 'unknown',
      ...(subtitle ? { subtitle } : {}),
      ...(dueTextIn(subtitleEl) ? { dueText: dueTextIn(subtitleEl)! } : {}),
      ...(bodyText ? { bodyText } : {}),
      ...(displayWeight(row) !== undefined ? { displayWeight: displayWeight(row)! } : {}),
    });
  }

  return items;
}

/** The leading "Due ..." sentence of a material row's subtitle, if it has one. */
export function dueTextIn(subtitle: Element | null): string | undefined {
  if (!subtitle) return undefined;

  const first = subtitle.querySelector('.small.gray') ?? subtitle;
  const text = textWithoutHiddenNodes(first);
  return DUE_PREFIX_RE.test(text) ? text : undefined;
}

/** True when the materials surface is the one Better Materials knows. */
export function isMaterialsRendered(root: ParentNode): boolean {
  return queryFirst(root, SGY.materials.table) !== null;
}

/** Native ordering metadata carried on material/folder rows. */
function displayWeight(row: Element): number | undefined {
  const raw = row.getAttribute('display_weight');
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
