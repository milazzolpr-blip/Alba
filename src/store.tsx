import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
import seed from './seed.json'
import type { ActiveSession, AppState, Day, Program, SessionLog, StravaAuth } from './types'
import { exerciseHistory, repsFirst, uid } from './lib'
import { dayKey, mesoWeek } from './wellness'
import type { CheckIn, Tomorrow, Wellness } from './types'

const KEY = 'alba.v1'
const initial = (): AppState => ({
  ...(seed as unknown as Pick<AppState, 'programs' | 'logs'>), active: null, strava: null, lastSync: null,
  wellness: [], checkins: [], tomorrow: null, patches: [], lastCopyAt: null, hcLast: null,
  meso: { number: 7, startDate: '2026-11-16', trainWeeks: 5 },
  settings: { sleepTargetMin: 420 },
})

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...initial(), ...JSON.parse(raw) }
  } catch { /* archivio del browser non disponibile: si parte dai dati iniziali */ }
  return initial()
}

export type Action =
  | { type: 'start'; program: Program; day: Day }
  | { type: 'addWellness'; entry: Wellness }
  | { type: 'deleteWellness'; date: string }
  | { type: 'saveCheckin'; entry: CheckIn }
  | { type: 'setTomorrow'; value: Tomorrow }
  | { type: 'setMeso'; startDate?: string; number?: number; trainWeeks?: number }
  | { type: 'setSleepTarget'; min: number }
  | { type: 'copied' }
  | { type: 'mergeHealth'; entries: Wellness[]; sleep: number; hr: number; hrv: number }
  | { type: 'applyPatch'; programId: string; day: Day; note: string }
  | { type: 'revertPatch'; id: string }
  | { type: 'importProgram'; program: Program }
  | { type: 'importLog'; log: SessionLog }
  | { type: 'setValue'; exId: string; idx: number; field: 'w' | 'r'; value: number | null }
  | { type: 'toggleSet'; exId: string; idx: number; restS: number; label: string }
  | { type: 'addSet'; exId: string }
  | { type: 'endRest' }
  | { type: 'adjustRest'; deltaS: number }
  | { type: 'buzzed' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'coreRound'; restS: number }
  | { type: 'finish' }
  | { type: 'discard' }
  | { type: 'saveProgram'; program: Program }
  | { type: 'deleteProgram'; id: string }
  | { type: 'activate'; id: string }
  | { type: 'deleteLog'; id: string }
  | { type: 'strava'; auth: StravaAuth | null }
  | { type: 'attachStrava'; logs: SessionLog[]; at: string }
  | { type: 'import'; state: AppState }
  | { type: 'reset' }

const closeRest = (a: ActiveSession, now: number): ActiveSession => {
  if (!a.rest) return a
  const taken = a.rest.accMs + (a.rest.startedAt ? now - a.rest.startedAt : 0)
  return { ...a, rest: null, restMs: a.restMs + taken }
}

