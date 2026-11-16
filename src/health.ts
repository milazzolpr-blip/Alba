import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Wellness } from './types'

interface DayRow { date: string; sleepMin: number | null; restHr: number | null; hrv: number | null }
interface AlbaHealthPlugin {
  status(): Promise<{ availability: 'available' | 'update' | 'unsupported'; hrvSupported: boolean }>
  check(): Promise<{ granted: boolean; count: number }>
  request(): Promise<{ granted: boolean; count: number }>
  readDaily(o: { days: number }): Promise<{ days: DayRow[]; sleepRecords: number; hrRecords: number; hrvDays: number }>
  openSettings(): Promise<void>
}
const Health = registerPlugin<AlbaHealthPlugin>('AlbaHealth')

/** Health Connect esiste solo nell'app Android: nel browser tutto questo resta spento. */
export const isNative = Capacitor.isNativePlatform()

export interface HcResult { entries: Wellness[]; sleepRecords: number; hrRecords: number; hrvDays: number }

export const hcStatus = () => Health.status()
export const hcCheck = () => Health.check()
export const hcRequest = () => Health.request()
export const hcOpenSettings = () => Health.openSettings()

export async function hcRead(days = 35): Promise<HcResult> {
  const r = await Health.readDaily({ days })
  const entries: Wellness[] = r.days
    .filter((d) => d.sleepMin != null || d.restHr != null || d.hrv != null)
    .map((d) => ({ date: d.date, sleepMin: d.sleepMin, restHr: d.restHr, hrv: d.hrv, source: 'healthconnect' as const }))
  return { entries, sleepRecords: r.sleepRecords, hrRecords: r.hrRecords, hrvDays: r.hrvDays }
}
