import { useState } from 'react'
import { useStore } from './store'
import { ConfirmButton, Icon, TopBar } from './ui'
import { fmtRest, readyToProgress, uid } from './lib'
import { mesoWeek } from './wellness'
import type { Day, Exercise, Program } from './types'
import type { Nav } from './App'

export function Programs({ nav }: { nav: Nav }) {
  const { state } = useStore()
  const sorted = [...state.programs].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
  return (
    <div className="screen">
      <TopBar title="Piano" right={<button className="btn btn-secondary btn-sm" onClick={() => nav.go({ k: 'edit', id: null })}><Icon name="plus" size={16} />Nuova</button>} />
      <MesoCard nav={nav} />
      <ul className="list list-cards">
        {sorted.map((p) => (
          <li key={p.id}>
            <button className={`card card-tap prog${p.status === 'active' ? ' is-active' : ''}`} onClick={() => nav.go({ k: 'program', id: p.id })}>
              <div className="card-title"><strong>{p.name}</strong>{p.status === 'active' ? <span className="chip chip-on">Attiva</span> : <span>{p.period}</span>}</div>
              <p className="prog-sub">{p.subtitle}</p>
              <p className="prog-meta">{p.days.length} giorni, {p.days.reduce((t, d) => t + d.exercises.length, 0)} esercizi, {state.logs.filter((l) => l.programId === p.id).length} sessioni registrate</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProgramDetail({ id, nav }: { id: string; nav: Nav }) {
  const { state, dispatch } = useStore()
  const p = state.programs.find((x) => x.id === id)
  const [open, setOpen] = useState<string | null>(p?.days[0]?.id ?? null)
  if (!p) return <div className="screen"><TopBar title="Scheda" onBack={nav.back} /><p className="hint">Questa scheda non esiste più.</p></div>
  const duplicate = () => {
    const nid = uid()
    const copy: Program = { ...structuredClone(p), id: nid, name: `${p.name} (copia)`, status: 'archived' }
    copy.days.forEach((d) => { d.id = `${nid}-${uid()}`; d.exercises.forEach((e) => { e.id = `${nid}-${uid()}` }) })
    dispatch({ type: 'saveProgram', program: copy }); nav.go({ k: 'edit', id: nid })
  }
  return (
    <div className="screen">
      <TopBar title={p.name} onBack={nav.back} right={<button className="btn btn-secondary btn-sm" onClick={() => nav.go({ k: 'edit', id: p.id })}>Modifica</button>} />
      <p className="lead">{p.subtitle}{p.period ? `, ${p.period.toLowerCase()}` : ''}</p>
      {p.note && <p className="hint">{p.note}</p>}

      {p.days.map((d) => {
        const isOpen = open === d.id
        return (
          <section className="day" key={d.id}>
            <button className="day-head" onClick={() => setOpen(isOpen ? null : d.id)} aria-expanded={isOpen}>
              <span className="day-letter">{d.label}</span>
              <span className="day-title"><strong>{d.name}</strong><span>{d.exercises.length} esercizi{d.minutes ? `, ${d.minutes} min` : ''}{d.core ? ', circuito addominali' : ''}</span></span>
              <Icon name={isOpen ? 'up' : 'down'} size={18} />
            </button>
            {isOpen && (
              <div className="day-body">
                {d.focus && <p className="day-focus">{d.focus}</p>}
                {d.techniques.length > 0 && <dl className="tech-list">{d.techniques.map((t) => (<div key={t.name}><dt>{t.name}</dt><dd>{t.desc}</dd></div>))}</dl>}
                <ol className="plan">
                  {d.exercises.map((e) => (
                    <li key={e.id} className={e.group ? 'in-group' : ''}>
                      <div className="plan-top">
                        <strong>{e.name}</strong>
                        <span className="plan-dose">{e.sets} × {e.reps}</span>
                      </div>
                      <div className="plan-chips">
                        {e.weightNote && <span className="chip chip-kg">{e.weightNote}</span>}
                        <span className="chip">Recupero {fmtRest(e.rest)}</span>
                        {e.group && <span className="chip chip-group">{e.group}</span>}
                        {e.isNew && <span className="chip chip-new">Nuovo</span>}
                        {p.status === 'active' && readyToProgress(state.logs, e) && <span className="chip chip-up">Pronto a +2,5 kg</span>}
                      </div>
                      {e.technique && <p className="plan-tech">{e.technique}</p>}
                    </li>
                  ))}
                </ol>
                {d.core && (
                  <div className="core-box">
                    <strong>Circuito addominali, ultimi 20 minuti</strong>
                    <p>{d.core.rounds} giri senza pausa tra gli esercizi, {d.core.rest} s di recupero a fine giro.</p>
                    <ol>{d.core.items.map((it) => <li key={it.name}><strong>{it.name}</strong>, {it.target}<span>{it.cue}</span></li>)}</ol>
                  </div>
                )}
                {!state.active && (
                  <button className="btn btn-primary btn-wide" onClick={() => { dispatch({ type: 'start', program: p, day: d }); nav.openSession() }}>
                    <Icon name="play" fill size={18} />Inizia {d.name}
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}

      <div className="actions">
        {p.status !== 'active' && <button className="btn btn-secondary" onClick={() => dispatch({ type: 'activate', id: p.id })}>Imposta come scheda attiva</button>}
        <button className="btn btn-secondary" onClick={duplicate}><Icon name="copy" size={16} />Duplica e modifica</button>
        <ConfirmButton label="Elimina scheda" confirm="Tocca ancora per eliminare" onConfirm={() => { dispatch({ type: 'deleteProgram', id: p.id }); nav.back() }} />
      </div>
    </div>
  )
}

const blankEx = (): Exercise => ({ id: uid(), name: '', sets: 3, reps: '10', weight: null, weightNote: '', rest: 90, technique: '', group: null, isNew: false })
const blankDay = (n: number): Day => ({ id: uid(), name: `Giorno ${n}`, label: String(n), focus: '', minutes: 80, techniques: [], exercises: [blankEx()] })

export function ProgramEditor({ id, nav }: { id: string | null; nav: Nav }) {
  const { state, dispatch } = useStore()
  const [p, setP] = useState<Program>(() => {
    const found = state.programs.find((x) => x.id === id)
    return found ? structuredClone(found) : { id: uid(), name: '', subtitle: '', period: '', status: 'archived', note: '', days: [blankDay(1)] }
  })
  const [error, setError] = useState('')
  const setDay = (i: number, patch: Partial<Day>) => setP({ ...p, days: p.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) })
  const setEx = (i: number, k: number, patch: Partial<Exercise>) => setDay(i, { exercises: p.days[i].exercises.map((e, j) => (j === k ? { ...e, ...patch } : e)) })
  const move = (i: number, k: number, dir: number) => {
    const list = [...p.days[i].exercises]; const t = k + dir
    if (t < 0 || t >= list.length) return
    ;[list[k], list[t]] = [list[t], list[k]]; setDay(i, { exercises: list })
  }
  const save = () => {
    if (!p.name.trim()) return setError('Dai un nome alla scheda prima di salvarla.')
    const days = p.days.map((d) => ({ ...d, core: d.core && d.core.items.some((c) => c.name.trim()) ? { ...d.core, items: d.core.items.filter((c) => c.name.trim()) } : undefined, exercises: d.exercises.filter((e) => e.name.trim()).map((e) => ({ ...e, weightNote: e.weight != null ? e.weightNote || `${e.weight.toLocaleString('it-IT')} kg` : e.weightNote })) })).filter((d) => d.exercises.length)
    if (!days.length) return setError('Aggiungi almeno un esercizio con un nome.')
    dispatch({ type: 'saveProgram', program: { ...p, days } }); nav.replace({ k: 'program', id: p.id })
  }
  const num = (v: string) => (v === '' || isNaN(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')))
  return (
    <div className="screen">
      <TopBar title={id ? 'Modifica scheda' : 'Nuova scheda'} onBack={nav.back} right={<button className="btn btn-primary btn-sm" onClick={save}>Salva</button>} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form">
        <label>Nome<input id="p-name" value={p.name} placeholder="Mese 8" onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label>Descrizione<input id="p-sub" value={p.subtitle} placeholder="Full Body x4" onChange={(e) => setP({ ...p, subtitle: e.target.value })} /></label>
        <label>Periodo<input id="p-period" value={p.period} placeholder="Dicembre 2026" onChange={(e) => setP({ ...p, period: e.target.value })} /></label>
        <label>Note<textarea id="p-note" rows={2} value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} /></label>
      </div>
      {p.days.map((d, i) => (
        <section className="edit-day" key={d.id}>
          <div className="edit-day-head">
            <input id={`d-${d.id}-label`} className="in-letter" aria-label="Sigla del giorno" maxLength={2} value={d.label} onChange={(e) => setDay(i, { label: e.target.value })} />
            <input id={`d-${d.id}-name`} aria-label="Nome del giorno" value={d.name} onChange={(e) => setDay(i, { name: e.target.value })} />
            <button className="icon-btn danger" aria-label={`Elimina ${d.name}`} onClick={() => setP({ ...p, days: p.days.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></button>
          </div>
          <label className="inline">Focus<input id={`d-${d.id}-focus`} value={d.focus} onChange={(e) => setDay(i, { focus: e.target.value })} /></label>
          {d.exercises.map((e, k) => (
            <div className="edit-ex" key={e.id}>
              <div className="edit-ex-top">
                <input id={`e-${e.id}-name`} aria-label="Nome esercizio" placeholder="Nome esercizio" value={e.name} onChange={(ev) => setEx(i, k, { name: ev.target.value })} />
                <button className="icon-btn" aria-label="Sposta su" onClick={() => move(i, k, -1)}><Icon name="up" size={16} /></button>
                <button className="icon-btn" aria-label="Sposta giù" onClick={() => move(i, k, 1)}><Icon name="down" size={16} /></button>
                <button className="icon-btn danger" aria-label="Elimina esercizio" onClick={() => setDay(i, { exercises: d.exercises.filter((_, j) => j !== k) })}><Icon name="trash" size={16} /></button>
              </div>
              <div className="edit-grid">
                <label>Serie<input id={`e-${e.id}-sets`} inputMode="numeric" value={e.sets} onChange={(ev) => setEx(i, k, { sets: Math.max(1, Number(ev.target.value) || 1) })} /></label>
                <label>Ripetizioni<input id={`e-${e.id}-reps`} value={e.reps} onChange={(ev) => setEx(i, k, { reps: ev.target.value })} /></label>
                <label>Peso kg<input id={`e-${e.id}-w`} inputMode="decimal" value={e.weight ?? ''} onChange={(ev) => setEx(i, k, { weight: num(ev.target.value), weightNote: '' })} /></label>
                <label>Recupero s<input id={`e-${e.id}-rest`} inputMode="numeric" value={e.rest} onChange={(ev) => setEx(i, k, { rest: Math.max(0, Number(ev.target.value) || 0) })} /></label>
              </div>
              <label className="inline">Tecnica<input id={`e-${e.id}-tech`} value={e.technique} placeholder="Es. ultima serie rest-pause" onChange={(ev) => setEx(i, k, { technique: ev.target.value })} /></label>
              <label className="inline">Abbinamento
                <select id={`e-${e.id}-group`} value={e.group ?? ''} onChange={(ev) => setEx(i, k, { group: ev.target.value || null })}>
                  <option value="">Nessuno</option><option>Superserie</option><option>Set meccanico</option>
                </select>
              </label>
            </div>
          ))}
          <button className="btn btn-secondary btn-wide" onClick={() => setDay(i, { exercises: [...d.exercises, blankEx()] })}><Icon name="plus" size={16} />Aggiungi esercizio</button>
          {d.core ? (
            <div className="edit-core">
              <div className="card-title"><strong>Circuito addominali</strong>
                <button className="link" onClick={() => setDay(i, { core: undefined })}>Togli circuito</button></div>
              <div className="edit-grid">
                <label>Giri<input id={`c-${d.id}-rounds`} inputMode="numeric" value={d.core.rounds} onChange={(ev) => setDay(i, { core: { ...d.core!, rounds: Math.max(1, Number(ev.target.value) || 1) } })} /></label>
                <label>Recupero s<input id={`c-${d.id}-rest`} inputMode="numeric" value={d.core.rest} onChange={(ev) => setDay(i, { core: { ...d.core!, rest: Math.max(0, Number(ev.target.value) || 0) } })} /></label>
              </div>
              {d.core.items.map((c, k) => {
                const setC = (patch: Partial<typeof c>) => setDay(i, { core: { ...d.core!, items: d.core!.items.map((x, j) => (j === k ? { ...x, ...patch } : x)) } })
                const mv = (dir: number) => { const list = [...d.core!.items]; const t = k + dir; if (t < 0 || t >= list.length) return; [list[k], list[t]] = [list[t], list[k]]; setDay(i, { core: { ...d.core!, items: list } }) }
                return (
                  <div className="edit-ex" key={k}>
                    <div className="edit-ex-top">
                      <input id={`c-${d.id}-${k}-name`} aria-label="Nome esercizio del circuito" placeholder="Nome esercizio" value={c.name} onChange={(ev) => setC({ name: ev.target.value })} />
                      <button className="icon-btn" aria-label="Sposta su" onClick={() => mv(-1)}><Icon name="up" size={16} /></button>
                      <button className="icon-btn" aria-label="Sposta giù" onClick={() => mv(1)}><Icon name="down" size={16} /></button>
                      <button className="icon-btn danger" aria-label="Elimina esercizio del circuito" onClick={() => setDay(i, { core: { ...d.core!, items: d.core!.items.filter((_, j) => j !== k) } })}><Icon name="trash" size={16} /></button>
                    </div>
                    <div className="core-edit-item">
                      <label>Quantità<input id={`c-${d.id}-${k}-t`} value={c.target} placeholder="12 per lato" onChange={(ev) => setC({ target: ev.target.value })} /></label>
                      <label>Note<input id={`c-${d.id}-${k}-cue`} value={c.cue} onChange={(ev) => setC({ cue: ev.target.value })} /></label>
                    </div>
                  </div>
                )
              })}
              <button className="btn btn-secondary btn-wide" onClick={() => setDay(i, { core: { ...d.core!, items: [...d.core!.items, { name: '', target: '12 rip.', cue: '' }] } })}><Icon name="plus" size={16} />Aggiungi esercizio al circuito</button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-wide" onClick={() => setDay(i, { core: { rounds: 4, rest: 60, items: [{ name: '', target: '12 rip.', cue: '' }] } })}><Icon name="plus" size={16} />Aggiungi circuito addominali</button>
          )}
        </section>
      ))}
      <button className="btn btn-secondary btn-wide" onClick={() => setP({ ...p, days: [...p.days, blankDay(p.days.length + 1)] })}><Icon name="plus" size={16} />Aggiungi giorno</button>
      <button className="btn btn-primary btn-wide" onClick={save}>Salva scheda</button>
    </div>
  )
}

function MesoCard({ nav }: { nav: Nav }) {
  const { state } = useStore()
  const mw = mesoWeek(state)
  const label = mw.phase === 'pre' ? 'inizia presto' : mw.phase === 'done' ? 'concluso: chiedi il prossimo' : mw.phase === 'deload' ? 'settimana di scarico' : `settimana ${mw.week} di ${mw.total}`
  return (
    <button className="card card-tap" onClick={() => nav.go({ k: 'meso' })}>
      <div className="card-title"><strong>Mesociclo {state.meso.number}</strong><span>{label}</span></div>
      <div className="meso-dots" aria-hidden="true">{Array.from({ length: mw.total }, (_, i) => <i key={i} className={`${i + 1 < mw.week ? 'd' : ''}${i + 1 === mw.week ? 'n' : ''}${i + 1 === mw.total ? ' dl' : ''}`} />)}</div>
      <p className="hint">{state.meso.trainWeeks} settimane più scarico. Tocca per vedere obiettivi e prossimo ciclo.</p>
    </button>
  )
}
