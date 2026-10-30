import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import {
  historyInitialization,
  workspaceHistoryEvent,
  type WorkspaceHistoryIntent,
} from './history-guard';

function browserHistory(index = 1) {
  const window = new EventTarget(),
    navigation = new EventTarget(),
    entries = ['people?q=retained', 'projects/new', 'account'].map(
      (path, entry) => ({
        path: '/en/admin/university/' + path,
        state: { __NA: true, tree: { entry } },
      }),
    ),
    location = { pathname: '', search: '', hash: '' },
    tasks: (() => void)[] = [];
  let position = index;
  const updateLocation = () => {
    const url = new URL(entries[position]!.path, 'https://example.test');
    location.pathname = url.pathname;
    location.search = url.search;
  };
  updateLocation();
  Object.defineProperty(navigation, 'currentEntry', {
    get: () => ({ index: position }),
  });
  Object.defineProperty(window, 'navigation', { value: navigation });
  const traverse = (destination: number) => {
    const event = new Event('navigate');
    Object.defineProperties(event, {
      navigationType: { value: 'traverse' },
      destination: { value: { index: destination } },
    });
    navigation.dispatchEvent(event);
    position = destination;
    updateLocation();
    const native = new Event('popstate');
    Object.defineProperty(native, 'state', {
      value: entries[position]!.state,
    });
    window.dispatchEvent(native);
  };
  const history = {
    go: (delta: number) => tasks.push(() => traverse(position + delta)),
  };
  const flush = () => {
    while (tasks.length) tasks.shift()!();
  };
  const initialize = () =>
    runInNewContext(historyInitialization, {
      window,
      location,
      history,
      CustomEvent,
    });
  return {
    window,
    entries,
    location,
    traverse,
    flush,
    initialize,
    position: () => position,
  };
}

it('an earlier history bridge lets a late mounted dirty guard stop framework restoration before its record unmounts', () => {
  const h = browserHistory();
  h.initialize();
  let restored = false,
    choiceShown = false,
    destination = '';
  const dirty = (event: Event) => {
    destination = (event as CustomEvent<WorkspaceHistoryIntent>).detail
      .destination;
    event.preventDefault();
    choiceShown = true;
  };
  h.window.addEventListener('popstate', () => {
    restored = true;
    h.window.removeEventListener(workspaceHistoryEvent, dirty);
  });
  h.window.addEventListener(workspaceHistoryEvent, dirty);
  h.traverse(0);
  h.flush();
  expect(choiceShown).toBe(true);
  expect(restored).toBe(false);
  expect(destination).toBe('/en/admin/university/people?q=retained');
  expect(h.position()).toBe(1);
});

it('blocked Back from an intermediate entry preserves its original Forward entry and replays traversal after discard', async () => {
  const h = browserHistory();
  h.initialize();
  const original = structuredClone(h.entries);
  let intent: WorkspaceHistoryIntent | undefined;
  const dirty = (event: Event) => {
    intent = (event as CustomEvent<WorkspaceHistoryIntent>).detail;
    event.preventDefault();
  };
  h.window.addEventListener(workspaceHistoryEvent, dirty);
  h.traverse(0);
  h.flush();
  expect(h.position()).toBe(1);
  expect(h.entries).toEqual(original);
  // Stay makes no history write; the existing C remains reachable by Forward.
  h.traverse(2);
  h.flush();
  expect(h.position()).toBe(1);
  h.window.removeEventListener(workspaceHistoryEvent, dirty);
  await intent!.resume();
  h.flush();
  expect(h.position()).toBe(2);
  h.traverse(1);
  expect(h.position()).toBe(1);
  expect(h.entries).toEqual(original);
});

it('one bridge per document preserves unblocked Back and Forward without changing framework state', () => {
  const h = browserHistory();
  h.initialize();
  h.initialize();
  const original = structuredClone(h.entries);
  let intents = 0,
    restored = 0;
  h.window.addEventListener(workspaceHistoryEvent, () => intents++);
  h.window.addEventListener('popstate', () => restored++);
  h.traverse(0);
  h.traverse(1);
  expect(intents).toBe(2);
  expect(restored).toBe(2);
  expect(h.entries).toEqual(original);
});

it('the bounded fallback adds only its entry index and retains opaque push/replace state and Forward history', async () => {
  const window = new EventTarget(),
    location = {
      href: 'https://example.test/A',
      pathname: '/A',
      search: '',
      hash: '',
    },
    entries = [{ state: { opaque: { page: 'A' } }, url: '/A' }],
    tasks: (() => void)[] = [];
  let position = 0;
  const history = {
    get state() {
      return entries[position]!.state;
    },
    pushState(
      state: (typeof entries)[0]['state'],
      _title: string,
      url: string,
    ) {
      entries.splice(position + 1);
      entries.push({ state, url });
      position++;
    },
    replaceState(
      state: (typeof entries)[0]['state'],
      _title: string,
      url: string,
    ) {
      entries[position] = { state, url };
    },
    go(delta: number) {
      tasks.push(() => {
        position += delta;
        location.pathname = entries[position]!.url;
        const event = new Event('popstate');
        Object.defineProperty(event, 'state', { value: history.state });
        window.dispatchEvent(event);
      });
    },
  };
  runInNewContext(historyInitialization, {
    window,
    location,
    history,
    CustomEvent,
    Object,
  });
  const b = { opaque: { page: 'B' } },
    c = { opaque: { page: 'C' } };
  history.pushState(b, '', '/B');
  history.pushState(c, '', '/C');
  const flush = () => {
    while (tasks.length) tasks.shift()!();
  };
  history.go(-1);
  flush();
  let intent: WorkspaceHistoryIntent | undefined;
  const dirty = (event: Event) => {
    intent = (event as CustomEvent<WorkspaceHistoryIntent>).detail;
    event.preventDefault();
  };
  window.addEventListener(workspaceHistoryEvent, dirty);
  history.go(-1);
  flush();
  expect(position).toBe(1);
  expect(entries).toHaveLength(3);
  expect(b).toEqual({ opaque: { page: 'B' } });
  expect(c).toEqual({ opaque: { page: 'C' } });
  expect(history.state.opaque).toEqual(b.opaque);
  history.go(1);
  flush();
  window.removeEventListener(workspaceHistoryEvent, dirty);
  await intent!.resume();
  flush();
  expect(position).toBe(2);
  expect(history.state.opaque).toEqual(c.opaque);
  expect(entries).toHaveLength(3);
  const unrelatedState = new Date('2026-10-13T00:00:00Z');
  history.replaceState(unrelatedState as never, '', '/C');
  expect(history.state).toBe(unrelatedState);
});
