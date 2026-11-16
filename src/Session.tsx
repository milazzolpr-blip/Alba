import { useEffect, useState } from 'react'
import { useStore } from './store'
import { ConfirmButton, Icon, Ring, useNow } from './ui'
import { exerciseHistory, fmtClock, fmtDate, fmtKg, fmtRest } from './lib'
import type { ActiveSet, Exercise } from './types'

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
  const all = day.exercises.flatMap((e) => a.sets[e.id] ?? [])
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

        {day.exercises.map((ex, i) => {
          const prev = day.exercises[i - 1], next = day.exercises[i + 1]
          const startsGroup = ex.group && prev?.group !== ex.group || (ex.group && prev?.group === ex.group && prev.rest > 0)
          return (
            <div key={ex.id} className={ex.group ? 'grouped' : ''}>
              {startsGroup && <p className="group-label">{ex.group}: esegui di seguito, recupero solo alla fine</p>}
              <ExerciseCard ex={ex} sets={a.sets[ex.id] ?? []} nextLabel={next ? `passa a ${next.name}` : 'fine'} />
            </div>
          )
        })}

        {day.core && (
          <article className="ex core">
            <div className="ex-head as-static">
              <span className="ex-count">{a.coreRounds}/{day.core.rounds}</span>
              <span className="ex-title"><strong>Circuito addominali</strong><span>{day.core.rounds} giri, nessuna pausa tra gli esercizi, {day.core.rest} s a fine giro</span></span>
            </div>
            <ol className="core-list">
              {day.core.items.map((it) => (<li key={it.name}><strong>{it.name}</strong><span className="core-target">{it.target}</span><span className="core-cue">{it.cue}</span></li>))}
            </ol>
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
