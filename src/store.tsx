import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
import seed from './seed.json'
import type { Activity, HcSession, ActiveSession, ActiveSet, AppState, Day, Exercise, LoggedSet, Program, SessionLog, StravaAuth } from './types'
import { exerciseHistory, fmtTarget, parseTarget, repsFirst, uid } from './lib'
import { dayKey, mesoWeek } from './wellness'
import type { CheckIn, CoreCircuit, Tomorrow, Wellness } from './types'

const KEY = 'alba.v1'
const initial = (): AppState => ({
  ...(seed as unknown as Pick<AppState, 'programs' | 'logs'>), active: null, strava: null, lastSync: null,
  wellness: [], checkins: [], tomorrow: null, patches: [], lastCopyAt: null, hcLast: null,
  meso: { number: 7, startDate: '2026-11-16', trainWeeks: 5 },
  settings: { sleepTargetMin: 420, stepGoal: 9500 },
  activity: [], hcSessions: [],
})

/** Le schede salvate sul telefono non si aggiornano da sole: se il seed ha il circuito addominali e la tua copia no, lo aggiunge. */
const CONSOLIDATED = ['m7-1-supine-press', 'm7-2-hack-squat']
const sp3 = (seeds: Program[]) => seeds.find((p) => p.id === 'm7')?.days.find((d) => d.id === 'm7-g3')?.exercises.find((e) => /push.?down/i.test(e.name)) as Exercise
function backfill(s: AppState): AppState {
  const seeds = (seed as unknown as { programs: Program[] }).programs
  const programs = s.programs.map((p) => {
    const sp = seeds.find((x) => x.id === p.id)
    if (!sp) return p
    return { ...p, days: p.days.map((d) => {
      const sd = sp.days.find((x) => x.id === d.id)
      return sd?.core && !d.core ? { ...d, core: structuredClone(sd.core) } : d
    }) }
  })
  // Esercizi entrati nella scheda del mese (Supine press, Hack squat): si aggiungono una sola volta, poi sono parte del mesociclo.
  const applied = new Set(s.seedApplied ?? [])
  const merged = programs.map((p) => {
    const sp = seeds.find((x) => x.id === p.id)
    if (!sp || p.id !== 'm7') return p
    return { ...p, days: p.days.map((d) => {
      const sd = sp.days.find((x) => x.id === d.id)
      if (!sd) return d
      let exs = d.exercises
      sd.exercises.forEach((se, i) => {
        if (!CONSOLIDATED.includes(se.id) || applied.has(se.id)) return
        applied.add(se.id)
        if (exs.some((e) => e.id === se.id || e.name.toLowerCase() === se.name.toLowerCase())) return
        const prev = sd.exercises[i - 1]
        const at = prev ? exs.findIndex((e) => e.name === prev.name) : -1
        exs = [...exs.slice(0, at >= 0 ? at + 1 : exs.length), structuredClone(se), ...exs.slice(at >= 0 ? at + 1 : exs.length)]
      })
      return exs === d.exercises ? d : { ...d, exercises: exs }
    }) }
  })
  const ALIGN = 'align-m7-g4-loads'
  const aligned = applied.has(ALIGN) ? merged : merged.map((p) => (p.id !== 'm7' ? p : { ...p, days: p.days.map((d) => (d.id !== 'm7-g4' ? d : { ...d, exercises: d.exercises.map((e) => (e.name === 'Leg press' && (e.weight ?? 0) < 235 ? { ...e, weight: 235, weightNote: '235 kg' } : e.name === 'Shoulder press' && (e.weight ?? 0) < 42.5 ? { ...e, weight: 42.5, weightNote: '42,5 kg' } : e)) })) }))
  applied.add(ALIGN)
  const PD = 'm7-push-down-before-superset'
  const withPd = applied.has(PD) ? aligned : aligned.map((p) => (p.id !== 'm7' ? p : { ...p, days: p.days.map((d) => {
    if (d.id !== 'm7-g3') return d
    const ex = [...d.exercises]
    const from = ex.findIndex((e) => /push.?down/i.test(e.name))
    const moved = from >= 0 ? ex.splice(from, 1)[0] : structuredClone(sp3(seeds))
    if (!moved) return d
    const to = ex.findIndex((e) => /overhead tricipiti/i.test(e.name))
    ex.splice(to >= 0 ? to : ex.length, 0, { ...moved, sets: 4, reps: moved.reps || '10', rest: 90, group: null })
    return { ...d, exercises: ex }
  }) }))
  applied.add(PD)
  // Le modifiche del coach che hanno aggiunto esercizi ora presenti nella scheda sono consolidate: non si annullano più.
  const patches = s.patches.map((pt) => {
    if (pt.reverted || pt.consolidated) return pt
    const day = withPd.find((p) => p.id === pt.programId)?.days.find((x) => x.id === pt.dayId)
    const added = day ? day.exercises.filter((e) => !pt.before.exercises.some((b) => b.name === e.name)) : []
    return added.length && added.every((e) => day!.exercises.some((x) => x.name === e.name)) ? { ...pt, consolidated: true } : pt
  })
  return { ...s, programs: withPd, patches, seedApplied: [...applied] }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return backfill({ ...initial(), ...JSON.parse(raw) })
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
  | { type: 'mergeHealth'; entries: Wellness[]; sleep: number; hr: number; hrv: number; activity?: Activity[]; sessions?: HcSession[]; ms?: number; full?: boolean; timings?: AppState['hcLast'] extends infer T ? (T extends { timings?: infer U } ? U : never) : never }
  | { type: 'setStepGoal'; steps: number }
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
  | { type: 'startCore' }
  | { type: 'setCoreCell'; item: number; idx: number; field: 'w' | 'r'; value: number | null }
  | { type: 'addExtra'; exercise: Exercise; sets: ActiveSet[]; keep: boolean }
  | { type: 'editLog'; id: string; add: { name: string; sets: LoggedSet[] }[]; entries?: SessionLog['entries']; core?: SessionLog['core']; coreRounds?: number; durationMin?: number | null }
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
  // La pausa dopo ogni giro del circuito si registra, così si vede quanto recuperi davvero.
  const coreRestS = a.rest.label === 'Recupero tra i giri' ? [...(a.coreRestS ?? []), Math.round(taken / 1000)] : a.coreRestS
  return { ...a, rest: null, restMs: a.restMs + taken, coreRestS }
}

