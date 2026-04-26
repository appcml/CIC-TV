#!/usr/bin/env python3
"""
actualizar.py — CIC TV
Busca canales de todas las categorías desde iptv-org y otras fuentes,
los valida y guarda en canales.json para que la app los use directamente.
Corre via GitHub Actions cada 6 horas.
"""

import asyncio
import json
import os
import re
import ssl
import time
import urllib.request
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

# ══════════════════════════════════
# CONFIGURACIÓN
# ══════════════════════════════════
REPO_BASE = 'https://iptv-org.github.io/iptv'

# ── Fuentes de plataformas gratuitas legales ──
FUENTES_EXTRA = [
    # Pluto TV — miles de canales gratuitos legales
    'https://i.mjh.nz/PlutoTV/all.m3u8',
    # Samsung TV Plus
    'https://apsattv.com/ssungusa.m3u',
    # Roku Channel
    'https://www.apsattv.com/rok.m3u',
    # DistroTV
    'https://www.apsattv.com/distro.m3u',
    # XUMO
    'https://www.apsattv.com/xumo.m3u',
    # Local Now
    'https://www.apsattv.com/localnow.m3u',
    # LG Channels
    'https://www.apsattv.com/lg.m3u',
]

FUENTES = [
    # ══ IPTV-ORG POR CATEGORÍA ══
    # Deportes (máxima prioridad — fútbol)
    {'url': f'{REPO_BASE}/categories/sports.m3u',        'cat': 'Deportes',        'co': None},
    {'url': f'{REPO_BASE}/categories/football.m3u',      'cat': 'Deportes',        'co': None},
    # Entretenimiento y cine
    {'url': f'{REPO_BASE}/categories/movies.m3u',        'cat': 'Películas',       'co': None},
    {'url': f'{REPO_BASE}/categories/series.m3u',        'cat': 'Series',          'co': None},
    {'url': f'{REPO_BASE}/categories/animation.m3u',     'cat': 'Infantil',        'co': None},
    {'url': f'{REPO_BASE}/categories/kids.m3u',          'cat': 'Infantil',        'co': None},
    {'url': f'{REPO_BASE}/categories/entertainment.m3u', 'cat': 'Entretenimiento', 'co': None},
    # Información
    {'url': f'{REPO_BASE}/categories/news.m3u',          'cat': 'Noticias',        'co': None},
    {'url': f'{REPO_BASE}/categories/documentary.m3u',   'cat': 'Documentales',    'co': None},
    {'url': f'{REPO_BASE}/categories/business.m3u',      'cat': 'Negocios',        'co': None},
    # Otros
    {'url': f'{REPO_BASE}/categories/music.m3u',         'cat': 'Música',          'co': None},
    {'url': f'{REPO_BASE}/categories/religious.m3u',     'cat': 'Religiosos',      'co': None},
    {'url': f'{REPO_BASE}/categories/general.m3u',       'cat': 'General',         'co': None},
    {'url': f'{REPO_BASE}/categories/auto.m3u',          'cat': 'General',         'co': None},
    {'url': f'{REPO_BASE}/categories/classic.m3u',       'cat': 'Entretenimiento', 'co': None},
    {'url': f'{REPO_BASE}/categories/comedy.m3u',        'cat': 'Entretenimiento', 'co': None},
    {'url': f'{REPO_BASE}/categories/cooking.m3u',       'cat': 'Entretenimiento', 'co': None},
    {'url': f'{REPO_BASE}/categories/culture.m3u',       'cat': 'Documentales',    'co': None},
    {'url': f'{REPO_BASE}/categories/family.m3u',        'cat': 'Infantil',        'co': None},
    {'url': f'{REPO_BASE}/categories/lifestyle.m3u',     'cat': 'Entretenimiento', 'co': None},
    {'url': f'{REPO_BASE}/categories/science.m3u',       'cat': 'Documentales',    'co': None},
    {'url': f'{REPO_BASE}/categories/travel.m3u',        'cat': 'Documentales',    'co': None},
    {'url': f'{REPO_BASE}/categories/weather.m3u',       'cat': 'Noticias',        'co': None},

    # ══ IPTV-ORG POR IDIOMA ══
    {'url': f'{REPO_BASE}/languages/spa.m3u', 'cat': None, 'co': None},  # Español
    {'url': f'{REPO_BASE}/languages/por.m3u', 'cat': None, 'co': None},  # Portugués
    {'url': f'{REPO_BASE}/languages/eng.m3u', 'cat': None, 'co': None},  # Inglés
    {'url': f'{REPO_BASE}/languages/ara.m3u', 'cat': None, 'co': None},  # Árabe

    # ══ IPTV-ORG POR PAÍS — LATINOAMÉRICA ══
    {'url': f'{REPO_BASE}/countries/ar.m3u',  'cat': None, 'co': 'AR'},
    {'url': f'{REPO_BASE}/countries/bo.m3u',  'cat': None, 'co': 'BO'},
    {'url': f'{REPO_BASE}/countries/br.m3u',  'cat': None, 'co': 'BR'},
    {'url': f'{REPO_BASE}/countries/cl.m3u',  'cat': None, 'co': 'CL'},
    {'url': f'{REPO_BASE}/countries/co.m3u',  'cat': None, 'co': 'CO'},
    {'url': f'{REPO_BASE}/countries/cr.m3u',  'cat': None, 'co': 'CR'},
    {'url': f'{REPO_BASE}/countries/do.m3u',  'cat': None, 'co': 'DO'},
    {'url': f'{REPO_BASE}/countries/ec.m3u',  'cat': None, 'co': 'EC'},
    {'url': f'{REPO_BASE}/countries/gt.m3u',  'cat': None, 'co': 'GT'},
    {'url': f'{REPO_BASE}/countries/hn.m3u',  'cat': None, 'co': 'HN'},
    {'url': f'{REPO_BASE}/countries/mx.m3u',  'cat': None, 'co': 'MX'},
    {'url': f'{REPO_BASE}/countries/pa.m3u',  'cat': None, 'co': 'PA'},
    {'url': f'{REPO_BASE}/countries/pe.m3u',  'cat': None, 'co': 'PE'},
    {'url': f'{REPO_BASE}/countries/py.m3u',  'cat': None, 'co': 'PY'},
    {'url': f'{REPO_BASE}/countries/sv.m3u',  'cat': None, 'co': 'SV'},
    {'url': f'{REPO_BASE}/countries/uy.m3u',  'cat': None, 'co': 'UY'},
    {'url': f'{REPO_BASE}/countries/ve.m3u',  'cat': None, 'co': 'VE'},

    # ══ IPTV-ORG POR PAÍS — NORTEAMÉRICA Y EUROPA ══
    {'url': f'{REPO_BASE}/countries/us.m3u',  'cat': None, 'co': 'US'},
    {'url': f'{REPO_BASE}/countries/ca.m3u',  'cat': None, 'co': 'CA'},
    {'url': f'{REPO_BASE}/countries/es.m3u',  'cat': None, 'co': 'ES'},
    {'url': f'{REPO_BASE}/countries/gb.m3u',  'cat': None, 'co': 'GB'},
    {'url': f'{REPO_BASE}/countries/de.m3u',  'cat': None, 'co': 'DE'},
    {'url': f'{REPO_BASE}/countries/fr.m3u',  'cat': None, 'co': 'FR'},
    {'url': f'{REPO_BASE}/countries/it.m3u',  'cat': None, 'co': 'IT'},
    {'url': f'{REPO_BASE}/countries/pt.m3u',  'cat': None, 'co': 'PT'},
    {'url': f'{REPO_BASE}/countries/nl.m3u',  'cat': None, 'co': 'NL'},
    {'url': f'{REPO_BASE}/countries/at.m3u',  'cat': None, 'co': 'AT'},
    {'url': f'{REPO_BASE}/countries/be.m3u',  'cat': None, 'co': 'BE'},
    {'url': f'{REPO_BASE}/countries/ch.m3u',  'cat': None, 'co': 'CH'},
    {'url': f'{REPO_BASE}/countries/pl.m3u',  'cat': None, 'co': 'PL'},
    {'url': f'{REPO_BASE}/countries/ru.m3u',  'cat': None, 'co': 'RU'},
    {'url': f'{REPO_BASE}/countries/tr.m3u',  'cat': None, 'co': 'TR'},

    # ══ IPTV-ORG POR PAÍS — ASIA ══
    {'url': f'{REPO_BASE}/countries/jp.m3u',  'cat': None, 'co': 'JP'},
    {'url': f'{REPO_BASE}/countries/kr.m3u',  'cat': None, 'co': 'KR'},
    {'url': f'{REPO_BASE}/countries/cn.m3u',  'cat': None, 'co': 'CN'},
    {'url': f'{REPO_BASE}/countries/in.m3u',  'cat': None, 'co': 'IN'},
    {'url': f'{REPO_BASE}/countries/id.m3u',  'cat': None, 'co': 'ID'},
    {'url': f'{REPO_BASE}/countries/th.m3u',  'cat': None, 'co': 'TH'},
    {'url': f'{REPO_BASE}/countries/ph.m3u',  'cat': None, 'co': 'PH'},

    # ══ IPTV-ORG POR PAÍS — MEDIO ORIENTE Y ÁFRICA ══
    {'url': f'{REPO_BASE}/countries/sa.m3u',  'cat': None, 'co': 'SA'},
    {'url': f'{REPO_BASE}/countries/ae.m3u',  'cat': None, 'co': 'AE'},
    {'url': f'{REPO_BASE}/countries/eg.m3u',  'cat': None, 'co': 'EG'},
    {'url': f'{REPO_BASE}/countries/ma.m3u',  'cat': None, 'co': 'MA'},
    {'url': f'{REPO_BASE}/countries/ng.m3u',  'cat': None, 'co': 'NG'},
    {'url': f'{REPO_BASE}/countries/za.m3u',  'cat': None, 'co': 'ZA'},
]

