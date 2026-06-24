import { useSyncExternalStore } from 'react'
import { getToasts, subscribeToasts, dismissToast } from '../ui/toast.js'
import './Toaster.css'

/**
 * Renders the active toasts in a fixed stack. Mounted once at the app root.
 * Toasts are right-aligned Hebrew messages and auto-dismiss; tapping closes one.
 */
export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts)

  if (toasts.length === 0) return null

  return (
    <div className="toaster" dir="rtl" lang="he" aria-live="polite" role="status">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast--${t.type}`}
          onClick={() => dismissToast(t.id)}
        >
          <span className="toast__icon" aria-hidden="true">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'ℹ'}
          </span>
          <span className="toast__message">{t.message}</span>
        </button>
      ))}
    </div>
  )
}
