import { useState } from 'react'
import './SongLibrary.css'

// The two library tabs.
const TABS = [
  { id: 'technique', label: 'תרגילי טכניקה' },
  { id: 'repertoire', label: 'רפרטואר ושירים' },
]

// Seed data: 15 placeholder slots for the teacher's videos, split across the
// two tabs. `youtubeId` is left empty until the real video ids are added — the
// thumbnail URL is built as https://img.youtube.com/vi/{youtubeId}/mqdefault.jpg
// and falls back to a placeholder while ids are missing.
const VIDEOS = [
  // ── תרגילי טכניקה (Technique exercises) ──
  { id: 't1', category: 'technique', youtubeId: '', title: 'מיתרים פתוחים — יציבות', subtitle: 'תרגיל בסיס' },
  { id: 't2', category: 'technique', youtubeId: '', title: 'תרגיל לגאטו', subtitle: 'חיבור צלילים' },
  { id: 't3', category: 'technique', youtubeId: '', title: 'תרגיל סטקאטו', subtitle: 'קשת קצרה' },
  { id: 't4', category: 'technique', youtubeId: '', title: 'סולם אג׳ם / מהור', subtitle: 'רה–רה' },
  { id: 't5', category: 'technique', youtubeId: '', title: 'סולם שור', subtitle: 'מי בחצי במול' },
  { id: 't6', category: 'technique', youtubeId: '', title: 'תרגיל אצבעות 1–4', subtitle: 'כולל זרת' },
  { id: 't7', category: 'technique', youtubeId: '', title: 'תרגיל ויברטו', subtitle: 'יד שמאל' },

  // ── רפרטואר ושירים (Repertoire & songs) ──
  { id: 'r1', category: 'repertoire', youtubeId: '', title: 'סארי גלין', subtitle: 'שיר עם' },
  { id: 'r2', category: 'repertoire', youtubeId: '', title: 'אוזונדרה', subtitle: 'ריקוד אזרי' },
  { id: 'r3', category: 'repertoire', youtubeId: '', title: 'מוגאם שור — פתיחה', subtitle: 'אלתור' },
  { id: 'r4', category: 'repertoire', youtubeId: '', title: 'רֶנְג אזרי', subtitle: 'קטע מקצבי' },
  { id: 'r5', category: 'repertoire', youtubeId: '', title: 'טֶסְניף', subtitle: 'קטע שירה' },
  { id: 'r6', category: 'repertoire', youtubeId: '', title: 'שיר ערש אזרי', subtitle: 'מלודיה רכה' },
  { id: 'r7', category: 'repertoire', youtubeId: '', title: 'ריקוד חתונה', subtitle: 'מסורתי' },
  { id: 'r8', category: 'repertoire', youtubeId: '', title: 'נעימת סיום', subtitle: 'רפרטואר' },
]

function thumbnailUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null
}

/** Thumbnail with a graceful fallback while the real video id is missing. */
function Thumbnail({ youtubeId, alt }) {
  const [failed, setFailed] = useState(false)
  const url = thumbnailUrl(youtubeId)

  if (!url || failed) {
    return (
      <div className="library__thumb library__thumb--placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path
            fill="currentColor"
            d="M9 17.5a3 3 0 1 1-2-2.83V5a1 1 0 0 1 .76-.97l9-2.25A1 1 0 0 1 18 2.75V15.5a3 3 0 1 1-2-2.83V8.78l-7 1.75v6.97Z"
          />
        </svg>
      </div>
    )
  }

  return (
    <img
      className="library__thumb"
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Song library with two tabs (technique exercises / repertoire) listing the
 * teacher's videos as wide row cards. `onBackHome` returns to the dashboard.
 */
export default function SongLibrary({ onBackHome }) {
  const [activeTab, setActiveTab] = useState('technique')
  const items = VIDEOS.filter((v) => v.category === activeTab)

  return (
    <section className="library">
      <header className="library__topbar">
        <button type="button" className="library__home" onClick={onBackHome}>
          <span dir="rtl" lang="he">
            ← חזרה למסך הבית
          </span>
        </button>
        <h1 className="library__title" dir="rtl" lang="he">
          ספריית שירים
        </h1>
      </header>

      <div className="library__tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`library__tab ${activeTab === tab.id ? 'library__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            dir="rtl"
            lang="he"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ul className="library__list">
        {items.map((item) => {
          const hasVideo = Boolean(item.youtubeId)
          const CardTag = hasVideo ? 'a' : 'div'
          const linkProps = hasVideo
            ? {
                href: `https://www.youtube.com/watch?v=${item.youtubeId}`,
                target: '_blank',
                rel: 'noopener noreferrer',
              }
            : {}
          return (
            <li key={item.id}>
              <CardTag
                className={`library__card ${hasVideo ? '' : 'library__card--pending'}`}
                {...linkProps}
              >
                <Thumbnail youtubeId={item.youtubeId} alt={item.title} />
                <div className="library__card-body" dir="rtl" lang="he">
                  <span className="library__card-title">{item.title}</span>
                  <span className="library__card-sub">{item.subtitle}</span>
                </div>
                <span className="library__card-status">
                  {hasVideo ? '▶' : 'בקרוב'}
                </span>
              </CardTag>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