# Mapeo de categorías
CAT_MAP = {
    'news': 'Noticias', 'sports': 'Deportes', 'football': 'Deportes',
    'entertainment': 'Entretenimiento', 'movies': 'Películas',
    'kids': 'Infantil', 'animation': 'Infantil', 'anime': 'Infantil',
    'music': 'Música', 'documentary': 'Documentales',
    'religious': 'Religiosos', 'business': 'Negocios',
    'series': 'Series', 'general': 'General', 'undefined': 'General',
    'auto': 'General', 'comedy': 'Entretenimiento', 'family': 'Infantil',
    'classic': 'Entretenimiento', 'culture': 'Entretenimiento',
    'lifestyle': 'Entretenimiento', 'travel': 'Documentales',
    'food': 'Entretenimiento', 'religion': 'Religiosos',
}

MAX_CANALES_POR_FUENTE = 500
TIMEOUT_VALIDACION = 8
WORKERS_VALIDACION = 30
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), 'canales.json')


# ══════════════════════════════════
# FETCH M3U
# ══════════════════════════════════
def fetch_m3u(url, timeout=15):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; GitHubActions)',
            'Accept': 'text/plain, application/x-mpegurl, */*',
        })
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            import gzip as gz
            raw = r.read()
            try:
                return gz.decompress(raw).decode('utf-8', errors='ignore')
            except Exception:
                return raw.decode('utf-8', errors='ignore')
    except Exception as e:
        print(f'  ⚠ fetch error {url[:60]}: {e}')
        return None


