import { useState } from 'react'
import SongInstructor from './SongInstructor.jsx'
import './SongLibrary.css'

// The two library tabs.
const TABS = [
  { id: 'technique', label: 'תרגילי טכניקה' },
  { id: 'repertoire', label: 'רפרטואר ושירים' },
]

// Hybrid seed data. The 15 teacher recordings are LOCAL assets (isLocal: true)
// mapped to their video filenames and shown with an icon placeholder. YouTube
// songs (isLocal: false) are added at runtime and fetch a remote thumbnail.
// NOTE: the filenames below are placeholders — swap in the real recordings.
const SEED_SONGS = [
  // ── תרגילי טכניקה (Technique exercises) ──
  { id: 't1', category: 'technique', isLocal: true, file: 'PXL_20251121_084618183.mp4', title: 'מיתרים פתוחים — יציבות', subtitle: 'תרגיל בסיס' },
  { id: 't2', category: 'technique', isLocal: true, file: 'PXL_20251121_085012001.mp4', title: 'תרגיל לגאטו', subtitle: 'חיבור צלילים' },
  { id: 't3', category: 'technique', isLocal: true, file: 'PXL_20251121_085440552.mp4', title: 'תרגיל סטקאטו', subtitle: 'קשת קצרה' },
  { id: 't4', category: 'technique', isLocal: true, file: 'PXL_20251121_090015874.mp4', title: 'סולם אג׳ם / מהור', subtitle: 'רה–רה' },
  { id: 't5', category: 'technique', isLocal: true, file: 'PXL_20251121_090533210.mp4', title: 'סולם שור', subtitle: 'מי בחצי במול' },
  { id: 't6', category: 'technique', isLocal: true, file: 'PXL_20251121_091102447.mp4', title: 'תרגיל אצבעות 1–4', subtitle: 'כולל זרת' },
  { id: 't7', category: 'technique', isLocal: true, file: 'PXL_20251121_091640989.mp4', title: 'תרגיל ויברטו', subtitle: 'יד שמאל' },

  // ── רפרטואר ושירים (Repertoire & songs) ──
  { id: 'r1', category: 'repertoire', isLocal: true, file: 'PXL_20251121_092230118.mp4', title: 'סארי גלין', subtitle: 'שיר עם' },
  { id: 'r2', category: 'repertoire', isLocal: true, file: 'PXL_20251121_092815776.mp4', title: 'אוזונדרה', subtitle: 'ריקוד אזרי' },
  { id: 'r3', category: 'repertoire', isLocal: true, file: 'PXL_20251121_093401334.mp4', title: 'מוגאם שור — פתיחה', subtitle: 'אלתור' },
  { id: 'r4', category: 'repertoire', isLocal: true, file: 'PXL_20251121_093944902.mp4', title: 'רֶנְג אזרי', subtitle: 'קטע מקצבי' },
  { id: 'r5', category: 'repertoire', isLocal: true, file: 'PXL_20251121_094520561.mp4', title: 'טֶסְניף', subtitle: 'קטע שירה' },
  { id: 'r6', category: 'repertoire', isLocal: true, file: 'PXL_20251121_095103188.mp4', title: 'שיר ערש אזרי', subtitle: 'מלודיה רכה' },
  { id: 'r7', category: 'repertoire', isLocal: true, file: 'PXL_20251121_095647725.mp4', title: 'ריקוד חתונה', subtitle: 'מסורתי' },
  { id: 'r8', category: 'repertoire', isLocal: true, file: 'PXL_20251121_100230443.mp4', title: 'נעימת סיום', subtitle: 'רפרטואר' },
]

/** Extract an 11-character YouTube id from a URL (or a bare id). */
function extractYouTubeId(input) {
  const value = input.trim()
  const match = value.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/,
  )
  if (match) return match[1]
  if (/^[\w-]{11}$/.test(value)) return value // bare id pasted directly
  return null
}

/** Local recordings show a tidy video/music icon instead of a remote image. */
function LocalThumb() {
  return (
    <div className="library__thumb library__thumb--placeholder" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          fill="currentColor"
          d="M4 4h12a2 2 0 0 1 2 2v3.2l3.3-2.3a.8.8 0 0 1 1.3.65v8.9a.8.8 0 0 1-1.3.65L18 14.8V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        />
      </svg>
    </div>
  )
}

/** YouTube thumbnail with a graceful fallback if the image fails to load. */
function YouTubeThumb({ youtubeId, alt }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <LocalThumb />
  return (
    <img
      className="library__thumb"
      src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Song library with two tabs. Lists local teacher recordings and YouTube songs
 * (which can be added at runtime). Selecting any song opens the SongInstructor
 * practice view. `onBackHome` returns to the dashboard.
 */
export default function SongLibrary({ onBackHome }) {
  const [activeTab, setActiveTab] = useState('technique')
  const [songs, setSongs] = useState(SEED_SONGS)
  const [url, setUrl] = useState('')
  const [addError, setAddError] = useState(null)
  const [selectedSong, setSelectedSong] = useState(null)

  // Selecting a song launches the practice view for it.
  if (selectedSong) {
    return (
      <SongInstructor song={selectedSong} onExit={() => setSelectedSong(null)} />
    )
  }

  const items = songs.filter((s) => s.category === activeTab)

  function handleAdd(event) {
    event.preventDefault()
    const youtubeId = extractYouTubeId(url)
    if (!youtubeId) {
      setAddError('כתובת יוטיוב לא תקינה')
      return
    }
    const newSong = {
      id: `yt-${youtubeId}-${Date.now()}`,
      category: 'repertoire',
      isLocal: false,
      youtubeId,
      title: 'שיר מיוטיוב',
      subtitle: youtubeId,
    }
    setSongs((prev) => [...prev, newSong])
    setUrl('')
    setAddError(null)
  }

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

      {activeTab === 'repertoire' && (
        <form className="library__add" onSubmit={handleAdd} dir="rtl" lang="he">
          <input
            className="library__add-input"
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="הדביקו כתובת יוטיוב"
          />
          <button type="submit" className="library__add-button">
            הוסף שיר מיוטיוב
          </button>
          {addError && <span className="library__add-error">{addError}</span>}
        </form>
      )}

      <ul className="library__list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="library__card"
              onClick={() => setSelectedSong(item)}
            >
              {item.isLocal ? (
                <LocalThumb />
              ) : (
                <YouTubeThumb youtubeId={item.youtubeId} alt={item.title} />
              )}
              <div className="library__card-body" dir="rtl" lang="he">
                <span className="library__card-title">{item.title}</span>
                <span className="library__card-sub">{item.subtitle}</span>
              </div>
              <span className="library__card-status">
                {item.isLocal ? 'מקומי' : 'יוטיוב'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
