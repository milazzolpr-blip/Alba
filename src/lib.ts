import type { AppState, Day, Exercise, Program, SessionLog } from './types'

export const fmtKg = (n: number | null | undefined) =>
  n == null ? '–' : n.toLocaleString('it-IT', ({ maximumFractionDigits: 1, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions))
export const fmtInt = (n: number) => Math.round(n).toLocaleString('it-IT', ({ useGrouping: 'always' } as unknown as Intl.NumberFormatOptions))
export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  const p = (x: number) => String(x).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`
}
export const fmtMin = (ms: number | null) => (ms == null ? '–' : `${Math.round(ms / 60000)} min`)
export const fmtRest = (s: number) => (s === 0 ? 'nessuno' : s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`)
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(iso).toLocaleDateString('it-IT', opts)
export const uid = () => Math.random().toString(36).slice(2, 10)

export const logVolume = (l: SessionLog) =>
  l.entries.reduce((t, e) => (e.unit === 's' ? t : t + e.sets.reduce((a, s) => a + (s.w ?? 0) * (s.r ?? 0), 0)), 0)

/** "12 rip." → 12 ripetizioni; "30 s" o "1 min" → secondi. Vale la prima quantità del testo. */
export function parseTarget(t: string): { r: number | null; unit: 's' | 'r' } {
  const m = t.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(min|secondi|sec|s\b|')?/)
  if (!m) return { r: null, unit: 'r' }
  const n = Number(m[1].replace(',', '.'))
  if (m[2] === 'min' || m[2] === "'") return { r: Math.round(n * 60), unit: 's' }
  if (m[2]) return { r: n, unit: 's' }
  return { r: n, unit: 'r' }
}
/** Riscrive la quantità del testo con il valore di oggi, tenendo il resto ("12 rip. per lato"). */
export function fmtTarget(orig: string, r: number | null, unit: 's' | 'r'): string {
  if (r == null) return orig
  if (unit === 's') return r >= 60 && r % 60 === 0 ? `${r / 60} min` : `${r} s`
  return /\d/.test(orig) ? orig.replace(/\d+(?:[.,]\d+)?/, String(r)) : `${r} rip.`
}
export const logSets = (l: SessionLog) => l.entries.reduce((t, e) => t + e.sets.length, 0)

export function mondayOf(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
export const activeProgram = (s: AppState): Program | undefined => s.programs.find((p) => p.status === 'active')

/** Prossima sessione: il giorno successivo all'ultimo registrato della scheda attiva. */
export function nextUp(s: AppState): { program: Program; day: Day; week: number; index: number } | null {
  const program = activeProgram(s)
  if (!program || !program.days.length) return null
  const mine = s.logs.filter((l) => l.programId === program.id)
  const last = mine[mine.length - 1]
  const lastIdx = last ? program.days.findIndex((d) => d.id === last.dayId) : -1
  const index = (lastIdx + 1) % program.days.length
  return { program, day: program.days[index], week: Math.floor(mine.length / program.days.length) + 1, index }
}

export interface HistoryPoint { date: string; top: number; reps: number[]; logId: string }
const norm = (n: string) => n.trim().toLowerCase()
/** Storico di un esercizio per nome: carico della serie più pesante in ogni sessione. */
export function exerciseHistory(logs: SessionLog[], name: string): HistoryPoint[] {
  const out: HistoryPoint[] = []
  for (const l of logs) {
    const e = l.entries.find((x) => norm(x.name) === norm(name))
    if (!e) continue
    const ws = e.sets.map((s) => s.w).filter((w): w is number => w != null)
    if (!ws.length) continue
    out.push({ date: l.startedAt, top: Math.max(...ws), reps: e.sets.map((s) => s.r ?? 0), logId: l.id })
  }
  return out
}
export function allExerciseNames(logs: SessionLog[]) {
  const m = new Map<string, string>()
  for (const l of logs) for (const e of l.entries) if (!m.has(norm(e.name))) m.set(norm(e.name), e.name)
  return [...m.values()]
}
export const repsTop = (reps: string) => {
  const nums = (reps.match(/\d+/g) ?? []).map(Number)
  return nums.length ? Math.max(...nums.slice(0, 2)) : 0
}
export const repsFirst = (reps: string) => Number((reps.match(/\d+/) ?? ['0'])[0])

/** Regola della scheda: tutte le serie al massimo del range per 2 sessioni consecutive → +2,5 kg. */
export function readyToProgress(logs: SessionLog[], ex: Exercise): boolean {
  const h = exerciseHistory(logs, ex.name).slice(-2)
  const top = repsTop(ex.reps)
  if (h.length < 2 || !top) return false
  return h.every((p) => p.top >= (ex.weight ?? 0) && p.reps.length >= ex.sets && p.reps.every((r) => r >= top))
}
