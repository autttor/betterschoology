import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BetterSchoologyState } from '@/src/types/settings';
import { defaultState } from '@/src/storage/defaults';
import App from '@/entrypoints/options/App';

const mock = vi.hoisted(() => ({
  state: null as BetterSchoologyState | null,
  setSettings: vi.fn(async () => {}),
  setCustomization: vi.fn(async () => {}),
  clearCustomization: vi.fn(async () => {}),
  restoreHiddenTask: vi.fn(async () => {}),
  resetHistory: vi.fn(async () => {}),
}));

vi.mock('@/src/components/useSettings', () => ({
  useBetterSchoologyState: () => ({ ...mock, state: mock.state!, loading: false }),
}));
vi.mock('wxt/browser', () => ({ browser: { runtime: { getManifest: () => ({ version: '0.0.1' }) } } }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

function button(text: string): HTMLButtonElement {
  const match = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}

function checkbox(label: string): HTMLInputElement {
  const match = [...host.querySelectorAll('label')].find((item) =>
    (item.querySelector('.toggle__label') ?? item.querySelector('span'))?.textContent === label,
  )?.querySelector('input');
  if (!match) throw new Error(`Missing checkbox: ${label}`);
  return match;
}

async function render() {
  await act(async () => { root.render(createElement(App)); });
}

async function selectSection(label: string) {
  await act(async () => { button(label).click(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.state = defaultState();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
});

describe('customizer controls', () => {
  it('uses the local display name and makes native header replacement optional', async () => {
    mock.state!.settings.displayNameOverride = 'Alex';
    await render();
    expect(host.textContent).toContain('Your customizer, Alex');
    await selectSection('Profile');
    expect(host.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Alex');
    const headerToggle = checkbox('Use it in Schoology’s header too');
    expect(headerToggle.checked).toBe(false);
    await act(async () => { headerToggle.click(); });
    expect(mock.setSettings).toHaveBeenCalledWith({ applyDisplayNameToSchoologyHeader: true });
  });

  it('shows all nav labels and resets each override', async () => {
    mock.state!.settings.navLabels = { courses: 'Classes', groups: 'Clubs' };
    await render();
    await selectSection('Top nav');
    expect([...host.querySelectorAll<HTMLInputElement>('input')].map((input) => input.value)).toEqual(['Classes', 'Clubs', '', '']);
    await act(async () => { button('Reset labels').click(); });
    expect(mock.setSettings).toHaveBeenCalledWith({
      navLabels: { courses: undefined, groups: undefined, resources: undefined, gradeReport: undefined },
    });
  });

  it('exposes dashboard sections without requiring all of them', async () => {
    await render();
    await selectSection('Dashboard');
    expect(checkbox('To Do').checked).toBe(true);
    expect(checkbox('Notifications').checked).toBe(true);
    expect(checkbox('Recent feedback').checked).toBe(true);
    expect(checkbox('Announcements').checked).toBe(true);
    expect(checkbox('Grade summary').checked).toBe(true);
    await act(async () => { checkbox('Notifications').click(); });
    expect(mock.setSettings).toHaveBeenCalledWith({ dashboard: { showNotifications: false } });
  });

  it('reveals hidden courses and lets the student restore one', async () => {
    mock.state!.courses = { '1': { id: '1', originalName: 'Lunch', href: '/course/1', lastSeenAt: 1 } };
    mock.state!.customizations = { '1': { courseId: '1', hidden: true } };
    await render();
    await selectSection('My courses');
    expect(host.querySelector('.course')).toBeNull();
    await act(async () => { checkbox('Show hidden courses (1)').click(); });
    expect(host.querySelector('.course')?.textContent).toContain('Lunch');
    await act(async () => { checkbox('Hide from dashboard').click(); });
    expect(mock.setCustomization).toHaveBeenCalledWith('1', { hidden: undefined });
  });

  it('restores a hidden assignment by its stable identity', async () => {
    mock.state!.hiddenTasks = { 'assignment:1': { id: 'assignment:1', title: 'Lab worksheet', href: '/assignment/1' } };
    await render();
    await selectSection('Hidden assignments');
    const restore = host.querySelector<HTMLButtonElement>('[aria-label="Restore Lab worksheet"]');
    expect(restore).not.toBeNull();
    await act(async () => { restore!.click(); });
    expect(mock.restoreHiddenTask).toHaveBeenCalledWith('assignment:1');
  });

  it('shows a clean hidden assignments empty state and resets splash history', async () => {
    await render();
    await selectSection('Hidden assignments');
    expect(host.textContent).toContain('No hidden assignments.');
    await selectSection('Splash text');
    await act(async () => { button('Reset splash history').click(); });
    expect(mock.resetHistory).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Splash history cleared.');
  });
});
