// Tiny dependency-free toast store. Any component can call `showToast(...)`;
// a single <Toaster /> (rendered once in App) subscribes and displays them.
// Keeps user-facing feedback consistent and on-brand instead of raw alert()s.

const listeners = new Set()
let toasts = []
let nextId = 0

function emit() {
  for (const fn of listeners) fn(toasts)
}

/**
 * Show a toast. `type` is one of 'info' | 'success' | 'error'.
 * Returns the toast id (so it can be dismissed early).
 */
export function showToast(message, type = 'info', duration = 3600) {
  const id = ++nextId
  toasts = [...toasts, { id, message, type }]
  emit()
  if (duration) setTimeout(() => dismissToast(id), duration)
  return id
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function getToasts() {
  return toasts
}

export function subscribeToasts(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
