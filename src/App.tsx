import { useEffect, useState } from 'react'
import { CheatsheetsPage } from './pages/CheatsheetsPage'
import { HomePage } from './pages/HomePage'
import { LabPage } from './pages/LabPage'
import { LessonPage } from './pages/LessonPage'
import { PracticePage } from './pages/PracticePage'
import { TutorPage } from './pages/TutorPage'
import { href, useRoute } from './router'

const NAV = [
  { id: '', label: 'Learn' },
  { id: 'practice', label: 'Practice' },
  { id: 'lab', label: 'Design Lab' },
  { id: 'cheatsheets', label: 'Cheatsheets' },
  { id: 'tutor', label: 'AI tutor' },
]

type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('sdl-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage blocked */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const route = useRoute()
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('sdl-theme', theme)
    } catch {
      /* storage blocked */
    }
  }, [theme])

  const section = route[0] ?? ''
  const active = section === 'learn' ? '' : section

  let page
  if (section === 'learn' && route[1]) page = <LessonPage lessonId={route[1]} />
  else if (section === 'practice') page = <PracticePage />
  else if (section === 'lab') page = <LabPage />
  else if (section === 'cheatsheets') page = <CheatsheetsPage />
  else if (section === 'tutor') page = <TutorPage />
  else page = <HomePage />

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <a href={href()} className="flex shrink-0 items-center gap-2 font-bold">
            <Logo />
            <span className="hidden sm:inline">System Design Lab</span>
          </a>
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Main">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={href(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active === item.id ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-sm text-muted hover:text-ink"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{page}</main>
    </div>
  )
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <polygon points="13,2 24,8 13,14 2,8" fill="#91a7ff" />
      <polygon points="2,8 13,14 13,24 2,18" fill="#5c7cfa" />
      <polygon points="24,8 13,14 13,24 24,18" fill="#4263eb" />
    </svg>
  )
}