# ══════════════════════════════════
# PARSEAR M3U
# ══════════════════════════════════
def parsear_m3u(txt, co_default=None, cat_default=None):
    canales = []
    lines = txt.split('\n')
    cur = {}
    for line in lines:
        line = line.strip()
        if line.startswith('#EXTINF'):
            name_m = re.search(r',(.+)$', line)
            logo_m = re.search(r'tvg-logo="([^"]*)"', line)
            co_m   = re.search(r'tvg-country="([^"]*)"', line)
            cat_m  = re.search(r'group-title="([^"]*)"', line)
            cur = {
                'name': (name_m.group(1) if name_m else '').strip(),
                'logo': (logo_m.group(1) if logo_m else ''),
                'co':   (co_m.group(1).upper() if co_m else co_default or ''),
                'cat':  CAT_MAP.get(
                    (cat_m.group(1) if cat_m else '').lower().split('/')[0].strip(),
                    cat_default or 'General'
                ),
            }
        elif line and not line.startswith('#') and cur.get('name'):
            cur['url'] = line
            cur['id']  = 'c' + re.sub(r'[^a-z0-9]', '', cur['name'].lower())[:8] + \
                         hex(abs(hash(line)) % 0xFFFF)[2:]
            cur['type'] = 'tv'
            cur['vivo'] = True
            cur['fallos'] = 0
            if cur['name'] and cur['url']:
                canales.append({**cur})
            cur = {}
    return canales


