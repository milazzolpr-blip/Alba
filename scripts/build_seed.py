# Genera src/seed.json dalle schede (stesse fonti dei PDF) e dai log reali.
import re, json, os
SP = '/tmp/claude-0/-home-claude/1214e15e-fc34-56db-9f1d-4839bd22a61e/scratchpad/'
def num(s):
    m = re.search(r'(\d+(?:[.,]\d+)?)', s or '')
    return float(m.group(1).replace(',', '.')) if m else None
def rest(s):
    s = (s or '').strip().lower()
    v = num(s)
    if v is None: return 0
    return int(v * 60) if 'min' in s else int(v)
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

# ---- Mese 7 v2.2 ----
REC = []
src = open(SP + 'gen_m7_v3.py', encoding='utf-8').read()
src = src.replace("def day(", "def _day(").replace("story = []\n", "def day(*a, **k):\n    REC.append((a, k)); return _day(*a, **k)\nstory = []\n", 1)
src = src.replace("/mnt/user-data/outputs/mese7_v2_fullbody4x.pdf", SP + "_tmp_seed.pdf")
exec(compile(src, SP + 'gen_m7_v3.py', 'exec'), {'__file__': SP + 'gen_m7_v3.py', '__name__': 'x', 'REC': REC})
days = []
for a, k in REC:
    n, name, focus, core, techs, rows = a[0], a[1], a[2], a[3], a[4], a[5]
    corerows = a[8] if len(a) > 8 else k.get('corerows')
    exs = []
    for r in rows:
        nm = r[0]; group = None
        m = re.match(r'\[(SS|Set meccanico)\]\s*\w+\s*-\s*(.*)', nm)
        if m: group = 'Superserie' if m.group(1) == 'SS' else 'Set meccanico'; nm = m.group(2)
        isnew = 'NUOVO' in nm; nm = nm.replace('NUOVO - ', '')
        exs.append(dict(id=f'm7-{n}-{slug(nm)}', name=nm, sets=int(num(r[1])), reps=r[1].split(' x ', 1)[1],
                        weight=num(r[2]), weightNote=r[2], rest=rest(r[3]), technique=r[4], group=group, isNew=isnew))
    d = dict(id=f'm7-g{n}', name=name.title().replace('Full Body', 'Full Body'), label='ABCD'[n-1], focus=focus,
             minutes=80, techniques=[dict(name=x, desc=y) for x, y in techs], exercises=exs)
    if corerows:
        d['core'] = dict(rounds=4, rest=60, items=[dict(name=b.split(' - ')[0], target=b.split(' - ')[1], cue=c) for _, b, c in corerows])
    days.append(d)
programs = [dict(id='m7', name='Mese 7', subtitle='Full Body x4 in multifrequenza', period='Novembre 2026', status='active',
                 note='Max 80 minuti. Focus spalle, gambe, polpacci. Settimana 4 di deload.', days=days)]

# ---- Schede storiche dai file originali ----
src = open(SP + 'gen_pdf_complete.py', encoding='utf-8').read().split('# MAIN')[0]
g = {'__name__': 'x'}; exec(compile(src, 'c', 'exec'), g)
CUR = {}
def fake_table(title, color, exercises, notes=None):
    CUR['days'].append((title, exercises)); return []
def fake_header(n, titolo, periodo, struttura):
    CUR.update(n=n, titolo=titolo, periodo=periodo); return []
g['exercise_table'] = fake_table; g['month_header'] = fake_header
def grab(fn, pid, name, sub=None, period=None):
    CUR.clear(); CUR['days'] = []; g[fn]()
    ds = []
    for i, (title, exs) in enumerate(CUR['days']):
        t = re.sub(r'^GIORNO \w+ — |^DELOAD \w — ', '', title)
        ds.append(dict(id=f'{pid}-g{i+1}', name=t, label=str(i+1), focus='', minutes=None, techniques=[],
            exercises=[dict(id=f'{pid}-{i+1}-{j}', name=e[0], sets=int(num(e[1]) or 1), reps=e[2], weight=None, weightNote='',
                            rest=rest(e[3]), technique=e[4], group=None, isNew=False) for j, e in enumerate(exs)]))
    programs.append(dict(id=pid, name=name, subtitle=sub or CUR.get('titolo', ''), period=period or CUR.get('periodo', ''),
                         status='archived', note='Scheda importata dal file originale: i carichi di quel periodo non sono registrati.', days=ds))

