import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { Icon, useNow } from './ui'
import { Home } from './Home'
import { ProgramDetail, ProgramEditor, Programs } from './Programs'
import { Archive, ExerciseDetail, LogDetail } from './Archive'
import { Profile } from './Profile'
import { Session } from './Session'
import { CoachTab } from './CoachTab'
import { Meso } from './Meso'
import { CheckInForm, Recovery, TomorrowForm, WellnessForm } from './Wellness'
import { completeLogin } from './strava'
import { fmtClock } from './lib'
import { hcCheck, hcRead, isNative } from './health'

type Tab = 'home' | 'programs' | 'coach' | 'archive' | 'profile'
export type Page = { k: 'program'; id: string } | { k: 'edit'; id: string | null } | { k: 'log'; id: string } | { k: 'exercise'; name: string } | { k: 'recovery' } | { k: 'wellness' } | { k: 'checkin' } | { k: 'tomorrow' } | { k: 'meso' }
export interface Nav { tab: (t: Tab) => void; go: (p: Page) => void; replace: (p: Page) => void; back: () => void; openSession: () => void }

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Oggi', icon: 'home' }, { id: 'programs', label: 'Piano', icon: 'plan' },
  { id: 'coach', label: 'Coach', icon: 'coach' }, { id: 'archive', label: 'Archivio', icon: 'archive' }, { id: 'profile', label: 'Profilo', icon: 'user' },
]

function Shell() {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState<Tab>('home')
  const [stack, setStack] = useState<Page[]>([])
  const [sessionOpen, setSessionOpen] = useState(false)
  const now = useNow(!!state.active?.resumedAt && !sessionOpen, 1000)
  const nav: Nav = {
    tab: (t) => { setTab(t); setStack([]) },
    go: (p) => setStack((s) => [...s, p]),
    replace: (p) => setStack((s) => [...s.slice(0, -1), p]),
    back: () => setStack((s) => s.slice(0, -1)),
    openSession: () => setSessionOpen(true),
  }
  useEffect(() => { completeLogin().then((auth) => { if (auth) { dispatch({ type: 'strava', auth }); setTab('profile') } }).catch(() => {}) }, [dispatch])
  // App Android: a ogni apertura legge da Health Connect, se i permessi sono già dati.
  useEffect(() => {
    if (!isNative) return
    // Dopo la prima lettura completa bastano gli ultimi giorni; se l'ultima lettura ha meno di 5 minuti non si rilegge.
    const last = state.hcLast
    const quick = !!last && state.wellness.length >= 20
    if (quick && Date.now() - new Date(last.at).getTime() < 5 * 60 * 1000) return
    hcCheck().then((c) => (c.granted ? hcRead(quick ? 'quick' : 'full') : null)).then((r) => { if (r) dispatch({ type: 'mergeHealth', entries: r.entries, sleep: r.sleepRecords, hr: r.hrRecords, hrv: r.hrvDays, activity: r.activity, sessions: r.sessions, ms: r.ms, full: r.full, timings: r.timings }) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])
  useEffect(() => { window.scrollTo(0, 0) }, [tab, stack.length])

  const lastData = [state.logs[state.logs.length - 1]?.startedAt, state.wellness[state.wellness.length - 1]?.date, state.checkins[state.checkins.length - 1]?.date].filter(Boolean).sort().pop()
  const unsent = !!lastData && (!state.lastCopyAt || lastData > state.lastCopyAt.slice(0, 10))
  const page = stack[stack.length - 1]
  const a = state.active
  return (
    <div className="app">
      <main>
        {page ? (
          page.k === 'program' ? <ProgramDetail id={page.id} nav={nav} /> :
          page.k === 'edit' ? <ProgramEditor id={page.id} nav={nav} /> :
          page.k === 'log' ? <LogDetail id={page.id} nav={nav} /> :
          page.k === 'recovery' ? <Recovery nav={nav} /> : page.k === 'wellness' ? <WellnessForm nav={nav} /> : page.k === 'checkin' ? <CheckInForm nav={nav} /> :
          page.k === 'tomorrow' ? <TomorrowForm nav={nav} /> : page.k === 'meso' ? <Meso nav={nav} /> : <ExerciseDetail name={page.name} nav={nav} />
        ) : tab === 'home' ? <Home nav={nav} /> : tab === 'programs' ? <Programs nav={nav} /> : tab === 'coach' ? <CoachTab nav={nav} /> : tab === 'archive' ? <Archive nav={nav} /> : <Profile />}
      </main>
      {a && !sessionOpen && (
        <button className="mini" onClick={() => setSessionOpen(true)}>
          <span className="mini-dot" /><span>Allenamento in corso</span>
          <strong>{a.resumedAt ? fmtClock(a.activeMs + now - a.resumedAt) : 'in pausa'}</strong>
        </button>
      )}
      <nav className="tabs" aria-label="Sezioni">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => nav.tab(t.id)}>
            <Icon name={t.icon} /><span>{t.label}</span>{t.id === 'coach' && unsent && <i className="tab-dot" aria-label="Dati nuovi da mandare" />}
          </button>
        ))}
      </nav>
      {a && sessionOpen && <Session onClose={() => setSessionOpen(false)} onFinished={(id) => { setSessionOpen(false); setTab('archive'); setStack([{ k: 'log', id }]) }} />}
    </div>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
