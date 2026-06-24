import './ConfirmDialog.css'

/**
 * A styled, on-brand confirmation modal (replaces window.confirm so the app
 * never shows raw browser chrome to a non-technical user). Hebrew RTL.
 *
 * Props:
 *   open        – whether the dialog is visible.
 *   title       – bold heading.
 *   message     – supporting line.
 *   confirmLabel / cancelLabel – button text.
 *   danger      – style the confirm button as destructive.
 *   onConfirm / onCancel – callbacks.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div className="confirm__backdrop" onClick={onCancel}>
      <div
        className="confirm__dialog"
        dir="rtl"
        lang="he"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="confirm__title">{title}</h2>}
        {message && <p className="confirm__message">{message}</p>}
        <div className="confirm__actions">
          <button
            type="button"
            className="confirm__btn confirm__btn--ghost"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm__btn ${danger ? 'confirm__btn--danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