# ---- Log reali ----
logs = []
def log(pid, did, dayname, date, items, approx=False):
    logs.append(dict(id=f'log-{date}-{did}', programId=pid, dayId=did, dayName=dayname, startedAt=date, durationMs=None,
                     pausedMs=None, restMs=None, approx=approx, imported=True,
                     entries=[dict(name=n, sets=[dict(w=w, r=r) for r in reps]) for n, w, reps in items]))
PPL = [
 ('Push', '2026-11-10T04:50:00', [
  ('Panca piana bilanciere', 65, [8,8,8,8]), ('OHP manubri in piedi', 28, [10,10,10,10]), ('Panca inclinata bilanciere', 55, [8,8,7]),
  ('Alzate laterali manubri', 24, [15,15,20]), ('Rear delt machine', 39, [20,20,20]), ('Face pull ai cavi', 16, [15,15,15]),
  ('Croci cavi bassi', 9, [12,12,12]), ('Overhead tricipiti cavo', 16, [15,15,15]), ('Tricipiti cavo singolo', 6.8, [12,12,12]),
  ('Leg raises appeso', None, [8,8,8]), ('Abdominal machine', 50, [12,12,12])]),
 ('Legs & Core', '2026-11-12T04:50:00', [
  ('Squat Smith gambe larghe', 70, [12,12,12,12]), ('Leg curl sdraiato', 41, [12,12,12]), ('Leg press', 215, [10,10,10,10]),
  ('Affondi manubri', 20, [8,8,8]), ('Leg extension', 18, [8,8,8]), ('Abductor machine', 50, [20,20,20]),
  ('Calf raise in piedi', 70, [15,15,15,15]), ('Shoulder press', 40, [8,8,8]), ('Alzate frontali manubri', 16, [10,10,10]),
  ('Leg raises appeso', None, [8,8,8])]),
 ('Pull', '2026-11-14T04:50:00', [
  ('Trazioni lastrate presa neutra', 71.2, [6,6,6,6]), ('Rematore Pendlay', 60, [8,8,8]), ('Incline lever row', 46, [10,10,10]),
  ('Seated row machine', 52.6, [10,10,10]), ('Pulley basso', 52, [8,8,8]), ('Hyperextension', 10, [8,8,8]),
  ('Curl bilanciere ai cavi', 23.5, [10,10,10]), ('Curl concentrato cavo', 9, [10,10,10])]),
]
ppl_days = []
for i, (nm, date, items) in enumerate(PPL):
    did = f'm7w1-g{i+1}'
    ppl_days.append(dict(id=did, name=nm, label=str(i+1), focus='', minutes=90, techniques=[],
        exercises=[dict(id=f'{did}-{j}', name=n, sets=len(r), reps=str(max(r)), weight=w, weightNote=(f'{w} kg' if w else 'corpo libero'),
                        rest=0, technique='', group=None, isNew=False) for j, (n, w, r) in enumerate(items)]))
    log('m7w1', did, nm, date, items)
programs.append(dict(id='m7w1', name='Mese 7, settimana 1', subtitle='Push / Pull / Legs (variazione)', period='10-14 novembre 2026',
                     status='archived', note='Settimana svolta prima del passaggio al Full Body x4. Esercizi e carichi dai tuoi log.', days=ppl_days))
# Mese 6: solo le righe presenti nei riepiloghi (settimane 3 e 4), date indicative
M6A3 = [('Trazioni lastrate presa neutra', 75, [6,6,5,5]), ('Rematore Pendlay', 54.4, [8,8,8]), ('Chest supported row', 42, [10,10]),
        ('Panca piana bilanciere', 62.4, [8,8,8]), ('Croci cavi bassi', 11.3, [12,12,12]), ('French press', 30, [10,10,10]), ('Overhead tricipiti cavo', 18, [15,15,15])]
M6A4 = [('Trazioni lastrate presa neutra', 75, [6,6,6,6]), ('Rematore Pendlay', 57.4, [8,8,8]), ('Chest supported row', 42, [10,10]),
        ('Panca piana bilanciere', 65, [8,8,8]), ('Croci cavi bassi', 11.3, [12,12,12]), ('French press', 30, [10,10,10]), ('Overhead tricipiti cavo', 18, [15,15,15])]
