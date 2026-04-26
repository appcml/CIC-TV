// ═══════════════════════════════════════════════════════════════
// recomendados.js — Sistema de recomendaciones CIC TV
// Fuente: futbollibretv.su + preferencias del usuario
// ═══════════════════════════════════════════════════════════════

// ════════════════════════════════════
// CONFIGURACIÓN
// ════════════════════════════════════
const REC_CONFIG = {
  urlFutbol:       'https://futbollibretv.su/',
  proxies: [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
    'https://thingproxy.freeboard.io/fetch/',
  ],
  // Cuántos ms entre cada paso del ticker automático
  tickerInterval:  4000,
  // Cuánto tiempo entre verificaciones de partidos en vivo (5 min)
  liveCheckMs:     5 * 60 * 1000,
  // Cuánto tiempo entre descargas del calendario (12 horas)
  calendarCheckMs: 12 * 60 * 60 * 1000,
  // Clave localStorage
  storageKey:      'cicRecomendados',
  prefsKey:        'cicPreferencias',
  historyKey:      'cicHistorial',
};

// ════════════════════════════════════
// ESTADO INTERNO
// ════════════════════════════════════
let recItems      = [];   // items actuales en el ticker
let recIndex      = 0;    // posición actual
let recTimer      = null; // timer del ticker automático
let recAutoTimer  = null; // timer de auto-avance
let partidosHoy   = [];   // calendario del día
let preferencias  = cargarPreferencias();
let historial     = cargarHistorial();

// ════════════════════════════════════
// INICIO
// ════════════════════════════════════
window.addEventListener('load', function() {
  // Pequeño delay para no competir con el autoplay del player
  setTimeout(iniciarRecomendados, 2000);
});

async function iniciarRecomendados() {
  console.log('[Recomendados] Iniciando...');
  await cargarCalendario();
  construirItems();
  renderTicker();
  iniciarAutoAvance();
  // Programar actualizaciones periódicas
  setInterval(verificarEnVivo, REC_CONFIG.liveCheckMs);
  setInterval(cargarCalendario, REC_CONFIG.calendarCheckMs);
}

// ════════════════════════════════════
// SCRAPING FUTBOLLIBRETV
// ════════════════════════════════════
async function cargarCalendario() {
  console.log('[Recomendados] Descargando calendario...');
  const html = await fetchConProxy(REC_CONFIG.urlFutbol);
  if (!html) {
    console.warn('[Recomendados] No se pudo obtener el calendario');
    usarDatosGuardados();
    return;
  }
  const partidos = parsearPartidos(html);
  if (partidos.length) {
    partidosHoy = partidos;
    guardarCalendario(partidos);
    console.log('[Recomendados] ' + partidos.length + ' partidos cargados');
    construirItems();
    renderTicker();
  }
}

function parsearPartidos(html) {
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    const partidos = [];

    // Filas de partidos: buscar elementos con hora y nombre de partido
    // FutbolLibreTV usa una tabla/lista con hora | bandera | nombre partido
    const filas = doc.querySelectorAll('tr, .evento, .match, .partido, [class*="event"], [class*="match"]');

    filas.forEach(function(fila) {
      const texto = fila.textContent.trim();
      // Buscar patrón de hora HH:MM
      const horaMatch = texto.match(/(\d{1,2}:\d{2})/);
      if (!horaMatch) return;
      const hora = horaMatch[1];

      // Buscar nombre del partido (vs o - entre equipos)
      const partidoMatch = texto.match(/([A-Za-záéíóúÁÉÍÓÚñÑ\s\.]+(?:vs?\.?|-)[ ]*[A-Za-záéíóúÁÉÍÓÚñÑ\s\.]+)/i);
      if (!partidoMatch) return;

      const nombre = limpiarTexto(partidoMatch[1]);
      if (nombre.length < 5) return;

      // Buscar canales disponibles (links dentro de la fila expandida)
      const canales = [];
      const links = fila.querySelectorAll('a[href]');
      links.forEach(function(a) {
        const href  = a.getAttribute('href') || '';
        const label = a.textContent.trim();
        if (href && label && !href.startsWith('#') && label.length > 1) {
          canales.push({ nombre: label, url: href });
        }
      });

      // También buscar filas hijas (canales desplegados)
      const subfilas = fila.querySelectorAll('tr, .canal, .stream, .link');
      subfilas.forEach(function(sub) {
        const subLinks = sub.querySelectorAll('a[href]');
        subLinks.forEach(function(a) {
          const href  = a.getAttribute('href') || '';
          const label = a.textContent.trim();
          if (href && label && !href.startsWith('#') && label.length > 1) {
            const yaExiste = canales.find(function(c){ return c.url === href; });
            if (!yaExiste) canales.push({ nombre: label, url: href });
          }
        });
      });

      partidos.push({
        hora:    hora,
        nombre:  nombre,
        canales: canales,
        enVivo:  esEnVivo(hora),
        liga:    detectarLiga(nombre),
      });
    });

    // Si no encontró con selectores específicos, intentar regex sobre el HTML crudo
    if (!partidos.length) {
      return parsearPartidosRegex(html);
    }

    return partidos;
  } catch(e) {
    console.warn('[Recomendados] Error parseando HTML:', e);
    return parsearPartidosRegex(html);
  }
}

