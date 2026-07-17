// @vitest-environment jsdom

import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RepoExplorer } from './RepoExplorer.js';

describe('RepoExplorer JSON inspector', () => {
  let compactLayoutMatches = false;
  let container: HTMLDivElement;
  let mediaQueryChangeListener: EventListener | null = null;
  let root: Root;

  beforeEach(() => {
    compactLayoutMatches = false;
    mediaQueryChangeListener = null;
    container = document.createElement('div');
    container.style.height = '800px';
    container.style.width = '1400px';
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(700);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return compactLayoutMatches;
        },
        media: query,
        onchange: null,
        addEventListener: (eventName: string, listener: EventListener) => {
          if (eventName === 'change') {
            mediaQueryChangeListener = listener;
          }
        },
        removeEventListener: (eventName: string, listener: EventListener) => {
          if (eventName === 'change' && mediaQueryChangeListener === listener) {
            mediaQueryChangeListener = null;
          }
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      })),
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {
          return undefined;
        }

        unobserve() {
          return undefined;
        }

        disconnect() {
          return undefined;
        }
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);

        if (url === '/api/repos/AccountRepo') {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  repoType: 'AccountRepo',
                  repoName: 'acct_1/user',
                  tableNames: ['commands', 'metadata'],
                },
              ]),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        }

        if (url === '/api/repos/AccountRepo/acct_1%2Fuser/commands') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                columns: [
                  {
                    name: 'serializedJson',
                    type: 'text',
                    isPrimaryKey: false,
                  },
                  {
                    name: 'decodedJson',
                    type: 'json',
                    isPrimaryKey: false,
                  },
                  {
                    name: 'invalidJson',
                    type: 'text',
                    isPrimaryKey: false,
                  },
                  {
                    name: 'jsonPrimitive',
                    type: 'text',
                    isPrimaryKey: false,
                  },
                  {
                    name: 'numberPrimitive',
                    type: 'integer',
                    isPrimaryKey: false,
                  },
                ],
                rows: [
                  {
                    serializedJson: '{"nested":{"value":1},"items":["first"]}',
                    decodedJson: { alreadyDecoded: { value: 2 } },
                    invalidJson: '{not-json',
                    jsonPrimitive: '42',
                    numberPrimitive: 7,
                  },
                  {
                    serializedJson: '[{"serializedArray":true}]',
                    decodedJson: [{ decodedArray: true }],
                    invalidJson: 'still-not-json',
                    jsonPrimitive: 'null',
                    numberPrimitive: 8,
                  },
                ],
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        }

        if (url === '/api/repos/AccountRepo/acct_1%2Fuser/metadata') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                columns: [
                  {
                    name: 'name',
                    type: 'text',
                    isPrimaryKey: true,
                  },
                ],
                rows: [{ name: 'account' }],
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({ error: `Unexpected URL: ${url}` }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }),
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens only object and array JSON, replaces and clears the selection, and expands nested nodes', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: <RepoExplorer />,
        },
      ],
      { initialEntries: ['/AccountRepo/acct_1%2Fuser'] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    const commandsButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        '[data-table-name="commands"]',
      );
      expect(button).not.toBeNull();
      return button;
    });

    await act(async () => {
      commandsButton?.click();
      await Promise.resolve();
    });

    const serializedObjectButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        '[aria-label="Inspect row 1 serializedJson JSON"]',
      );
      expect(button).not.toBeNull();
      return button;
    });

    expect(
      container.querySelector('[aria-label="Inspect row 1 invalidJson JSON"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[aria-label="Inspect row 1 jsonPrimitive JSON"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[aria-label="Inspect row 1 numberPrimitive JSON"]',
      ),
    ).toBeNull();

    await act(async () => {
      serializedObjectButton?.click();
      await Promise.resolve();
    });

    const serializedObjectView = await vi.waitFor(() => {
      const view = container.querySelector<HTMLElement>(
        '[aria-label="JSON for row 1 serializedJson"]',
      );
      expect(view).not.toBeNull();
      expect(container.textContent).toContain('serializedJson');
      expect(container.textContent).toContain('Row 1');
      return view;
    });
    const selectedSerializedObjectButton =
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Inspect row 1 serializedJson JSON"]',
      );
    expect(
      selectedSerializedObjectButton?.closest('td')?.getAttribute('data-state'),
    ).toBe('selected');
    expect(serializedObjectView?.textContent).not.toContain('value');

    const nestedExpandButton = serializedObjectView?.querySelector<HTMLElement>(
      '[aria-label="expand JSON"]',
    );
    expect(nestedExpandButton).not.toBeNull();
    await act(async () => {
      nestedExpandButton?.click();
      await Promise.resolve();
    });
    expect(serializedObjectView?.textContent).toContain('value');

    const decodedObjectButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Inspect row 1 decodedJson JSON"]',
    );
    expect(decodedObjectButton).not.toBeNull();
    await act(async () => {
      decodedObjectButton?.click();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[aria-label="JSON for row 1 decodedJson"]'),
    ).not.toBeNull();
    expect(
      selectedSerializedObjectButton?.closest('td')?.getAttribute('data-state'),
    ).toBeNull();
    expect(decodedObjectButton?.closest('td')?.getAttribute('data-state')).toBe(
      'selected',
    );

    const serializedArrayButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Inspect row 2 serializedJson JSON"]',
    );
    expect(serializedArrayButton).not.toBeNull();
    await act(async () => {
      serializedArrayButton?.click();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[aria-label="JSON for row 2 serializedJson"]'),
    ).not.toBeNull();

    const decodedArrayButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Inspect row 2 decodedJson JSON"]',
    );
    expect(decodedArrayButton).not.toBeNull();
    await act(async () => {
      decodedArrayButton?.click();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[aria-label="JSON for row 2 decodedJson"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Row 2');

    const closeButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Close JSON inspector"]',
    );
    expect(closeButton).not.toBeNull();
    await act(async () => {
      closeButton?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[aria-label^="JSON for row"]')).toBeNull();
    expect(container.querySelector('[role="separator"]')).toBeNull();

    const serializedObjectButtonAfterClose =
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Inspect row 1 serializedJson JSON"]',
      );
    expect(serializedObjectButtonAfterClose).not.toBeNull();
    await act(async () => {
      serializedObjectButtonAfterClose?.click();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[aria-label^="JSON for row"]'),
    ).not.toBeNull();

    const refreshButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Refresh table"]',
    );
    expect(refreshButton).not.toBeNull();
    await act(async () => {
      refreshButton?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[aria-label^="JSON for row"]')).toBeNull();

    const refreshedSerializedObjectButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        '[aria-label="Inspect row 1 serializedJson JSON"]',
      );
      expect(button).not.toBeNull();
      return button;
    });
    await act(async () => {
      refreshedSerializedObjectButton?.click();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[aria-label^="JSON for row"]'),
    ).not.toBeNull();

    const metadataButton = container.querySelector<HTMLButtonElement>(
      '[data-table-name="metadata"]',
    );
    expect(metadataButton).not.toBeNull();
    await act(async () => {
      metadataButton?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[aria-label^="JSON for row"]')).toBeNull();
    expect(container.querySelector('[role="separator"]')).toBeNull();
  });

  it('remounts horizontal and vertical groups with an accessible separator while preserving JSON selection', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: <RepoExplorer />,
        },
      ],
      { initialEntries: ['/AccountRepo/acct_1%2Fuser'] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    const commandsButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        '[data-table-name="commands"]',
      );
      expect(button).not.toBeNull();
      return button;
    });
    await act(async () => {
      commandsButton?.click();
      await Promise.resolve();
    });

    const jsonButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        '[aria-label="Inspect row 1 serializedJson JSON"]',
      );
      expect(button).not.toBeNull();
      return button;
    });
    await act(async () => {
      jsonButton?.click();
      await Promise.resolve();
    });

    const desktopGroup =
      container.querySelector<HTMLDivElement>('[data-group]');
    const desktopSeparator =
      container.querySelector<HTMLDivElement>('[role="separator"]');
    expect(desktopGroup?.style.flexDirection).toBe('row');
    expect(desktopGroup?.children.item(0)?.id).toBe('repo-table');
    expect(desktopGroup?.children.item(1)?.id).toBe('json-inspector-separator');
    expect(desktopGroup?.children.item(2)?.id).toBe('json-inspector');
    expect(document.getElementById('repo-table')?.style.flexGrow).toBe('65');
    expect(document.getElementById('json-inspector')?.style.flexGrow).toBe(
      '35',
    );
    expect(desktopSeparator?.getAttribute('aria-orientation')).toBe('vertical');
    expect(desktopSeparator?.tabIndex).toBe(0);
    expect(desktopSeparator?.className).toContain('cursor-col-resize');

    await act(async () => {
      desktopSeparator?.focus();
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(desktopSeparator);
    expect(desktopSeparator?.getAttribute('data-separator')).toBe('focus');

    await act(async () => {
      desktopSeparator?.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'ArrowLeft',
        }),
      );
      await Promise.resolve();
    });
    expect(desktopSeparator?.getAttribute('aria-valuenow')).not.toBeNull();

    await act(async () => {
      desktopSeparator?.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 900,
          clientY: 400,
        }),
      );
      await Promise.resolve();
    });
    expect(desktopSeparator?.className).toContain('active:bg-ring');

    compactLayoutMatches = true;
    await act(async () => {
      mediaQueryChangeListener?.(new Event('change'));
      await Promise.resolve();
    });

    const compactGroup =
      container.querySelector<HTMLDivElement>('[data-group]');
    const compactSeparator =
      container.querySelector<HTMLDivElement>('[role="separator"]');
    expect(compactGroup).not.toBe(desktopGroup);
    expect(compactGroup?.style.flexDirection).toBe('column');
    expect(compactGroup?.children.item(0)?.id).toBe('repo-table');
    expect(compactGroup?.children.item(1)?.id).toBe('json-inspector-separator');
    expect(compactGroup?.children.item(2)?.id).toBe('json-inspector');
    expect(document.getElementById('repo-table')?.style.flexGrow).toBe('60');
    expect(document.getElementById('json-inspector')?.style.flexGrow).toBe(
      '40',
    );
    expect(compactSeparator?.getAttribute('aria-orientation')).toBe(
      'horizontal',
    );
    expect(compactSeparator?.tabIndex).toBe(0);
    expect(compactSeparator?.className).toContain('cursor-row-resize');
    expect(
      container.querySelector('[aria-label="JSON for row 1 serializedJson"]'),
    ).not.toBeNull();
  });
});
