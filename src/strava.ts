// Amazfit → Zepp → Strava → Alba. Le chiavi Strava restano nella funzione sul server, mai nell'app.
import type { SessionLog, StravaAuth } from './types'

const FN = '/.netlify/functions/strava'

export async function stravaAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${FN}?action=status`)
    return r.ok && (await r.json()).configured === true
  } catch { return false }
}
export const stravaLogin = () => { location.href = `${FN}?action=login&return=${encodeURIComponent(location.origin + '/')}` }

/** Al ritorno da Strava l'indirizzo contiene ?code=...: si scambia con i token e si ripulisce l'indirizzo. */
export async function completeLogin(): Promise<StravaAuth | null> {
  const code = new URLSearchParams(location.search).get('code')
  if (!code) return null
  history.replaceState(null, '', location.pathname)
  const r = await fetch(FN, { method: 'POST', body: JSON.stringify({ action: 'exchange', code }) })
  return r.ok ? ((await r.json()) as StravaAuth) : null
}

async function fresh(auth: StravaAuth): Promise<StravaAuth> {
  if (auth.expiresAt * 1000 > Date.now() + 60000) return auth
  const r = await fetch(FN, { method: 'POST', body: JSON.stringify({ action: 'refresh', refreshToken: auth.refreshToken }) })
  if (!r.ok) throw new Error('Strava ha rifiutato il rinnovo: collega di nuovo l\'account.')
  return { ...auth, ...(await r.json()) }
}

interface Activity { id: number; name: string; start_date: string; elapsed_time: number; average_heartrate?: number; max_heartrate?: number; calories?: number }

/** Abbina a ogni sessione senza dati l'attività Strava iniziata entro 90 minuti dal suo inizio. */
export async function syncStrava(auth: StravaAuth, logs: SessionLog[]): Promise<{ auth: StravaAuth; logs: SessionLog[]; matched: number }> {
  const a = await fresh(auth)
  const missing = logs.filter((l) => !l.strava && !l.approx)
  if (!missing.length) return { auth: a, logs, matched: 0 }
  const after = Math.floor(new Date(missing[0].startedAt).getTime() / 1000) - 7200
  const r = await fetch(FN, { method: 'POST', body: JSON.stringify({ action: 'activities', accessToken: a.accessToken, after }) })
  if (!r.ok) throw new Error('Strava non ha risposto. Riprova tra qualche minuto.')
  const acts = (await r.json()) as Activity[]
  let matched = 0
  const out = logs.map((l) => {
    if (l.strava || l.approx) return l
    const t = new Date(l.startedAt).getTime()
    const act = acts.find((x) => Math.abs(new Date(x.start_date).getTime() - t) < 90 * 60000)
    if (!act) return l
    matched++
    return { ...l, strava: { id: act.id, name: act.name, avgHr: act.average_heartrate, maxHr: act.max_heartrate, calories: act.calories, elapsedS: act.elapsed_time } }
  })
  return { auth: a, logs: out, matched }
}
