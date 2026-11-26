import type { AppState, Day, Exercise, LoggedSet, Program, SessionLog } from './types'
import { readiness, fmtSleep, dayKey, addDays, mesoWeek } from './wellness'
import { fmtKg, fmtInt, fmtTarget, logVolume, parseTarget, uid } from './lib'
import { isGym, MIN_ACTIVITY_MIN, sessionLabel, sessionMin } from './health'

const it = (d: string | Date, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => new Date(d).toLocaleDateString('it-IT', o)

function sessionText(l: SessionLog, s: AppState) {
  const prog = s.programs.find((p) => p.id === l.programId)
  const dayIdx = prog ? prog.days.findIndex((d) => d.id === l.dayId) + 1 : 0
  const lines = [`${prog?.name ?? 'Scheda'} Giorno ${dayIdx || '?'} - ${l.dayName} (${it(l.startedAt, { weekday: 'long', day: 'numeric', month: 'long' })})`]
  for (const e of l.entries.filter((x) => !x.circuit)) {
    const groups: { w: number | null; r: number[] }[] = []
    for (const x of e.sets) { const g = groups[groups.length - 1]; if (g && g.w === x.w) g.r.push(x.r ?? 0); else groups.push({ w: x.w, r: [x.r ?? 0] }) }
    lines.push(`- ${e.name}: ${groups.map((g) => `${g.w == null ? '–' : fmtKg(g.w) + ' kg'} × ${g.r.join(', ')}`).join(' | ')}`)
  }
  // Circuito addominali: ogni esercizio con le sue ripetizioni (o secondi) per giro, e le pause tra i giri.
  const circ = l.entries.filter((x) => x.circuit)
  if (circ.length) {
    lines.push(`- Circuito addominali: ${l.coreRounds ?? circ[0].sets.length} giri${l.coreRestS?.length ? `, pause tra i giri ${l.coreRestS.join(', ')} s` : ''}`)
    for (const e of circ) {
      const u = e.unit === 's' ? ' s' : ''
      const groups: { w: number | null; r: number[] }[] = []
      for (const x of e.sets) { const g = groups[groups.length - 1]; if (g && g.w === x.w) g.r.push(x.r ?? 0); else groups.push({ w: x.w, r: [x.r ?? 0] }) }
      const anyKg = groups.some((g) => g.w != null)
      lines.push(`  - ${e.name}: ${groups.map((g) => `${g.w == null ? (anyKg ? 'senza kg × ' : '') : fmtKg(g.w) + ' kg × '}${g.r.map((r) => r + u).join(', ')}`).join(' | ')}`)
    }
  } else if (l.coreRounds) lines.push(`- Circuito addominali: ${l.coreRounds} giri${l.core?.length ? ` (${l.core.map((c) => `${c.name} ${c.target}${c.w != null ? ` ${c.w} kg` : ''}`).join('; ')})` : ''}`)
  const t: string[] = []
  if (l.durationMs != null) t.push(`durata attiva ${Math.round(l.durationMs / 60000)} min`)
  if (l.pausedMs) t.push(`pause ${Math.round(l.pausedMs / 60000)} min`)
  if (l.restMs) t.push(`recuperi ${Math.round(l.restMs / 60000)} min`)
  t.push(`volume ${fmtInt(logVolume(l))} kg`)
  if (l.watch?.avgHr) t.push(`FC media ${l.watch.avgHr} bpm${l.watch.maxHr ? `, max ${l.watch.maxHr}` : ''}`)
  if (l.watch?.kcal) t.push(`${l.watch.kcal} kcal orologio (stima)`)
  if (l.strava?.avgHr) t.push(`FC media ${l.strava.avgHr} bpm`)
  if (l.strava?.calories) t.push(`${l.strava.calories} kcal orologio`)
  lines.push(t.join(', '))
  return lines.join('\n')
}

export type Range = 'week' | 'today' | 'last'
export const PATCH_HELP = `Se vuoi modificare la scheda, rispondimi con un blocco \`\`\`alba-patch con JSON: {"day":"nome giorno","note":"motivo","changes":[{"exercise":"nome","sets":3,"reps":"8","weight":65,"technique":"testo","rest":120}],"remove":["nome"],"core_rounds":3,"core":{"rounds":4,"rest":60,"items":[{"name":"V-up","target":"12 rip.","cue":""}]},"minutes":62}. Tutti i campi tranne day e changes sono facoltativi. Gli esercizi del circuito addominali si modificano come gli altri, dentro changes (esempio: {\"exercise\":\"Crunch\",\"weight\":7.5} oppure {\"exercise\":\"Hollow hold\",\"reps\":\"45 s\"}).`

export function coachSummary(s: AppState, range: Range, now: Date = new Date()): string {
  const out: string[] = []
  const mw = mesoWeek(s, now)
  const prog = s.programs.find((p) => p.status === 'active')
  out.push(`Riepilogo Alba del ${it(now, { weekday: 'long', day: 'numeric', month: 'long' })}`)
  out.push(`Scheda attiva: ${prog?.name ?? 'nessuna'}. Mesociclo ${s.meso.number}, ${mw.phase === 'deload' ? 'settimana di scarico' : mw.phase === 'train' ? `settimana ${mw.week} di ${s.meso.trainWeeks}` : mw.phase === 'pre' ? 'non ancora iniziato' : 'concluso, serve il successivo'}.`)
  if (range !== 'last') {
    const r = readiness(s, now)
    const from = range === 'today' ? dayKey(now) : dayKey(addDays(now, -6))
    const w = s.wellness.filter((x) => x.date >= from).sort((a, b) => a.date.localeCompare(b.date))
    out.push('', 'RECUPERO (Amazfit)')
    if (!w.length) out.push('Nessun dato registrato.')
    for (const x of w) out.push(`${it(x.date, { weekday: 'short', day: 'numeric' })}: sonno ${fmtSleep(x.sleepMin)}, FC a riposo ${x.restHr ?? '–'} bpm, HRV ${x.hrv ?? '–'} ms`)
    if (r.level !== 'nodata') out.push(`Stato calcolato dall'app: ${r.title}${r.reasons.length ? ' (' + r.reasons.join('; ') + ')' : ''}`)
    const act = (s.activity ?? []).filter((x) => x.date >= from).sort((a, b) => a.date.localeCompare(b.date))
    const seen = new Set<string>()
    const extra = (s.hcSessions ?? []).filter((x) => !isGym(x.type) && dayKey(new Date(x.start)) >= from).filter((x) => { const k = `${x.start}|${x.end}|${x.type}`; if (seen.has(k)) return false; seen.add(k); return true })
    if (act.length || extra.length) {
      out.push('', 'ATTIVITÀ (Amazfit)')
      for (const x of act) out.push(`${it(x.date, { weekday: 'short', day: 'numeric' })}: ${x.steps != null ? `${fmtInt(x.steps)} passi` : 'passi non disponibili'}${x.distanceM != null ? `, ${(x.distanceM / 1000).toFixed(1).replace('.', ',')} km` : ''}${x.activeKcal != null ? `, ${fmtInt(x.activeKcal)} kcal attive` : ''}${x.totalKcal != null ? `, ${fmtInt(x.totalKcal)} kcal totali` : ''}`)
      const long = extra.filter((x) => sessionMin(x) >= MIN_ACTIVITY_MIN)
      for (const x of long) out.push(`- ${sessionLabel(x)}, ${it(x.start, { weekday: 'short', day: 'numeric' })}: ${sessionMin(x)} min${x.distanceM ? `, ${(x.distanceM / 1000).toFixed(1).replace('.', ',')} km` : ''}${x.avgHr ? `, FC media ${x.avgHr}${x.maxHr ? `, max ${x.maxHr}` : ''}` : ''}${x.kcal ? `, ${x.kcal} kcal` : ''}`)
      const shortDays = new Map<string, { n: number; min: number }>()
      for (const x of extra.filter((y) => sessionMin(y) < MIN_ACTIVITY_MIN)) { const k = dayKey(new Date(x.start)); const g = shortDays.get(k) ?? { n: 0, min: 0 }; shortDays.set(k, { n: g.n + 1, min: g.min + sessionMin(x) }) }
      if (shortDays.size) out.push(`Brevi camminate (sotto ${MIN_ACTIVITY_MIN} min): ${[...shortDays].map(([k, g]) => `${it(k, { weekday: 'short', day: 'numeric' })} ${g.n} per ${g.min} min`).join('; ')}`)
      if (!extra.length) out.push('Altre attività: nessuna.')
    }
    const c = s.checkins.filter((x) => x.date >= from).sort((a, b) => a.date.localeCompare(b.date))
    out.push('', 'CHECK-IN')
    if (!c.length) out.push('Nessun check-in.')
    for (const x of c) out.push(`${it(x.date, { weekday: 'short', day: 'numeric' })}: energia ${x.energy}/5, umore ${x.mood}/5, stress ${x.stress}/5${x.nutrition ? ', alimentazione ' + x.nutrition : ''}${x.weight ? ', peso ' + fmtKg(x.weight) + ' kg' : ''}${x.note ? '. Nota: ' + x.note : ''}`)
    if (s.tomorrow && s.tomorrow.forDate >= dayKey(now)) {
      const lab = { piano: 'sì, come da piano', leggera: 'sì, ma più leggera', diversa: 'sì, ma in un altro orario o più corta', riposo: 'no, riposo' }[s.tomorrow.answer]
      const isToday = s.tomorrow.forDate === dayKey(now)
      out.push('', isToday ? `OGGI (${it(s.tomorrow.forDate, { weekday: 'long', day: 'numeric' })}, risposta data ieri sera)` : `DOMANI (${it(s.tomorrow.forDate, { weekday: 'long', day: 'numeric' })})`, `Mi alleno: ${lab}. Gambe ${s.tomorrow.legs}/5 di indolenzimento.${s.tomorrow.note ? ' ' + s.tomorrow.note : ''}`)
    }
  }
  const logs = range === 'last' ? s.logs.slice(-1) : range === 'today' ? s.logs.filter((l) => dayKey(new Date(l.startedAt)) === dayKey(now)) : s.logs.filter((l) => l.startedAt >= addDays(now, -7).toISOString())
  out.push('', range === 'last' ? 'ULTIMA SESSIONE' : 'SESSIONI')
  if (!logs.length) out.push('Nessuna sessione in questo periodo.')
  for (const l of logs) out.push(sessionText(l, s), '')
  const mods = s.patches.filter((p) => !p.reverted && !p.consolidated && p.at >= addDays(now, -14).toISOString())
  if (mods.length) out.push('MODIFICHE DEL COACH ANCORA ATTIVE', ...mods.map((p) => `- ${p.dayName}: ${p.note}`), '')
  out.push('---', PATCH_HELP)
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

const PROGRAM_SCHEMA = `{"name":"Mese 8","subtitle":"...","period":"...","note":"...","days":[{"name":"Full Body A","label":"A","focus":"...","minutes":80,"techniques":[{"name":"...","desc":"..."}],"exercises":[{"name":"...","sets":4,"reps":"8","weight":65,"rest":150,"technique":"...","group":null,"isNew":false}],"core":{"rounds":4,"rest":60,"items":[{"name":"...","target":"...","cue":"..."}]}}]}`
export function nextMesoPrompt(s: AppState, now: Date = new Date()) {
  return `Preparami il prossimo mesociclo di ${s.meso.trainWeeks} settimane più una di scarico, progressivo rispetto ai carichi raggiunti qui sotto. Rispondimi con un blocco \`\`\`alba-program con JSON in questo formato: ${PROGRAM_SCHEMA}\n\n` + coachSummary(s, 'week', now)
}

// ---------- Lettura della risposta del coach ----------
export interface Change { exercise: string; sets?: number; reps?: string; weight?: number; technique?: string; rest?: number }
export interface AddEx { name: string; sets: number; reps: string; weight?: number | null; rest?: number; technique?: string; after?: string }
export interface Patch { day: string; note?: string; changes?: Change[]; add?: AddEx[]; remove?: string[]; core_rounds?: number; core?: { rounds?: number; rest?: number; items?: { name: string; target: string; cue?: string }[] }; minutes?: number }
export interface LogIn { day: string; startedAt: string; durationMin?: number | null; coreRounds?: number; entries: { name: string; sets: (number | null)[][] | LoggedSet[] }[] }
export type Parsed = { kind: 'log'; log: LogIn; text: string } | { kind: 'patch'; patch: Patch; text: string } | { kind: 'program'; program: Program; text: string } | { kind: 'hrv'; values: { date: string; value: number }[]; text: string } | { kind: 'none'; text: string; error?: string }

export function parseCoach(raw: string): Parsed {
  const text = raw.trim()
  let kind = '', body = '', whole = ''
  const m = text.match(/```\s*(?:alba-)?(patch|program|log|json)?\s*([\s\S]*?)```/i)
  if (m && m[2].trim().startsWith('{')) { kind = (m[1] ?? '').toLowerCase(); body = m[2]; whole = m[0] }
  else {
    // Senza le virgolette del blocco: si prende il primo JSON tra graffe, anche se la copia ha perso i tre apici.
    const a = text.indexOf('{'), z = text.lastIndexOf('}')
    if (a >= 0 && z > a) { body = text.slice(a, z + 1); whole = body }
  }
  if (!body) return { kind: 'none', text, error: text ? 'Non trovo nessun blocco da leggere: incolla la risposta del coach comprensiva del testo tra graffe.' : undefined }
  let j: Record<string, unknown>
  try { j = JSON.parse(body) } catch { return { kind: 'none', text, error: 'Il blocco non è un JSON valido. Chiedi al coach di rimandarlo.' } }
  // Il tipo si riconosce dal contenuto, quindi funziona anche se la parola alba-… non è stata copiata.
  if (Array.isArray(j.hrv)) {
    const values = (j.hrv as { date?: unknown; value?: unknown }[]).filter((v) => typeof v?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date as string) && typeof v?.value === 'number' && isFinite(v.value as number)).map((v) => ({ date: v.date as string, value: Math.round(v.value as number) }))
    if (!values.length) return { kind: 'none', text, error: 'Nel blocco HRV non trovo date e valori leggibili.' }
    return { kind: 'hrv', values, text: text.replace(whole, '').trim() }
  }
  if (kind !== 'patch' && kind !== 'program' && kind !== 'log') kind = Array.isArray(j.days) ? 'program' : Array.isArray(j.entries) ? 'log' : 'patch'
  const prose = text.replace(whole, '').trim()
  if (kind === 'log') {
    const l = j as unknown as LogIn
    if (!l || typeof l.day !== 'string' || !Array.isArray(l.entries) || typeof l.startedAt !== 'string') return { kind: 'none', text, error: 'Nel blocco alba-log mancano day, startedAt o entries.' }
    return { kind: 'log', log: l, text: prose }
  }
  if (kind === 'patch') {
    const p = j as unknown as Patch
    if (!p || typeof p.day !== 'string') return { kind: 'none', text, error: 'Nel blocco manca il campo "day".' }
    return { kind: 'patch', patch: p, text: prose }
  }
  const raw2 = j as unknown as Partial<Program>
  if (!raw2 || !Array.isArray(raw2.days) || !raw2.days.length) return { kind: 'none', text, error: 'Nel programma mancano i giorni.' }
  const id = `m-${uid()}`
  const days: Day[] = raw2.days.map((d, i) => {
    const dd = d as Partial<Day>
    return {
      id: `${id}-${i + 1}`, name: dd.name ?? `Giorno ${i + 1}`, label: dd.label ?? String.fromCharCode(65 + i), focus: dd.focus ?? '', minutes: dd.minutes ?? null,
      techniques: dd.techniques ?? [], core: dd.core,
      exercises: (dd.exercises ?? []).map((e, k): Exercise => {
        const x = e as Partial<Exercise>
        return { id: `${id}-${i + 1}-${k + 1}`, name: x.name ?? 'Esercizio', sets: Number(x.sets) || 3, reps: String(x.reps ?? '10'), weight: x.weight ?? null, weightNote: x.weight != null ? `partenza ${fmtKg(x.weight)} kg` : (x.weightNote ?? ''), rest: Number(x.rest) || 90, technique: x.technique ?? '', group: x.group ?? null, isNew: !!x.isNew }
      }),
    }
  })
  return { kind: 'program', text: prose, program: { id, name: raw2.name ?? 'Nuovo mesociclo', subtitle: raw2.subtitle ?? '', period: raw2.period ?? '', status: 'archived', note: raw2.note ?? '', days } }
}

const nn = (x: string) => x.trim().toLowerCase()
const findEx = (d: Day, name: string) => d.exercises.find((e) => nn(e.name) === nn(name)) ?? d.exercises.find((e) => nn(e.name).includes(nn(name)) || nn(name).includes(nn(e.name)))
export const findDay = (p: Program, name: string) => p.days.find((d) => nn(d.name) === nn(name) || nn(d.label) === nn(name)) ?? p.days.find((d) => nn(d.name).includes(nn(name)))

export interface Preview { day: Day | null; rows: { name: string; before: string; after: string }[]; errors: string[] }
const exLine = (e: Exercise) => `${e.sets} × ${e.reps}${e.weight != null ? ` a ${fmtKg(e.weight)} kg` : ''}${e.technique ? '' : ''}`

/** Applica la modifica a una copia del giorno: serve sia all'anteprima sia alla conferma. */
export function applyPatch(day: Day, patch: Patch, nowIso: string): { day: Day; preview: Preview } {
  const next = structuredClone(day)
  const rows: Preview['rows'] = [], errors: string[] = []
  for (const c of patch.changes ?? []) {
    const e = findEx(next, c.exercise)
    if (!e) {
      // Un esercizio del circuito addominali si modifica come gli altri: carico e ripetizioni (o secondi).
      const ci = next.core?.items.find((x) => nn(x.name) === nn(c.exercise))
      if (!ci) { errors.push(`Esercizio non trovato: ${c.exercise}`); continue }
      const before = `${ci.target}${ci.w != null ? `, ${fmtKg(ci.w)} kg` : ''}`
      if (c.reps != null) ci.target = /[a-z]/i.test(String(c.reps)) ? String(c.reps) : fmtTarget(ci.target, Number(c.reps), parseTarget(ci.target).unit)
      if (c.weight != null) ci.w = c.weight
      rows.push({ name: `${ci.name} (circuito)`, before, after: `${ci.target}${ci.w != null ? `, ${fmtKg(ci.w)} kg` : ''}` })
      continue
    }
    const before = exLine(e) + (e.technique ? `, ${e.technique}` : '')
    if (c.sets != null) e.sets = c.sets
    if (c.reps != null) e.reps = String(c.reps)
    if (c.weight != null) { e.weight = c.weight; e.weightNote = `partenza ${fmtKg(c.weight)} kg`; e.startW = c.weight; e.startWAt = nowIso }
    if (c.technique != null) e.technique = c.technique
    if (c.rest != null) e.rest = c.rest
    rows.push({ name: e.name, before, after: exLine(e) + (e.technique ? `, ${e.technique}` : '') })
  }
  for (const a of patch.add ?? []) {
    if (findEx(next, a.name)) { errors.push(`${a.name} è già nella sessione`); continue }
    const ex: Exercise = { id: `${next.id}-x${uid()}`, name: a.name, sets: a.sets, reps: String(a.reps), weight: a.weight ?? null, weightNote: a.weight != null ? `partenza ${fmtKg(a.weight)} kg` : '', rest: a.rest ?? 90, technique: a.technique ?? '', group: null, isNew: false }
    const at = a.after ? next.exercises.findIndex((e) => nn(e.name) === nn(a.after!)) : -1
    next.exercises.splice(at >= 0 ? at + 1 : next.exercises.length, 0, ex)
    rows.push({ name: a.name, before: 'non c\'era', after: exLine(ex) + (ex.technique ? `, ${ex.technique}` : '') })
  }
  for (const r of patch.remove ?? []) {
    const e = findEx(next, r)
    if (!e) { errors.push(`Esercizio non trovato: ${r}`); continue }
    rows.push({ name: e.name, before: exLine(e), after: 'tolto dalla sessione' })
    next.exercises = next.exercises.filter((x) => x !== e)
  }
  if (patch.core_rounds != null && next.core) { rows.push({ name: 'Circuito addominali', before: `${next.core.rounds} giri`, after: `${patch.core_rounds} giri` }); next.core.rounds = patch.core_rounds }
  if (patch.core) {
    const c = next.core ?? { rounds: 4, rest: 60, items: [] }
    rows.push({ name: 'Circuito addominali', before: next.core ? `${c.rounds} giri, ${c.items.length} esercizi` : 'non c\'era', after: `${patch.core.rounds ?? c.rounds} giri, ${(patch.core.items ?? c.items).length} esercizi` })
    next.core = { rounds: patch.core.rounds ?? c.rounds, rest: patch.core.rest ?? c.rest, items: (patch.core.items ?? c.items).map((it) => ({ name: it.name, target: it.target, cue: it.cue ?? '' })) }
  }
  if (patch.minutes != null) { rows.push({ name: 'Durata prevista', before: `${next.minutes ?? '–'} min`, after: `${patch.minutes} min` }); next.minutes = patch.minutes }
  return { day: next, preview: { day: next, rows, errors } }
}

/** Trasforma una sessione scritta a mano in un registro dell'app, agganciata al giorno della scheda attiva. */
export function buildLog(s: AppState, l: LogIn): { log: SessionLog | null; error?: string } {
  const prog = s.programs.find((p) => p.status === 'active')
  const day = prog && findDay(prog, l.day)
  if (!prog || !day) return { log: null, error: `Non trovo il giorno "${l.day}" nella scheda attiva.` }
  const entries = l.entries.map((e) => ({ name: e.name, sets: (e.sets as unknown[]).map((x) => (Array.isArray(x) ? { w: (x[0] as number | null) ?? null, r: (x[1] as number | null) ?? null } : (x as LoggedSet))) }))
  const ms = l.durationMin != null ? l.durationMin * 60000 : null
  return { log: { id: `log-${l.startedAt}-${prog.id}-${day.id}`, programId: prog.id, dayId: day.id, dayName: day.name, startedAt: l.startedAt, durationMs: ms, pausedMs: null, restMs: null, imported: true, coreRounds: l.coreRounds, entries } }
}
