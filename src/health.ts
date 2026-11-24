import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Activity, HcSession, Wellness } from './types'

export interface Timings { sleep: number; rhr: number; hrv: number; activity: number; sessions: number }
interface DayRow { date: string; sleepMin: number | null; restHr: number | null; hrv: number | null }
interface AlbaHealthPlugin {
  status(): Promise<{ availability: 'available' | 'update' | 'unsupported'; hrvSupported: boolean }>
  check(): Promise<{ granted: boolean; activity: boolean; count: number }>
  request(): Promise<{ granted: boolean; activity: boolean; count: number }>
  readDaily(o: { days: number; activityDays: number }): Promise<{ days: DayRow[]; activity?: Activity[]; sessions?: HcSession[]; sleepRecords: number; hrRecords: number; hrvDays: number; ms?: number; timings?: Timings }>
  openSettings(): Promise<void>
}
const Health = registerPlugin<AlbaHealthPlugin>('AlbaHealth')

/** Health Connect esiste solo nell'app Android: nel browser tutto questo resta spento. */
export const isNative = Capacitor.isNativePlatform()

export interface HcResult { entries: Wellness[]; activity: Activity[]; sessions: HcSession[]; sleepRecords: number; hrRecords: number; hrvDays: number; ms: number; full: boolean; timings?: Timings }

export const hcStatus = () => Health.status()
export const hcCheck = () => Health.check()
export const hcRequest = () => Health.request()
export const hcOpenSettings = () => Health.openSettings()

/** Lettura completa: 35 giorni di recupero, 14 di attività. Quella veloce legge solo gli ultimi giorni (il resto è già nell'app). */
export const HC_FULL = { days: 35, activityDays: 14 }
export const HC_QUICK = { days: 4, activityDays: 3 }
export async function hcRead(mode: 'full' | 'quick' = 'full'): Promise<HcResult> {
  const t0 = Date.now()
  const w = mode === 'full' ? HC_FULL : HC_QUICK
  const r = await Health.readDaily(w)
  const entries: Wellness[] = r.days
    .map((d) => ({ ...d, sleepMin: d.sleepMin != null && d.sleepMin > 15 * 60 ? null : d.sleepMin })) // oltre 15 ore è un dato doppio o errato
    .filter((d) => d.sleepMin != null || d.restHr != null || d.hrv != null)
    .map((d) => ({ date: d.date, sleepMin: d.sleepMin, restHr: d.restHr, hrv: d.hrv, source: 'healthconnect' as const }))
  return { entries, activity: r.activity ?? [], sessions: r.sessions ?? [], sleepRecords: r.sleepRecords, hrRecords: r.hrRecords, hrvDays: r.hrvDays, ms: r.ms ?? Date.now() - t0, full: mode === 'full', timings: r.timings }
}

const TYPES: Record<number, string> = { 8: 'Bici', 9: 'Cyclette', 13: 'Calisthenics', 25: 'Ellittica', 36: 'HIIT', 37: 'Trekking', 56: 'Corsa', 57: 'Corsa su tapis roulant', 68: 'Scale', 70: 'Allenamento di forza', 73: 'Nuoto', 74: 'Nuoto', 79: 'Camminata', 81: 'Pesi', 83: 'Yoga' }
export const sessionLabel = (s: Pick<HcSession, 'type' | 'title'>) => TYPES[s.type] || s.title || 'Allenamento'
/** Zepp registra ogni breve passeggiata come allenamento: sotto i 20 minuti si raggruppano per giorno. */
export const MIN_ACTIVITY_MIN = 20
export const sessionMin = (s: Pick<HcSession, 'start' | 'end'>) => Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000)
/** Allenamenti dell'orologio che non sono una sessione di palestra già nell'app: camminate, trekking, corsa e simili. */
export const isGym = (t: number) => t === 70 || t === 81 || t === 13 || t === 0
