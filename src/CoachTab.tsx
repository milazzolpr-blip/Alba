import { useMemo, useState } from 'react'
import { useStore } from './store'
import { Icon, TopBar, ConfirmButton } from './ui'
import { applyPatch, coachSummary, findDay, parseCoach, type Range } from './coach'
import type { Nav } from './App'

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export function CoachTab({ nav }: { nav: Nav }) {
  const { state, dispatch } = useStore()
  const [range, setRange] = useState<Range>('week')
  const [msg, setMsg] = useState('')
  const [reply, setReply] = useState('')
  const text = useMemo(() => coachSummary(state, range), [state, range])
  const parsed = useMemo(() => (reply.trim() ? parseCoach(reply) : null), [reply])
  const program = state.programs.find((p) => p.status === 'active')

  const copy = async () => {
    const ok = await copyText(text)
    dispatch({ type: 'copied' })
    setMsg(ok ? 'Copiato. Incollalo nella chat con il coach.' : 'Il telefono non ha permesso la copia: seleziona il testo qui sopra e copialo a mano.')
  }
  let preview: ReturnType<typeof applyPatch> | null = null
  let dayErr = ''
  if (parsed?.kind === 'patch' && program) {
    const d = findDay(program, parsed.patch.day)
    if (d) preview = applyPatch(d, parsed.patch, new Date().toISOString()); else dayErr = `Non trovo il giorno "${parsed.patch.day}" nella scheda attiva.`
  }
  const applied = (id: string) => state.patches.find((p) => p.id === id)

  return (
    <div className="screen">
      <TopBar title="Coach" />
      <p className="lead">Il coach legge i tuoi dati e ti risponde qui in chat. Tu copi, io rispondo, tu incolli: la scheda si aggiorna da sola.</p>

      <section className="block">
        <div className="block-head"><h3>1. Manda il riepilogo</h3></div>
        <div className="seg" role="tablist">{([['week', 'Ultimi 7 giorni'], ['today', 'Solo oggi'], ['last', 'Ultima sessione']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)}>{l}</button>)}</div>
        <pre className="summary" tabIndex={0}>{text}</pre>
        <button className="btn btn-primary btn-wide" onClick={copy}><Icon name="copy" size={16} />Copia il riepilogo</button>
        <p className="hint">Il testo resta sul tuo telefono finché non lo incolli tu.</p>
      </section>

      <section className="block">
        <div className="block-head"><h3>2. Incolla la risposta</h3></div>
        <textarea id="coach-reply" rows={4} placeholder="Incolla qui la risposta del coach" value={reply} onChange={(e) => setReply(e.target.value)} />
        {parsed?.kind === 'none' && parsed.error && <p className="error" role="alert">{parsed.error}</p>}
        {dayErr && <p className="error" role="alert">{dayErr}</p>}
        {parsed?.kind === 'patch' && preview && (
          <div className="card diff">
            {parsed.text && <p>{parsed.text}</p>}
            <div className="card-title"><strong>Cosa cambia, {preview.day.name}</strong></div>
            <ul className="list">{preview.preview.rows.map((r) => (
              <li key={r.name} className="diff-row"><strong>{r.name}</strong><span className="hint">Prima: {r.before}</span><span className="diff-after">Dopo: {r.after}</span></li>))}</ul>
            {preview.preview.errors.map((e) => <p key={e} className="error">{e}</p>)}
            <div className="act-row">
              <button className="btn btn-secondary" onClick={() => setReply('')}>Tieni il piano originale</button>
              <button className="btn btn-primary" disabled={!preview.preview.rows.length} onClick={() => { dispatch({ type: 'applyPatch', programId: program!.id, day: preview!.day, note: parsed.patch.note ?? parsed.text.slice(0, 120) }); setReply(''); setMsg('Modifica applicata. Puoi annullarla qui sotto.') }}>Applica modifica</button>
            </div>
          </div>
        )}
        {parsed?.kind === 'program' && (
          <div className="card diff">
            {parsed.text && <p>{parsed.text}</p>}
            <div className="card-title"><strong>{parsed.program.name}</strong><span>{parsed.program.days.length} giorni</span></div>
            <p className="hint">{parsed.program.days.map((d) => `${d.name} (${d.exercises.length} esercizi)`).join(', ')}</p>
            <p className="hint">Diventa la scheda attiva e il nuovo mesociclo parte dal prossimo lunedì. La scheda attuale resta nell'archivio.</p>
            <div className="act-row">
              <button className="btn btn-secondary" onClick={() => setReply('')}>Scarta</button>
              <button className="btn btn-primary" onClick={() => { dispatch({ type: 'importProgram', program: parsed.program }); setReply(''); nav.tab('home') }}>Attiva il mesociclo</button>
            </div>
          </div>
        )}
      </section>

      {state.patches.length > 0 && (
        <section className="block">
          <div className="block-head"><h3>Modifiche del coach</h3></div>
          <ul className="list list-cards">{state.patches.map((p) => (
            <li key={p.id} className="card">
              <div className="card-title"><strong>{p.dayName}</strong><span>{new Date(p.at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span></div>
              <p className="hint">{p.note || 'Modifica applicata'}</p>
              {p.reverted ? <span className="chip">Annullata</span> : applied(p.id) && <ConfirmButton className="btn btn-ghost" label="Annulla questa modifica" confirm="Tocca ancora per ripristinare l'originale" onConfirm={() => dispatch({ type: 'revertPatch', id: p.id })} />}
            </li>))}</ul>
        </section>
      )}
      {msg && <p className="toast" role="status">{msg}</p>}
    </div>
  )
}
