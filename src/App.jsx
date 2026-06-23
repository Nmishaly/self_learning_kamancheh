import { useState } from 'react'
import Dashboard from './components/Dashboard.jsx'
import CurriculumRoadmap from './components/CurriculumRoadmap.jsx'
import SongLibrary from './components/SongLibrary.jsx'

export default function App() {
  const [view, setView] = useState('home')
  const goHome = () => setView('home')

  return (
    <main>
      {view === 'home' && <Dashboard onNavigate={setView} />}
      {view === 'curriculum' && <CurriculumRoadmap onBackHome={goHome} />}
      {view === 'library' && <SongLibrary onBackHome={goHome} />}
    </main>
  )
}
