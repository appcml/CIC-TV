#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_playlist.py — CIC TV v2
Sistema completo de generación y auto-reparación de playlist IPTV
"""
import json, os, re, ssl, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

OUTPUT_M3U      = 'playlist.m3u'
RADIOS_JSON     = 'radios.json'
CANALES_JSON    = 'canales.json'
TIMEOUT_CHECK   = 8
TIMEOUT_FETCH   = 15
WORKERS_CHECK   = 40
MAX_CANALES_M3U = 8000

CANALES_TV_BASE = [
    {'id':'n01','name':'DW Español',        'cat':'Noticias',    'co':'DE','logo':'','url':'https://dwamdstream102.akamaized.net/hls/live/2015530/dwstream102/index.m3u8'},
    {'id':'n02','name':'France 24 ES',      'cat':'Noticias',    'co':'FR','logo':'','url':'https://stream.france24.com/hls/live/2037226/F24_ES_LO_HLS/master.m3u8'},
    {'id':'n03','name':'Al Jazeera EN',     'cat':'Noticias',    'co':'QA','logo':'','url':'https://live-hls-web-aje.getaj.net/AJE/index.m3u8'},
    {'id':'n04','name':'TRT World',         'cat':'Noticias',    'co':'TR','logo':'','url':'https://tv-trtworld.medya.trt.com.tr/master.m3u8'},
    {'id':'n05','name':'NASA TV',           'cat':'Noticias',    'co':'US','logo':'','url':'https://nasa-i.akamaihd.net/hls/live/253565/NASA-NTV1-HLS/master.m3u8'},
    {'id':'n06','name':'Euronews EN',       'cat':'Noticias',    'co':'EU','logo':'','url':'https://rakuten-euronews-1-eu.samsung.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n07','name':'Bloomberg TV',      'cat':'Negocios',    'co':'US','logo':'','url':'https://bloombg-samsung.amagi.tv/playlist.m3u8'},
    {'id':'n08','name':'Sky News',          'cat':'Noticias',    'co':'GB','logo':'','url':'https://skynews-ubplex.sly.is/out/v1/7d9d2b6e2c4f4f4f8f4f4f4f4f4f4f4f/index.m3u8'},
    {'id':'n09','name':'RT en Español',     'cat':'Noticias',    'co':'RU','logo':'','url':'https://rt-esp.rttv.com/live/rtesp/playlist.m3u8'},
    {'id':'n10','name':'Outside TV',        'cat':'Deportes',    'co':'US','logo':'','url':'https://outsidetv.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n11','name':'Fight Sports',      'cat':'Deportes',    'co':'US','logo':'','url':'https://fightsports.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n12','name':'Motor Trend',       'cat':'General',     'co':'US','logo':'','url':'https://motortrend.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n13','name':'Red Bull TV',       'cat':'Deportes',    'co':'AT','logo':'','url':'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8'},
    {'id':'n14','name':'Tastemade',         'cat':'General',     'co':'US','logo':'','url':'https://tastemade.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n15','name':'La 1 RTVE',         'cat':'General',     'co':'ES','logo':'','url':'https://rtvelive.rtve.es/live/stream/la1/la1_HD.m3u8'},
    {'id':'n16','name':'24h RTVE',          'cat':'Noticias',    'co':'ES','logo':'','url':'https://rtvelive.rtve.es/live/stream/24h/24h_HD.m3u8'},
    {'id':'n17','name':'La 2 RTVE',         'cat':'General',     'co':'ES','logo':'','url':'https://rtvelive.rtve.es/live/stream/la2/la2_HD.m3u8'},
    {'id':'n18','name':'Eurosport 1',       'cat':'Deportes',    'co':'EU','logo':'','url':'https://eurosport.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n19','name':'beIN Sports xtra',  'cat':'Deportes',    'co':'QA','logo':'','url':'https://bein.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n20','name':'DeporTV AR',        'cat':'Deportes',    'co':'AR','logo':'','url':'https://deportv-live.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n21','name':'Mezzo Live HD',     'cat':'Musica',      'co':'FR','logo':'','url':'https://mezzo.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n22','name':'Baby TV',           'cat':'Infantil',    'co':'GB','logo':'','url':'https://babytv.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n23','name':'History Hit',       'cat':'Documentales','co':'GB','logo':'','url':'https://historyhit.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n24','name':'Insight TV',        'cat':'Documentales','co':'NL','logo':'','url':'https://insight.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n25','name':'3ABN Latino',       'cat':'Religiosos',  'co':'US','logo':'','url':'https://3abn.wurl.tv/manifest/playlist.m3u8'},
    {'id':'n26','name':'Pluto News',        'cat':'Noticias',    'co':'US','logo':'','url':'https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5dd56cd48b5f66f2c72e44b5/master.m3u8'},
    {'id':'n27','name':'Pluto Movies',      'cat':'Peliculas',   'co':'US','logo':'','url':'https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5d5c604cf3cce2aa7e6fa4a4/master.m3u8'},
    {'id':'n28','name':'Canal 13 CL',       'cat':'General',     'co':'CL','logo':'','url':'https://13live.13.cl/hls/live/master.m3u8'},
    {'id':'n29','name':'TVN CL',            'cat':'Noticias',    'co':'CL','logo':'','url':'https://mdstrm.com/live-stream/57f8040c65e24e0600b7b5a4.m3u8'},
    {'id':'n30','name':'Red Bull TV',       'cat':'Deportes',    'co':'AT','logo':'','url':'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8'},
]

RADIOS_BASE = [
    {'id':'rd01','name':'Radio Cooperativa CL', 'cat':'Noticias','co':'CL','url':'https://streaming.cooperativa.cl/radio-cooperativa-128.mp3'},
    {'id':'rd02','name':'Radio Agricultura CL',  'cat':'General', 'co':'CL','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOAGRICULTURA.mp3'},
    {'id':'rd03','name':'ADN Radio CL',          'cat':'Noticias','co':'CL','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/ADNRADIO.mp3'},
    {'id':'rd04','name':'Bio Bio Radio CL',      'cat':'Noticias','co':'CL','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOBIOBIO.mp3'},
    {'id':'rd05','name':'Radio Duna CL',         'cat':'Musica',  'co':'CL','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIODUNA.mp3'},
    {'id':'rd06','name':'Radio Activa CL',       'cat':'Musica',  'co':'CL','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOACTIVA.mp3'},
    {'id':'rd07','name':'Pudahuel FM CL',        'cat':'Musica',  'co':'CL','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/PUDAHUEL.mp3'},
    {'id':'rd08','name':'Radio Mitre AR',        'cat':'Noticias','co':'AR','url':'https://streaming.radiomitre.cienradios.com/radiomitre.mp3'},
    {'id':'rd09','name':'La 100 AR',             'cat':'Musica',  'co':'AR','url':'https://streaming.la100.cienradios.com/la100.mp3'},
    {'id':'rd10','name':'Cadena 3 AR',           'cat':'Noticias','co':'AR','url':'https://cadena3.com/stream/cadena3.aac'},
    {'id':'rd11','name':'Caracol Radio CO',      'cat':'Noticias','co':'CO','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/CARACOL_RADIO.mp3'},
    {'id':'rd12','name':'W Radio Colombia',      'cat':'Noticias','co':'CO','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/WRADIO_CO.mp3'},
    {'id':'rd13','name':'Olimpica Stereo CO',    'cat':'Musica',  'co':'CO','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/OLIMPICA.mp3'},
    {'id':'rd14','name':'Blu Radio CO',          'cat':'Noticias','co':'CO','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/BLU_RADIO.mp3'},
    {'id':'rd15','name':'Los 40 Mexico',         'cat':'Musica',  'co':'MX','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/XHPLAY_CO.mp3'},
    {'id':'rd16','name':'RPP Radio PE',          'cat':'Noticias','co':'PE','url':'https://rpp-radio.streaming.com.pe/rpp-radio'},
    {'id':'rd17','name':'Cadena SER ES',         'cat':'Noticias','co':'ES','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/SER.mp3'},
    {'id':'rd18','name':'Cadena COPE ES',        'cat':'Noticias','co':'ES','url':'https://cope.stream.flumotion.com/cope/cope-main.mp3'},
    {'id':'rd19','name':'Onda Cero ES',          'cat':'Noticias','co':'ES','url':'https://streaming.ondacero.es/oc_live/live.aac'},
    {'id':'rd20','name':'Europa FM ES',          'cat':'Musica',  'co':'ES','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/EUROPA_FM.mp3'},
    {'id':'rd21','name':'Los 40 ES',             'cat':'Musica',  'co':'ES','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3'},
    {'id':'rd22','name':'Rock FM ES',            'cat':'Musica',  'co':'ES','url':'https://playerservices.streamtheworld.com/api/livestream-redirect/ROCKFM.mp3'},
    {'id':'rd23','name':'BBC World Service',     'cat':'Noticias','co':'GB','url':'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service'},
    {'id':'rd24','name':'BBC Radio 1',           'cat':'Musica',  'co':'GB','url':'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one'},
    {'id':'rd25','name':'NPR News US',           'cat':'Noticias','co':'US','url':'https://npr-ice.streamguys1.com/live.mp3'},
    {'id':'rd26','name':'RFI Espanol',           'cat':'Noticias','co':'FR','url':'https://rfifr-04.ice.infomaniak.ch/rfifr-04.aac'},
    {'id':'rd27','name':'euronews Radio ES',     'cat':'Noticias','co':'EU','url':'https://euronews-04.ice.infomaniak.ch/euronews-04.aac'},
    {'id':'rd28','name':'DW Radio Espanol',      'cat':'Noticias','co':'DE','url':'https://dwaudiode.akamaized.net/hls/live/2017965/dwstream_esp/index.m3u8'},
    {'id':'rd29','name':'Tropical 102.9',        'cat':'Musica',  'co':'LA','url':'http://radiotropical.streaming-pro.com:8016/'},
    {'id':'rd30','name':'Salsa Dura',            'cat':'Musica',  'co':'LA','url':'http://142.4.200.58:7260/'},
    {'id':'rd31','name':'Son Vallenato',         'cat':'Musica',  'co':'CO','url':'http://listen64.radionomy.com/Son-Vallenato'},
    {'id':'rd32','name':'Maxima Latina FM',      'cat':'Musica',  'co':'LA','url':'http://87.98.229.193:8024'},
    {'id':'rd33','name':'Puro Exitos',           'cat':'Musica',  'co':'LA','url':'http://streaming.capasiete.com:9704'},
    {'id':'rd34','name':'Salsabor Radio',        'cat':'Musica',  'co':'LA','url':'http://78.129.224.21:39649/'},
    {'id':'rd35','name':'Cadena Continental AR', 'cat':'Noticias','co':'AR','url':'https://streaming.continental.cienradios.com/continental.mp3'},
]

FUENTES_PAISES = {
    'CL':'https://iptv-org.github.io/iptv/countries/cl.m3u',
    'AR':'https://iptv-org.github.io/iptv/countries/ar.m3u',
    'CO':'https://iptv-org.github.io/iptv/countries/co.m3u',
    'MX':'https://iptv-org.github.io/iptv/countries/mx.m3u',
    'PE':'https://iptv-org.github.io/iptv/countries/pe.m3u',
    'VE':'https://iptv-org.github.io/iptv/countries/ve.m3u',
    'ES':'https://iptv-org.github.io/iptv/countries/es.m3u',
    'US':'https://iptv-org.github.io/iptv/countries/us.m3u',
    'GB':'https://iptv-org.github.io/iptv/countries/gb.m3u',
    'DE':'https://iptv-org.github.io/iptv/countries/de.m3u',
    'FR':'https://iptv-org.github.io/iptv/countries/fr.m3u',
    'BR':'https://iptv-org.github.io/iptv/countries/br.m3u',
    'EC':'https://iptv-org.github.io/iptv/countries/ec.m3u',
    'BO':'https://iptv-org.github.io/iptv/countries/bo.m3u',
    'GT':'https://iptv-org.github.io/iptv/countries/gt.m3u',
    'UY':'https://iptv-org.github.io/iptv/countries/uy.m3u',
}

FUENTES_CATEGORIAS = {
    'Noticias':      'https://iptv-org.github.io/iptv/categories/news.m3u',
    'Deportes':      'https://iptv-org.github.io/iptv/categories/sports.m3u',
    'Peliculas':     'https://iptv-org.github.io/iptv/categories/movies.m3u',
    'Musica':        'https://iptv-org.github.io/iptv/categories/music.m3u',
    'Infantil':      'https://iptv-org.github.io/iptv/categories/kids.m3u',
    'Documentales':  'https://iptv-org.github.io/iptv/categories/documentary.m3u',
    'Entretenimiento':'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
}

REPOS_EXTRA = [
    'https://i.mjh.nz/PlutoTV/all.m3u8',
    'https://i.mjh.nz/SamsungTVPlus/all.m3u8',
    'https://i.mjh.nz/Rakuten/all.m3u8',
    'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
]

def get_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

def http_get(url, timeout=TIMEOUT_FETCH, method='GET'):
    try:
        req = urllib.request.Request(url, method=method, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
        })
        with urllib.request.urlopen(req, timeout=timeout, context=get_ctx()) as r:
            return r.status, (b'' if method == 'HEAD' else r.read())
    except urllib.error.HTTPError as e:
        return e.code, b''
    except Exception:
        return 0, b''

def verificar_canal(url, timeout=TIMEOUT_CHECK):
    if not url or len(url) < 10: return False
    if any(x in url for x in ['youtube','twitch','youtu.be']): return True
    status, _ = http_get(url, timeout=timeout, method='HEAD')
    if status == 405:
        status, _ = http_get(url, timeout=timeout, method='GET')
    return 200 <= status < 400

def parsear_m3u(texto):
    canales, cur = [], {}
    for linea in texto.split('\n'):
        linea = linea.strip()
        if linea.startswith('#EXTINF'):
            nm = re.search(r'tvg-name="([^"]*)"', linea)
            lg = re.search(r'tvg-logo="([^"]*)"', linea)
            gr = re.search(r'group-title="([^"]*)"', linea)
            co = re.search(r'tvg-country="([^"]*)"', linea)
            cur = {
                'name': nm.group(1) if nm else linea.split(',')[-1].strip(),
                'logo': lg.group(1) if lg else '',
                'cat':  gr.group(1) if gr else 'General',
                'co':   (co.group(1) if co else '').upper(),
            }
        elif linea and not linea.startswith('#') and cur.get('name'):
            cur['url'] = linea
            canales.append(dict(cur))
            cur = {}
    return canales

def descargar_m3u(url, timeout=TIMEOUT_FETCH):
    status, data = http_get(url, timeout=timeout)
    if not data: return []
    return parsear_m3u(data.decode('utf-8', errors='ignore'))

def buscar_stream_en_web(nombre, co=''):
    """Busca stream oficial del canal en DuckDuckGo."""
    for termino in [f'{nombre} live stream m3u8', f'{nombre} online hls stream']:
        try:
            query = urllib.parse.quote(termino + (f' {co}' if co else ''))
            status, data = http_get(f'https://html.duckduckgo.com/html/?q={query}', timeout=10)
            if not data: continue
            html = data.decode('utf-8', errors='ignore')
            urls = re.findall(r'https?://[^\s"\'<>]+(?:\.m3u8|\.m3u|/live[^\s"\'<>]*|/stream[^\s"\'<>]*)', html)
            for u in urls:
                u = u.rstrip('.,)')
                if len(u) > 20 and 'duckduckgo' not in u and 'google' not in u:
                    if verificar_canal(u, timeout=5):
                        return u
        except Exception:
            continue
    return None

def buscar_alternativa(canal, pool_pais, pool_cat):
    nombre = canal.get('name','').lower()
    co     = canal.get('co','')
    cat    = canal.get('cat','')
    stop   = {'tv','fm','am','radio','canal','channel','the','los','las','del','de','en','la','el'}
    palabras = [p for p in re.split(r'[\s\-_]+', nombre) if len(p) > 2 and p not in stop]
    if not palabras: return None

    def score(n): return sum(1 for p in palabras if p in n.lower())

    # 1. Por país
    for alt in sorted(pool_pais.get(co,[]), key=lambda a: score(a.get('name','')), reverse=True)[:10]:
        if alt.get('url') and alt['url'] != canal.get('url') and score(alt.get('name','')) >= 1:
            if verificar_canal(alt['url'], timeout=5):
                print(f'     OK [pais] {alt["name"]}')
                return alt['url']

    # 2. Por categoría
    for alt in sorted(pool_cat.get(cat,[]), key=lambda a: score(a.get('name','')), reverse=True)[:10]:
        if alt.get('url') and alt['url'] != canal.get('url') and score(alt.get('name','')) >= 1:
            if verificar_canal(alt['url'], timeout=5):
                print(f'     OK [cat] {alt["name"]}')
                return alt['url']

    # 3. Búsqueda web
    print(f'     Buscando en web: {canal["name"]}...')
    return buscar_stream_en_web(canal['name'], co)

def descubrir_nuevos(tv_existente, radio_existente, pool_pais, pool_repos):
    urls_tv    = {c['url'] for c in tv_existente}
    urls_radio = {r['url'] for r in radio_existente}
    nuevos_tv, nuevas_radio = [], []
    paises = ['CL','AR','CO','MX','PE','VE','EC','BO','GT','UY','ES','BR']
    for co in paises:
        for ch in pool_pais.get(co, []):
            if not ch.get('url') or not ch.get('name'): continue
            url = ch['url']
            es_radio = any(x in url.lower() for x in ['.mp3','.aac','.ogg']) or 'radio' in ch.get('name','').lower()
            if es_radio:
                if url not in urls_radio:
                    nuevas_radio.append({'id':f'rdn{len(nuevas_radio)}','name':ch['name'],'cat':ch.get('cat','General'),'co':co,'logo':ch.get('logo',''),'url':url,'type':'radio'})
                    urls_radio.add(url)
            else:
                if url not in urls_tv:
                    nuevos_tv.append({'id':f'new{co}{len(nuevos_tv)}','name':ch['name'],'cat':ch.get('cat','General'),'co':co,'logo':ch.get('logo',''),'url':url,'type':'tv'})
                    urls_tv.add(url)
    # Repos extra
    for ch in pool_repos:
        if not ch.get('url') or not ch.get('name'): continue
        if ch['url'] not in urls_tv and ch['url'] not in urls_radio:
            nuevos_tv.append({'id':f'repo{len(nuevos_tv)}','name':ch['name'],'cat':ch.get('cat','General'),'co':ch.get('co',''),'logo':ch.get('logo',''),'url':ch['url'],'type':'tv'})
            urls_tv.add(ch['url'])
    return nuevos_tv, nuevas_radio

def generar_m3u(canales_tv, radios):
    ahora  = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    lineas = [
        '#EXTM3U',
        f'# CIC TV — {ahora} | TV: {len(canales_tv)} | Radio: {len(radios)}',
        f'# Compatible: VLC, Kodi, TiviMate, IPTV Smarters, GSE Smart IPTV',
        '',
    ]
    orden = ['Noticias','Deportes','Entretenimiento','Peliculas','Series','Infantil','Musica','Documentales','Religiosos','Negocios','General']
    cats  = {}
    for ch in canales_tv:
        cats.setdefault(ch.get('cat','General'), []).append(ch)
    for cat in sorted(cats.keys(), key=lambda x: orden.index(x) if x in orden else 99):
        for ch in cats[cat]:
            if not ch.get('url'): continue
            lineas += [f'#EXTINF:-1 tvg-name="{ch.get("name","")}" tvg-logo="{ch.get("logo","")}" tvg-country="{ch.get("co","")}" group-title="{cat}",{ch.get("name","")}', ch['url'], '']
    for rd in radios:
        if not rd.get('url'): continue
        grupo = f'Radio {rd.get("co","")}'.strip()
        lineas += [f'#EXTINF:-1 tvg-name="{rd.get("name","")}" tvg-logo="" tvg-country="{rd.get("co","")}" group-title="{grupo}",{rd.get("name","")}', rd['url'], '']
    return '\n'.join(lineas)

def main():
    t0 = time.time()
    print('='*65)
    print('  CIC TV — Generador Playlist M3U v2')
    print(f'  {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}')
    print('='*65)

    # 1. Canales TV
    canales_tv = list(CANALES_TV_BASE)
    if os.path.exists(CANALES_JSON):
        try:
            data   = json.load(open(CANALES_JSON, encoding='utf-8'))
            extra  = data.get('canales', [])
            urls_e = {c['url'] for c in canales_tv}
            nuevos = [c for c in extra if c.get('url') and c['url'] not in urls_e]
            canales_tv.extend(nuevos[:MAX_CANALES_M3U])
            print(f'[1] TV: {len(CANALES_TV_BASE)} base + {len(nuevos)} canales.json = {len(canales_tv)}')
        except Exception as e:
            print(f'[1] TV base: {len(canales_tv)} ({e})')
    else:
        print(f'[1] TV base: {len(canales_tv)}')

    # 2. Radios
    radios = list(RADIOS_BASE)
    if os.path.exists(RADIOS_JSON):
        try:
            data_r  = json.load(open(RADIOS_JSON, encoding='utf-8'))
            extra_r = data_r.get('radios', [])
            urls_r  = {r['url'] for r in radios}
            nuevas  = [r for r in extra_r if r.get('url') and r['url'] not in urls_r]
            radios.extend(nuevas)
            print(f'[2] Radio: {len(RADIOS_BASE)} base + {len(nuevas)} radios.json = {len(radios)}')
        except Exception as e:
            print(f'[2] Radio base: {len(radios)} ({e})')
    else:
        print(f'[2] Radio base: {len(radios)}')

    # 3. Descargar pools iptv-org
    print(f'\n[3] Descargando fuentes iptv-org...')
    pool_pais, pool_cat = {}, {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        f_p = {ex.submit(descargar_m3u, url): co for co, url in FUENTES_PAISES.items()}
        for f in as_completed(f_p):
            co = f_p[f]; r = f.result()
            pool_pais[co] = r
            if r: print(f'    {co}: {len(r)}')
        f_c = {ex.submit(descargar_m3u, url): cat for cat, url in FUENTES_CATEGORIAS.items()}
        for f in as_completed(f_c):
            cat = f_c[f]; r = f.result()
            pool_cat[cat] = r
            if r: print(f'    {cat}: {len(r)}')

    # 4. Repos extra
    print(f'\n[4] Descargando repos extra...')
    pool_repos = []
    for url in REPOS_EXTRA[:3]:
        r = descargar_m3u(url, timeout=20)
        if r:
            pool_repos.extend(r)
            print(f'    {url[:50]}: {len(r)}')

    # 5. Verificar caídos (primeros 200)
    print(f'\n[5] Verificando {min(200, len(canales_tv))} canales...')
    a_verificar = canales_tv[:200]
    resultados  = {}
    with ThreadPoolExecutor(max_workers=WORKERS_CHECK) as ex:
        futs = {ex.submit(verificar_canal, c['url']): c for c in a_verificar}
        for f in as_completed(futs):
            resultados[futs[f]['url']] = f.result()
    caidos = [c for c in a_verificar if not resultados.get(c['url'], True)]
    print(f'    Vivos: {len(a_verificar)-len(caidos)} | Caidos: {len(caidos)}')

    # 6. Reparar caídos
    reparados = 0
    if caidos:
        print(f'\n[6] Reparando {len(caidos)} caidos...')
        for ch in caidos:
            print(f'  Caido: {ch["name"]} ({ch["co"]})')
            nueva = buscar_alternativa(ch, pool_pais, pool_cat)
            if nueva:
                ch['url'] = nueva
                ch['reparado'] = True
                reparados += 1
            else:
                ch['caido'] = True
        print(f'    Reparados: {reparados}/{len(caidos)}')

    # 7. Descubrir nuevos
    print(f'\n[7] Descubriendo canales nuevos...')
    nuevos_tv, nuevas_radio = descubrir_nuevos(canales_tv, radios, pool_pais, pool_repos)
    print(f'    Candidatos TV: {len(nuevos_tv)} | Radio: {len(nuevas_radio)}')
    # Verificar nuevos TV (lote de 300)
    verificados = []
    with ThreadPoolExecutor(max_workers=30) as ex:
        futs = {ex.submit(verificar_canal, c['url'], 5): c for c in nuevos_tv[:400]}
        for f in as_completed(futs):
            if f.result(): verificados.append(futs[f])
    canales_tv.extend(verificados[:300])
    radios.extend(nuevas_radio[:150])
    print(f'    Agregados: {len(verificados[:300])} TV + {len(nuevas_radio[:150])} radios')

    # 8. Guardar radios.json
    json.dump({'generado': datetime.now(timezone.utc).isoformat(), 'total': len(radios), 'radios': radios},
              open(RADIOS_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'\n[8] radios.json: {len(radios)} emisoras')

    # 9. Generar M3U
    finales   = [c for c in canales_tv if not c.get('caido')]
    contenido = generar_m3u(finales, radios)
    open(OUTPUT_M3U, 'w', encoding='utf-8').write(contenido)
    entradas  = contenido.count('#EXTINF')
    print(f'[9] playlist.m3u: {entradas} entradas ({len(finales)} TV + {len(radios)} radios)')
    print(f'\nCompletado en {time.time()-t0:.1f}s')
    print('='*65)

if __name__ == '__main__':
    main()