function reduce(s: AppState, act: Action): AppState {
  const now = Date.now()
  const a = s.active
  switch (act.type) {
    case 'start': {
      const sets: ActiveSession['sets'] = {}
      const deload = mesoWeek(s).phase === 'deload'
      const light = s.tomorrow?.forDate === dayKey() && s.tomorrow.answer === 'leggera'
      for (const ex of act.day.exercises) {
        // Si parte dall'ultimo carico registrato; un carico indicato dal coach vale se è più recente dell'ultima sessione.
        const last = exerciseHistory(s.logs, ex.name).pop()
        const lastAt = s.logs.length ? s.logs[s.logs.length - 1].startedAt : ''
        const coachW = ex.startW != null && ex.startWAt && ex.startWAt > lastAt ? ex.startW : null
        let w = coachW ?? last?.top ?? ex.weight
        let n = ex.sets
        if (deload) { n = Math.max(2, Math.ceil(ex.sets * 0.6)); if (w != null && coachW == null) w = Math.round(w * 0.9 * 2) / 2 }
        else if (light && n >= 3) n -= 1
        sets[ex.id] = Array.from({ length: n }, () => ({ w, r: repsFirst(ex.reps) || null, done: false }))
      }
      return { ...s, active: { programId: act.program.id, dayId: act.day.id, startedAt: now, activeMs: 0, resumedAt: now, pausedMs: 0, pausedAt: null, restMs: 0, rest: null, sets, coreRounds: 0 } }
    }
    case 'setValue': {
      if (!a) return s
      const row = a.sets[act.exId].map((x, i) => (i >= act.idx && (i === act.idx || !x.done) ? { ...x, [act.field]: act.value } : x))
      return { ...s, active: { ...a, sets: { ...a.sets, [act.exId]: row } } }
    }
    case 'toggleSet': {
      if (!a) return s
      const was = a.sets[act.exId][act.idx].done
      const row = a.sets[act.exId].map((x, i) => (i === act.idx ? { ...x, done: !was } : x))
      let next = { ...closeRest(a, now), sets: { ...a.sets, [act.exId]: row } }
      if (!was && act.restS > 0) next = { ...next, rest: { startedAt: a.resumedAt ? now : null, accMs: 0, plannedMs: act.restS * 1000, label: act.label, buzzed: false } }
      return { ...s, active: next }
    }
    case 'addSet': {
      if (!a) return s
      const row = a.sets[act.exId]
      const tpl = row[row.length - 1] ?? { w: null, r: null, done: false }
      return { ...s, active: { ...a, sets: { ...a.sets, [act.exId]: [...row, { ...tpl, done: false }] } } }
    }
    case 'endRest': return a ? { ...s, active: closeRest(a, now) } : s
    case 'adjustRest': return a?.rest ? { ...s, active: { ...a, rest: { ...a.rest, plannedMs: Math.max(0, a.rest.plannedMs + act.deltaS * 1000), buzzed: false } } } : s
    case 'buzzed': return a?.rest ? { ...s, active: { ...a, rest: { ...a.rest, buzzed: true } } } : s
    case 'pause': {
      if (!a || !a.resumedAt) return s
      const rest = a.rest && a.rest.startedAt ? { ...a.rest, accMs: a.rest.accMs + now - a.rest.startedAt, startedAt: null } : a.rest
      return { ...s, active: { ...a, activeMs: a.activeMs + now - a.resumedAt, resumedAt: null, pausedAt: now, rest } }
    }
    case 'resume': {
      if (!a || a.resumedAt) return s
      const rest = a.rest ? { ...a.rest, startedAt: now } : null
      return { ...s, active: { ...a, resumedAt: now, pausedMs: a.pausedMs + (a.pausedAt ? now - a.pausedAt : 0), pausedAt: null, rest } }
    }
    case 'coreRound': {
      if (!a) return s
      const base = closeRest(a, now)
      return { ...s, active: { ...base, coreRounds: a.coreRounds + 1, rest: act.restS ? { startedAt: a.resumedAt ? now : null, accMs: 0, plannedMs: act.restS * 1000, label: 'Recupero tra i giri', buzzed: false } : null } }
    }
    case 'finish': {
      if (!a) return s
      const done = closeRest(a, now)
      const program = s.programs.find((p) => p.id === a.programId)
      const day = program?.days.find((d) => d.id === a.dayId)
      if (!day) return { ...s, active: null }
      const entries = day.exercises
        .map((ex) => ({ name: ex.name, sets: done.sets[ex.id].filter((x) => x.done).map(({ w, r }) => ({ w, r })) }))
        .filter((e) => e.sets.length)
      const log: SessionLog = {
        id: `log-${a.startedAt}`, programId: a.programId, dayId: a.dayId, dayName: day.name,
        startedAt: new Date(a.startedAt).toISOString(),
        durationMs: done.activeMs + (done.resumedAt ? now - done.resumedAt : 0),
        pausedMs: done.pausedMs + (done.pausedAt ? now - done.pausedAt : 0),
        restMs: done.restMs, coreRounds: done.coreRounds || undefined, entries,
      }
      return { ...s, active: null, logs: [...s.logs, log] }
    }
    case 'discard': return { ...s, active: null }
    case 'addWellness': return { ...s, wellness: [...s.wellness.filter((w) => w.date !== act.entry.date), act.entry].sort((a, b) => a.date.localeCompare(b.date)) }
    case 'deleteWellness': return { ...s, wellness: s.wellness.filter((w) => w.date !== act.date) }
    case 'saveCheckin': return { ...s, checkins: [...s.checkins.filter((c) => c.date !== act.entry.date), act.entry].sort((a, b) => a.date.localeCompare(b.date)) }
    case 'setTomorrow': return { ...s, tomorrow: act.value }
    case 'setMeso': return { ...s, meso: { ...s.meso, ...(act.startDate ? { startDate: act.startDate } : {}), ...(act.number ? { number: act.number } : {}), ...(act.trainWeeks ? { trainWeeks: act.trainWeeks } : {}) } }
    case 'setSleepTarget': return { ...s, settings: { ...s.settings, sleepTargetMin: act.min } }
    case 'mergeHealth': {
      const by = new Map(s.wellness.map((w) => [w.date, w]))
      for (const e of act.entries) {
        const o = by.get(e.date)
        // I valori dell'orologio sostituiscono quelli a mano solo dove ci sono.
        by.set(e.date, { date: e.date, sleepMin: e.sleepMin ?? o?.sleepMin ?? null, restHr: e.restHr ?? o?.restHr ?? null, hrv: e.hrv ?? o?.hrv ?? null, source: 'healthconnect' })
      }
      return { ...s, wellness: [...by.values()].sort((a, b) => a.date.localeCompare(b.date)), hcLast: { at: new Date().toISOString(), days: act.entries.length, sleep: act.sleep, hr: act.hr, hrv: act.hrv } }
    }
    case 'copied': return { ...s, lastCopyAt: new Date().toISOString() }
    case 'applyPatch': {
      const prog = s.programs.find((p) => p.id === act.programId)
      const old = prog?.days.find((d) => d.id === act.day.id)
      if (!prog || !old) return s
      const rec = { id: uid(), at: new Date().toISOString(), programId: prog.id, dayId: old.id, dayName: old.name, note: act.note, before: old }
      return { ...s, patches: [rec, ...s.patches].slice(0, 20), programs: s.programs.map((p) => (p.id === prog.id ? { ...p, days: p.days.map((d) => (d.id === old.id ? act.day : d)) } : p)) }
    }
    case 'revertPatch': {
      const rec = s.patches.find((p) => p.id === act.id)
      if (!rec || rec.reverted) return s
      return { ...s, patches: s.patches.map((p) => (p.id === rec.id ? { ...p, reverted: true } : p)), programs: s.programs.map((p) => (p.id === rec.programId ? { ...p, days: p.days.map((d) => (d.id === rec.dayId ? rec.before : d)) } : p)) }
    }
    case 'importLog': return s.logs.some((x) => x.id === act.log.id) ? s : { ...s, logs: [...s.logs, act.log].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) }
    case 'importProgram': {
      const monday = new Date(); monday.setHours(0, 0, 0, 0)
      const wd = (monday.getDay() + 6) % 7
      if (wd !== 0) monday.setDate(monday.getDate() + (7 - wd))
      return { ...s, programs: [{ ...act.program, status: 'active' as const }, ...s.programs.map((p) => ({ ...p, status: 'archived' as const }))], meso: { ...s.meso, number: s.meso.number + 1, startDate: dayKey(monday) } }
    }
    case 'saveProgram': {
      const exists = s.programs.some((p) => p.id === act.program.id)
      return { ...s, programs: exists ? s.programs.map((p) => (p.id === act.program.id ? act.program : p)) : [act.program, ...s.programs] }
    }
    case 'deleteProgram': return { ...s, programs: s.programs.filter((p) => p.id !== act.id) }
    case 'activate': return { ...s, programs: s.programs.map((p) => ({ ...p, status: p.id === act.id ? 'active' : 'archived' })) }
    case 'deleteLog': return { ...s, logs: s.logs.filter((l) => l.id !== act.id) }
    case 'strava': return { ...s, strava: act.auth }
    case 'attachStrava': return { ...s, logs: act.logs, lastSync: act.at }
    case 'import': return { ...initial(), ...act.state, active: null }
    case 'reset': return initial()
  }
}

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* senza archivio i dati restano solo in memoria */ }
  }, [state])
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}
export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('StoreProvider mancante')
  return c
}
