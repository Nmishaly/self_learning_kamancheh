import './Dashboard.css'

// Inline icons keep the dependency-free, minimalist look.
function PathIcon() {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 4h8a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h8M6 4v0m12 16v0M6 2.5A1.5 1.5 0 1 0 6 5.5 1.5 1.5 0 0 0 6 2.5Zm12 16a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
      />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 17.5a3 3 0 1 1-2-2.83V5a1 1 0 0 1 .76-.97l9-2.25A1 1 0 0 1 18 2.75V15.5a3 3 0 1 1-2-2.83V8.78l-7 1.75v6.97Zm0-9.03 7-1.75V4.03L9 5.78v2.69Z"
      />
    </svg>
  )
}

/**
 * Main entry dashboard. Presents the two top-level destinations as equal
 * square cards. `onNavigate` is called with the target view id.
 */
export default function Dashboard({ onNavigate }) {
  return (
    <section className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__title" dir="rtl" lang="he">
          מורה פרטי לקמנצ'ה
        </h1>
      </header>

      <div className="dashboard__grid">
        <button
          type="button"
          className="dashboard__card"
          onClick={() => onNavigate('curriculum')}
        >
          <span className="dashboard__card-icon">
            <PathIcon />
          </span>
          <span className="dashboard__card-label" dir="rtl" lang="he">
            מערך שיעורים
          </span>
        </button>

        <button
          type="button"
          className="dashboard__card"
          onClick={() => onNavigate('library')}
        >
          <span className="dashboard__card-icon">
            <NoteIcon />
          </span>
          <span className="dashboard__card-label" dir="rtl" lang="he">
            ספריית שירים
          </span>
        </button>
      </div>
    </section>
  )
}
