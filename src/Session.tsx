import { useEffect, useState } from 'react'
import { useStore } from './store'
import { ConfirmButton, Icon, Ring, useNow } from './ui'
import { exerciseHistory, fmtClock, fmtDate, fmtKg, fmtRest } from './lib'
import type { ActiveSet, Exercise } from './types'
import { uid } from './lib'

function Stepper({ id, value, step, onChange, label }: { id: string; value: number | null; step: number; onChange: (v: number | null) => void; label: string }) {
  const bump = (d: number) => onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100))
  return (
    <div className="stepper">
      <button type="button" onClick={() => bump(-step)} aria-label={`Meno ${label}`}><Icon name="minus" size={16} /></button>
      <input id={id} inputMode="decimal" aria-label={label} value={value ?? ''} placeholder="–"
        onChange={(e) => { const v = e.target.value.replace(',', '.'); onChange(v === '' || isNaN(Number(v)) ? null : Number(v)) }} />
      <button type="button" onClick={() => bump(step)} aria-label={`Più ${label}`}><Icon name="plus" size={16} /></button>
    </div>
  )
}

function ExerciseCard({ ex, sets, nextLabel }: { ex: Exercise; sets: ActiveSet[]; nextLabel: string }) {
  const { state, dispatch } = useStore()
  const last = exerciseHistory(state.logs, ex.name).pop()
  const done = sets.filter((s) => s.done).length
  const complete = done === sets.length
  const [open, setOpen] = useState(true)
  return (
    <article className={`ex${complete ? ' is-complete' : ''}`}>
      <button className="ex-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="ex-count">{done}/{sets.length}</span>
        <span className="ex-title">
          <strong>{ex.name}</strong>
          <span>{ex.sets} × {ex.reps}{ex.weight != null ? `, ${ex.weightNote}` : ''}</span>
        </span>
        {ex.isNew && <span className="chip chip-new">Nuovo</span>}
      </button>
      {open && (
        <div className="ex-body">
          {ex.technique && <p className="ex-tech">{ex.technique}</p>}
          <p className="ex-meta">
            <span><Icon name="clock" size={14} />Recupero {ex.rest ? fmtRest(ex.rest) : `nessuno, ${nextLabel}`}</span>
            {last && <span>Ultima volta {fmtKg(last.top)} kg × {last.reps.join(', ')} ({fmtDate(last.date, { day: 'numeric', month: 'short' })})</span>}
          </p>
          <div className="sets" role="group" aria-label={`Serie di ${ex.name}`}>
            <div className="sets-head"><span></span><span>kg</span><span>ripetizioni</span><span></span></div>
            {sets.map((s, i) => (
              <div className={`set${s.done ? ' is-done' : ''}`} key={i}>
                <span className="set-n">{i + 1}</span>
                <Stepper id={`${ex.id}-w${i}`} label={`peso serie ${i + 1}`} value={s.w} step={2.5} onChange={(v) => dispatch({ type: 'setValue', exId: ex.id, idx: i, field: 'w', value: v })} />
                <Stepper id={`${ex.id}-r${i}`} label={`ripetizioni serie ${i + 1}`} value={s.r} step={1} onChange={(v) => dispatch({ type: 'setValue', exId: ex.id, idx: i, field: 'r', value: v })} />
                <button className="set-check" aria-pressed={s.done} aria-label={`Serie ${i + 1} ${s.done ? 'fatta' : 'da fare'}`}
                  onClick={() => { try { navigator.vibrate?.(30) } catch { /* vibrazione non disponibile */ } dispatch({ type: 'toggleSet', exId: ex.id, idx: i, restS: ex.rest, label: `Dopo ${ex.name}` }) }}>
                  <Icon name="check" size={20} />
                </button>
              </div>
            ))}
          </div>
          <button className="link" onClick={() => dispatch({ type: 'addSet', exId: ex.id })}>Aggiungi una serie</button>
        </div>
      )}
    </article>
  )
}