# ══════════════════════════════════
# VALIDAR STREAM
# ══════════════════════════════════
def validar_canal(canal):
    url = canal.get('url', '')
    if not url:
        return False
    # Saltar URLs con IPs privadas o tokens hardcodeados poco confiables
    if any(p in url for p in [
        ':8000/play/', ':9005/play/', ':2000/play/', ':4000/play/',
        ':2080/cdn2/', 'token=4444', 'megogo.xyz',
    ]):
        return False

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; StreamChecker)',
            'Range': 'bytes=0-2048',
        }, method='GET')
        with urllib.request.urlopen(req, context=ctx, timeout=TIMEOUT_VALIDACION) as r:
            status = r.status
            data   = r.read(1024)
            if status not in (200, 206):
                return False
            if len(data) < 10:
                return False
            # Verificar que es contenido HLS/stream válido (no una página HTML de error)
            texto = data.decode('utf-8', errors='ignore').lower()
            if '<html' in texto or '<!doctype' in texto:
                return False
            # HLS válido contiene #extm3u o datos binarios
            if b'#extm3u' in data or b'#extinf' in data or len(data) > 100:
                return True
            return False
    except Exception:
        return False


def validar_lote(canales):
    """Valida un lote de canales en paralelo."""
    resultados = []
    with ThreadPoolExecutor(max_workers=WORKERS_VALIDACION) as ex:
        futuros = {ex.submit(validar_canal, c): c for c in canales}
        for futuro, canal in futuros.items():
            try:
                vivo = futuro.result(timeout=TIMEOUT_VALIDACION + 2)
                canal['vivo']   = vivo
                canal['fallos'] = 0 if vivo else canal.get('fallos', 0) + 1
                resultados.append(canal)
            except Exception:
                canal['vivo']   = False
                canal['fallos'] = canal.get('fallos', 0) + 1
                resultados.append(canal)
    return resultados


# ══════════════════════════════════
# CARGAR CANALES EXISTENTES
# ══════════════════════════════════
def cargar_existentes():
    try:
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return {c['url']: c for c in data.get('canales', [])}
    except Exception:
        return {}


