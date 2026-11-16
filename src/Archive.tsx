import { useState } from 'react'
import { useStore } from './store'
import { ConfirmButton, Icon, Spark, Stat, TopBar } from './ui'
import { allExerciseNames, exerciseHistory, fmtClock, fmtDate, fmtInt, fmtKg, logSets, logVolume } from './lib'
import type { Nav } from './App'

export function Archive({ nav }: { nav: Nav }) {
  const { state } = useStore()
  const [seg, setSeg] = useState<'sessions' | 'exercises'>('sessions')
  const [q, setQ] = useState('')
  const months = new Map<string, typeof state.logs>()
  for (const l of [...state.logs].reverse()) {
    const key = fmtDate(l.startedAt, { month: 'long', year: 'numeric' })
    months.set(key, [...(months.get(key) ?? []), l])
  }
  const names = allExerciseNames(state.logs).filter((n) => n.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.localeCompare(b, 'it'))
  return (
    <div className="screen">
      <TopBar title="Archivio" />
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={seg === 'sessions'} onClick={() => setSeg('sessions')}>Sessioni</button>
        <button role="tab" aria-selected={seg === 'exercises'} onClick={() => setSeg('exercises')}>Esercizi</button>
      </div>
      {seg === 'sessions' ? (
        months.size === 0 ? <section className="empty"><h2>Nessuna sessione</h2><p>Le sessioni che completi compaiono qui, mese per mese.</p></section> :
        [...months.entries()].map(([m, logs]) => (
          <section className="block" key={m}>
            <div className="block-head"><h3>{m.replace(/^./, (c) => c.toUpperCase())}</h3><span className="count">{logs.length} sessioni, {fmtInt(logs.reduce((t, l) => t + logVolume(l), 0) / 1000)} t</span></div>
            <ul className="list">
              {logs.map((l) => (
                <li key={l.id}>
                  <button className="row" onClick={() => nav.go({ k: 'log', id: l.id })}>
                    <span className="row-date"><strong>{new Date(l.startedAt).getDate()}</strong><span>{fmtDate(l.startedAt, { weekday: 'short' })}</span></span>
                    <span className="row-main"><strong>{l.dayName}</strong><span>{state.programs.find((p) => p.id === l.programId)?.name ?? 'Scheda eliminata'}{l.approx ? ', data indicativa' : ''}</span></span>
                    <span className="row-num"><strong>{fmtInt(logVolume(l))} kg</strong><span>{l.durationMs != null ? `${Math.round(l.durationMs / 60000)} min` : `${logSets(l)} serie`}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <>
          <input id="ex-search" className="search" type="search" placeholder="Cerca un esercizio" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca un esercizio" />
          <ul className="list">
            {names.map((name) => {
              const h = exerciseHistory(state.logs, name)
              if (!h.length) return null
              return (
                <li key={name}>
                  <button className="row" onClick={() => nav.go({ k: 'exercise', name })}>
                    <span className="row-main"><strong>{name}</strong><span>{h.length} {h.length === 1 ? 'sessione' : 'sessioni'}</span></span>
                    <Spark values={h.map((p) => p.top)} />
                    <span className="row-num"><strong>{fmtKg(h[h.length - 1].top)} kg</strong><span>massimo {fmtKg(Math.max(...h.map((p) => p.top)))}</span></span>
                  </button>
                </li>
              )
            })}
          </ul>
          {names.length === 0 && <p className="hint">Nessun esercizio con questo nome.</p>}
        </>
      )}
    </div>
  )
}

export function LogDetail({ id, nav }: { id: string; nav: Nav }) {
  const { state, dispatch } = useStore()
  const l = state.logs.find((x) => x.id === id)
  if (!l) return <div className="screen"><TopBar title="Sessione" onBack={nav.back} /><p className="hint">Questa sessione non esiste più.</p></div>
  const before = state.logs.filter((x) => x.startedAt < l.startedAt)
  return (
    <div className="screen">
      <TopBar title={l.dayName} onBack={nav.back} />
      <p className="lead">{fmtDate(l.startedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{l.approx ? ' (data indicativa)' : ''}</p>
      <div className="card stats stats-wrap">
        <Stat value={l.durationMs != null ? fmtClock(l.durationMs) : '–'} label="Tempo attivo" />
        <Stat value={l.restMs != null ? fmtClock(l.restMs) : '–'} label="Recupero totale" />
        <Stat value={l.pausedMs != null ? fmtClock(l.pausedMs) : '–'} label="In pausa" />
        <Stat value={fmtInt(logVolume(l))} unit="kg" label="Volume" />
        <Stat value={String(logSets(l))} label="Serie" />
        {l.coreRounds != null && <Stat value={String(l.coreRounds)} label="Giri addominali" />}
      </div>
      {l.imported && <p className="hint">Sessione importata dai tuoi messaggi: tempi e recuperi non erano registrati.</p>}
      {l.strava && (
        <div className="card strava-data">
          <Icon name="heart" size={18} /><strong>{l.strava.name}</strong>
          <span>{l.strava.avgHr ? `${Math.round(l.strava.avgHr)} bpm medi` : 'frequenza non disponibile'}{l.strava.maxHr ? `, massimo ${Math.round(l.strava.maxHr)}` : ''}{l.strava.calories ? `, ${Math.round(l.strava.calories)} kcal` : ''}</span>
        </div>
      )}
      <ul className="list log-list">
        {l.entries.map((e) => {
          const prev = exerciseHistory(before, e.name).pop()
          const top = Math.max(0, ...e.sets.map((s) => s.w ?? 0))
          const d = prev && top ? top - prev.top : null
          return (
            <li key={e.name}>
              <button className="row row-log" onClick={() => nav.go({ k: 'exercise', name: e.name })}>
                <span className="row-main"><strong>{e.name}</strong>
                  <span className="reps">{e.sets.map((s, i) => <i key={i}>{s.w != null ? `${fmtKg(s.w)} × ` : ''}{s.r ?? '–'}</i>)}</span></span>
                {d != null && <span className={`row-num ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}><strong>{d === 0 ? '=' : `${d > 0 ? '+' : '−'}${fmtKg(Math.abs(d))}`}</strong><span>kg</span></span>}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="actions"><ConfirmButton label="Elimina sessione" confirm="Tocca ancora per eliminare" onConfirm={() => { dispatch({ type: 'deleteLog', id: l.id }); nav.back() }} /></div>
    </div>
  )
}

export function ExerciseDetail({ name, nav }: { name: string; nav: Nav }) {
  const { state } = useStore()
  const h = exerciseHistory(state.logs, name)
  const first = h[0], last = h[h.length - 1]
  return (
    <div className="screen">
      <TopBar title={name} onBack={nav.back} />
      {!h.length ? <p className="hint">Nessun carico registrato per questo esercizio.</p> : (
        <>
          <div className="card stats">
            <Stat value={fmtKg(last.top)} unit="kg" label="Ultimo" />
            <Stat value={fmtKg(Math.max(...h.map((p) => p.top)))} unit="kg" label="Massimo" />
            <Stat value={`${last.top - first.top >= 0 ? '+' : '−'}${fmtKg(Math.abs(last.top - first.top))}`} unit="kg" label="Dall'inizio" />
          </div>
          <div className="card chart">
            <p className="chart-title">Carico della serie più pesante, kg</p>
            <Spark values={h.map((p) => p.top)} w={340} h={150} labels />
            <div className="chart-x"><span>{fmtDate(first.date, { day: 'numeric', month: 'short' })}</span><span>{fmtDate(last.date, { day: 'numeric', month: 'short' })}</span></div>
          </div>
          <ul className="list">
            {[...h].reverse().map((p) => (
              <li key={p.logId}>
                <button className="row" onClick={() => nav.go({ k: 'log', id: p.logId })}>
                  <span className="row-main"><strong>{fmtDate(p.date, { day: 'numeric', month: 'long', year: 'numeric' })}</strong><span>{p.reps.join(', ')} ripetizioni</span></span>
                  <span className="row-num"><strong>{fmtKg(p.top)} kg</strong></span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
