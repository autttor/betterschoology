import type { Density } from '@/src/types/settings';
import { SGY, dropClasses, markEnhanced, queryAll, queryFirst } from '@/src/schoology/selectors';

/**
 * Better Materials.
 *
 * The native table is *restyled and annotated*, never rebuilt. Schoology's
 * `sCourseMaterialsFolders` module binds folder expanders, completion tracking
 * and lock behaviour to these exact rows, so a rebuilt list would look correct
 * and silently do nothing.
 *
 * What it adds is classes, nothing else: one on the table so our stylesheet can
 * give rows real hierarchy, and one per row so a material's own due sentence
 * can be styled as the value it is. Deliberately *not* a duplicated due chip --
 * a row that states its due date twice is worse than one that states it once.
 */
export const MATERIALS_CLASS = 'bs-materials';
export const MATERIAL_ROW_CLASS = 'bs-material-row';
const FEATURE_ID = 'better-materials';

export function enhanceMaterials(doc: Document, density: Density): boolean {
  const table = queryFirst<HTMLElement>(doc, SGY.materials.table);
  if (!table) return false;

  table.classList.add(MATERIALS_CLASS);
  table.classList.toggle('bs-materials--compact', density === 'compact');

  for (const row of queryAll<HTMLElement>(doc, SGY.materials.materialRow)) {
    // Folder rows are left entirely alone: Schoology's expander, its lock
    // behaviour and its completion tracking are all bound to those nodes.
    row.classList.add(MATERIAL_ROW_CLASS);
    markEnhanced(row, FEATURE_ID);
  }

  return true;
}

export function revertMaterials(doc: Document): void {
  const table = queryFirst<HTMLElement>(doc, SGY.materials.table);
  if (table) dropClasses(table, MATERIALS_CLASS, 'bs-materials--compact');

  for (const row of Array.from(doc.querySelectorAll(`.${MATERIAL_ROW_CLASS}`))) {
    dropClasses(row, MATERIAL_ROW_CLASS);
  }
}