M6B3 = [('Alzate laterali manubri', 24, [15,15,15]), ('Rear delt machine', 39, [20,20,20]), ('Leg curl sdraiato', 41, [15,15,15]),
        ('Squat Smith gambe larghe', 62.5, [15,15,15]), ('Abductor machine', 50, [20,20,20]), ('Curl bilanciere ai cavi', 22.5, [10,10,10]),
        ('Curl concentrato cavo', 9, [12,12,12]), ('Abdominal machine', 50, [15,15,15,15])]
M6B4 = [('Alzate laterali manubri', 24, [15,15,20]), ('Rear delt machine', 39, [20,20,15]), ('Leg curl sdraiato', 41, [15,15,12]),
        ('Squat Smith gambe larghe', 62.5, [15,15,15]), ('Abductor machine', 50, [20,20,20]), ('Curl bilanciere ai cavi', 22.5, [10,10,10]),
        ('Curl concentrato cavo', 9, [12,12,12]), ('Abdominal machine', 50, [15,15,15,15])]
m6days = [dict(id='m6-ga', name='Trazioni, panca, tricipiti', label='A', focus='', minutes=None, techniques=[], exercises=[
            dict(id=f'm6-a-{j}', name=n, sets=len(r), reps=str(max(r)), weight=w, weightNote=f'{w} kg', rest=0, technique='', group=None, isNew=False) for j, (n, w, r) in enumerate(M6A4)]),
          dict(id='m6-gb', name='Spalle, gambe, bicipiti', label='B', focus='', minutes=None, techniques=[], exercises=[
            dict(id=f'm6-b-{j}', name=n, sets=len(r), reps=str(max(r)), weight=w, weightNote=f'{w} kg', rest=0, technique='', group=None, isNew=False) for j, (n, w, r) in enumerate(M6B4)])]
log('m6', 'm6-ga', 'Trazioni, panca, tricipiti', '2026-10-27T04:50:00', M6A3, True)
log('m6', 'm6-gb', 'Spalle, gambe, bicipiti', '2026-10-29T04:50:00', M6B3, True)
log('m6', 'm6-ga', 'Trazioni, panca, tricipiti', '2026-11-03T04:50:00', M6A4, True)
log('m6', 'm6-gb', 'Spalle, gambe, bicipiti', '2026-11-05T04:50:00', M6B4, True)
programs.append(dict(id='m6', name='Mese 6', subtitle='Multifrequenza 4 giorni', period='Ottobre - novembre 2026', status='archived',
    note='Dati parziali: solo gli esercizi delle settimane 3 e 4 ancora disponibili nei riepiloghi. Date indicative.', days=m6days))
grab('mese5', 'm5', 'Mese 5', period='Settembre - ottobre 2026')
grab('deload_section', 'dl', 'Deload', sub='3 sessioni di scarico', period='Settembre 2026')
grab('mese3', 'm3', 'Piano dicembre 2025', period='Dicembre 2025')
grab('mese2', 'm2', 'Mese 2', period='Autunno 2025')
grab('mese1', 'm1', 'Mese 1', period='14 settembre - 12 ottobre 2025')
logs.sort(key=lambda l: l['startedAt'])
def accents(o):
    if isinstance(o, str):
        for a, b in [("gia'", 'già'), ("piu'", 'più'), ("cosi'", 'così'), ("qualita'", 'qualità'), ("li'", 'lì'), ("parita'", 'parità'),
                     ("velocita'", 'velocità'), ("densita'", 'densità'), ("intensita'", 'intensità'), ("mobilita'", 'mobilità'), ("meta'", 'metà')]:
            o = o.replace(a, b)
        return re.sub(r"\b([Ee])'(?=\s|$)", lambda m: 'è' if m.group(1) == 'e' else 'È', o)
    if isinstance(o, list): return [accents(x) for x in o]
    if isinstance(o, dict): return {k: accents(v) for k, v in o.items()}
    return o
programs = accents(programs)
json.dump(dict(programs=programs, logs=logs), open('src/seed.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print([(p['id'], len(p['days']), sum(len(d['exercises']) for d in p['days'])) for p in programs], len(logs))
