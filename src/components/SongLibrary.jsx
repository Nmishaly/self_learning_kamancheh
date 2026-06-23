import { useState } from 'react'
import SongInstructor from './SongInstructor.jsx'
import { MAQAM_OPTIONS, DEFAULT_MAQAM } from '../data/maqams.js'
import { decodeAndAnalyze } from '../audio/analyzeAudio.js'
import './SongLibrary.css'

// The two library tabs.
const TABS = [
  { id: 'technique', label: 'תרגילי טכניקה' },
  { id: 'repertoire', label: 'רפרטואר ושירים' },
]

// Hybrid seed data. The 15 teacher recordings are LOCAL assets (isLocal: true)
// mapped to their video filenames and shown with an icon placeholder. YouTube
// songs (isLocal: false) are added at runtime and fetch a remote thumbnail.
// Every song carries a `maqam` (defaults to Ajam) used by the player.
// NOTE: the filenames below are placeholders — swap in the real recordings.
const SEED_SONGS = [
  // ── תרגילי טכניקה (Technique exercises) ──
  { id: 't1', category: 'technique', isLocal: true, file: 'PXL_20251121_084618183.mp4', title: 'מיתרים פתוחים — יציבות', subtitle: 'תרגיל בסיס', maqam: 'ajam' },
  { id: 't2', category: 'technique', isLocal: true, file: 'PXL_20251121_085012001.mp4', title: 'תרגיל לגאטו', subtitle: 'חיבור צלילים', maqam: 'ajam' },
  { id: 't3', category: 'technique', isLocal: true, file: 'PXL_20251121_085440552.mp4', title: 'תרגיל סטקאטו', subtitle: 'קשת קצרה', maqam: 'ajam' },
  { id: 't4', category: 'technique', isLocal: true, file: 'PXL_20251121_090015874.mp4', title: 'סולם אג׳ם / מהור', subtitle: 'רה–רה', maqam: 'ajam' },
  { id: 't5', category: 'technique', isLocal: true, file: 'PXL_20251121_090533210.mp4', title: 'סולם שור', subtitle: 'מי בחצי במול', maqam: 'shur' },
  { id: 't6', category: 'technique', isLocal: true, file: 'PXL_20251121_091102447.mp4', title: 'תרגיל אצבעות 1–4', subtitle: 'כולל זרת', maqam: 'ajam' },
  { id: 't7', category: 'technique', isLocal: true, file: 'PXL_20251121_091640989.mp4', title: 'תרגיל ויברטו', subtitle: 'יד שמאל', maqam: 'ajam' },

  // ── רפרטואר ושירים (Repertoire & songs) ──
  { id: 'r1', category: 'repertoire', isLocal: true, file: 'PXL_20251121_092230118.mp4', title: 'סארי גלין', subtitle: 'שיר עם', maqam: 'shur' },
  { id: 'r2', category: 'repertoire', isLocal: true, file: 'PXL_20251121_092815776.mp4', title: 'אוזונדרה', subtitle: 'ריקוד אזרי', maqam: 'ajam' },
  { id: 'r3', category: 'repertoire', isLocal: true, file: 'PXL_20251121_093401334.mp4', title: 'מוגאם שור — פתיחה', subtitle: 'אלתור', maqam: 'shur' },
  { id: 'r4', category: 'repertoire', isLocal: true, file: 'PXL_20251121_093944902.mp4', title: 'רֶנְג אזרי', subtitle: 'קטע מקצבי', maqam: 'rast' },
  { id: 'r5', category: 'repertoire', isLocal: true, file: 'PXL_20251121_094520561.mp4', title: 'טֶסְניף', subtitle: 'קטע שירה', maqam: 'ajam' },
  { id: 'r6', category: 'repertoire', isLocal: true, file: 'PXL_20251121_095103188.mp4', title: 'שיר ערש אזרי', subtitle: 'מלודיה רכה', maqam: 'shur' },
  { id: 'r7', category: 'repertoire', isLocal: true, file: 'PXL_20251121_095647725.mp4', title: 'ריקוד חתונה', subtitle: 'מסורתי', maqam: 'rast' },
  { id: 'r8', category: 'repertoire', isLocal: true, file: 'PXL_20251121_100230443.mp4', title: 'נעימת סיום', subtitle: 'רפרטואר', maqam: 'ajam' },
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

/** Local recordings show a tidy video icon instead of a remote image. */
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
 * (added at runtime). Each card has a maqam dropdown; selecting a card opens the
 * SongInstructor player. `onBackHome` returns to the dashboard.
 */
export default function SongLibrary({ onBackHome }) {
  const [activeTab, setActiveTab] = useState('technique')
  const [songs, setSongs] = useState(SEED_SONGS)
  const [url, setUrl] = useState('')
  const [addError, setAddError] = useState(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [selectedSong, setSelectedSong] = useState(null)

  // Selecting a song launches the player for it.
  if (selectedSong) {
    return (
      <SongInstructor song={selectedSong} onExit={() => setSelectedSong(null)} />
    )
  }

  const items = songs.filter((s) => s.category === activeTab)

  async function handleAdd(event) {
    event.preventDefault()
    const youtubeId = extractYouTubeId(url)
    if (!youtubeId) {
      setAddError('כתובת יוטיוב לא תקינה')
      return
    }

    setIsAdding(true)
    setAddError(null)

    // Best-effort: fetch the real video title from YouTube's oEmbed endpoint.
    let title = 'שיר מיוטיוב'
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${youtubeId}`,
      )
      if (oembed.ok) {
        const data = await oembed.json()
        if (data.title) title = data.title
      }
    } catch {
      // Title is optional — fall back to the default.
    }

    const maqam = DEFAULT_MAQAM // new YouTube songs default to the Ajam scale

    // Ask the local backend (Claude) to translate the song into timed phrases.
    let notes = null
    try {
      const response = await fetch('/api/translate-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, maqam }),
      })
      if (response.ok) {
        const data = await response.json()
        notes = data.notes
      } else {
        setAddError('התרגום נכשל — השיר נוסף ללא תווים')
      }
    } catch {
      setAddError('אין חיבור לשרת — השיר נוסף ללא תווים')
    }

    const newSong = {
      id: `yt-${youtubeId}-${Date.now()}`,
      category: 'repertoire',
      isLocal: false,
      youtubeId,
      title,
      subtitle: youtubeId,
      maqam,
      notes, // generated phrase array, or null if the backend was unavailable
    }
    setSongs((prev) => [...prev, newSong])
    setUrl('')
    setIsAdding(false)
  }

  // Analyze a local audio file entirely in the browser (no server round-trip):
  // decode it, run onset/beat/pitch detection, and store the resulting notes.
  async function handleFile(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = '' // allow re-selecting the same file later
    if (!file) return

    setIsAnalyzing(true)
    setUploadError(null)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const { bpm, notes } = await decodeAndAnalyze(arrayBuffer)
      if (!notes || notes.length === 0) {
        setUploadError('לא זוהו תווים בקובץ')
        return
      }
      const newSong = {
        id: `file-${Date.now()}`,
        category: 'repertoire',
        isLocal: false,
        source: 'upload',
        youtubeId: '',
        title: file.name.replace(/\.[^.]+$/, ''),
        subtitle: `${notes.length} תווים · ${bpm} BPM`,
        maqam: DEFAULT_MAQAM,
        bpm,
        notes,
      }
      setSongs((prev) => [...prev, newSong])
      setActiveTab('repertoire')
    } catch {
      setUploadError('לא ניתן לנתח את הקובץ — נסו קובץ שמע אחר')
    } finally {
      setIsAnalyzing(false)
    }
  }

  function updateMaqam(id, maqam) {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, maqam } : s)))
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
            disabled={isAdding}
          />
          <button type="submit" className="library__add-button" disabled={isAdding}>
            {isAdding ? 'מתרגם…' : 'הוסף שיר מיוטיוב'}
          </button>
          {addError && <span className="library__add-error">{addError}</span>}
        </form>
      )}

      {activeTab === 'repertoire' && (
        <div className="library__upload" dir="rtl" lang="he">
          <label
            className={`library__upload-button ${isAnalyzing ? 'is-busy' : ''}`}
          >
            {isAnalyzing ? 'מנתח שמע…' : '📂 העלאת קובץ שמע'}
            <input
              type="file"
              accept="audio/*"
              className="library__upload-input"
              onChange={handleFile}
              disabled={isAnalyzing}
            />
          </label>
          {uploadError && (
            <span className="library__add-error">{uploadError}</span>
          )}
        </div>
      )}

      <ul className="library__list">
        {items.map((item) => (
          <li key={item.id} className="library__card">
            <button
              type="button"
              className="library__card-main"
              onClick={() => setSelectedSong(item)}
            >
              {item.youtubeId ? (
                <YouTubeThumb youtubeId={item.youtubeId} alt={item.title} />
              ) : (
                <LocalThumb />
              )}
              <div className="library__card-body" dir="rtl" lang="he">
                <span className="library__card-title">{item.title}</span>
                <span className="library__card-sub">{item.subtitle}</span>
              </div>
              <span className="library__card-status">
                {item.source === 'upload'
                  ? 'שמע'
                  : item.isLocal
                    ? 'מקומי'
                    : 'יוטיוב'}
              </span>
            </button>

            {/* Maqam dropdown — change the scale used by the player. */}
            <label className="library__maqam" dir="rtl" lang="he">
              <span className="library__maqam-label">מקאם</span>
              <select
                className="library__maqam-select"
                value={item.maqam}
                onChange={(e) => updateMaqam(item.id, e.target.value)}
              >
                {MAQAM_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
