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

# ── Fuentes verificadas — alta disponibilidad ──
FUENTES_EXTRA = [
    # Pluto TV — miles de canales 100% legales y gratuitos
    'https://i.mjh.nz/PlutoTV/all.m3u8',
    # Pluto TV por región
    'https://i.mjh.nz/PlutoTV/us.m3u8',
    'https://i.mjh.nz/PlutoTV/es.m3u8',
    'https://i.mjh.nz/PlutoTV/mx.m3u8',
    'https://i.mjh.nz/PlutoTV/ar.m3u8',
    # Free TV — canales gratuitos verificados
    'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    # Samsung TV Plus — canales oficiales
    'https://apsattv.com/ssungusa.m3u',
    # Roku Channel — canales oficiales
    'https://www.apsattv.com/rok.m3u',
    # DistroTV — canales oficiales
    'https://www.apsattv.com/distro.m3u',
    # XUMO — canales oficiales
    'https://www.apsattv.com/xumo.m3u',
    # Local Now
    'https://www.apsattv.com/localnow.m3u',
    # LG Channels
    'https://www.apsattv.com/lg.m3u',
    # Vizio
    'https://www.apsattv.com/vizio.m3u',
    # m3u.cl — canales Chile verificados
    'https://m3u.cl/lista.m3u',
    # m3u.cl LATAM — canales latinoamericanos
    'https://m3u.cl/lista/LATAM.m3u',
    # Plex TV — canales oficiales gratuitos
    'https://i.mjh.nz/Plex/all.m3u8',
    # PBS — canales públicos USA
    'https://i.mjh.nz/PBS/all.m3u8',
    # Stirr — canales gratuitos
    'https://i.mjh.nz/Stirr/all.m3u8',
    # Redbox — canales gratuitos
    'https://www.apsattv.com/redbox.m3u',
    # Tubi TV Live
    'https://www.apsattv.com/tubi.m3u',
    # Rakuten TV
    'https://www.apsattv.com/rakuten.m3u',
    # Klowd TV
    'https://www.apsattv.com/klowd.m3u',
    # TCL TV
    'https://www.apsattv.com/tcl.m3u',
    # ── Alplox json-teles — canales Chile verificados con m3u8 ──
    'https://rawcdn.githack.com/Alplox/json-teles/refs/heads/main/canales.m3u',
    # ── TDTChannels — España y LATAM (TV + Radio) ──
    'https://www.tdtchannels.com/lists/tv.m3u8',
    # ── Free-TV / IPTV — canales gratuitos verificados ──
    'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    # ── mametchikitty — animación y películas en español ──
    'https://mametchikitty.github.io/Listas-IPTV/dibujos-animados.m3u',
    'https://mametchikitty.github.io/Listas-IPTV/peliculas.m3u',
    # Radio pervii.com — movidas a FUENTES_RADIO (generan radios.json, no canales.json)
    # (eliminadas de aquí para evitar mezclar radios con canales TV)
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
TIMEOUT_VALIDACION = 10  # segundos — más tiempo para canales lentos
WORKERS_VALIDACION = 50  # más workers = validación más rápida
OUTPUT_FILE       = os.path.join(os.path.dirname(__file__), 'canales.json')
OUTPUT_RADIO_FILE = os.path.join(os.path.dirname(__file__), 'radios.json')

# ══════════════════════════════════════════════════════════════
# FUENTES DE RADIO — se generan en radios.json (separado de TV)
# ══════════════════════════════════════════════════════════════
RADIO_CAT_MAP = {
    'music': 'Música', 'música': 'Música', 'musica': 'Música',
    'news': 'Noticias', 'noticias': 'Noticias',
    'talk': 'General', 'general': 'General', 'undefined': 'General',
    'sports': 'Deportes', 'sport': 'Deportes', 'deportes': 'Deportes',
    'religious': 'Religiosos', 'religion': 'Religiosos', 'religiosos': 'Religiosos',
    'entertainment': 'Entretenimiento', 'culture': 'Entretenimiento',
    'business': 'Negocios', 'education': 'General',
}

FUENTES_RADIO = [
    # ══ pervii.com — catálogo completo de géneros ══
    # Pop / Top
    {'url': 'http://radio.pervii.com/top_radio_top_40.m3u',        'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_pop.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_mixed.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_various.m3u',       'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_oldies.m3u',        'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_retro.m3u',         'cat': 'Música', 'co': None},
    # Rock / Metal / Punk
    {'url': 'http://radio.pervii.com/top_radio_rock.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_metal.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_hardrock.m3u',      'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_punk.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_gothic.m3u',        'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_hardcore.m3u',      'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_alternative.m3u',   'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_indie.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_progressive.m3u',   'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_industrial.m3u',    'cat': 'Música', 'co': None},
    # Electrónica / Dance
    {'url': 'http://radio.pervii.com/top_radio_electronic.m3u',    'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_dance.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_house.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_techno.m3u',        'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_trance.m3u',        'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_club.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_eurodance.m3u',     'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_disco.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_discofox.m3u',      'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_drum_and_bass.m3u', 'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_breakbeat.m3u',     'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_goa.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_ebm.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_jungle.m3u',        'cat': 'Música', 'co': None},
    # Jazz / Blues / Soul / R&B
    {'url': 'http://radio.pervii.com/top_radio_jazz.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_smooth_jazz.m3u',   'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_acid_jazz.m3u',     'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_blues.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_soul.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_rnb.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_funk.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_swing.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_big_band.m3u',      'cat': 'Música', 'co': None},
    # Hip Hop / Rap / Urban
    {'url': 'http://radio.pervii.com/top_radio_hip_hop.m3u',       'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_rap.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_urban.m3u',         'cat': 'Música', 'co': None},
    # Latin / World
    {'url': 'http://radio.pervii.com/top_radio_latin.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_salsa.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_reggae.m3u',        'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_ska.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_world.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_african.m3u',       'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_arabic.m3u',        'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_asian.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_india.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_jpop.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_anime.m3u',         'cat': 'Música', 'co': None},
    # Por décadas
    {'url': 'http://radio.pervii.com/top_radio_60s.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_70s.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_80s.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_90s.m3u',           'cat': 'Música', 'co': None},
    # Clásica / Instrumental
    {'url': 'http://radio.pervii.com/top_radio_classical.m3u',     'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_opera.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_symphonic.m3u',     'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_instrumental.m3u',  'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_ambient.m3u',       'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_chillout.m3u',      'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_lounge.m3u',        'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_downtempo.m3u',     'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_easy_listening.m3u','cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_film.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_soundtrack.m3u',    'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_musical.m3u',       'cat': 'Música', 'co': None},
    # Country / Folk / Americana
    {'url': 'http://radio.pervii.com/top_radio_country.m3u',       'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_folk.m3u',          'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_americana.m3u',     'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_bluegrass.m3u',     'cat': 'Música', 'co': None},
    # Por idioma/región
    {'url': 'http://radio.pervii.com/top_radio_deutsch.m3u',       'cat': 'Música', 'co': 'DE'},
    {'url': 'http://radio.pervii.com/top_radio_france.m3u',        'cat': 'Música', 'co': 'FR'},
    {'url': 'http://radio.pervii.com/top_radio_italian.m3u',       'cat': 'Música', 'co': 'IT'},
    {'url': 'http://radio.pervii.com/top_radio_portugal.m3u',      'cat': 'Música', 'co': 'PT'},
    {'url': 'http://radio.pervii.com/top_radio_spain.m3u',         'cat': 'Música', 'co': 'ES'},
    {'url': 'http://radio.pervii.com/top_radio_greek.m3u',         'cat': 'Música', 'co': 'GR'},
    {'url': 'http://radio.pervii.com/top_radio_polish.m3u',        'cat': 'Música', 'co': 'PL'},
    {'url': 'http://radio.pervii.com/top_radio_romanian.m3u',      'cat': 'Música', 'co': 'RO'},
    {'url': 'http://radio.pervii.com/top_radio_russian.m3u',       'cat': 'Música', 'co': 'RU'},
    {'url': 'http://radio.pervii.com/top_radio_turk.m3u',          'cat': 'Música', 'co': 'TR'},
    {'url': 'http://radio.pervii.com/top_radio_schlager.m3u',      'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_polka.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_usa.m3u',           'cat': 'Música', 'co': 'US'},
    {'url': 'http://radio.pervii.com/top_radio_college.m3u',       'cat': 'Música', 'co': None},
    # Otros géneros
    {'url': 'http://radio.pervii.com/top_radio_metal.m3u',         'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_gay.m3u',           'cat': 'Música', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_comedy.m3u',        'cat': 'Entretenimiento', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_talk.m3u',          'cat': 'General',         'co': None},
    {'url': 'http://radio.pervii.com/top_radio_sport.m3u',         'cat': 'Deportes',        'co': None},
    # Religiosas
    {'url': 'http://radio.pervii.com/top_radio_christian.m3u',     'cat': 'Religiosos', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_gospel.m3u',        'cat': 'Religiosos', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_quran.m3u',         'cat': 'Religiosos', 'co': None},
    {'url': 'http://radio.pervii.com/top_radio_spiritual.m3u',     'cat': 'Religiosos', 'co': None},
    # ══ m3u.cl ══
    {'url': 'https://m3u.cl/lista.m3u',       'cat': 'General', 'co': 'CL', 'radio_only': True},
    {'url': 'https://m3u.cl/lista/LATAM.m3u', 'cat': 'General', 'co': None, 'radio_only': True},
    # ══ iptv-org radios por país LATAM (solo URLs de audio) ══
    {'url': 'https://iptv-org.github.io/iptv/countries/cl.m3u', 'cat': None, 'co': 'CL', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/ar.m3u', 'cat': None, 'co': 'AR', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/mx.m3u', 'cat': None, 'co': 'MX', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/co.m3u', 'cat': None, 'co': 'CO', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/pe.m3u', 'cat': None, 'co': 'PE', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/ve.m3u', 'cat': None, 'co': 'VE', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/ec.m3u', 'cat': None, 'co': 'EC', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/bo.m3u', 'cat': None, 'co': 'BO', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/do.m3u', 'cat': None, 'co': 'DO', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/uy.m3u', 'cat': None, 'co': 'UY', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/py.m3u', 'cat': None, 'co': 'PY', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/gt.m3u', 'cat': None, 'co': 'GT', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/es.m3u', 'cat': None, 'co': 'ES', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/us.m3u', 'cat': None, 'co': 'US', 'radio_only': True},
    {'url': 'https://iptv-org.github.io/iptv/countries/br.m3u', 'cat': None, 'co': 'BR', 'radio_only': True},
]


# ══════════════════════════════════════════════════════════════
# LECTOR DE fuentes.txt — fuentes manuales del usuario
# ══════════════════════════════════════════════════════════════
# Formato fuentes.txt:
#   # Comentario
#   https://ejemplo.com/lista.m3u           ← TV (auto-detectado)
#   https://ejemplo.com/radio.m3u  radio    ← forzar tipo radio
#   https://ejemplo.com/lista.m3u  tv  CL   ← forzar TV + país
#   https://ejemplo.com/lista.m3u  tv  MX  Películas  ← con categoría

FUENTES_TXT_FILE = os.path.join(os.path.dirname(__file__), 'fuentes.txt')

def leer_fuentes_txt():
    """Lee fuentes.txt y retorna (fuentes_tv, fuentes_radio)."""
    fuentes_tv    = []  # lista de URLs string (van a FUENTES_EXTRA)
    fuentes_radio = []  # lista de dicts (van a FUENTES_RADIO)

    if not os.path.exists(FUENTES_TXT_FILE):
        return fuentes_tv, fuentes_radio

    with open(FUENTES_TXT_FILE, 'r', encoding='utf-8') as f:
        lineas = f.readlines()

    for linea in lineas:
        linea = linea.strip()
        # Ignorar comentarios y líneas vacías
        if not linea or linea.startswith('#'):
            continue
        partes = linea.split()
        url  = partes[0]
        tipo = partes[1].lower() if len(partes) > 1 else 'auto'
        co   = partes[2].upper() if len(partes) > 2 else None
        cat  = ' '.join(partes[3:]) if len(partes) > 3 else None

        # Auto-detectar tipo por extensión/nombre si no se especificó
        if tipo == 'auto':
            u = url.lower()
            if any(x in u for x in ['radio', 'audio', '.mp3', '.aac', '.pls']):
                tipo = 'radio'
            else:
                tipo = 'tv'

        if tipo == 'radio':
            fuentes_radio.append({
                'url': url,
                'cat': cat,
                'co':  co,
                'radio_only': False,  # ya viene de fuente de radio
            })
            print(f'   📻 [fuentes.txt] Radio: {url.split("/")[-1][:50]}')
        else:
            fuentes_tv.append(url)
            print(f'   📺 [fuentes.txt] TV: {url.split("/")[-1][:50]}')

    return fuentes_tv, fuentes_radio


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

    # ── Leer fuentes.txt manuales ──
    print(chr(10) + '📄 Leyendo fuentes.txt...')
    fuentes_txt_tv, fuentes_txt_radio = leer_fuentes_txt()
    if fuentes_txt_tv:
        print(f'   → {len(fuentes_txt_tv)} fuentes TV manuales')
    if fuentes_txt_radio:
        print(f'   → {len(fuentes_txt_radio)} fuentes Radio manuales')

    # Combinar fuentes TV: las del txt van primero (prioridad manual)
    fuentes_extra_total = fuentes_txt_tv + FUENTES_EXTRA

    todos = {}  # url → canal
    # Preservar canales existentes
    for url, c in existentes.items():
        todos[url] = c

    # ── Descargar y parsear fuentes extra (manuales + automáticas) ──
    for url_extra in fuentes_extra_total:
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
    MAX_VALIDAR = 2000  # validar más canales por ciclo
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



# ══════════════════════════════════════════════════════════════
# MAIN RADIO — genera radios.json desde FUENTES_RADIO
# ══════════════════════════════════════════════════════════════
def es_url_radio(url):
    """Devuelve True si la URL parece ser audio (radio), no video."""
    u = url.lower()
    # Extensiones de audio directas
    if any(u.endswith(ext) for ext in ['.mp3', '.aac', '.ogg', '.flac', '.m4a', '.opus', '.pls', '.xspf']):
        return True
    # Streams de audio conocidos
    if any(p in u for p in ['stream', 'radio', 'audio', 'listen', 'live.mp3', '/stream/', '/radio/', '/listen/']):
        return True
    # m3u8 de video → NO es radio
    if u.endswith('.m3u8') or '.m3u8' in u:
        return False
    return False

def cargar_radios_existentes():
    try:
        with open(OUTPUT_RADIO_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return {r['url']: r for r in data.get('radios', [])}
    except Exception:
        return {}

def normalizar_cat_radio(cat_raw, cat_fuente):
    if cat_fuente:
        return cat_fuente
    if not cat_raw:
        return 'General'
    key = cat_raw.lower().split(';')[0].strip()
    return RADIO_CAT_MAP.get(key, 'General')

def parsear_m3u_radio(txt, co_default=None, cat_default=None, radio_only=False):
    """Parsea M3U extrayendo solo entradas de radio (audio). Si radio_only=True filtra por URL."""
    canales = []
    cur = {}
    for linea in txt.split('\n'):
        linea = linea.strip()
        if linea.startswith('#EXTINF'):
            name_m  = re.search(r',(.+)$', linea)
            logo_m  = re.search(r'tvg-logo="([^"]*)"', linea)
            co_m    = re.search(r'tvg-country="([^"]*)"', linea)
            cat_m   = re.search(r'group-title="([^"]*)"', linea)
            cur = {
                'name': name_m.group(1).strip() if name_m else '',
                'logo': logo_m.group(1) if logo_m else '',
                'co':   (co_m.group(1).upper() if co_m else co_default) or '',
                'cat_raw': cat_m.group(1) if cat_m else '',
            }
        elif linea and not linea.startswith('#') and cur.get('name'):
            url = linea.strip()
            cur['url'] = url
            # Si radio_only, solo incluir URLs de audio (no m3u8 de video)
            if radio_only and not es_url_radio(url):
                cur = {}
                continue
            cur['cat'] = normalizar_cat_radio(cur.get('cat_raw', ''), cat_default)
            cur.pop('cat_raw', None)
            if url:
                canales.append({**cur})
            cur = {}
    return canales

def validar_radio(radio):
    """Valida si una URL de radio responde correctamente."""
    url = radio.get('url', '')
    if not url:
        return False
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; StreamChecker)',
            'Icy-MetaData': '1',
        }, method='GET')
        with urllib.request.urlopen(req, context=ctx, timeout=8) as r:
            status = r.status
            if status not in (200, 206):
                return False
            data = r.read(512)
            if len(data) < 5:
                return False
            # Verificar que no es página de error HTML
            texto = data.decode('utf-8', errors='ignore').lower()
            if '<html' in texto or '<!doctype' in texto:
                return False
            return True
    except Exception:
        return False


