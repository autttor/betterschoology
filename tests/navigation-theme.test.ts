import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/src/storage/defaults';
import { getDisplayName, navigationEnhancement } from '@/src/features/navigation';
import { readHeaderDisplayName, readNavigationLabels } from '@/src/schoology/adapters/navigation';
import { resolveRoute } from '@/src/schoology/router';
import type { EnhancementContext } from '@/src/schoology/lifecycle';
import { loadFixtureAtRoute } from './helpers/fixtures';

function setup(document = new JSDOM(readFileSync(resolve(import.meta.dirname,
  'fixtures/schoology/fragments/navigation-polish.html'), 'utf8'),
{ url: 'http://localhost:4173/home' }).window.document) {
  const context: EnhancementContext = {
    document, route: resolveRoute(document.URL), state: defaultState(), requestPass: vi.fn(),
  };
  return { context, document, apply: () => navigationEnhancement.apply(context) };
}

describe('safe native header customization', () => {
  it('parses captured navigation using semantic attributes and native paths', () => {
    const { document } = loadFixtureAtRoute('home');
    expect(readNavigationLabels(document).map((item) => item.key))
      .toEqual(['courses', 'groups', 'resources', 'gradeReport']);
    expect(readHeaderDisplayName(document)?.node.data).toBe('Test Student');
  });

  it('renames Courses in the existing text node, preserves native handlers, and resets', () => {
    const { context, document, apply } = setup();
    const courses = readNavigationLabels(document)[0]!;
    const click = vi.fn();
    courses.element.addEventListener('click', click);
    context.state.settings.navLabels.courses = 'Classes';
    apply();
    apply();
    expect(courses.node.data).toBe('Classes');
    expect(courses.element.querySelector('span')?.firstChild).toBe(courses.node);
    courses.element.click();
    expect(click).toHaveBeenCalledTimes(1);
    context.state.settings.navLabels = {};
    apply();
    expect(courses.node.data).toBe('Courses');
    courses.element.click();
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('keeps original resource and grades hrefs and restores every label on disable', () => {
    const { context, document, apply } = setup();
    const labels = readNavigationLabels(document);
    const links = labels.map(({ element }) => element.getAttribute('href'));
    context.state.settings.navLabels = {
      courses: 'Classes', groups: 'Clubs', resources: 'Stuff', gradeReport: 'Grades',
    };
    apply();
    expect(labels.map(({ node }) => node.data)).toEqual(['Classes', 'Clubs', 'Stuff', 'Grades']);
    expect(labels.map(({ element }) => element.getAttribute('href'))).toEqual(links);
    navigationEnhancement.revert?.(context);
    expect(labels.map(({ node }) => node.data)).toEqual(['Courses', 'Groups', 'Resources', 'Grade Report']);
  });

  it('uses the override in owned UI by default, and only changes the account on opt-in', () => {
    const { context, document, apply } = setup();
    const account = readHeaderDisplayName(document)!;
    const originalNode = account.node;
    document.body.insertAdjacentHTML('beforeend', '<form><input value="Test Student"></form><article>Test Student</article>');
    context.state.settings.displayNameOverride = ' Alex ';
    apply();
    expect(account.node.data).toBe('Test Student');
    expect(getDisplayName(document, context.state.settings.displayNameOverride)).toBe('Alex');
    context.state.settings.applyDisplayNameToSchoologyHeader = true;
    apply();
    expect(account.node.data).toBe('Alex');
    expect(readHeaderDisplayName(document)?.node).toBe(originalNode);
    expect(document.querySelector('a[href="/user/300001"]')?.getAttribute('href')).toBe('/user/300001');
    expect(document.querySelector('input')?.value).toBe('Test Student');
    expect(document.querySelector('article')?.textContent).toBe('Test Student');
    expect(getDisplayName(document)).toBe('Test');
    context.state.settings.applyDisplayNameToSchoologyHeader = false;
    apply();
    expect(account.node.data).toBe('Test Student');
  });

  it('falls back to the native first name and returns undefined if no name is safely available', () => {
    const { document } = setup();
    expect(getDisplayName(document)).toBe('Test');
    expect(getDisplayName(document, '   ')).toBe('Test');
    readHeaderDisplayName(document)!.element.remove();
    expect(getDisplayName(document)).toBeUndefined();
  });

  it('does not replace a multi-label account control or a Schoology-updated value on revert', () => {
    const { context, document, apply } = setup();
    const account = readHeaderDisplayName(document)!;
    context.state.settings.displayNameOverride = 'Alex';
    context.state.settings.applyDisplayNameToSchoologyHeader = true;
    apply();
    account.node.data = 'A newly switched account';
    navigationEnhancement.revert?.(context);
    expect(account.node.data).toBe('A newly switched account');
    account.element.append(document.createTextNode('Account options'));
    expect(readHeaderDisplayName(document)).toBeNull();
  });

  it('marks only popovers explicitly owned by header triggers, then removes its marker', () => {
    const { context, document, apply } = setup();
    document.body.insertAdjacentHTML('beforeend', '<div id="unrelated" role="dialog">Editor</div>');
    apply();
    expect(document.getElementById('fixture-courses-menu')?.hasAttribute('data-bs-native-nav-popover')).toBe(true);
    expect(document.getElementById('unrelated')?.hasAttribute('data-bs-native-nav-popover')).toBe(false);
    navigationEnhancement.revert?.(context);
    expect(document.querySelector('[data-bs-native-nav-popover]')).toBeNull();
  });
});
