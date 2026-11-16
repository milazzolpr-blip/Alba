// Funzione server per Strava: tiene il client secret fuori dall'app.
// Variabili d'ambiente richieste su Netlify: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET.
const ID = process.env.STRAVA_CLIENT_ID
const SECRET = process.env.STRAVA_CLIENT_SECRET
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function token(params: Record<string, string>) {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: ID, client_secret: SECRET, ...params }),
  })
  if (!r.ok) return null
  const t = await r.json()
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at, athlete: t.athlete ? `${t.athlete.firstname} ${t.athlete.lastname}` : undefined }
}

export default async (req: Request) => {
  const url = new URL(req.url)
  if (req.method === 'GET') {
    const action = url.searchParams.get('action')
    if (action === 'status') return json({ configured: Boolean(ID && SECRET) })
    if (action === 'login') {
      if (!ID) return json({ error: 'STRAVA_CLIENT_ID mancante' }, 500)
      const back = url.searchParams.get('return') ?? url.origin + '/'
      // Si torna solo sull'indirizzo dell'app stessa.
      if (new URL(back).origin !== url.origin) return json({ error: 'Indirizzo di ritorno non valido' }, 400)
      const auth = new URL('https://www.strava.com/oauth/authorize')
      auth.search = new URLSearchParams({ client_id: ID, redirect_uri: back, response_type: 'code', approval_prompt: 'auto', scope: 'activity:read_all' }).toString()
      return Response.redirect(auth.toString(), 302)
    }
    return json({ error: 'Azione sconosciuta' }, 400)
  }
  if (!ID || !SECRET) return json({ error: 'Strava non configurato' }, 500)
  const body = await req.json().catch(() => ({}))
  if (body.action === 'exchange') {
    const t = await token({ code: String(body.code), grant_type: 'authorization_code' })
    return t ? json(t) : json({ error: 'Codice non valido' }, 401)
  }
  if (body.action === 'refresh') {
    const t = await token({ refresh_token: String(body.refreshToken), grant_type: 'refresh_token' })
    return t ? json({ accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt }) : json({ error: 'Rinnovo rifiutato' }, 401)
  }
  if (body.action === 'activities') {
    const h = { authorization: `Bearer ${body.accessToken}` }
    const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=50&after=${Number(body.after) || 0}`, { headers: h })
    if (!r.ok) return json({ error: 'Strava non raggiungibile' }, r.status)
    const list: { id: number }[] = await r.json()
    // Le calorie sono solo nel dettaglio dell'attività: lo si chiede per le più recenti.
    const detailed = await Promise.all(list.slice(-12).map(async (a) => {
      const d = await fetch(`https://www.strava.com/api/v3/activities/${a.id}`, { headers: h })
      return d.ok ? d.json() : a
    }))
    return json([...list.slice(0, -12), ...detailed])
  }
  return json({ error: 'Azione sconosciuta' }, 400)
}
