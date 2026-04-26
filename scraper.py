#!/usr/bin/env python3
"""
scraper.py — CIC TV
Scraping de futbollibretv.su/agenda/ usando Playwright (headless Chrome)
Genera partidos.json que lee recomendados.js
Corre via GitHub Actions cada hora
"""

import asyncio
import json
import re
import os
from datetime import datetime

# ── Intento con Playwright (navegador real) ──
async def scrape_con_playwright():
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright no disponible, usando requests")
        return None

    partidos = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
            ]
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            locale='es-ES',
            viewport={'width': 1280, 'height': 800},
        )
        page = await context.new_page()

        # Ocultar señales de automatización
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)

        print("Visitando home para obtener cookies...")
        try:
            await page.goto('https://futbollibretv.su/', wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(2)
        except Exception as e:
            print(f"Error en home: {e}")

        print("Cargando /agenda/...")
        try:
            await page.goto('https://futbollibretv.su/agenda/', wait_until='networkidle', timeout=30000)
            await asyncio.sleep(3)
        except Exception as e:
            print(f"Error en agenda: {e}")
            await browser.close()
            return None

        # Obtener HTML completo
        html = await page.content()
        print(f"HTML obtenido: {len(html)} chars")

        # Parsear con BeautifulSoup
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, 'html.parser')
            partidos = parsear_agenda(soup, html)
        except ImportError:
            # Fallback: parsear con regex
            partidos = parsear_regex(html)

        await browser.close()
    return partidos


def parsear_agenda(soup, html_raw):
    """Parsear la tabla de partidos de /agenda/"""
    partidos = []
    vistos = set()
    partido_actual = None

    # Buscar todas las filas de la tabla
    filas = soup.find_all('tr')
    print(f"Filas encontradas: {len(filas)}")

    for fila in filas:
        texto = fila.get_text(separator=' ', strip=True)
        celdas = fila.find_all('td')
        if not celdas:
            continue

        # ── Fila de partido (tiene hora + nombre con "vs") ──
        hora_match = re.search(r'(\d{1,2}:\d{2})', texto)
        vs_match = re.search(
            r'([A-Za-z\u00C0-\u024F][^\n<]{2,35})\s+vs\.?\s+([A-Za-z\u00C0-\u024F][^\n<]{2,35})',
            texto, re.IGNORECASE
        )

        if hora_match and vs_match:
            hora = hora_match.group(1)
            equipo_a = vs_match.group(1).strip()
            equipo_b = vs_match.group(2).strip()
            nombre = f"{equipo_a} vs {equipo_b}"
            nombre = limpiar_nombre(nombre)

            if len(nombre) < 8 or len(nombre) > 80:
                continue

            key = nombre.lower().replace(' ', '')[:20]
            if key in vistos:
                continue
            vistos.add(key)

            # Detectar liga del texto (suele venir antes del nombre)
            liga_match = re.search(r'^([A-Za-z\u00C0-\u024F][^:]+):\s*', texto)
            liga = liga_match.group(1).strip() if liga_match else detectar_liga(nombre)

            # Detectar si está en vivo (fila resaltada en verde)
            en_vivo = bool(
                fila.get('class') and any('active' in c or 'live' in c or 'green' in c
                                          for c in fila.get('class', []))
            ) or es_en_vivo(hora)

            # Bandera/país
            img = fila.find('img')
            logo = img.get('src', '') if img else ''

            partido_actual = {
                'hora':    hora,
                'nombre':  nombre,
                'liga':    liga,
                'logo':    logo,
                'enVivo':  en_vivo,
                'canales': [],
            }
            partidos.append(partido_actual)

        # ── Fila de canal (tiene link /eventos/?r=BASE64) ──
        elif partido_actual:
            links = fila.find_all('a', href=re.compile(r'/eventos/'))
            for link in links:
                href = link.get('href', '')
                b64_match = re.search(r'[?&]r=([A-Za-z0-9+/=]+)', href)
                if not b64_match:
                    continue
                nombre_canal = link.get_text(strip=True) or 'Canal'
                # Calidad si está disponible
                calidad_td = link.find_next('td')
                calidad = calidad_td.get_text(strip=True) if calidad_td else ''

                partido_actual['canales'].append({
                    'nombre': nombre_canal,
                    'calidad': calidad,
                    'href': href,
                    'base64': b64_match.group(1),
                })

    print(f"Partidos parseados: {len(partidos)}")
    for p in partidos[:5]:
        print(f"  {p['hora']} | {p['nombre']} | canales: {len(p['canales'])}")
    return partidos


