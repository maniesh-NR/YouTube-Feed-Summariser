import test from 'node:test';
import assert from 'node:assert/strict';
import { copyTextWithFallback, fallbackExecCommandCopy } from './clipboard';

function createMockDocument(execResult: boolean | (() => boolean)) {
  const appended: any[] = [];
  const removed: any[] = [];
  const mockTextarea = {
    value: '',
    attrs: {} as Record<string, string>,
    style: {} as Record<string, string>,
    selected: false,
    focused: false,
    selectionRange: [0, 0] as [number, number],
    setAttribute(name: string, val: string) {
      this.attrs[name] = val;
    },
    focus() {
      this.focused = true;
    },
    select() {
      this.selected = true;
    },
    setSelectionRange(start: number, end: number) {
      this.selectionRange = [start, end];
    },
    remove() {
      removed.push(this);
    }
  };

  return {
    appended,
    removed,
    mockTextarea,
    document: {
      activeElement: null,
      body: {
        appendChild(node: any) {
          appended.push(node);
          return node;
        }
      },
      createElement(tag: string) {
        assert.equal(tag, 'textarea');
        return mockTextarea;
      },
      execCommand(cmd: string) {
        assert.equal(cmd, 'copy');
        return typeof execResult === 'function' ? execResult() : execResult;
      }
    }
  };
}

test('copyTextWithFallback resolves cleanly when navigator.clipboard.writeText succeeds', async () => {
  let written = '';
  const mockDoc = createMockDocument(true);
  const res = await copyTextWithFallback('https://www.youtube.com/watch?v=abc123', {
    navigator: {
      clipboard: {
        writeText: async (text: string) => {
          written = text;
        }
      }
    },
    document: mockDoc.document
  });

  assert.deepEqual(res, { ok: true, method: 'clipboard' });
  assert.equal(written, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(mockDoc.appended.length, 0);
});

test('copyTextWithFallback catches NotAllowedError from writeText and falls back to execCommand copy', async () => {
  const mockDoc = createMockDocument(true);
  const res = await copyTextWithFallback('// userscript source', {
    navigator: {
      clipboard: {
        writeText: async () => {
          const err = new Error("Failed to execute 'writeText' on 'Clipboard': Write permission denied.");
          err.name = 'NotAllowedError';
          throw err;
        }
      }
    },
    document: mockDoc.document
  });

  assert.deepEqual(res, { ok: true, method: 'execCommand' });
  assert.equal(mockDoc.mockTextarea.value, '// userscript source');
  assert.equal(mockDoc.mockTextarea.selected, true);
  assert.deepEqual(mockDoc.mockTextarea.selectionRange, [0, '// userscript source'.length]);
  assert.equal(mockDoc.removed.length, 1);
});

test('copyTextWithFallback works when navigator.clipboard is missing', async () => {
  const mockDoc = createMockDocument(true);
  const res = await copyTextWithFallback('fallback text', {
    navigator: {},
    document: mockDoc.document
  });

  assert.deepEqual(res, { ok: true, method: 'execCommand' });
  assert.equal(mockDoc.mockTextarea.value, 'fallback text');
  assert.equal(mockDoc.removed.length, 1);
});

test('copyTextWithFallback never throws when both writeText and execCommand fail', async () => {
  const mockDoc = createMockDocument(() => {
    throw new Error('execCommand blocked');
  });
  const res = await copyTextWithFallback('blocked text', {
    navigator: {
      clipboard: {
        writeText: async () => {
          const err = new Error("Failed to execute 'writeText' on 'Clipboard': Write permission denied.");
          err.name = 'NotAllowedError';
          throw err;
        }
      }
    },
    document: mockDoc.document
  });

  assert.deepEqual(res, { ok: false, method: 'none' });
  assert.equal(mockDoc.removed.length, 1);
});

test('fallbackExecCommandCopy returns false gracefully without DOM', () => {
  assert.equal(fallbackExecCommandCopy('abc', {}), false);
});
