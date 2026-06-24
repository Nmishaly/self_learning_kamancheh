import { useState } from 'react'
import Dashboard from './components/Dashboard.jsx'
import CurriculumRoadmap from './components/CurriculumRoadmap.jsx'
import SongLibrary from './components/SongLibrary.jsx'
import Welcome from './components/Welcome.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Toaster from './components/Toaster.jsx'

const WELCOME_KEY = 'kamancheh-welcomed'

// Whether the one-time welcome has already been shown (safe if storage is off).
function hasSeenWelcome() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

export default function App() {
  const [view, setView] = useState('home')
  const [welcomed, setWelcomed] = useState(hasSeenWelcome)
  const goHome = () => setView('home')

  function dismissWelcome() {
    setWelcomed(true)
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // Storage may be unavailable (private mode) — the intro just shows again.
    }
  }

  return (
    <ErrorBoundary>
      <main>
        {!welcomed ? (
          <Welcome onDone={dismissWelcome} />
        ) : (
          <>
            {view === 'home' && <Dashboard onNavigate={setView} />}
            {view === 'curriculum' && <CurriculumRoadmap onBackHome={goHome} />}
            {view === 'library' && <SongLibrary onBackHome={goHome} />}
          </>
        )}
      </main>
      <Toaster />
    </ErrorBoundary>
  )
}
