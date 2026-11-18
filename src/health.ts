import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Activity, HcSession, Wellness } from './types'

interface DayRow { date: string; sleepMin: number | null; restHr: number | null; hrv: number | null }
interface AlbaHealthPlugin {
  status(): Promise<{ availability: 'available' | 'update' | 'unsupported'; hrvSupported: boolean }>
  check(): Promise<{ granted: boolean; activity: boolean; count: number }>
  request(): Promise<{ granted: boolean; activity: boolean; count: number }>
  readDaily(o: { days: number }): Promise<{ days: DayRow[]; activity?: Activity[]; sessions?: HcSession[]; sleepRecords: number; hrRecords: number; hrvDays: number }>
  openSettings(): Promise<void>
}
const Health = registerPlugin<AlbaHealthPlugin>('AlbaHealth')

/** Health Connect esiste solo nell'app Android: nel browser tutto questo resta spento. */
export const isNative = Capacitor.isNativePlatform()

export interface HcResult { entries: Wellness[]; activity: Activity[]; sessions: HcSession[]; sleepRecords: number; hrRecords: number; hrvDays: number }

export const hcStatus = () => Health.status()
export const hcCheck = () => Health.check()
export const hcRequest = () => Health.request()
export const hcOpenSettings = () => Health.openSettings()

export async function hcRead(days = 35): Promise<HcResult> {
  const r = await Health.readDaily({ days })
  const entries: Wellness[] = r.days
    .map((d) => ({ ...d, sleepMin: d.sleepMin != null && d.sleepMin > 15 * 60 ? null : d.sleepMin })) // oltre 15 ore è un dato doppio o errato
    .filter((d) => d.sleepMin != null || d.restHr != null || d.hrv != null)
    .map((d) => ({ date: d.date, sleepMin: d.sleepMin, restHr: d.restHr, hrv: d.hrv, source: 'healthconnect' as const }))
  return { entries, activity: r.activity ?? [], sessions: r.sessions ?? [], sleepRecords: r.sleepRecords, hrRecords: r.hrRecords, hrvDays: r.hrvDays }
}

const TYPES: Record<number, string> = { 8: 'Bici', 9: 'Cyclette', 13: 'Calisthenics', 25: 'Ellittica', 36: 'HIIT', 37: 'Trekking', 56: 'Corsa', 57: 'Corsa su tapis roulant', 68: 'Scale', 70: 'Allenamento di forza', 73: 'Nuoto', 74: 'Nuoto', 79: 'Camminata', 81: 'Pesi', 83: 'Yoga' }
export const sessionLabel = (s: Pick<HcSession, 'type' | 'title'>) => s.title || TYPES[s.type] || 'Allenamento'
/** Allenamenti dell'orologio che non sono una sessione di palestra già nell'app: camminate, trekking, corsa e simili. */
export const isGym = (t: number) => t === 70 || t === 81 || t === 13 || t === 0