# ══════════════════════════════════
# MAIN
# ══════════════════════════════════
def main():
    print(f'\n{"="*60}')
    print(f'CIC TV — Actualizador de canales')
    print(f'{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'{"="*60}\n')

    existentes = cargar_existentes()
    print(f'Canales existentes: {len(existentes)}')

    todos = {}  # url → canal
    # Preservar canales existentes
    for url, c in existentes.items():
        todos[url] = c

    # ── Descargar y parsear fuentes extra (Pluto TV, Samsung, Roku, etc.) ──
    for url_extra in FUENTES_EXTRA:
        print(f'\n📥 Extra: {url_extra.split("/")[-1][:30]} ...', end=' ', flush=True)
        txt = fetch_m3u(url_extra)
        if not txt:
            print('sin respuesta')
            continue
        nuevos_extra = parsear_m3u(txt, None, None)
        print(f'{len(nuevos_extra)} canales')
        agregados_extra = 0
        for c in nuevos_extra[:300]:  # max 300 por fuente extra
            if c.get('url') and c['url'] not in todos:
                todos[c['url']] = c
                agregados_extra += 1
        print(f'   → {agregados_extra} nuevos')

    # ── Descargar y parsear todas las fuentes ──
    for fuente in FUENTES:
        url_fuente = fuente['url']
        print(f'\n📥 {url_fuente.split("/")[-1]} ...', end=' ', flush=True)
        txt = fetch_m3u(url_fuente)
        if not txt:
            print('sin respuesta')
            continue

        nuevos = parsear_m3u(txt, fuente.get('co'), fuente.get('cat'))
        print(f'{len(nuevos)} canales parseados')

        agregados = 0
        for c in nuevos[:MAX_CANALES_POR_FUENTE]:
            url = c.get('url', '')
            if not url or url in todos:
                continue
            todos[url] = c
            agregados += 1

        print(f'   → {agregados} canales nuevos agregados')

    total = len(todos)
    print(f'\n📊 Total canales en base: {total}')

    # ── Validar canales (priorizar los marcados como caídos) ──
    print('\n🔍 Validando canales...')
    lista = list(todos.values())

    # Ordenar: primero los caídos (para revalidar), luego los nuevos sin validar
    lista.sort(key=lambda c: (
        0 if not c.get('vivo') else 1,
        c.get('fallos', 0),
    ), reverse=False)

    # Validar en lotes de 200 (no más para no saturar)
    MAX_VALIDAR = 1000
    a_validar = lista[:MAX_VALIDAR]
    no_validar = lista[MAX_VALIDAR:]

    print(f'   Validando {len(a_validar)} canales ({WORKERS_VALIDACION} en paralelo)...')
    t0 = time.time()
    validados = validar_lote(a_validar)
    t1 = time.time()

    vivos  = sum(1 for c in validados if c.get('vivo'))
    caidos = sum(1 for c in validados if not c.get('vivo'))
    print(f'   ✅ {vivos} vivos | ❌ {caidos} caídos | ⏱ {t1-t0:.1f}s')

    # Combinar validados + no validados
    todos_final = {c['url']: c for c in validados}
    for c in no_validar:
        todos_final[c['url']] = c

    # ── Eliminar canales con muchos fallos ──
    antes = len(todos_final)
    todos_final = {u: c for u, c in todos_final.items() if c.get('fallos', 0) < 5}
    eliminados = antes - len(todos_final)
    if eliminados:
        print(f'   🗑 {eliminados} canales eliminados por fallos repetidos')

    # ── Guardar JSON ──
    lista_final = list(todos_final.values())
    vivos_total  = sum(1 for c in lista_final if c.get('vivo', True))
    caidos_total = len(lista_final) - vivos_total

    data = {
        'version':  2,
        'generado': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'stats': {
            'total':             len(lista_final),
            'vivos':             vivos_total,
            'caidos':            caidos_total,
            'ultima_validacion': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        },
        'canales': lista_final,
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(OUTPUT_FILE) // 1024
    print(f'\n✅ canales.json guardado:')
    print(f'   Total:  {len(lista_final)} canales')
    print(f'   Vivos:  {vivos_total}')
    print(f'   Caídos: {caidos_total}')
    print(f'   Tamaño: {size_kb} KB')


if __name__ == '__main__':
    main()