/** Se un giorno ha perso il circuito addominali ma l'ultima sessione dello stesso giorno lo aveva, lo si ricostruisce da lì. */
function circuitFromLogs(logs: SessionLog[], programId: string, dayId: string): CoreCircuit | undefined {
  for (let i = logs.length - 1; i >= 0; i--) {
    const l = logs[i]
    if (l.programId !== programId || l.dayId !== dayId) continue
    const circ = l.entries.filter((e) => e.circuit)
    if (circ.length) {
      return { rounds: l.coreRounds ?? circ[0].sets.length, rest: 60, items: circ.map((e) => { const f = e.sets[0]; return { name: e.name, target: f?.r != null ? (e.unit === 's' ? fmtTarget('', f.r, 's') : `${f.r} rip.`) : '12 rip.', cue: '', w: f?.w ?? null } }) }
    }
    if (l.core?.length) return { rounds: l.coreRounds ?? 4, rest: 60, items: l.core.map((c) => ({ name: c.name, target: c.target, cue: '', w: c.w })) }
  }
  return undefined
}

function reduce(s: AppState, act: Action): AppState {
  const now = Date.now()
  const a = s.active
  switch (act.type) {
    case 'start': {
      // Rete di sicurezza: se la scheda del giorno non ha più il circuito ma l'ultima volta lo avevi fatto, torna.
      const restored = !act.day.core ? circuitFromLogs(s.logs, act.program.id, act.day.id) : undefined
      if (restored) {
        const day = { ...act.day, core: restored }
        const programs = s.programs.map((p) => (p.id === act.program.id ? { ...p, days: p.days.map((d) => (d.id === day.id ? day : d)) } : p))
        return reduce({ ...s, programs }, { ...act, day })
      }
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
      // Il circuito è un blocco a giri: ogni esercizio ha una cella per giro, con ripetizioni (o secondi) e kg.
      const core = act.day.core
      const parsed = core?.items.map((it) => parseTarget(it.target))
      const coreSets = core ? Object.fromEntries(core.items.map((it, i) => [`core-${i}`, Array.from({ length: core.rounds }, () => ({ w: it.w ?? null, r: parsed![i].r, done: false }))])) : undefined
      return { ...s, active: { programId: act.program.id, dayId: act.day.id, startedAt: now, activeMs: 0, resumedAt: now, pausedMs: 0, pausedAt: null, restMs: 0, rest: null, sets, coreRounds: 0, extra: [], core: core ? structuredClone(core.items) : undefined, coreSets, coreUnits: parsed?.map((p) => p.unit), coreRestS: [] } }
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
      const coreSets = base.coreSets ? Object.fromEntries(Object.entries(base.coreSets).map(([k, row]) => [k, row.map((x, j) => (j === a.coreRounds ? { ...x, done: true } : x))])) : base.coreSets
      return { ...s, active: { ...base, coreSets, coreRounds: a.coreRounds + 1, rest: act.restS ? { startedAt: a.resumedAt ? now : null, accMs: 0, plannedMs: act.restS * 1000, label: 'Recupero tra i giri', buzzed: false } : null } }
    }
    case 'startCore': return a ? { ...s, active: closeRest(a, now) } : s
    case 'setCoreCell': {
      const key = `core-${act.item}`
      if (!a?.coreSets?.[key]) return s
      // Come nelle serie normali: il valore cambiato vale anche per i giri successivi non ancora fatti.
      const row = a.coreSets[key].map((x, j) => (j >= act.idx && (j === act.idx || !x.done) ? { ...x, [act.field]: act.value } : x))
      return { ...s, active: { ...a, coreSets: { ...a.coreSets, [key]: row } } }
    }
    case 'addExtra': {
      if (!a) return s
      return { ...s, active: { ...a, extra: [...(a.extra ?? []), act.exercise], sets: { ...a.sets, [act.exercise.id]: act.sets } }, ...(act.keep ? { programs: s.programs.map((p) => (p.id === a.programId ? { ...p, days: p.days.map((d) => { if (d.id !== a.dayId) return d; const at = act.exercise.afterName ? d.exercises.findIndex((e) => e.name === act.exercise.afterName) : -1; const ex = [...d.exercises]; ex.splice(at >= 0 ? at + 1 : ex.length, 0, act.exercise); return { ...d, exercises: ex } }) } : p)) } : {}) }
    }
    case 'editLog': {
      return { ...s, logs: s.logs.map((l) => {
        if (l.id !== act.id) return l
        const entries = [...(act.entries ?? l.entries).filter((e) => e.sets.length), ...act.add.filter((e) => e.sets.length)]
        const durationMs = act.durationMin != null ? act.durationMin * 60000 : l.durationMs
        return { ...l, entries, core: act.core ?? l.core, coreRounds: act.coreRounds ?? l.coreRounds, durationMs, restMs: null }
      }) }
    }
    case 'finish': {
      if (!a) return s
      const done = closeRest(a, now)
      const program = s.programs.find((p) => p.id === a.programId)
      const day = program?.days.find((d) => d.id === a.dayId)
      if (!day) return { ...s, active: null }
      const entries = [...day.exercises, ...(a.extra ?? []).filter((x) => !day.exercises.some((y) => y.id === x.id))]
        .map((ex) => ({ name: ex.name, sets: done.sets[ex.id].filter((x) => x.done).map(({ w, r }) => ({ w, r })) }))
        .filter((e) => e.sets.length)
      // Gli esercizi del circuito entrano nella sessione come tutti gli altri, un'entrata per esercizio con una serie per giro.
      const circuit = done.coreSets && done.core ? done.core.map((c, i) => ({ name: c.name, sets: (done.coreSets![`core-${i}`] ?? []).filter((x) => x.done).map(({ w, r }) => ({ w, r })), circuit: true as const, ...(done.coreUnits?.[i] === 's' ? { unit: 's' as const } : {}) })).filter((e) => e.sets.length) : []
      entries.push(...circuit)
      const log: SessionLog = {
        id: `log-${a.startedAt}`, programId: a.programId, dayId: a.dayId, dayName: day.name,
        startedAt: new Date(a.startedAt).toISOString(),
        durationMs: done.activeMs + (done.resumedAt ? now - done.resumedAt : 0),
        pausedMs: done.pausedMs + (done.pausedAt ? now - done.pausedAt : 0),
        restMs: done.restMs, coreRounds: done.coreRounds || undefined, entries,
        coreRestS: done.coreRestS?.length ? done.coreRestS : undefined,
        core: done.coreRounds && done.core && !done.coreSets ? done.core.map((c) => ({ name: c.name, target: c.target, w: c.w ?? null })) : undefined,
      }
      // I valori del circuito di oggi diventano la base per la prossima volta.
      const baseItems = done.core?.map((c, i) => { const f = done.coreSets?.[`core-${i}`]?.[0]; return f ? { ...c, target: fmtTarget(c.target, f.r, done.coreUnits?.[i] ?? 'r'), w: f.w ?? null } : c })
      const programs = baseItems && done.coreRounds ? s.programs.map((p) => (p.id === a.programId ? { ...p, days: p.days.map((d) => (d.id === a.dayId && d.core ? { ...d, core: { ...d.core, items: baseItems } } : d)) } : p)) : s.programs
      return { ...s, active: null, programs, logs: [...s.logs, log] }
    }
    case 'discard': return { ...s, active: null }
    case 'addWellness': return { ...s, wellness: [...s.wellness.filter((w) => w.date !== act.entry.date), act.entry].sort((a, b) => a.date.localeCompare(b.date)) }
    case 'deleteWellness': return { ...s, wellness: s.wellness.filter((w) => w.date !== act.date) }
    case 'saveCheckin': return { ...s, checkins: [...s.checkins.filter((c) => c.date !== act.entry.date), act.entry].sort((a, b) => a.date.localeCompare(b.date)) }
    case 'setTomorrow': return { ...s, tomorrow: act.value }
    case 'setMeso': return { ...s, meso: { ...s.meso, ...(act.startDate ? { startDate: act.startDate } : {}), ...(act.number ? { number: act.number } : {}), ...(act.trainWeeks ? { trainWeeks: act.trainWeeks } : {}) } }
    case 'setStepGoal': return { ...s, settings: { ...s.settings, stepGoal: act.steps } }
    case 'setSleepTarget': return { ...s, settings: { ...s.settings, sleepTargetMin: act.min } }
    case 'mergeHealth': {
      const by = new Map(s.wellness.map((w) => [w.date, w]))
      for (const e of act.entries) {
        const o = by.get(e.date)
        // I valori dell'orologio sostituiscono quelli a mano solo dove ci sono.
        by.set(e.date, { date: e.date, sleepMin: e.sleepMin ?? o?.sleepMin ?? null, restHr: e.restHr ?? o?.restHr ?? null, hrv: e.hrv ?? o?.hrv ?? null, source: 'healthconnect' })
      }
      const ab = new Map((s.activity ?? []).map((a) => [a.date, a]))
      for (const a of act.activity ?? []) ab.set(a.date, a)
      // Zepp può scrivere due volte lo stesso allenamento: si tiene una sola copia per inizio, fine e tipo.
      const sKey = (x: HcSession) => `${x.start}|${x.end}|${x.type}`
      const sb = new Map((s.hcSessions ?? []).map((x) => [sKey(x), x]))
      for (const x of act.sessions ?? []) sb.set(sKey(x), x)
      const hcSessions = [...sb.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(-120)
      // Abbina a ogni sessione dell'app l'allenamento dell'orologio con più sovrapposizione di orario.
      const logs = s.logs.map((l) => {
        if (l.watch || l.durationMs == null) return l
        const a0 = new Date(l.startedAt).getTime(), a1 = a0 + l.durationMs
        let best: HcSession | null = null, bestO = 0
        for (const x of hcSessions) {
          const o = Math.min(a1, new Date(x.end).getTime()) - Math.max(a0, new Date(x.start).getTime())
          const shorter = Math.min(a1 - a0, new Date(x.end).getTime() - new Date(x.start).getTime())
          if (o > 0 && o >= shorter * 0.5 && o > bestO) { best = x; bestO = o }
        }
        return best && (best.avgHr != null || best.kcal != null) ? { ...l, watch: { avgHr: best.avgHr, maxHr: best.maxHr, kcal: best.kcal } } : l
      })
      return { ...s, logs, wellness: [...by.values()].sort((a, b) => a.date.localeCompare(b.date)), activity: [...ab.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60), hcSessions,
        hcLast: act.full === false && s.hcLast
          // Lettura veloce: i conteggi restano quelli dell'ultima lettura completa.
          ? { ...s.hcLast, at: new Date().toISOString(), ms: act.ms, full: false, timings: act.timings, activity: act.activity != null && (act.activity.length > 0 || (act.sessions ?? []).length > 0) ? true : s.hcLast.activity }
          : { at: new Date().toISOString(), days: act.entries.length, sleep: act.sleep, hr: act.hr, hrv: act.hrv, steps: (act.activity ?? []).filter((a) => a.steps != null).length, sessions: (act.sessions ?? []).length, activity: act.activity != null && (act.activity.length > 0 || (act.sessions ?? []).length > 0), ms: act.ms, full: true, timings: act.timings } }
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

export { reduce }