def validar_lote_radios(lista, workers=40):
    """Valida radios en paralelo, retorna solo las vivas."""
    vivas = []
    caidas = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futuros = {ex.submit(validar_radio, r): r for r in lista}
        for futuro, radio in futuros.items():
            try:
                ok = futuro.result(timeout=10)
                if ok:
                    radio['vivo'] = True
                    vivas.append(radio)
                else:
                    caidas += 1
            except Exception:
                caidas += 1
    return vivas, caidas


def main_radio():
    print(f'\n{"="*60}')
    print(f'CIC TV — Actualizador de RADIOS')
    print(f'{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'{"="*60}\n')

    existentes = cargar_radios_existentes()
    print(f'Radios existentes en JSON: {len(existentes)}')

    # ── Agregar fuentes radio manuales de fuentes.txt ──
    _, fuentes_txt_radio = leer_fuentes_txt()
    fuentes_radio_total = fuentes_txt_radio + FUENTES_RADIO

    # Recolectar todas las radios de todas las fuentes
    candidatas = {}  # url → radio (sin duplicados)

    for fuente in fuentes_radio_total:
        url_fuente  = fuente['url']
        cat_default = fuente.get('cat')
        co_default  = fuente.get('co')
        radio_only  = fuente.get('radio_only', False)
        print(f'📻 {url_fuente.split("/")[-1][:40]} ...', end=' ', flush=True)
        txt = fetch_m3u(url_fuente)
        if not txt:
            print('sin respuesta')
            continue
        nuevas = parsear_m3u_radio(txt, co_default, cat_default, radio_only)
        print(f'{len(nuevas)} entradas')
        agregadas = 0
        for r in nuevas:
            url = r.get('url', '')
            if not url or url in candidatas:
                continue
            candidatas[url] = r
            agregadas += 1
        print(f'   → {agregadas} nuevas candidatas')

    print(f'\n📊 Total candidatas: {len(candidatas)}')

    # ── Validar todas las radios candidatas ──
    print(f'\n🔍 Validando streams de radio (40 en paralelo)...')
    lista_candidatas = list(candidatas.values())
    t0 = time.time()
    vivas, caidas = validar_lote_radios(lista_candidatas, workers=40)
    t1 = time.time()
    print(f'   ✅ {len(vivas)} funcionando | ❌ {caidas} caídas | ⏱ {t1-t0:.1f}s')

    # ── Asignar IDs estables ──
    for r in vivas:
        if not r.get('id'):
            r['id'] = 'r' + str(abs(hash(r['url'])) % (10**8)).zfill(8)
        r['type'] = 'radio'

    total = len(vivas)
    print(f'\n📊 Total radios validadas: {total}')

    data = {
        'generado': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'total':    total,
        'radios':   vivas,
    }

    with open(OUTPUT_RADIO_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(OUTPUT_RADIO_FILE) // 1024
    print(f'\n✅ radios.json guardado: {total} radios validadas · {size_kb} KB')
if __name__ == '__main__':
    main()
    main_radio()
