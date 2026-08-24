/**
 * Detect Shift+= / Numpad+ / literal "+" for page "add" hotkeys.
 * Ignores Ctrl/Cmd/Alt combos.
 */
export function isPlusHotkey(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return false
  if (e.key === '+') return true
  if (e.code === 'NumpadAdd') return true
  if (e.key === '=' && e.shiftKey) return true
  if (e.code === 'Equal' && e.shiftKey) return true
  return false
}

/** True when focus is in a field where "+" should type, not trigger add. */
export function isTypingTarget(el = document.activeElement) {
  if (!el) return false
  const tag = (el.tagName || '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}