function parsearPartidosRegex(html) {
  const partidos = [];
  // Buscar patrones HH:MM ... vs ... en el HTML
  const regex = /(\d{1,2}:\d{2})[^<]*?([A-Za-záéíóúÁÉÍÓÚñÑ][^<]{3,40}(?:vs?\.?|-)[^<]{3,40})/gi;
  let match;
  const vistos = new Set();
  while ((match = regex.exec(html)) !== null) {
    const hora   = match[1];
    const nombre = limpiarTexto(match[2]);
    if (nombre.length < 8 || vistos.has(nombre)) continue;
    vistos.add(nombre);
    partidos.push({
      hora:    hora,
      nombre:  nombre,
      canales: [],
      enVivo:  esEnVivo(hora),
      liga:    detectarLiga(nombre),
    });
    if (partidos.length >= 30) break;
  }
  return partidos;
}

// ════════════════════════════════════
// VERIFICAR PARTIDOS EN VIVO
// ════════════════════════════════════
async function verificarEnVivo() {
  // Actualizar estado en vivo basado en hora actual
  const ahora = new Date();
  partidosHoy.forEach(function(p) {
    p.enVivo = esEnVivo(p.hora);
  });
  construirItems();
  renderTicker();
}

function esEnVivo(horaStr) {
  try {
    const ahora = new Date();
    const partes = horaStr.split(':');
    const hPartido = parseInt(partes[0]);
    const mPartido = parseInt(partes[1]);
    const inicio = new Date();
    inicio.setHours(hPartido, mPartido, 0, 0);
    const fin = new Date(inicio.getTime() + 120 * 60 * 1000); // +2 horas
    return ahora >= inicio && ahora <= fin;
  } catch(e) { return false; }
}

// ════════════════════════════════════
// CONSTRUIR ITEMS DEL TICKER
// ════════════════════════════════════
function construirItems() {
  const items = [];
  const favsApp = JSON.parse(localStorage.getItem('cicFavs3') || '[]');

  // 1. Partidos EN VIVO — ordenados por preferencia del usuario
  const enVivo = partidosHoy.filter(function(p){ return p.enVivo; });
  const priorizados = priorizarPorPreferencias(enVivo);

  priorizados.forEach(function(partido) {
    // Si tiene canales, crear un item por cada canal
    if (partido.canales.length > 0) {
      partido.canales.forEach(function(canal, idx) {
        items.push({
          tipo:    'partido',
          emoji:   '🔴',
          texto:   partido.nombre + ' · ' + canal.nombre,
          hora:    partido.hora,
          url:     canal.url,
          partido: partido,
          canal:   canal,
          enVivo:  true,
        });
      });
    } else {
      items.push({
        tipo:    'partido',
        emoji:   '🔴',
        texto:   partido.nombre,
        hora:    partido.hora,
        url:     REC_CONFIG.urlFutbol,
        partido: partido,
        enVivo:  true,
      });
    }
  });

  // 2. Próximos partidos del día (no en vivo aún)
  const proximos = partidosHoy
    .filter(function(p){ return !p.enVivo; })
    .slice(0, 5);

  proximos.forEach(function(partido) {
    items.push({
      tipo:   'proximo',
      emoji:  '⏰',
      texto:  partido.hora + ' · ' + partido.nombre,
      url:    null,
      partido: partido,
      enVivo: false,
    });
  });

  // 3. Si no hay partidos — mostrar canales favoritos del usuario
  if (!items.length) {
    const allSrc = (typeof allTV !== 'undefined' ? allTV : [])
      .concat(typeof allRadio !== 'undefined' ? allRadio : []);
    const favCanales = allSrc.filter(function(c){ return favsApp.includes(c.id); });
    favCanales.slice(0, 8).forEach(function(canal) {
      items.push({
        tipo:  'favorito',
        emoji: '⭐',
        texto: canal.name + ' · ' + canal.cat,
        canal: canal,
        url:   null,
        enVivo: false,
      });
    });
  }

  // 4. Si aún no hay nada — mensaje genérico
  if (!items.length) {
    items.push({
      tipo:  'info',
      emoji: '📺',
      texto: 'Sin partidos en vivo ahora · Próximos eventos aparecerán aquí',
      url:   null,
    });
  }

  recItems = items;
  if (recIndex >= recItems.length) recIndex = 0;
}