function AddExtra({ names }: { names: string[] }) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', sets: '3', reps: '10', w: '', rest: '90', keep: true, after: '' })
  const num = (v: string) => (v === '' || isNaN(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')))
  if (!open) return <button className="ghost-add" onClick={() => setOpen(true)}><Icon name="plus" size={16} />Aggiungi esercizio a questa sessione</button>
  const add = () => {
    if (!f.name.trim()) return
    const w = num(f.w), n = Math.max(1, Number(f.sets) || 1)
    const ex: Exercise = { id: `x-${uid()}`, name: f.name.trim(), sets: n, reps: f.reps || '10', weight: w, weightNote: w != null ? `${w.toLocaleString('it-IT')} kg` : '', rest: Math.max(0, Number(f.rest) || 0), technique: '', group: null, isNew: true, afterName: f.after || undefined }
    dispatch({ type: 'addExtra', exercise: ex, sets: Array.from({ length: n }, () => ({ w, r: Number(f.reps) || null, done: false })), keep: f.keep })
    setOpen(false); setF({ name: '', sets: '3', reps: '10', w: '', rest: '90', keep: true, after: '' })
  }
  // Pannello ancorato in alto: la tastiera occupa la parte bassa dello schermo e non copre più i campi.
  return (
    <div className="sheet-backdrop" onClick={() => setOpen(false)}>
    <article className="sheet" role="dialog" aria-label="Aggiungi esercizio" onClick={(e) => e.stopPropagation()}>
      <div className="card-title"><strong>Aggiungi esercizio</strong></div>
      <div className="form">
        <label>Esercizio<input id="x-name" autoFocus enterKeyHint="next" value={f.name} placeholder="Es. Hack squat" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="edit-grid">
          <label>Serie<input id="x-sets" inputMode="numeric" value={f.sets} onChange={(e) => setF({ ...f, sets: e.target.value })} /></label>
          <label>Ripetizioni<input id="x-reps" value={f.reps} onChange={(e) => setF({ ...f, reps: e.target.value })} /></label>
          <label>Peso kg<input id="x-w" inputMode="decimal" value={f.w} onChange={(e) => setF({ ...f, w: e.target.value })} /></label>
          <label>Recupero s<input id="x-rest" inputMode="numeric" value={f.rest} onChange={(e) => setF({ ...f, rest: e.target.value })} /></label>
        </div>
        <label>Dopo quale esercizio<select id="x-after" value={f.after} onChange={(e) => setF({ ...f, after: e.target.value })}><option value="">In fondo</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="check-row"><input id="x-keep" type="checkbox" checked={f.keep} onChange={(e) => setF({ ...f, keep: e.target.checked })} />Tienilo anche nella scheda</label>
        <div className="act-row"><button className="btn btn-primary" onClick={add}>Aggiungi</button><button className="btn btn-secondary" onClick={() => setOpen(false)}>Annulla</button></div>
      </div>
    </article>
    </div>
  )
}

export function Session({ onClose, onFinished }: { onClose: () => void; onFinished: (logId: string) => void }) {
  const { state, dispatch } = useStore()
  const a = state.active
  const now = useNow(!!a)
  const [showTech, setShowTech] = useState(false)
  const program = a && state.programs.find((p) => p.id === a.programId)
  const day = program?.days.find((d) => d.id === a?.dayId)

  // Lo schermo resta acceso mentre ti alleni, dove il telefono lo consente.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    wl?.request('screen').then((l) => { lock = l }).catch(() => { /* non concesso: si prosegue comunque */ })
    return () => { lock?.release().catch(() => {}) }
  }, [])

  const rest = a?.rest ?? null
  const restElapsed = rest ? rest.accMs + (rest.startedAt ? now - rest.startedAt : 0) : 0
  const restLeft = rest ? rest.plannedMs - restElapsed : 0
  useEffect(() => {
    if (rest && !rest.buzzed && restLeft <= 0) {
      try { navigator.vibrate?.([220, 120, 220]) } catch { /* vibrazione non disponibile */ }
      dispatch({ type: 'buzzed' })
    }
  }, [rest, restLeft, dispatch])

  if (!a || !day) return null
  const paused = !a.resumedAt
  const elapsed = a.activeMs + (a.resumedAt ? now - a.resumedAt : 0)
  const exList = (() => {
    const list = [...day.exercises]
    for (const x of (a.extra ?? []).filter((y) => !day.exercises.some((z) => z.id === y.id))) {
      const at = x.afterName ? list.findIndex((e) => e.name === x.afterName) : -1
      list.splice(at >= 0 ? at + 1 : list.length, 0, x)
    }
    return list
  })()
  const all = exList.flatMap((e) => a.sets[e.id] ?? [])
  const doneSets = all.filter((s) => s.done).length
  const budget = (day.minutes ?? 0) * 60000
  const finish = () => { const id = `log-${a.startedAt}`; dispatch({ type: 'finish' }); onFinished(id) }

  return (
    <div className="session" role="dialog" aria-label="Allenamento in corso">
      <header className="session-top">
        <button className="icon-btn" onClick={onClose} aria-label="Riduci"><Icon name="down" /></button>
        <div className="session-clock">
          <span className={`clock${paused ? ' is-paused' : ''}`}>{fmtClock(elapsed)}</span>
          <span className="clock-sub">{paused ? 'In pausa' : `${day.name}${budget ? `, obiettivo ${day.minutes} min` : ''}`}</span>
        </div>
        <button className={`pause-btn${paused ? ' is-paused' : ''}`} onClick={() => dispatch({ type: paused ? 'resume' : 'pause' })} aria-label={paused ? 'Riprendi allenamento' : 'Metti in pausa'}>
          <Icon name={paused ? 'play' : 'pause'} fill={paused} size={22} />
        </button>
        <div className="session-bar" aria-hidden="true"><i style={{ width: `${all.length ? (doneSets / all.length) * 100 : 0}%` }} /></div>
      </header>

      <div className="session-body">
        <div className="session-sum">
          <span><strong>{doneSets}</strong> di {all.length} serie</span>
          <span>Recupero totale <strong>{fmtClock(a.restMs + restElapsed)}</strong></span>
          <span>Pause <strong>{fmtClock(a.pausedMs + (a.pausedAt ? now - a.pausedAt : 0))}</strong></span>
        </div>

        {day.techniques.length > 0 && (
          <section className="tech">
            <button className="tech-head" onClick={() => setShowTech(!showTech)} aria-expanded={showTech}>
              <span>Tecniche di questa sessione</span><Icon name={showTech ? 'up' : 'down'} size={18} />
            </button>
            {showTech && <dl>{day.techniques.map((t) => (<div key={t.name}><dt>{t.name}</dt><dd>{t.desc}</dd></div>))}</dl>}
          </section>
        )}

        {exList.map((ex, i) => {
          const prev = exList[i - 1], next = exList[i + 1]
          const startsGroup = ex.group && prev?.group !== ex.group || (ex.group && prev?.group === ex.group && prev.rest > 0)
          return (
            <div key={ex.id} className={ex.group ? 'grouped' : ''}>
              {startsGroup && <p className="group-label">{ex.group}: esegui di seguito, recupero solo alla fine</p>}
              <ExerciseCard ex={ex} sets={a.sets[ex.id] ?? []} nextLabel={next ? `passa a ${next.name}` : 'fine'} />
            </div>
          )
        })}

        <AddExtra names={exList.map((e) => e.name)} />

        {day.core && (
          <article className="ex core">
            <div className="ex-head as-static">
              <span className="ex-count">{a.coreRounds}/{day.core.rounds}</span>
              <span className="ex-title"><strong>Circuito addominali</strong><span>{day.core.rounds} giri, nessuna pausa tra gli esercizi, {day.core.rest} s a fine giro</span></span>
            </div>
            <ol className="core-list">
              {(a.core ?? day.core.items).map((it, i) => (
                <li key={`${it.name}-${i}`}>
                  <strong>{it.name}</strong>
                  <span className="core-vals">
                    <input id={`core-t-${i}`} className="core-in" aria-label={`Quantità ${it.name}`} value={it.target} onChange={(e) => dispatch({ type: 'setCoreItem', idx: i, patch: { target: e.target.value } })} />
                    <input id={`core-w-${i}`} className="core-in core-kg" inputMode="decimal" aria-label={`Peso ${it.name}, kg`} placeholder="kg" value={it.w ?? ''} onChange={(e) => { const v = e.target.value.replace(',', '.'); dispatch({ type: 'setCoreItem', idx: i, patch: { w: v === '' || isNaN(Number(v)) ? null : Number(v) } }) }} />
                  </span>
                  {it.cue && <span className="core-cue">{it.cue}</span>}
                </li>
              ))}
            </ol>
            {a.coreRounds === 0 && <button className="link core-start" onClick={() => dispatch({ type: 'startCore' })}>Inizia il circuito: chiudi il recupero</button>}
            <button className="btn btn-secondary btn-wide" disabled={a.coreRounds >= day.core.rounds} onClick={() => dispatch({ type: 'coreRound', restS: a.coreRounds + 1 < day.core!.rounds ? day.core!.rest : 0 })}>
              {a.coreRounds >= day.core.rounds ? 'Circuito completato' : `Giro ${a.coreRounds + 1} completato`}
            </button>
          </article>
        )}

        <div className="session-end">
          <button className="btn btn-primary btn-wide" onClick={finish} disabled={doneSets === 0 && a.coreRounds === 0}>Termina e salva allenamento</button>
          <ConfirmButton label="Annulla allenamento" confirm="Tocca ancora per cancellare questa sessione" onConfirm={() => { dispatch({ type: 'discard' }); onClose() }} />
        </div>
      </div>

      {rest && (
        <aside className={`rest${restLeft <= 0 ? ' is-over' : ''}`} aria-live="polite">
          <Ring progress={rest.plannedMs ? Math.max(0, restLeft) / rest.plannedMs : 0} size={76} over={restLeft <= 0}>
            <span className="rest-time">{restLeft >= 0 ? fmtClock(restLeft + 999) : `+${fmtClock(-restLeft)}`}</span>
          </Ring>
          <div className="rest-mid">
            <strong>{restLeft > 0 ? 'Recupero' : 'Recupero finito, riparti'}</strong>
            <span>{rest.label}</span>
            <div className="rest-adj">
              <button onClick={() => dispatch({ type: 'adjustRest', deltaS: -15 })}>−15 s</button>
              <button onClick={() => dispatch({ type: 'adjustRest', deltaS: 15 })}>+15 s</button>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'endRest' })}>{restLeft > 0 ? 'Salta' : 'Inizia serie'}</button>
        </aside>
      )}

      {paused && (
        <div className="paused">
          <p className="paused-t">Allenamento in pausa</p>
          <p>Il cronometro è fermo. Il tempo di pausa viene registrato a parte.</p>
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'resume' })}><Icon name="play" fill size={18} />Riprendi</button>
        </div>
      )}
    </div>
  )
}
