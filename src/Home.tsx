import { useStore } from './store'
import { Icon, Spark, Stat, useNow } from './ui'
import { allExerciseNames, exerciseHistory, fmtClock, fmtDate, fmtInt, fmtKg, fmtMin, logSets, logVolume, mondayOf, nextUp, readyToProgress } from './lib'
import type { Nav } from './App'
import { isGym, isNative, sessionLabel } from './health'
import { dayKey, fmtSleep, levelColor, mesoWeek, readiness } from './wellness'

const DAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export function Home({ nav }: { nav: Nav }) {
  const { state, dispatch } = useStore()
  const up = nextUp(state)
  const active = state.active
  const now = useNow(!!active?.resumedAt, 1000)
  const today = new Date()
  const monday = mondayOf(today)
  const week = DAYS.map((d, i) => {
    const date = new Date(monday); date.setDate(monday.getDate() + i)
    const done = state.logs.some((l) => new Date(l.startedAt).toDateString() === date.toDateString())
    return { d, date, done, isToday: date.toDateString() === today.toDateString() }
  })
  const doneThisWeek = week.filter((x) => x.done).length
  const target = up?.program.days.length ?? 4

  const last = state.logs[state.logs.length - 1]
  const prevSame = last && [...state.logs].reverse().find((l) => l.id !== last.id && l.dayId === last.dayId)
  const volDelta = last && prevSame ? logVolume(last) - logVolume(prevSame) : null

  const lifts = allExerciseNames(state.logs)
    .map((name) => ({ name, h: exerciseHistory(state.logs, name) }))
    .filter((x) => x.h.length >= 2)
    .sort((a, b) => b.h.length - a.h.length)
    .slice(0, 5)

  const ready = up ? up.day.exercises.filter((ex) => readyToProgress(state.logs.filter((l) => l.programId === up.program.id), ex)) : []
  const month = state.logs.filter((l) => { const d = new Date(l.startedAt); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() })
  const monthTime = month.reduce((t, l) => t + (l.durationMs ?? 0), 0)
  const activeDay = active && state.programs.find((p) => p.id === active.programId)?.days.find((d) => d.id === active.dayId)

  return (
    <div className="screen">
      <header className="greet">
        <p className="greet-date">{today.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>Ciao Luca</h1>
      </header>

      <Wellbeing nav={nav} />

      {active && activeDay ? (
        <section className="hero is-live">
          <div className="hero-letter">{activeDay.label}</div>
          <div className="hero-body">
            <p className="hero-kicker">Allenamento in corso</p>
            <h2>{activeDay.name}</h2>
            <p className="hero-clock">{fmtClock(active.activeMs + (active.resumedAt ? now - active.resumedAt : 0))}</p>
          </div>
          <button className="btn btn-primary btn-wide" onClick={nav.openSession}><Icon name="play" fill size={18} />Riprendi allenamento</button>
        </section>
      ) : up ? (
        <section className="hero">
          <div className="hero-letter">{up.day.label}</div>
          <div className="hero-body">
            <p className="hero-kicker">Prossima sessione, settimana {up.week}</p>
            <h2>{up.day.name}</h2>
            <p className="hero-focus">{up.day.focus}</p>
            <ul className="hero-meta">
              <li><Icon name="clock" size={15} />{up.day.minutes ?? '–'} min</li>
              <li>{up.day.exercises.length} esercizi</li>
              {up.day.core && <li>20 min addominali</li>}
            </ul>
          </div>
          <button className="btn btn-primary btn-wide" onClick={() => { dispatch({ type: 'start', program: up.program, day: up.day }); nav.openSession() }}>
            <Icon name="play" fill size={18} />Inizia allenamento
          </button>
          <button className="link" onClick={() => nav.go({ k: 'program', id: up.program.id })}>Vedi la scheda completa</button>
        </section>
      ) : (
        <section className="empty">
          <h2>Nessuna scheda attiva</h2>
          <p>Scegli una scheda dall'elenco e impostala come attiva per vedere qui la prossima sessione.</p>
          <button className="btn btn-primary" onClick={() => nav.tab('programs')}>Apri le schede</button>
        </section>
      )}

      <section className="block">
        <div className="block-head"><h3>Questa settimana</h3><span className="count">{doneThisWeek} di {target}</span></div>
        <ol className="week">
          {week.map((x, i) => (
            <li key={i} className={`${x.done ? 'is-done' : ''}${x.isToday ? ' is-today' : ''}`} aria-label={`${fmtDate(x.date.toISOString(), { weekday: 'long' })}${x.done ? ', allenamento fatto' : ''}`}>
              <span className="week-d">{x.d}</span>
              <span className="week-n">{x.done ? <Icon name="check" size={16} /> : x.date.getDate()}</span>
            </li>
          ))}
        </ol>
      </section>

      {ready.length > 0 && (
        <section className="note-up">
          <Icon name="up" size={18} />
          <p><strong>Pronto a salire di 2,5 kg:</strong> {ready.map((e) => e.name).join(', ')}. Due sessioni di fila al massimo delle ripetizioni.</p>
        </section>
      )}

      {last && (
        <section className="block">
          <div className="block-head"><h3>Ultima sessione</h3><button className="link" onClick={() => nav.go({ k: 'log', id: last.id })}>Dettagli</button></div>
          <button className="card card-tap" onClick={() => nav.go({ k: 'log', id: last.id })}>
            <div className="card-title"><strong>{last.dayName}</strong><span>{fmtDate(last.startedAt)}</span></div>
            <div className="stats">
              <Stat value={last.durationMs == null ? '–' : String(Math.round(last.durationMs / 60000))} unit={last.durationMs == null ? undefined : 'min'} label="Durata" />
              <Stat value={fmtInt(logVolume(last))} unit="kg" label="Volume" />
              <Stat value={String(logSets(last))} label="Serie" />
              {last.strava?.avgHr && <Stat value={String(last.strava.avgHr)} unit="bpm" label="FC media" />}
            </div>
            {volDelta != null && <p className={`delta ${volDelta >= 0 ? 'up' : 'down'}`}>{volDelta >= 0 ? '+' : '−'}{fmtInt(Math.abs(volDelta))} kg di volume rispetto alla volta precedente</p>}
            {last.durationMs == null && <p className="hint">Sessione importata dai tuoi messaggi: durata non registrata.</p>}
          </button>
        </section>
      )}

      {lifts.length > 0 && (
        <section className="block">
          <div className="block-head"><h3>Progressione</h3><button className="link" onClick={() => nav.tab('archive')}>Tutti gli esercizi</button></div>
          <ul className="list">
            {lifts.map(({ name, h }) => {
              const d = h[h.length - 1].top - h[0].top
              return (
                <li key={name}>
                  <button className="row" onClick={() => nav.go({ k: 'exercise', name })}>
                    <span className="row-main"><strong>{name}</strong><span>{h.length} sessioni</span></span>
                    <Spark values={h.map((p) => p.top)} />
                    <span className="row-num"><strong>{fmtKg(h[h.length - 1].top)} kg</strong>
                      <span className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d === 0 ? 'stabile' : `${d > 0 ? '+' : '−'}${fmtKg(Math.abs(d))} kg`}</span></span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="block">
        <div className="block-head"><h3>{today.toLocaleDateString('it-IT', { month: 'long' }).replace(/^./, (c) => c.toUpperCase())}</h3></div>
        <div className="card stats">
          <Stat value={String(month.length)} label="Allenamenti" />
          <Stat value={fmtInt(month.reduce((t, l) => t + logVolume(l), 0) / 1000)} unit="t" label="Volume" />
          <Stat value={monthTime ? fmtMin(monthTime).replace(' min', '') : '–'} unit={monthTime ? 'min' : undefined} label="Tempo attivo" />
        </div>
      </section>
    </div>
  )
}

function ActivityBlock({ nav }: { nav: Nav }) {
  const { state } = useStore()
  const goal = state.settings.stepGoal ?? 9500
  const acts = state.activity ?? []
  const today = acts.find((a) => a.date === dayKey())
  const since = Date.now() - 7 * 86400000
  const others = (state.hcSessions ?? []).filter((x) => !isGym(x.type) && new Date(x.start).getTime() > since).slice(-4).reverse()
  const noData = isNative && state.hcLast && state.hcLast.activity === false
  if (!today && !others.length && !noData) return null
  if (!today && !others.length) return <button className="card card-tap coach-note" onClick={() => nav.tab('profile')}><strong className="brass">Passi e allenamenti non arrivano</strong><span>Zepp non li manda a Health Connect, oppure mancano i permessi. Tocca per controllare.</span></button>
  const pct = today?.steps != null ? Math.min(100, Math.round((today.steps / goal) * 100)) : 0
  const yday = new Date(Date.now() - 86400000).getTime()
  const heavy = (state.hcSessions ?? []).some((x) => !isGym(x.type) && new Date(x.end).getTime() > yday - 86400000 && new Date(x.end).getTime() - new Date(x.start).getTime() >= 90 * 60000)
  const fmt = (n: number | null) => (n == null ? '–' : fmtInt(n))
  return (
    <section className="card activity">
      <div className="card-title"><span className="hint">Attività, dall'orologio</span></div>
      {today && (
        <>
          <div className="metrics">
            <div className="metric"><span>Passi</span><strong>{fmt(today.steps)}</strong><em>{today.steps != null ? `${pct}% di ${fmtInt(goal)}` : ' '}</em></div>
            <div className="metric"><span>Kcal attive</span><strong>{fmt(today.activeKcal)}</strong><em>{today.totalKcal != null ? `${fmt(today.totalKcal)} totali` : ' '}</em></div>
            <div className="metric"><span>Distanza</span><strong>{today.distanceM != null ? (today.distanceM / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) : '–'}<small> km</small></strong><em> </em></div>
          </div>
          <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Passi di oggi rispetto all'obiettivo"><i style={{ width: `${pct}%` }} /></div>
        </>
      )}
      {others.map((x) => (
        <div className="act-line" key={x.id}><strong>{sessionLabel(x)}</strong><span>{new Date(x.start).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })}, {Math.round((new Date(x.end).getTime() - new Date(x.start).getTime()) / 60000)} min{x.distanceM ? `, ${(x.distanceM / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} km` : ''}{x.avgHr ? `, FC ${x.avgHr}` : ''}</span></div>
      ))}
      {heavy && <div className="advice"><strong>Carico dei giorni scorsi</strong><span>Un'attività lunga nelle ultime 48 ore: se le gambe sono cariche, dillo nel check-in.</span></div>}
    </section>
  )
}

function Wellbeing({ nav }: { nav: Nav }) {
  const { state } = useStore()
  const r = readiness(state)
  const mw = mesoWeek(state)
  const today = dayKey()
  const ci = state.checkins.find((c) => c.date === today)
  const tmr = state.tomorrow && state.tomorrow.forDate === dayKey(new Date(Date.now() + 86400000)) ? state.tomorrow : null
  const lastLog = state.logs[state.logs.length - 1]
  const lastData = [lastLog?.startedAt, state.wellness[state.wellness.length - 1]?.date, state.checkins[state.checkins.length - 1]?.date].filter(Boolean).sort().pop()
  const unsent = !!lastData && (!state.lastCopyAt || lastData > state.lastCopyAt.slice(0, 10))
  const patch = state.patches.find((p) => !p.reverted && Date.now() - new Date(p.at).getTime() < 3 * 86400000)
  const col = levelColor[r.level]
  const L = r.latest
  const dlt = (v: number | null, f: (n: number) => string) => (v == null ? '' : `${v > 0 ? '+' : '−'}${f(Math.abs(v))} sulla media`)
  const metric = (label: string, val: string, unit: string, d: string, bad: boolean) => (
    <div className="metric"><span>{label}</span><strong>{val}<small>{unit}</small></strong><em className={bad ? 'is-bad' : ''}>{d || ' '}</em></div>)
  return (
    <>
      <section className="card come-stai" style={{ ['--lvl' as string]: col }}>
        <div className="card-title"><span className="hint">Come stai, dall'orologio</span>{mw.phase === 'deload' && <span className="chip chip-on">Settimana di scarico</span>}</div>
        <div className="verdict"><i aria-hidden="true" /><h2>{r.title}</h2></div>
        {r.level === 'nodata' ? <p>{r.advice}</p> : <p>{r.reasons.length ? r.reasons[0][0].toUpperCase() + r.reasons[0].slice(1) + (r.reasons.length > 1 ? `; ${r.reasons.slice(1).join('; ')}` : '') + '.' : ''}</p>}
        {L && (
          <div className="metrics">
            {metric('Sonno', fmtSleep(L.sleepMin), '', dlt(r.d.sleep, (n) => fmtSleep(n)), (r.d.sleep ?? 0) < -45)}
            {metric('FC a riposo', L.restHr != null ? String(L.restHr) : '–', ' bpm', dlt(r.d.hr, (n) => String(Math.round(n))), (r.d.hr ?? 0) >= 4)}
            {metric('HRV', L.hrv != null ? String(L.hrv) : '–', ' ms', r.d.hrv == null ? '' : `${r.d.hrv > 0 ? '+' : '−'}${Math.round(Math.abs(r.d.hrv))}% sulla media`, (r.d.hrv ?? 0) <= -15)}
          </div>
        )}
        {r.level !== 'nodata' && <div className="advice"><strong>Per l'allenamento di oggi</strong><span>{r.advice}</span></div>}
        <div className="act-row">
          <button className="btn btn-secondary" onClick={() => nav.go({ k: r.level === 'nodata' ? 'wellness' : 'recovery' })}>{r.level === 'nodata' ? 'Aggiungi i dati' : 'Vedi andamento'}</button>
          {r.level !== 'nodata' && <button className="btn btn-secondary" onClick={() => nav.go({ k: 'wellness' })}>Aggiungi dati</button>}
        </div>
      </section>

      <ActivityBlock nav={nav} />

      {patch && <button className="card card-tap coach-note" onClick={() => nav.tab('coach')}><strong className="brass">Il coach ha modificato {patch.dayName}</strong><span>{patch.note || 'Modifica applicata'}</span></button>}
      {unsent && <button className="card card-tap coach-note" onClick={() => nav.tab('coach')}><strong className="brass">Hai dati nuovi per il coach</strong><span>Copia il riepilogo e mandalo in chat per ricevere indicazioni.</span></button>}

      <section className="card pair">
        <div><strong>{tmr ? 'Domani' : 'Domani ti alleni?'}</strong><span className="hint">{tmr ? { piano: 'Sì, come da piano', leggera: 'Sì, ma più leggera', diversa: 'Sì, ma diverso dal piano', riposo: 'Riposo' }[tmr.answer] : 'Rispondi e il coach ricalibra la sessione.'}</span></div>
        <button className="btn btn-secondary btn-sm" onClick={() => nav.go({ k: 'tomorrow' })}>{tmr ? 'Cambia' : 'Rispondi'}</button>
      </section>
      <section className="card pair">
        <div><strong>{ci ? 'Check-in fatto' : 'Com\'è la tua giornata'}</strong><span className="hint">{ci ? `Energia ${ci.energy}, umore ${ci.mood}, stress ${ci.stress}` : 'Energia, umore, stress, cibo e peso. 20 secondi.'}</span></div>
        <button className="btn btn-secondary btn-sm" onClick={() => nav.go({ k: 'checkin' })}>{ci ? 'Modifica' : 'Check-in'}</button>
      </section>
    </>
  )
}