// ════════════════════════════════════
// PRIORIZAR POR PREFERENCIAS
// ════════════════════════════════════
function priorizarPorPreferencias(partidos) {
  return partidos.slice().sort(function(a, b) {
    const scoreA = calcularScore(a);
    const scoreB = calcularScore(b);
    return scoreB - scoreA;
  });
}

function calcularScore(partido) {
  let score = 0;
  const nombre = partido.nombre.toLowerCase();
  const liga   = (partido.liga || '').toLowerCase();

  // Puntos por equipo favorito
  (preferencias.equipos || []).forEach(function(eq) {
    if (nombre.includes(eq.toLowerCase())) score += eq.vistas * 10;
  });

  // Puntos por liga favorita
  (preferencias.ligas || []).forEach(function(l) {
    if (liga.includes(l.nombre.toLowerCase())) score += l.vistas * 5;
  });

  // Puntos si está en vivo
  if (partido.enVivo) score += 50;

  return score;
}

// ════════════════════════════════════
// RENDER TICKER
// ════════════════════════════════════
function renderTicker() {
  const track = document.getElementById('rec-track');
  if (!track || !recItems.length) return;

  track.innerHTML = recItems.map(function(item, idx) {
    const activo   = idx === recIndex ? 'background:rgba(230,63,110,0.15);' : '';
    const cursor   = (item.url || item.canal) ? 'pointer' : 'default';
    const enVivoIndicador = item.enVivo
      ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#e63f6e;margin-right:4px;animation:pulse 2s infinite;vertical-align:middle;"></span>'
      : '';
    return '<div class="rec-item" data-idx="'+idx+'" onclick="recClick('+idx+')" style="'
      + 'flex-shrink:0;display:inline-flex;align-items:center;'
      + 'padding:0 12px;height:35px;cursor:'+cursor+';'
      + 'border-right:1px solid rgba(255,255,255,0.07);'
      + 'font-family:\'DM Sans\',sans-serif;font-size:11px;color:#f0f0f8;'
      + 'white-space:nowrap;transition:background .2s;'+activo
      + '">'
      + enVivoIndicador
      + '<span style="margin-right:5px;font-size:12px;">'+item.emoji+'</span>'
      + '<span>'+item.texto+'</span>'
      + '</div>';
  }).join('');

  // Scroll al item activo
  scrollToActive();
}

function scrollToActive() {
  const track = document.getElementById('rec-track');
  if (!track) return;
  const items = track.querySelectorAll('.rec-item');
  if (!items[recIndex]) return;

  // Calcular offset del item activo
  let offsetLeft = 0;
  for (let i = 0; i < recIndex; i++) {
    offsetLeft += items[i].offsetWidth;
  }
  track.style.transform = 'translateX(-' + offsetLeft + 'px)';
}

// ════════════════════════════════════
// NAVEGACIÓN TICKER
// ════════════════════════════════════
function recNext() {
  if (!recItems.length) return;
  recIndex = (recIndex + 1) % recItems.length;
  renderTicker();
  resetAutoAvance();
}

function recPrev() {
  if (!recItems.length) return;
  recIndex = (recIndex - 1 + recItems.length) % recItems.length;
  renderTicker();
  resetAutoAvance();
}

function recClick(idx) {
  const item = recItems[idx];
  if (!item) return;

  // Registrar interacción para aprender preferencias
  if (item.partido) registrarInteraccion(item.partido);

  if (item.canal && item.canal.id) {
    // Es un canal de CIC TV — reproducir directamente
    if (typeof playFromSide === 'function') playFromSide(item.canal.id);
    else if (typeof playFromGrid === 'function') playFromGrid(item.canal.id);
  } else if (item.url) {
    // Es una URL de FutbolLibre — intentar reproducir en el player principal
    abrirEnPlayer(item);
  }

  recIndex = idx;
  renderTicker();
}

