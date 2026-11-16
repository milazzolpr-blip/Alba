import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource/big-shoulders-display/latin-600'
import '@fontsource/big-shoulders-display/latin-700'
import '@fontsource/big-shoulders-display/latin-800'
import '@fontsource/figtree/latin-400'
import '@fontsource/figtree/latin-500'
import '@fontsource/figtree/latin-600'
import '@fontsource/figtree/latin-700'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
// Funziona senza rete solo quando l'app è pubblicata sul suo indirizzo.
if ('serviceWorker' in navigator && location.protocol === 'https:' && import.meta.env.MODE !== 'single') {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
