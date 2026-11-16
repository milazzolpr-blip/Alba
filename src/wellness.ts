import type { AppState, Wellness } from './types'

export const dayKey = (d: Date = new Date()) => d.toLocaleDateString('sv-SE')
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export const fmtSleep = (min: number | null) => (min == null ? '–' : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}`)

export type Level = 'nodata' | 'good' | 'fair' | 'partial' | 'low'
export interface Readiness {
  level: Level
  title: string
  reasons: string[]
  advice: string
  latest: Wellness | null
  base: { sleep: number | null; hr: number | null; hrv: number | null }
  d: { sleep: number | null; hr: number | null; hrv: number | null } // scostamento dalla media
}

/** Valori letti dall'orologio, confrontati con la tua media. Regole semplici e leggibili, nessuna diagnosi. */
export function readiness(s: AppState, today: Date = new Date()): Readiness {
  const all = [...s.wellness].sort((a, b) => a.date.localeCompare(b.date))
  const t = dayKey(today), from = dayKey(addDays(today, -2))
  const latest = [...all].reverse().find((w) => w.date <= t && w.date >= from) ?? null
  const none = { level: 'nodata' as Level, title: 'Mancano i dati', reasons: [], advice: 'Aggiungi i valori di stanotte: bastano sonno, frequenza a riposo e HRV dall\'app Zepp.', latest, base: { sleep: null, hr: null, hrv: null }, d: { sleep: null, hr: null, hrv: null } }
  if (!latest) return none
  const recent = all.filter((w) => w.date <= t && w.date >= dayKey(addDays(today, -2)))
  const older = all.filter((w) => w.date < dayKey(addDays(today, -2)) && w.date >= dayKey(addDays(today, -30)))
  const pool = older.length >= 5 ? older : all.filter((w) => !recent.includes(w))
  const nums = (arr: Wellness[], k: 'sleepMin' | 'restHr' | 'hrv') => arr.map((w) => w[k]).filter((x): x is number => x != null)
  const base = { sleep: avg(nums(pool, 'sleepMin')), hr: avg(nums(pool, 'restHr')), hrv: avg(nums(pool, 'hrv')) }
  const now = { sleep: avg(nums(recent, 'sleepMin')), hr: avg(nums(recent, 'restHr')), hrv: avg(nums(recent, 'hrv')) }
  const target = s.settings.sleepTargetMin
  const reasons: string[] = []
  let bad = 0
  if (now.sleep != null && now.sleep < target - 60) { bad++; reasons.push(`sonno medio ${fmtSleep(now.sleep)} nelle ultime notti, contro un obiettivo di ${fmtSleep(target)}`) }
  if (now.hr != null && base.hr != null && now.hr - base.hr >= 4) { bad++; reasons.push(`frequenza a riposo ${Math.round(now.hr - base.hr)} bpm sopra la tua media`) }
  if (now.hrv != null && base.hrv != null && now.hrv <= base.hrv * 0.85) { bad++; reasons.push(`HRV ${Math.round((1 - now.hrv / base.hrv) * 100)}% sotto la tua media`) }
  const d = { sleep: now.sleep != null && base.sleep != null ? now.sleep - base.sleep : null, hr: now.hr != null && base.hr != null ? now.hr - base.hr : null, hrv: now.hrv != null && base.hrv != null ? (now.hrv / base.hrv - 1) * 100 : null }
  const ci = s.checkins.find((c) => c.date === t)
  const extra = ci && (ci.energy <= 2 || ci.stress >= 4) ? ' Nel check-in hai segnato poca energia o stress alto: tienine conto.' : ''
  if (bad === 0) return { level: 'good', title: 'Recupero buono', reasons: ['sonno, frequenza e HRV sono in linea con la tua media'], advice: 'Allenati come da scheda e prova a salire dove la regola di progressione lo permette.' + extra, latest, base, d }
  if (bad === 1) return { level: 'fair', title: 'Recupero discreto', reasons, advice: 'Fai la sessione come da scheda, ma non forzare le serie oltre il tecnico.' + extra, latest, base, d }
  if (bad === 2) return { level: 'partial', title: 'Recupero parziale', reasons, advice: 'Fai la sessione tenendo i carichi della volta scorsa e salta le tecniche più pesanti (rest-pause, cluster). Se domani i valori sono ancora così, chiedi al coach.' + extra, latest, base, d }
  return { level: 'low', title: 'Recupero scarso', reasons, advice: 'Tre segnali su tre sono peggiori della tua media. Meglio una sessione molto leggera o il riposo: mandalo al coach prima di decidere.' + extra, latest, base, d }
}

export const levelColor: Record<Level, string> = { nodata: 'var(--muted)', good: 'var(--good)', fair: 'var(--dawn)', partial: 'var(--warn)', low: 'var(--bad)' }

/** Settimana del mesociclo: 1..trainWeeks = allenamento, trainWeeks+1 = scarico, oltre = ciclo concluso. */
export function mesoWeek(s: AppState, today: Date = new Date()) {
  const start = new Date(s.meso.startDate + 'T00:00:00')
  const diff = Math.floor((new Date(dayKey(today) + 'T00:00:00').getTime() - start.getTime()) / 86400000)
  const week = Math.floor(diff / 7) + 1
  const total = s.meso.trainWeeks + 1
  const phase: 'pre' | 'train' | 'deload' | 'done' = week < 1 ? 'pre' : week <= s.meso.trainWeeks ? 'train' : week === total ? 'deload' : 'done'
  return { week, total, phase }
}
