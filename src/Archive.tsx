import { useState } from 'react'
import { useStore } from './store'
import { ConfirmButton, Icon, Spark, Stat, TopBar } from './ui'
import { allExerciseNames, exerciseHistory, fmtClock, fmtDate, fmtInt, fmtKg, logSets, logVolume } from './lib'
import type { Nav } from './App'
import type { SessionLog } from './types'

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

function EditLog({ l }: { l: SessionLog }) {
  const { state, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const day = state.programs.find((p) => p.id === l.programId)?.days.find((d) => d.id === l.dayId)
  const [x, setX] = useState({ name: '', sets: '3', reps: '12', w: '' })
  const [added, setAdded] = useState<{ name: string; sets: { w: number | null; r: number | null }[] }[]>([])
  const [rounds, setRounds] = useState(String(l.coreRounds ?? day?.core?.rounds ?? 4))
  const [coreOn, setCoreOn] = useState(!l.core && !!day?.core)
  const [items, setItems] = useState(() => (day?.core?.items ?? []).map((c) => ({ name: c.name, target: c.target, w: c.w != null ? String(c.w) : '' })))
  const [dur, setDur] = useState(l.durationMs != null ? String(Math.round(l.durationMs / 60000)) : '')
  const num = (v: string) => (v === '' || isNaN(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')))
  if (!open) return <button className="btn btn-secondary btn-wide" onClick={() => setOpen(true)}>Correggi sessione</button>
  const addEx = () => {
    if (!x.name.trim()) return
    const w = num(x.w), r = Number(x.reps) || null
    setAdded([...added, { name: x.name.trim(), sets: Array.from({ length: Math.max(1, Number(x.sets) || 1) }, () => ({ w, r })) }])
    setX({ name: '', sets: '3', reps: '12', w: '' })
  }
  const save = () => {
    dispatch({ type: 'editLog', id: l.id, add: added, durationMin: num(dur),
      ...(coreOn && items.length ? { coreRounds: Number(rounds) || 0, core: items.map((c) => ({ name: c.name, target: c.target, w: num(c.w) })) } : {}) })
    setOpen(false); setAdded([])
  }
  return (
    <section className="card edit-log">
      <div className="card-title"><strong>Correggi sessione</strong></div>
      <p className="hint">Aggiungi ciò che hai fatto fuori dall'app. I recuperi diventano non misurati.</p>
      {added.map((e, i) => <p key={i} className="hint"><strong>{e.name}</strong>: {e.sets.length} × {e.sets[0].r ?? '–'}{e.sets[0].w != null ? ` a ${fmtKg(e.sets[0].w)} kg` : ''}</p>)}
      <div className="form">
        <label>Esercizio fatto<input id="el-name" value={x.name} placeholder="Es. Hack squat" onChange={(e) => setX({ ...x, name: e.target.value })} /></label>
        <div className="edit-grid">
          <label>Serie<input id="el-sets" inputMode="numeric" value={x.sets} onChange={(e) => setX({ ...x, sets: e.target.value })} /></label>
          <label>Ripetizioni<input id="el-reps" inputMode="numeric" value={x.reps} onChange={(e) => setX({ ...x, reps: e.target.value })} /></label>
          <label>Peso kg<input id="el-w" inputMode="decimal" value={x.w} onChange={(e) => setX({ ...x, w: e.target.value })} /></label>
        </div>
        <button className="btn btn-secondary btn-wide" onClick={addEx}>Aggiungi alla sessione</button>
      </div>
      {day?.core && (
        <div className="form">
          <label className="check-row"><input id="el-core" type="checkbox" checked={coreOn} onChange={(e) => setCoreOn(e.target.checked)} />Registra il circuito addominali</label>
          {coreOn && (
            <>
              <label>Giri fatti<input id="el-rounds" inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value)} /></label>
              {items.map((c, i) => (
                <div className="core-edit-item" key={i}>
                  <label>{c.name}<input id={`el-ct-${i}`} value={c.target} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, target: e.target.value } : y)))} /></label>
                  <label>kg<input id={`el-cw-${i}`} inputMode="decimal" value={c.w} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, w: e.target.value } : y)))} /></label>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <label>Durata totale, minuti<input id="el-dur" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} /></label>
      <div className="act-row"><button className="btn btn-primary" onClick={save}>Salva correzioni</button><button className="btn btn-secondary" onClick={() => setOpen(false)}>Annulla</button></div>
    </section>
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
      {l.watch && (l.watch.avgHr != null || l.watch.kcal != null) && (
        <div className="card">
          <div className="card-title"><strong>Dall'orologio</strong><span className="hint">abbinata per orario</span></div>
          <div className="watch-stats">
            <div><b>{l.watch.avgHr ?? '–'}</b><span className="hint">FC media</span></div>
            <div><b>{l.watch.maxHr ?? '–'}</b><span className="hint">FC max</span></div>
            <div><b>{l.watch.kcal ?? '–'}</b><span className="hint">kcal, stima</span></div>
          </div>
          <p className="hint">Le calorie dell'orologio per i pesi sono una stima: valgono come ordine di grandezza.</p>
        </div>
      )}
      {l.core && l.core.length > 0 && (
        <div className="card">
          <div className="card-title"><strong>Circuito addominali</strong><span>{l.coreRounds ?? 0} giri</span></div>
          <ul className="core-done">{l.core.map((c, i) => <li key={i}><span>{c.name}</span><strong>{c.target}{c.w != null ? `, ${fmtKg(c.w)} kg` : ''}</strong></li>)}</ul>
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
      <EditLog l={l} />
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
