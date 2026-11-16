import { useState } from 'react'
import { useStore } from './store'
import { TopBar } from './ui'
import { mesoWeek } from './wellness'
import { exerciseHistory, fmtKg } from './lib'
import { nextMesoPrompt } from './coach'
import type { Nav } from './App'

const VOL = [50, 60, 72, 80, 70, 30], INT = [60, 68, 76, 84, 92, 40], LAB = ['Base', 'Volume', 'Volume', 'Intensità', 'Picco', 'Scarico']
const COMPOUND = /panca|squat|stacco|pendlay|trazion|military|overhead press|leg press|rematore|press/i

export function Meso({ nav }: { nav: Nav }) {
  const { state, dispatch } = useStore()
  const mw = mesoWeek(state)
  const [msg, setMsg] = useState('')
  const program = state.programs.find((p) => p.status === 'active')
  const lifts = (program?.days.flatMap((d) => d.exercises) ?? [])
    .map((e) => ({ e, h: exerciseHistory(state.logs, e.name) })).filter((x) => x.h.length).sort((a, b) => b.h.length - a.h.length).slice(0, 4)
  const canAsk = mw.phase === 'deload' || mw.phase === 'done'
  const ask = async () => {
    try { await navigator.clipboard.writeText(nextMesoPrompt(state)); dispatch({ type: 'copied' }); setMsg('Copiato. Incollalo nella chat con il coach e poi incolla la risposta nella scheda Coach.') } catch { setMsg('Copia non riuscita: apri la scheda Coach e copia il riepilogo da lì.') }
  }
  const total = state.meso.trainWeeks + 1
  return (
    <div className="screen">
      <TopBar title="Mesociclo" onBack={nav.back} />
      <section className="card">
        <div className="card-title"><strong>Mesociclo {state.meso.number}{program ? `: ${program.name}` : ''}</strong>
          <span>{mw.phase === 'pre' ? 'inizia presto' : mw.phase === 'done' ? 'concluso' : `settimana ${mw.week} di ${total}`}</span></div>
        <p className="hint">{state.meso.trainWeeks} settimane di allenamento e una di scarico. Il coach può ritoccare la scheda anche dentro la settimana.</p>
        <label className="form-inline">Inizio (un lunedì)<input type="date" value={state.meso.startDate} onChange={(e) => e.target.value && dispatch({ type: 'setMeso', startDate: e.target.value })} /></label>
      </section>
      <section className="card"><div className="card-title"><h3 className="h3">Le {total} settimane</h3><span className="hint">chiaro: volume, pieno: intensità</span></div>
        <div className="weeks">{Array.from({ length: total }, (_, i) => {
          const dl = i === total - 1
          return (<div key={i} className={`wk${mw.week === i + 1 ? ' is-now' : ''}${dl ? ' is-deload' : ''}`}>
            <div className="wk-bars"><i style={{ height: `${VOL[i]}%` }} className="v" /><i style={{ height: `${INT[i]}%` }} /></div>
            <strong>S{i + 1}</strong><span>{LAB[i]}</span></div>)
        })}</div></section>
      {lifts.length > 0 && (
        <section className="card"><div className="card-title"><h3 className="h3">Dove puntiamo a fine S{state.meso.trainWeeks}</h3><span className="hint">stima automatica</span></div>
          <ul className="list">{lifts.map(({ e, h }) => { const top = h[h.length - 1].top; const t = top + (COMPOUND.test(e.name) ? 5 : 2); return (
            <li key={e.id} className="row"><span className="row-main"><strong>{e.name}</strong><span>oggi {fmtKg(top)} kg</span></span><span className="row-num"><strong className="brass">{fmtKg(t)} kg</strong></span></li>) })}</ul>
          <p className="hint">Il coach affina questi obiettivi quando gli mandi il riepilogo.</p></section>
      )}
      <section className="card"><strong className="teal">Dopo lo scarico: mesociclo {state.meso.number + 1}</strong>
        <p className="hint">Nella settimana di scarico le serie scendono a circa il 60% e i carichi del 10%, in automatico. Alla fine mandi il riepilogo al coach e ricevi il mesociclo successivo, già impostato sui tuoi nuovi massimali.</p>
        <button className="btn btn-primary btn-wide" disabled={!canAsk} onClick={ask}>Chiedi il prossimo mesociclo</button>
        {!canAsk && <p className="hint">Si attiva nella settimana di scarico.</p>}</section>
      {msg && <p className="toast" role="status">{msg}</p>}
    </div>
  )
}
