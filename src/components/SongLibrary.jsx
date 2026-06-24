import { useState } from 'react'
import SongInstructor from './SongInstructor.jsx'
import VideoLesson from './VideoLesson.jsx'
import { MAQAM_OPTIONS, DEFAULT_MAQAM } from '../data/maqams.js'
import { decodeAndAnalyze } from '../audio/analyzeAudio.js'
import { showToast } from '../ui/toast.js'
import './SongLibrary.css'

// The two library tabs.
const TABS = [
  { id: 'technique', label: 'תרגילי טכניקה' },
  { id: 'repertoire', label: 'רפרטואר ושירים' },
]

// Reject files larger than this to avoid very long in-browser analysis.
const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB
// The annotation endpoint accepts up to this many notes; skip enrichment above.
const MAX_ANNOTATE_NOTES = 64

// Local teacher recordings (LOCAL assets, isLocal: true) mapped to their video
// filenames. Drop the real recordings into /public/videos and update the
// filenames below. They open in the VideoLesson player (watch + slow-down +
// loop) — no fabricated fingering overlay.
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

/** Local recordings / uploads show a tidy media icon instead of a remote image. */
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

// Best-effort: ask the server to add Hebrew technique cues to the real,
// transcribed notes. Never blocks the result — on any failure the notes are
// returned unchanged. Aborts after 30s so the UI never hangs.
async function enrichWithInstructions(notes, maqam) {
  if (notes.length === 0 || notes.length > MAX_ANNOTATE_NOTES) return notes
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  const headers = { 'Content-Type': 'application/json' }
  // Sent only if the deployment gates the endpoint with a shared token.
  if (import.meta.env.VITE_APP_ACCESS_TOKEN) {
    headers['x-app-token'] = import.meta.env.VITE_APP_ACCESS_TOKEN
  }
  try {
    const res = await fetch('/api/annotate-notes', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        maqam,
        notes: notes.map((n) => ({ time: n.time, note: n.note })),
      }),
      signal: controller.signal,
    })
    if (!res.ok) return notes
    const data = await res.json()
    const instructions = Array.isArray(data.instructions) ? data.instructions : []
    return notes.map((n, i) => ({ ...n, instruction: instructions[i] || '' }))
  } catch {
    return notes // offline / timeout / error — play without cues
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Song library with two tabs. Lists local teacher recordings and any audio the
 * user has uploaded and had transcribed. Selecting a card opens the right
 * player: VideoLesson for recordings, SongInstructor for transcribed audio.
 */
export default function SongLibrary({ onBackHome }) {
  const [activeTab, setActiveTab] = useState('technique')
  const [songs, setSongs] = useState(SEED_SONGS)
  const [progress, setProgress] = useState(null) // null | 0..100 while analyzing
  const [selectedSong, setSelectedSong] = useState(null)

  // Selecting a song launches the right player for it.
  if (selectedSong) {
    return selectedSong.isLocal ? (
      <VideoLesson song={selectedSong} onExit={() => setSelectedSong(null)} />
    ) : (
      <SongInstructor song={selectedSong} onExit={() => setSelectedSong(null)} />
    )
  }

  const items = songs.filter((s) => s.category === activeTab)
  const isAnalyzing = progress !== null

  // Analyze a local audio file entirely in the browser: decode it, transcribe
  // it to notes, optionally add Hebrew cues, and add it to the repertoire. The
  // player then re-plays the song on the Kamancheh synth from those notes (with
  // a synced fingering overlay), with an option to hear the original recording.
  async function handleFile(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = '' // allow re-selecting the same file later
    if (!file) return

    if (file.size > MAX_FILE_BYTES) {
      showToast('הקובץ גדול מדי (עד 25MB). נסו קובץ קצר יותר.', 'error')
      return
    }

    setProgress(0)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const { bpm, notes } = await decodeAndAnalyze(arrayBuffer, (f) =>
        setProgress(Math.round(f * 100)),
      )
      if (!notes || notes.length === 0) {
        showToast('לא זוהו תווים בקובץ. נסו הקלטה ברורה יותר.', 'error')
        return
      }

      const maqam = DEFAULT_MAQAM
      const enriched = await enrichWithInstructions(notes, maqam)
      const audioUrl = URL.createObjectURL(file)

      const newSong = {
        id: `file-${Date.now()}`,
        category: 'repertoire',
        isLocal: false,
        source: 'upload',
        audioUrl,
        title: file.name.replace(/\.[^.]+$/, ''),
        subtitle: `${enriched.length} תווים · ${bpm} BPM`,
        maqam,
        bpm,
        notes: enriched,
      }
      setSongs((prev) => [...prev, newSong])
      setActiveTab('repertoire')
      showToast('השיר נותח ונוסף לרפרטואר!', 'success')
    } catch {
      showToast('לא ניתן לנתח את הקובץ — נסו קובץ שמע אחר.', 'error')
    } finally {
      setProgress(null)
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
        <div className="library__upload" dir="rtl" lang="he">
          <label
            className={`library__upload-button ${isAnalyzing ? 'is-busy' : ''}`}
          >
            {isAnalyzing ? `מנתח שמע… ${progress}%` : '🎙️ העלאת הקלטה לתרגול'}
            <input
              type="file"
              accept="audio/*"
              className="library__upload-input"
              onChange={handleFile}
              disabled={isAnalyzing}
            />
          </label>
          {isAnalyzing && (
            <div className="library__upload-bar" aria-hidden="true">
              <div
                className="library__upload-bar-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <p className="library__upload-hint">
            העלו קובץ שמע (עד 25MB) והאפליקציה תזהה את התווים, תתרגם אותם לנגינת
            קמנצ׳ה ותלמד אתכם לנגן את השיר (אפשר גם לשמוע את ההקלטה המקורית).
          </p>
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
              <LocalThumb />
              <div className="library__card-body" dir="rtl" lang="he">
                <span className="library__card-title">{item.title}</span>
                <span className="library__card-sub">{item.subtitle}</span>
              </div>
              <span className="library__card-status">
                {item.source === 'upload' ? 'הקלטה' : 'וידאו'}
              </span>
            </button>

            {/* Maqam dropdown — only meaningful for transcribed uploads. */}
            {item.source === 'upload' && (
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
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