function abrirEnPlayer(item) {
  // Crear un objeto canal temporal para reproducir en el player
  const canalTemp = {
    id:   'rec_' + Date.now(),
    name: item.partido ? item.partido.nombre : item.texto,
    cat:  'Deportes',
    co:   '',
    type: 'tv',
    logo: '',
    url:  item.url,
  };

  // Usar las funciones del player principal
  if (typeof playVideo === 'function') {
    if (typeof curCh !== 'undefined') curCh = canalTemp;
    if (typeof g === 'function') g('pname').textContent = canalTemp.name;
    playVideo(canalTemp);
    // Guardar como último canal
    localStorage.setItem('cicLastChannel', JSON.stringify(canalTemp));
  }
}

// ════════════════════════════════════
// AUTO AVANCE
// ════════════════════════════════════
function iniciarAutoAvance() {
  recAutoTimer = setInterval(function() {
    recNext();
  }, REC_CONFIG.tickerInterval);
}

function resetAutoAvance() {
  clearInterval(recAutoTimer);
  iniciarAutoAvance();
}

// ════════════════════════════════════
// APRENDIZAJE DE PREFERENCIAS
// ════════════════════════════════════
function registrarInteraccion(partido) {
  // Registrar equipo
  const equipos = extraerEquipos(partido.nombre);
  equipos.forEach(function(equipo) {
    const existe = preferencias.equipos.find(function(e){ return e.nombre === equipo; });
    if (existe) { existe.vistas++; }
    else { preferencias.equipos.push({ nombre: equipo, vistas: 1 }); }
  });

  // Registrar liga
  if (partido.liga) {
    const ligaExiste = preferencias.ligas.find(function(l){ return l.nombre === partido.liga; });
    if (ligaExiste) { ligaExiste.vistas++; }
    else { preferencias.ligas.push({ nombre: partido.liga, vistas: 1 }); }
  }

  // Ordenar por vistas y guardar
  preferencias.equipos.sort(function(a, b){ return b.vistas - a.vistas; });
  preferencias.ligas.sort(function(a, b){ return b.vistas - a.vistas; });
  guardarPreferencias();
}

function extraerEquipos(nombre) {
  // Separar por "vs", "v/s", "-"
  const partes = nombre.split(/\s+vs\.?\s+|\s+v\/s\s+|\s+-\s+/i);
  return partes.map(function(p){ return p.trim(); }).filter(function(p){ return p.length > 2; });
}

function detectarLiga(nombre) {
  const ligas = [
    'Liga MX','Premier League','LaLiga','Serie A','Bundesliga','Ligue 1',
    'Champions League','Copa Libertadores','Copa Sudamericana','Liga Pro',
    'Primera División','Liga Profesional','Eredivisie','Liga Portugal',
  ];
  const n = nombre.toLowerCase();
  for (let i = 0; i < ligas.length; i++) {
    if (n.includes(ligas[i].toLowerCase())) return ligas[i];
  }
  return 'Fútbol';
}

// ════════════════════════════════════
// FETCH CON PROXY CORS
// ════════════════════════════════════
async function fetchConProxy(url) {
  // Intentar directo primero
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (r.ok) return await r.text();
  } catch(e) {}

  // Intentar con proxies
  for (let i = 0; i < REC_CONFIG.proxies.length; i++) {
    try {
      const r = await fetch(
        REC_CONFIG.proxies[i] + encodeURIComponent(url),
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) return await r.text();
    } catch(e) { continue; }
  }
  return null;
}

// ════════════════════════════════════
// PERSISTENCIA LOCAL
// ════════════════════════════════════
function cargarPreferencias() {
  try {
    return JSON.parse(localStorage.getItem(REC_CONFIG.prefsKey)) || { equipos: [], ligas: [] };
  } catch(e) { return { equipos: [], ligas: [] }; }
}

function guardarPreferencias() {
  localStorage.setItem(REC_CONFIG.prefsKey, JSON.stringify(preferencias));
}

function cargarHistorial() {
  try {
    return JSON.parse(localStorage.getItem(REC_CONFIG.historyKey)) || [];
  } catch(e) { return []; }
}

function guardarCalendario(partidos) {
  try {
    localStorage.setItem(REC_CONFIG.storageKey, JSON.stringify({
      fecha:    new Date().toDateString(),
      partidos: partidos,
    }));
  } catch(e) {}
}

function usarDatosGuardados() {
  try {
    const guardado = JSON.parse(localStorage.getItem(REC_CONFIG.storageKey));
    if (guardado && guardado.fecha === new Date().toDateString()) {
      partidosHoy = guardado.partidos || [];
      console.log('[Recomendados] Usando datos guardados: ' + partidosHoy.length + ' partidos');
      construirItems();
      renderTicker();
    }
  } catch(e) {}
}

// ════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════
function limpiarTexto(txt) {
  return txt
    .replace(/\s+/g, ' ')
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ\.\-:]/g, '')
    .trim();
}
