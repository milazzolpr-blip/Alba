# Alba

App web installabile (PWA) per allenamento: schede, sessioni con timer, archivio, recupero dall'orologio, check-in, mesociclo 5+1 e ciclo con il coach.

## Sviluppo
    npm install
    npm run dev

## Pubblicazione
Netlify legge `netlify.toml`: build `npm run build`, cartella `dist`, funzioni in `netlify/functions`.
Variabili opzionali (solo per Strava): `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.

## Ciclo con il coach
1. Scheda Coach, "Copia il riepilogo", incolla in chat.
2. La risposta contiene un blocco `alba-patch` (modifica di un giorno) o `alba-program` (nuovo mesociclo).
3. Incolla la risposta nella scheda Coach: anteprima di cosa cambia, poi "Applica". Ogni modifica si annulla.
