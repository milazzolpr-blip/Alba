import { useEffect, useState, type ReactNode } from 'react'

const paths: Record<string, string> = {
  home: 'M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z',
  plan: 'M6 4h12v16H6zM9 9h6M9 13h6M9 17h3',
  archive: 'M4 19V9m5.3 10V5m5.4 14v-7M20 19V8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M8 5v14M16 5v14',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  back: 'M15 5l-7 7 7 7',
  down: 'm6 9 6 6 6-6',
  right: 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  up: 'm6 15 6-6 6 6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  coach: 'M5 5h14v10H10l-5 4z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
}
export function Icon({ name, size = 22, fill = false }: { name: keyof typeof paths | string; size?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={fill ? 0 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

/** Andamento del carico: una sola scala per linea, area e punto finale. */
export function Spark({ values, w = 96, h = 36, labels = false }: { values: number[]; w?: number; h?: number; labels?: boolean }) {
  if (!values.length) return null
  const padX = labels ? 34 : 4, padY = labels ? 14 : 5
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => (values.length === 1 ? w / 2 : padX + (i * (w - padX - 6)) / (values.length - 1))
  const y = (v: number) => padY + (1 - (v - min) / span) * (h - padY * 2) * (max === min ? 0.5 : 1) + (max === min ? (h - padY * 2) / 4 : 0)
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const last = values.length - 1
  return (
    <svg className="spark" width={labels ? '100%' : w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Andamento: da ${values[0]} a ${values[last]} kg`}>
      {labels && [max, min].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
        <g key={v}>
          <line x1={padX} x2={w - 6} y1={y(v)} y2={y(v)} className="spark-grid" />
          <text x={padX - 6} y={y(v) + 3.5} textAnchor="end" className="spark-label">{v.toLocaleString('it-IT')}</text>
        </g>
      ))}
      {values.length > 1 && <polygon className="spark-area" points={`${x(0)},${h - 2} ${pts.join(' ')} ${x(last)},${h - 2}`} />}
      {values.length > 1 && <polyline className="spark-line" fill="none" points={pts.join(' ')} />}
      {labels && values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.2} className="spark-dot" />)}
      <circle cx={x(last)} cy={y(values[last])} r={labels ? 4 : 3.2} className="spark-end" />
    </svg>
  )
}

export function Ring({ progress, size = 88, over = false, children }: { progress: number; size?: number; over?: boolean; children?: ReactNode }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, progress))
  return (
    <div className={`ring${over ? ' is-over' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" fill="none" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bar" fill="none" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  )
}

export function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-v">{value}{unit && <span className="stat-u"> {unit}</span>}</div>
      <div className="stat-l">{label}</div>
    </div>
  )
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack && <button className="icon-btn" onClick={onBack} aria-label="Indietro"><Icon name="back" /></button>}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  )
}

/** Conferma dentro la pagina: due tocchi per le azioni che cancellano dati. */
export function ConfirmButton({ label, confirm, onConfirm, className = 'btn btn-ghost danger' }: { label: string; confirm: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button className={`${className}${armed ? ' is-armed' : ''}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirm : label}
    </button>
  )
}

export function useNow(running: boolean, everyMs = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [running, everyMs])
  return now
}