def parsear_regex(html):
    """Fallback: parsear con regex puro"""
    partidos = []
    vistos = set()

    bloques = re.split(r'<tr[\s>]', html, flags=re.IGNORECASE)
    partido_actual = None

    for bloque in bloques:
        # Quitar tags HTML
        texto = re.sub(r'<[^>]+>', ' ', bloque)
        texto = re.sub(r'\s+', ' ', texto).strip()

        hora_m = re.search(r'(\d{1,2}:\d{2})', texto)
        vs_m   = re.search(
            r'([A-Za-z\u00C0-\u024F][^\n\t]{2,35})\s+vs\.?\s+([A-Za-z\u00C0-\u024F][^\n\t]{2,35})',
            texto, re.IGNORECASE
        )

        if hora_m and vs_m:
            nombre = limpiar_nombre(f"{vs_m.group(1).strip()} vs {vs_m.group(2).strip()}")
            if len(nombre) < 8 or len(nombre) > 80:
                continue
            key = nombre.lower().replace(' ', '')[:20]
            if key in vistos:
                continue
            vistos.add(key)

            partido_actual = {
                'hora':    hora_m.group(1),
                'nombre':  nombre,
                'liga':    detectar_liga(nombre),
                'logo':    '',
                'enVivo':  es_en_vivo(hora_m.group(1)),
                'canales': [],
            }
            partidos.append(partido_actual)

        elif partido_actual:
            # Buscar links de eventos en este bloque
            links = re.findall(r'href="([^"]*\/eventos\/\?r=([A-Za-z0-9+/=]+))"[^>]*>([^<]{0,40})', bloque)
            for href, b64, nombre_canal in links:
                partido_actual['canales'].append({
                    'nombre': nombre_canal.strip() or 'Canal',
                    'calidad': '',
                    'href': href,
                    'base64': b64,
                })

    return partidos


def limpiar_nombre(nombre):
    nombre = re.sub(r'\s+', ' ', nombre).strip()
    nombre = re.sub(r'(?i)datemodified.*', '', nombre)
    nombre = re.sub(r'(?i)description.*', '', nombre)
    return nombre.strip()


def detectar_liga(nombre):
    n = nombre.lower()
    ligas = [
        ('Champions League', 'champions'),
        ('LaLiga', 'laliga'), ('LaLiga', 'la liga'),
        ('Liga MX', 'liga mx'),
        ('Premier League', 'premier'),
        ('Serie A', 'serie a'),
        ('Bundesliga', 'bundesliga'),
        ('Ligue 1', 'ligue 1'),
        ('Copa Libertadores', 'libertadores'),
        ('Copa Sudamericana', 'sudamericana'),
        ('Liga Profesional', 'liga profesional'),
        ('Primera División', 'primera div'),
        ('Eredivisie', 'eredivisie'),
        ('FA Cup', 'fa cup'),
        ('Primeira Liga', 'primeira liga'),
    ]
    for liga, clave in ligas:
        if clave in n:
            return liga
    return 'Fútbol'


def es_en_vivo(hora_str):
    try:
        ahora = datetime.now()
        partes = hora_str.split(':')
        h, m = int(partes[0]), int(partes[1])
        inicio = ahora.replace(hour=h, minute=m, second=0, microsecond=0)
        fin_ts = inicio.timestamp() + 130 * 60  # +2h10min
        return inicio.timestamp() <= ahora.timestamp() <= fin_ts
    except Exception:
        return False


def guardar_json(partidos):
    """Guardar partidos.json en el directorio raíz del repo"""
    data = {
        'generado':  datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'fecha':     datetime.now().strftime('%Y-%m-%d'),
        'total':     len(partidos),
        'partidos':  partidos,
    }
    ruta = os.path.join(os.path.dirname(__file__), 'partidos.json')
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ partidos.json guardado: {len(partidos)} partidos")
    print(f"   Ruta: {ruta}")


async def main():
    print(f"=== Scraper CIC TV — {datetime.now().strftime('%Y-%m-%d %H:%M')} ===")

    partidos = await scrape_con_playwright()

    if not partidos:
        print("Playwright falló o sin partidos — generando JSON vacío con hora")
        partidos = []

    guardar_json(partidos)


if __name__ == '__main__':
    asyncio.run(main())
