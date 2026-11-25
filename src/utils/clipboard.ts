export interface ClipboardCopyEnvironment {
  navigator?: {
    clipboard?: {
      writeText?: (text: string) => Promise<void>;
    };
  };
  document?: {
    body?: {
      appendChild: (node: any) => any;
    } | null;
    activeElement?: Element | { focus?: (options?: { preventScroll?: boolean }) => void } | null;
    createElement?: (tagName: string) => any;
    execCommand?: (commandId: string) => boolean;
    getSelection?: () => {
      rangeCount: number;
      getRangeAt: (index: number) => any;
      removeAllRanges: () => void;
      addRange: (range: any) => void;
    } | null;
  };
}

export interface ClipboardCopyResult {
  ok: boolean;
  method: 'clipboard' | 'execCommand' | 'none';
}

export function fallbackExecCommandCopy(text: string, doc?: ClipboardCopyEnvironment['document']): boolean {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!targetDoc?.createElement || !targetDoc?.body || typeof targetDoc.execCommand !== 'function') {
    return false;
  }

  let textarea: any = null;
  const previousActive = targetDoc.activeElement ?? null;
  const selection = typeof targetDoc.getSelection === 'function' ? targetDoc.getSelection() : null;
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  try {
    textarea = targetDoc.createElement('textarea');
    textarea.value = text;
    if (typeof textarea.setAttribute === 'function') {
      textarea.setAttribute('readonly', '');
      textarea.setAttribute('aria-hidden', 'true');
    }
    if (textarea.style) {
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
    }

    targetDoc.body.appendChild(textarea);

    if (typeof textarea.focus === 'function') {
      try {
        textarea.focus({ preventScroll: true });
      } catch {
        textarea.focus();
      }
    }
    if (typeof textarea.select === 'function') {
      textarea.select();
    }
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(0, text.length);
    }

    return Boolean(targetDoc.execCommand('copy'));
  } catch {
    return false;
  } finally {
    if (textarea && typeof textarea.remove === 'function') {
      try {
        textarea.remove();
      } catch {
        // Ignore cleanup failure on detached mock elements
      }
    }
    if (selection && previousRange) {
      try {
        selection.removeAllRanges();
        selection.addRange(previousRange);
      } catch {
        // Ignore selection restore failure
      }
    }
    if (previousActive && 'focus' in previousActive && typeof previousActive.focus === 'function') {
      try {
        previousActive.focus({ preventScroll: true });
      } catch {
        // Ignore focus restore failure
      }
    }
  }
}

export async function copyTextWithFallback(
  text: string,
  env?: ClipboardCopyEnvironment
): Promise<ClipboardCopyResult> {
  const targetNav = env?.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  const targetDoc = env?.document ?? (typeof document !== 'undefined' ? document : undefined);

  if (typeof targetNav?.clipboard?.writeText === 'function') {
    try {
      await targetNav.clipboard.writeText(text);
      return { ok: true, method: 'clipboard' };
    } catch {
      // Blocked by Permissions-Policy / NotAllowedError inside sandboxed iframe or expired gesture
    }
  }

  if (fallbackExecCommandCopy(text, targetDoc)) {
    return { ok: true, method: 'execCommand' };
  }

  return { ok: false, method: 'none' };
}
