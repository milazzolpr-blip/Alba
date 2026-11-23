export interface Exercise {
  afterName?: string // posizione scelta quando l'esercizio è stato aggiunto: dopo questo esercizio
  id: string
  name: string
  sets: number
  reps: string
  weight: number | null
  weightNote: string
  rest: number // secondi dopo ogni serie; 0 = passa subito all'esercizio successivo
  technique: string
  group: string | null
  isNew: boolean
  startW?: number // carico indicato dal coach: vale finché non registri una sessione più recente
  startWAt?: string
}
export interface CoreItem { name: string; target: string; cue: string; w?: number | null }
export interface CoreCircuit { rounds: number; rest: number; items: CoreItem[] }
export interface Day {
  id: string
  name: string
  label: string
  focus: string
  minutes: number | null
  techniques: { name: string; desc: string }[]
  exercises: Exercise[]
  core?: CoreCircuit
}
export interface Program {
  id: string
  name: string
  subtitle: string
  period: string
  status: 'active' | 'archived'
  note: string
  days: Day[]
}
export interface LoggedSet { w: number | null; r: number | null }
export interface StravaData { id: number; name: string; avgHr?: number; maxHr?: number; calories?: number; elapsedS?: number }
export interface SessionLog {
  id: string
  programId: string
  dayId: string
  dayName: string
  startedAt: string
  durationMs: number | null // tempo attivo, pause escluse
  pausedMs: number | null
  restMs: number | null
  approx?: boolean
  imported?: boolean
  coreRounds?: number
  core?: { name: string; target: string; w: number | null }[]
  entries: { name: string; sets: LoggedSet[]; unit?: 's'; circuit?: boolean }[] // circuit: esercizio del circuito addominali; unit 's': secondi invece di ripetizioni
  coreRestS?: number[] // recupero realmente preso dopo ogni giro del circuito, in secondi
  strava?: StravaData
  watch?: WatchData // frequenza e calorie dell'orologio, abbinate per orario
}
export interface ActiveSet { w: number | null; r: number | null; done: boolean }
export interface ActiveSession {
  programId: string
  dayId: string
  startedAt: number
  activeMs: number // accumulato fino all'ultima pausa
  resumedAt: number | null // null = in pausa
  pausedMs: number
  pausedAt: number | null
  restMs: number
  rest: { startedAt: number | null; accMs: number; plannedMs: number; label: string; buzzed: boolean } | null
  sets: Record<string, ActiveSet[]>
  coreRounds: number
  extra?: Exercise[] // esercizi aggiunti durante la sessione
  core?: CoreItem[] // nomi e quantità del circuito di oggi
  coreSets?: Record<string, ActiveSet[]> // un valore per esercizio e per giro: core-0, core-1…
  coreUnits?: ('s' | 'r')[] // secondi o ripetizioni, per esercizio del circuito
  coreRestS?: number[]
}
export interface StravaAuth { accessToken: string; refreshToken: string; expiresAt: number; athlete: string }
export interface Wellness { date: string; sleepMin: number | null; restHr: number | null; hrv: number | null; source: 'manual' | 'healthconnect' }
export interface CheckIn { date: string; energy: number; mood: number; stress: number; nutrition: 'sotto' | 'piano' | 'sopra' | null; weight: number | null; note: string }
export interface Tomorrow { forDate: string; answer: 'piano' | 'leggera' | 'diversa' | 'riposo'; legs: number; note: string; answeredAt: string }
export interface Mesocycle { number: number; startDate: string; trainWeeks: number }
export interface AppliedPatch { id: string; at: string; programId: string; dayId: string; dayName: string; note: string; before: Day; reverted?: boolean; consolidated?: boolean }
export interface Settings { sleepTargetMin: number; stepGoal?: number }
export interface Activity { date: string; steps: number | null; distanceM: number | null; activeKcal: number | null; totalKcal: number | null }
export interface HcSession { id: string; start: string; end: string; type: number; title: string | null; avgHr: number | null; maxHr: number | null; kcal: number | null; distanceM: number | null }
export interface WatchData { avgHr: number | null; maxHr: number | null; kcal: number | null }
export interface AppState {
  programs: Program[]
  logs: SessionLog[]
  active: ActiveSession | null
  strava: StravaAuth | null
  lastSync: string | null
  wellness: Wellness[]
  checkins: CheckIn[]
  tomorrow: Tomorrow | null
  meso: Mesocycle
  patches: AppliedPatch[]
  activity?: Activity[]
  hcSessions?: HcSession[]
  seedApplied?: string[] // esercizi del seed già consolidati nella tua scheda
  settings: Settings
  lastCopyAt: string | null
  hcLast: { at: string; days: number; sleep: number; hr: number; hrv: number; steps?: number; sessions?: number; activity?: boolean; ms?: number; full?: boolean } | null
}
