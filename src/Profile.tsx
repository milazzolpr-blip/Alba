import { useEffect, useState } from 'react'
import { useStore } from './store'
import { ConfirmButton, Icon, TopBar } from './ui'
import { stravaAvailable, stravaLogin, syncStrava } from './strava'
import { fmtDate } from './lib'
import { fmtSleep } from './wellness'
import { hcOpenSettings, hcRead, hcRequest, hcStatus, isNative } from './health'

export function Profile() {
  const { state, dispatch } = useStore()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [backup, setBackup] = useState('')
  useEffect(() => { stravaAvailable().then(setAvailable) }, [])

  const sync = async () => {
    if (!state.strava) return
    setBusy(true); setMsg('')
    try {
      const r = await syncStrava(state.strava, state.logs)
      dispatch({ type: 'strava', auth: r.auth })
      dispatch({ type: 'attachStrava', logs: r.logs, at: new Date().toISOString() })
      setMsg(r.matched ? `${r.matched} sessioni abbinate ai dati dell'orologio.` : 'Nessuna nuova attività da abbinare.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Sincronizzazione non riuscita.') }
    setBusy(false)
  }
  const exportData = async () => {
    const text = JSON.stringify({ programs: state.programs, logs: state.logs, wellness: state.wellness, checkins: state.checkins, meso: state.meso, patches: state.patches, settings: state.settings })
    setBackup(text)
    try { await navigator.clipboard.writeText(text); setMsg('Copia di sicurezza copiata negli appunti.') } catch { setMsg('Seleziona il testo qui sotto e copialo.') }
  }
  const importData = () => {
    try {
      const d = JSON.parse(backup)
      if (!Array.isArray(d.programs) || !Array.isArray(d.logs)) throw new Error()
      dispatch({ type: 'import', state: d }); setMsg('Dati ripristinati.')
    } catch { setMsg('Il testo incollato non è una copia di sicurezza valida.') }
  }

  const [hc, setHc] = useState<'unknown' | 'available' | 'update' | 'unsupported'>('unknown')
  useEffect(() => { if (isNative) hcStatus().then((x) => setHc(x.availability)).catch(() => setHc('unsupported')) }, [])
  const readHc = async (mode: 'full' | 'quick' = 'quick') => {
    setBusy(true); setMsg('')
    try {
      const r = await hcRead(!state.hcLast ? 'full' : mode)
      dispatch({ type: 'mergeHealth', entries: r.entries, sleep: r.sleepRecords, hr: r.hrRecords, hrv: r.hrvDays, activity: r.activity, sessions: r.sessions, ms: r.ms, full: r.full, timings: r.timings })
      const sec = `${(r.ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} s`
      setMsg(r.entries.length ? `Letti ${r.entries.length} giorni da Health Connect${r.activity.length ? `, con ${r.activity.length} giorni di attività e ${r.sessions.length} allenamenti` : ''}, in ${sec}.` : 'Health Connect non ha ancora dati di sonno, frequenza o HRV.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lettura non riuscita.') }
    setBusy(false)
  }
  const connectHc = async () => {
    setBusy(true); setMsg('')
    try { const r = await hcRequest(); if (r.granted) await readHc('full'); else setMsg('Permessi non concessi: servono almeno sonno e frequenza a riposo. Passi e allenamenti sono facoltativi.') } catch (e) { setMsg(e instanceof Error ? e.message : 'Collegamento non riuscito.') }
    setBusy(false)
  }
  const reminder = () => {
    const url = location.origin
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alba//IT', 'BEGIN:VEVENT', `UID:alba-domani@${location.host || 'alba'}`, 'DTSTAMP:20261101T000000Z',
      'DTSTART;TZID=Europe/Rome:20261115T210000', 'DTEND;TZID=Europe/Rome:20261115T211500', 'RRULE:FREQ=DAILY', 'SUMMARY:Alba: domani ti alleni?', `DESCRIPTION:Apri Alba e rispondi: ${url}`, `URL:${url}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Alba: domani ti alleni?', 'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'alba-promemoria.ics'; a.click()
    setMsg('Apri il file scaricato per aggiungere il promemoria delle 21:00 al calendario.')
  }
  return (
    <div className="screen">
      <TopBar title="Profilo" />
      <section className="block">
        <div className="block-head"><h3>Amazfit e recupero</h3>{isNative && state.hcLast && <span className="chip chip-on">Collegato</span>}</div>
        <div className="card sync">
          {isNative ? (
            <>
              <p>Zepp scrive i dati dell'Amazfit in Health Connect e Alba li legge da lì ogni volta che apri l'app. Restano su questo telefono.</p>
              {hc === 'unsupported' && <p className="error">Questo telefono non ha Health Connect.</p>}
              {hc === 'update' && <p className="hint">Health Connect va installato o aggiornato dal Play Store.</p>}
              <button className="btn btn-primary btn-wide" disabled={busy || hc === 'unsupported'} onClick={connectHc}>{state.hcLast ? 'Ridai i permessi' : 'Collega Health Connect'}</button>
              <button className="btn btn-secondary btn-wide" disabled={busy} onClick={() => readHc('quick')}>Aggiorna adesso</button>
              {state.hcLast && <p className="hint">Ultima lettura {fmtDate(state.hcLast.at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{state.hcLast.ms != null && ` (${state.hcLast.full === false ? 'veloce' : 'completa'}, ${(state.hcLast.ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} s)`}{state.hcLast.timings && ` Dettaglio: sonno ${(state.hcLast.timings.sleep / 1000).toFixed(1)} s, frequenza ${(state.hcLast.timings.rhr / 1000).toFixed(1)} s, HRV ${(state.hcLast.timings.hrv / 1000).toFixed(1)} s, attività ${(state.hcLast.timings.activity / 1000).toFixed(1)} s (${state.hcLast.timings.sessions} allenamenti).`}. Ultima lettura completa, trovati: sonno {state.hcLast.sleep} notti, frequenza a riposo {state.hcLast.hr} misure, HRV {state.hcLast.hrv} giorni. L'HRV si inserisce a mano (opzione sopra).{state.hcLast.activity != null && ` Attività: ${state.hcLast.activity ? `${state.hcLast.steps ?? 0} giorni con passi, ${state.hcLast.sessions ?? 0} allenamenti.` : 'Zepp non ha mandato passi, calorie o allenamenti, oppure non hai concesso i permessi: tocca «Ridai i permessi».'}`}</p>}
              <button className="link" disabled={busy} onClick={() => readHc('full')}>Rilettura completa degli ultimi 35 giorni</button>
              <p className="hint">Versione dell'app: {__BUILD__}</p>
              <button className="link" onClick={() => hcOpenSettings().catch(() => {})}>Apri le impostazioni di Health Connect</button>
            </>
          ) : (
            <p>Nel browser sonno, frequenza a riposo e HRV li inserisci tu dall'app Zepp, in 30 secondi. Con l'app Android arrivano da soli da Health Connect.</p>
          )}
          <div className="form"><label>Ore di sonno desiderate
            <select value={state.settings.sleepTargetMin} onChange={(e) => dispatch({ type: 'setSleepTarget', min: Number(e.target.value) })}>
              {[360, 390, 420, 450, 480].map((m) => <option key={m} value={m}>{fmtSleep(m)}</option>)}</select></label></div>
          <div className="form"><label className="check-row"><input type="checkbox" checked={!!state.settings.hrvFromHealth} onChange={(e) => dispatch({ type: 'setHrvFromHealth', value: e.target.checked })} /> Prendi l'HRV da Health Connect</label>
            <p className="hint">Zepp può mandare a Health Connect un valore diverso dall'HRV che vedi nell'app Zepp. Con l'opzione spenta l'HRV lo inserisci tu e non viene mai sostituito. Se la accendi, Health Connect compila solo i giorni vuoti.</p></div>
          <div className="form"><label>Obiettivo passi al giorno
            <select id="step-goal" value={state.settings.stepGoal ?? 9500} onChange={(e) => dispatch({ type: 'setStepGoal', steps: Number(e.target.value) })}>
              {[8000, 9000, 9500, 10000, 12000].map((n) => <option key={n} value={n}>{n.toLocaleString('it-IT')}</option>)}</select></label></div>
          <button className="btn btn-secondary btn-wide" onClick={reminder}>Promemoria alle 21:00 nel calendario</button>
          <p className="hint">Il promemoria "Domani ti alleni?" passa dal calendario del telefono, perché un'app web non può avvisarti da sola.</p>
        </div>
      </section>
      <section className="block">
        <div className="block-head"><h3>Amazfit tramite Strava</h3>{state.strava && <span className="chip chip-on">Collegato</span>}</div>
        <div className="card sync">
          {state.strava ? (
            <>
              <p><strong>{state.strava.athlete}</strong></p>
              <p className="hint">{state.lastSync ? `Ultima sincronizzazione ${fmtDate(state.lastSync, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Mai sincronizzato.'}</p>
              <button className="btn btn-primary btn-wide" disabled={busy} onClick={sync}>{busy ? 'Sincronizzo…' : 'Sincronizza adesso'}</button>
              <ConfirmButton label="Scollega Strava" confirm="Tocca ancora per scollegare" onConfirm={() => dispatch({ type: 'strava', auth: null })} />
            </>
          ) : (
            <>
              <p>Frequenza cardiaca e calorie di ogni allenamento arrivano dall'orologio: Zepp le invia a Strava, Alba le legge da lì e le abbina alla sessione dello stesso orario.</p>
              <ol className="steps">
                <li>Nell'app Zepp: Profilo, Aggiungi account, Strava.</li>
                <li>Avvia l'attività Forza sull'orologio quando inizi la sessione qui.</li>
                <li>Collega Strava con il pulsante qui sotto.</li>
              </ol>
              <button className="btn btn-primary btn-wide" disabled={!available} onClick={stravaLogin}>Collega Strava</button>
              {available === false && <p className="hint">Il collegamento si attiva quando l'app è pubblicata sul suo indirizzo con le chiavi Strava configurate. In questa anteprima non è disponibile.</p>}
            </>
          )}
        </div>
      </section>

      <section className="block">
        <div className="block-head"><h3>I tuoi dati</h3><span className="count">{state.programs.length} schede, {state.logs.length} sessioni</span></div>
        <div className="card sync">
          <p className="hint">I dati sono salvati su questo telefono. Fai una copia di sicurezza ogni tanto, o prima di cambiare telefono.</p>
          <button className="btn btn-secondary btn-wide" onClick={exportData}><Icon name="copy" size={16} />Copia di sicurezza</button>
          <textarea id="backup" rows={3} placeholder="Incolla qui una copia di sicurezza per ripristinarla" value={backup} onChange={(e) => setBackup(e.target.value)} />
          <button className="btn btn-secondary btn-wide" disabled={!backup.trim()} onClick={importData}>Ripristina dalla copia incollata</button>
          <ConfirmButton label="Riporta ai dati iniziali" confirm="Tocca ancora: cancella le sessioni registrate qui" onConfirm={() => { dispatch({ type: 'reset' }); setMsg('Dati iniziali ripristinati.') }} />
        </div>
      </section>
      {msg && <p className="toast" role="status">{msg}</p>}
    </div>
  )
}
