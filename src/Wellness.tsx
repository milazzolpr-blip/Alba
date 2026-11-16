import { useState } from 'react'
import { useStore } from './store'
import { Icon, TopBar } from './ui'
import { addDays, dayKey, fmtSleep, levelColor, readiness } from './wellness'
import type { Nav } from './App'
import type { Wellness } from './types'

/** Andamento con la fascia della tua media: il numero da solo non dice se va bene. */
function Trend({ label, unit, values, base, fmt, lowerIsBetter }: { label: string; unit: string; values: { date: string; v: number }[]; base: number | null; fmt: (n: number) => string; lowerIsBetter: boolean }) {
  const last = values[values.length - 1]
  const W = 330, H = 96
  const all = values.map((x) => x.v).concat(base != null ? [base] : [])
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1
  const x = (i: number) => (values.length === 1 ? W / 2 : (i * W) / (values.length - 1))
  const y = (v: number) => 8 + (1 - (v - min) / span) * (H - 16)
  const diff = last && base != null ? last.v - base : null
  const worse = diff != null && (lowerIsBetter ? diff > 0 : diff < 0)
  return (
    <section className="card trend">
      <div className="card-title"><strong>{label}</strong>{diff != null && <span style={{ color: Math.abs(diff) / (base || 1) < 0.03 ? 'var(--muted)' : worse ? 'var(--warn)' : 'var(--good)' }}>{diff > 0 ? '+' : '−'}{unit === 'h' ? fmtSleep(Math.abs(diff)) : fmt(Math.abs(diff))} sulla media</span>}</div>
      <div className="stat-v">{last ? fmt(last.v) : '–'}<span className="stat-u"> {unit === 'h' ? '' : unit}</span></div>
      {values.length > 1 ? (
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}, andamento`}>
          {base != null && <rect x="0" width={W} y={y(base) - 12} height="24" className="trend-band" />}
          <polyline className="trend-line" fill="none" points={values.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} />
          <circle cx={x(values.length - 1)} cy={y(last.v)} r="3.5" className="spark-end" />
        </svg>
      ) : <p className="hint">Servono almeno due giorni di dati per vedere l'andamento.</p>}
      <p className="hint">La fascia azzurra è la tua media abituale.</p>
    </section>
  )
}

export function Recovery({ nav }: { nav: Nav }) {
  const { state, dispatch } = useStore()
  const [range, setRange] = useState(14)
  const r = readiness(state)
  const from = dayKey(addDays(new Date(), -range))
  const ws = state.wellness.filter((w) => w.date >= from)
  const series = (k: 'sleepMin' | 'restHr' | 'hrv') => ws.filter((w) => w[k] != null).map((w) => ({ date: w.date, v: w[k] as number }))
  return (
    <div className="screen">
      <TopBar title="Recupero" onBack={nav.back} right={<button className="btn btn-secondary btn-sm" onClick={() => nav.go({ k: 'wellness' })}><Icon name="plus" size={16} />Dati</button>} />
      <div className="seg" role="tablist">{[14, 28, 90].map((n) => <button key={n} role="tab" aria-selected={range === n} onClick={() => setRange(n)}>{n} giorni</button>)}</div>
      <Trend label="Frequenza a riposo" unit="bpm" values={series('restHr')} base={r.base.hr} fmt={(n) => String(Math.round(n))} lowerIsBetter />
      <Trend label="Sonno" unit="h" values={series('sleepMin')} base={r.base.sleep} fmt={(n) => fmtSleep(n)} lowerIsBetter={false} />
      <Trend label="HRV" unit="ms" values={series('hrv')} base={r.base.hrv} fmt={(n) => String(Math.round(n))} lowerIsBetter={false} />
      <section className="card"><strong className="brass">Come ragiona l'app</strong>
        <p className="hint">Confronta ogni valore con la tua media degli ultimi 28 giorni: sonno sotto l'obiettivo di oltre un'ora, frequenza a riposo di 4 bpm o più sopra la media, HRV di oltre il 15% sotto. Un segnale su tre è "discreto", due "parziale", tre "scarso". Non è una diagnosi: è un'indicazione per l'allenamento.</p></section>
      {ws.length > 0 && (
        <section className="block"><div className="block-head"><h3>Giorni registrati</h3></div>
          <ul className="list">{[...ws].reverse().map((w) => (
            <li key={w.date} className="row"><span className="row-main"><strong>{new Date(w.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</strong><span>sonno {fmtSleep(w.sleepMin)}, FC {w.restHr ?? '–'}, HRV {w.hrv ?? '–'}</span></span>
              <button className="icon-btn danger" aria-label="Elimina questo giorno" onClick={() => dispatch({ type: 'deleteWellness', date: w.date })}><Icon name="trash" size={18} /></button></li>))}</ul></section>
      )}
    </div>
  )
}

export function WellnessForm({ nav }: { nav: Nav }) {
  const { state, dispatch } = useStore()
  const [date, setDate] = useState(dayKey())
  const ex = state.wellness.find((w) => w.date === date)
  const [h, setH] = useState(ex?.sleepMin != null ? String(Math.floor(ex.sleepMin / 60)) : '')
  const [m, setM] = useState(ex?.sleepMin != null ? String(ex.sleepMin % 60) : '')
  const [hr, setHr] = useState(ex?.restHr != null ? String(ex.restHr) : '')
  const [hrv, setHrv] = useState(ex?.hrv != null ? String(ex.hrv) : '')
  const num = (v: string) => (v.trim() === '' || isNaN(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')))
  const sleep = h.trim() === '' && m.trim() === '' ? null : (num(h) ?? 0) * 60 + (num(m) ?? 0)
  const ok = sleep != null || num(hr) != null || num(hrv) != null
  const save = () => { const e: Wellness = { date, sleepMin: sleep, restHr: num(hr), hrv: num(hrv), source: 'manual' }; dispatch({ type: 'addWellness', entry: e }); nav.back() }
  return (
    <div className="screen">
      <TopBar title="Dati dell'orologio" onBack={nav.back} />
      <p className="lead">Li trovi nell'app Zepp, nella scheda Sonno e nella scheda Salute. Dopo il collegamento a Health Connect arriveranno da soli.</p>
      <div className="form">
        <label>Giorno della notte<input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="edit-grid">
          <label>Sonno, ore<input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} placeholder="5" /></label>
          <label>Minuti<input inputMode="numeric" value={m} onChange={(e) => setM(e.target.value)} placeholder="12" /></label>
        </div>
        <div className="edit-grid">
          <label>FC a riposo, bpm<input inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="48" /></label>
          <label>HRV, ms<input inputMode="numeric" value={hrv} onChange={(e) => setHrv(e.target.value)} placeholder="41" /></label>
        </div>
      </div>
      <button className="btn btn-primary btn-wide" disabled={!ok} onClick={save}>Salva</button>
    </div>
  )
}

function Scale({ label, value, onChange, lo, hi }: { label: string; value: number; onChange: (n: number) => void; lo: string; hi: string }) {
  return (
    <div className="scale"><strong>{label}</strong>
      <div className="scale-row" role="group" aria-label={label}>{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-pressed={value === n} onClick={() => { try { navigator.vibrate?.(15) } catch { /* nessuna vibrazione */ } onChange(n) }}>{n}</button>)}</div>
      <div className="scale-lab"><span>{lo}</span><span>{hi}</span></div></div>
  )
}

export function CheckInForm({ nav }: { nav: Nav }) {
  const { state, dispatch } = useStore()
  const t = dayKey()
  const ex = state.checkins.find((c) => c.date === t)
  const [energy, setEnergy] = useState(ex?.energy ?? 3)
  const [mood, setMood] = useState(ex?.mood ?? 3)
  const [stress, setStress] = useState(ex?.stress ?? 3)
  const [nut, setNut] = useState<'sotto' | 'piano' | 'sopra' | null>(ex?.nutrition ?? null)
  const [w, setW] = useState(ex?.weight != null ? String(ex.weight).replace('.', ',') : '')
  const [note, setNote] = useState(ex?.note ?? '')
  const wn = w.trim() === '' || isNaN(Number(w.replace(',', '.'))) ? null : Number(w.replace(',', '.'))
  return (
    <div className="screen">
      <TopBar title="Check-in" onBack={nav.back} />
      <p className="lead">Pochi tocchi: il coach li legge insieme ai dati dell'orologio.</p>
      <Scale label="Energia" value={energy} onChange={setEnergy} lo="Scarico" hi="Pieno" />
      <Scale label="Umore" value={mood} onChange={setMood} lo="Basso" hi="Ottimo" />
      <Scale label="Stress" value={stress} onChange={setStress} lo="Calmo" hi="Alto" />
      <div className="scale"><strong>Alimentazione di ieri</strong>
        <div className="chip-group">{([['sotto', 'Sotto il piano'], ['piano', 'Nel piano'], ['sopra', 'Sopra il piano']] as const).map(([k, l]) => <button key={k} className="chip-btn" aria-pressed={nut === k} onClick={() => setNut(nut === k ? null : k)}>{l}</button>)}</div></div>
      <div className="form"><label>Peso a digiuno, kg<input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="63,2" /></label>
        <label>Nota libera<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Spalla destra rigida, mal di testa nel pomeriggio…" /></label></div>
      <button className="btn btn-primary btn-wide" onClick={() => { dispatch({ type: 'saveCheckin', entry: { date: t, energy, mood, stress, nutrition: nut, weight: wn, note: note.trim() } }); nav.back() }}>Salva check-in</button>
    </div>
  )
}

export function TomorrowForm({ nav }: { nav: Nav }) {
  const { state, dispatch } = useStore()
  const forDate = dayKey(addDays(new Date(), 1))
  const ex = state.tomorrow?.forDate === forDate ? state.tomorrow : null
  const [ans, setAns] = useState<'piano' | 'leggera' | 'diversa' | 'riposo'>(ex?.answer ?? 'piano')
  const [legs, setLegs] = useState(ex?.legs ?? 2)
  const [note, setNote] = useState(ex?.note ?? '')
  const opts = [['piano', 'Sì, come da piano', 'Sessione completa'], ['leggera', 'Sì, ma più leggera', 'Una serie in meno sugli esercizi da 3 o più serie'], ['diversa', 'Sì, ma più tardi o più corta', 'Dimmi come nella nota'], ['riposo', 'No, riposo', 'Recupero e sonno prima di tutto']] as const
  return (
    <div className="screen">
      <TopBar title="Domani ti alleni?" onBack={nav.back} />
      <p className="lead">{new Date(forDate + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}. In base alla risposta il coach adatta la sessione.</p>
      <div className="opts">{opts.map(([k, t, s]) => <button key={k} className="opt" aria-pressed={ans === k} onClick={() => setAns(k)}><strong>{t}</strong><span>{s}</span></button>)}</div>
      <Scale label="Come sono le gambe adesso?" value={legs} onChange={setLegs} lo="Fresche" hi="Molto doloranti" />
      <div className="form"><label>Nota<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Posso allenarmi solo 45 minuti" /></label></div>
      <button className="btn btn-primary btn-wide" onClick={() => { dispatch({ type: 'setTomorrow', value: { forDate, answer: ans, legs, note: note.trim(), answeredAt: new Date().toISOString() } }); nav.back() }}>Salva la risposta</button>
      <p className="hint">La risposta entra nel riepilogo che mandi al coach.</p>
    </div>
  )
}
export { levelColor }
