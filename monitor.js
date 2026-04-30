// ═══════════════════════════════════════════════════════════════
// monitor.js — CIC TV v5
// Sistema LIVIANO de gestión de canales
// 
// PRINCIPIO: No verificar canales desde el browser (genera cientos
// de errores en consola). La verificación masiva es trabajo del
// GitHub Actions (generar_playlist.py).
//
// El monitor solo:
// 1. Carga canales nuevos desde canales.json y radios.json
// 2. Oculta canales cuando el USUARIO los reporta como caídos
//    (al reproducir y dar error)
// 3. Busca alternativa SOLO cuando un canal falla al reproducir
// ═══════════════════════════════════════════════════════════════

var MON = {
  checkMs:   30 * 60 * 1000,  // recargar JSON cada 30 min
  ocultosKey: 'cicCanalesOcultos',
  statusKey:  'cicCanalStatus',
};

var canalesOcultos = {};
var canalStatus    = {};
var monJsonUrl     = '';

// ════════════════════════════════════
// ARRANQUE
// ════════════════════════════════════
window.addEventListener('load', function() {
  var base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
  monJsonUrl = base;

  try { canalesOcultos = JSON.parse(localStorage.getItem(MON.ocultosKey) || '{}'); } catch(e) { canalesOcultos = {}; }
  try { canalStatus    = JSON.parse(localStorage.getItem(MON.statusKey)  || '{}'); } catch(e) { canalStatus = {}; }

  setTimeout(function() {
    // 1. Aplicar canales ocultos del localStorage
    aplicarOcultos();
    // 2. Cargar canales nuevos desde JSON
    cargarCanalesJSON();
    cargarRadiosJSON();
    // 3. Recargar cada 30 min
    setInterval(function() {
      cargarCanalesJSON();
      cargarRadiosJSON();
    }, MON.checkMs);
  }, 3000);
});

// ════════════════════════════════════
// APLICAR OCULTOS AL INICIO
// ════════════════════════════════════
function aplicarOcultos() {
  var ids = Object.keys(canalesOcultos);
  if (!ids.length) return;
  var antes = allTV.length;
  allTV = allTV.filter(function(c) {
    return !canalesOcultos[c.id || c.url];
  });
  var n = antes - allTV.length;
  if (n > 0) {
    monLog('Ocultados ' + n + ' canales caidos del inicio');
    if (typeof renderSideList === 'function') renderSideList();
  }
}

// ════════════════════════════════════
// CARGAR canales.json
// ════════════════════════════════════
async function cargarCanalesJSON() {
  try {
    var res = await fetch(monJsonUrl + 'canales.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    var data = await res.json();
    if (!data.canales || !data.canales.length) return;
    var urls  = new Set(allTV.map(function(c){ return c.url; }));
    var antes = allTV.length;
    data.canales.forEach(function(ch) {
      if (!ch.url || !ch.name) return;
      if (canalesOcultos[ch.id || ch.url]) return;
      if (urls.has(ch.url)) return;
      ch.type = ch.type || 'tv';
      allTV.push(ch);
      urls.add(ch.url);
    });
    var agregados = allTV.length - antes;
    if (agregados > 0) {
      monLog(agregados + ' canales TV nuevos desde canales.json');
      if (typeof renderSideList === 'function') setTimeout(renderSideList, 300);
      if (typeof updateAll      === 'function') setTimeout(updateAll,      350);
      if (typeof showToast      === 'function') showToast('📡 ' + agregados + ' canales nuevos');
    }
  } catch(e) { monLog('canales.json: ' + e.message); }
}

// ════════════════════════════════════
// CARGAR radios.json
// ════════════════════════════════════
async function cargarRadiosJSON() {
  try {
    var res = await fetch(monJsonUrl + 'radios.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    var data = await res.json();
    if (!data.radios || !data.radios.length) return;
    var urls  = new Set(allRadio.map(function(r){ return r.url; }));
    var antes = allRadio.length;
    data.radios.forEach(function(rd) {
      if (!rd.url || !rd.name) return;
      if (urls.has(rd.url)) return;
      rd.type = 'radio';
      allRadio.push(rd);
      urls.add(rd.url);
    });
    var agregadas = allRadio.length - antes;
    if (agregadas > 0) {
      monLog(agregadas + ' radios nuevas desde radios.json');
      if (typeof updateAll === 'function') setTimeout(updateAll, 300);
      if (typeof showToast === 'function') showToast('📻 ' + agregadas + ' radios nuevas');
    }
  } catch(e) { monLog('radios.json: ' + e.message); }
}

// ════════════════════════════════════
// REGISTRAR FALLO (llamado desde showErr)
// Solo cuando el usuario intenta reproducir un canal
// ════════════════════════════════════
function registrarFallo(ch) {
  if (!ch) return;
  var key = ch.id || ch.url;
  if (!canalStatus[key]) canalStatus[key] = { fallos: 0 };
  canalStatus[key].fallos++;
  canalStatus[key].ts = Date.now();

  monLog('Fallo ' + canalStatus[key].fallos + '/3: ' + ch.name);

  if (canalStatus[key].fallos >= 3) {
    // Ocultar canal
    canalesOcultos[key] = true;
    allTV = allTV.filter(function(c){ return (c.id || c.url) !== key; });
    monLog('Canal ocultado: ' + ch.name);
    guardarStatus();
    // Buscar alternativa en segundo plano
    buscarAlternativaFondo(ch);
    if (!window._monRenderPending) {
      window._monRenderPending = true;
      setTimeout(function() {
        window._monRenderPending = false;
        if (typeof renderSideList === 'function') renderSideList();
        if (typeof updateAll      === 'function') updateAll();
      }, 500);
    }
  } else {
    guardarStatus();
  }
}

// ════════════════════════════════════
// BUSCAR ALTERNATIVA EN FONDO
// Solo cuando un canal es ocultado por fallos repetidos
// Usa SOLO fuentes con CORS permitido
// ════════════════════════════════════
async function buscarAlternativaFondo(ch) {
  // Fuentes con CORS permitido desde browser
  var FUENTES_OK = {
    'Noticias':      'https://iptv-org.github.io/iptv/categories/news.m3u',
    'Deportes':      'https://iptv-org.github.io/iptv/categories/sports.m3u',
    'Peliculas':     'https://iptv-org.github.io/iptv/categories/movies.m3u',
    'Películas':     'https://iptv-org.github.io/iptv/categories/movies.m3u',
    'Musica':        'https://iptv-org.github.io/iptv/categories/music.m3u',
    'Música':        'https://iptv-org.github.io/iptv/categories/music.m3u',
    'Infantil':      'https://iptv-org.github.io/iptv/categories/kids.m3u',
    'Documentales':  'https://iptv-org.github.io/iptv/categories/documentary.m3u',
    'Entretenimiento':'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
  };

  var nombre   = (ch.name || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
  var palabras = nombre.split(/\s+/).filter(function(p){ return p.length > 2; });
  if (!palabras.length) return;

  // Intentar por categoría primero (más relevante)
  var urlFuente = FUENTES_OK[ch.cat];
  if (!urlFuente && ch.co) {
    urlFuente = 'https://iptv-org.github.io/iptv/countries/' + ch.co.toLowerCase() + '.m3u';
  }
  if (!urlFuente) return;

  try {
    var r = await fetch(urlFuente, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return;
    var txt        = await r.text();
    var candidatos = parsearM3URapido(txt);
    var match = candidatos.find(function(c) {
      if (!c.url || c.url === ch.url) return false;
      if (allTV.find(function(x){ return x.url === c.url; })) return false;
      var cn = c.name.toLowerCase();
      return palabras.some(function(p){ return cn.indexOf(p) !== -1; });
    });
    if (match) {
      var chNuevo = {
        id:   (ch.id || 'x') + '_alt',
        name: ch.name,
        cat:  ch.cat,
        co:   ch.co,
        type: ch.type || 'tv',
        logo: ch.logo || match.logo || '',
        url:  match.url,
      };
      allTV.push(chNuevo);
      monLog('Reemplazo encontrado para ' + ch.name);
      if (typeof renderSideList === 'function') setTimeout(renderSideList, 200);
      if (typeof updateAll      === 'function') setTimeout(updateAll,      250);
      if (typeof showToast      === 'function') showToast('✅ Canal actualizado: ' + ch.name);
    }
  } catch(e) { monLog('Sin reemplazo para: ' + ch.name); }
}

// ════════════════════════════════════
// PARSEAR M3U RÁPIDO
// ════════════════════════════════════
function parsearM3URapido(txt) {
  var canales = [], cur = {};
  txt.split('\n').forEach(function(l) {
    l = l.trim();
    if (l.startsWith('#EXTINF')) {
      var nM = l.match(/tvg-name="([^"]*)"/);
      var lM = l.match(/tvg-logo="([^"]*)"/);
      cur = { name: nM ? nM[1] : l.split(',').pop().trim(), logo: lM ? lM[1] : '' };
    } else if (l && !l.startsWith('#') && cur.name) {
      cur.url = l;
      canales.push(Object.assign({}, cur));
      cur = {};
    }
  });
  return canales;
}

// ════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════
function guardarStatus() {
  try {
    localStorage.setItem(MON.ocultosKey, JSON.stringify(canalesOcultos));
    localStorage.setItem(MON.statusKey,  JSON.stringify(canalStatus));
  } catch(e) {}
}

function monLog(msg) { console.log('[Monitor] ' + msg); }

// ── Comandos de debug ──
window.cicVerificarSalud  = function() { monLog('Canales activos: ' + allTV.length + ' | Radios: ' + allRadio.length); };
window.cicMostrarOcultos  = function() { console.log('[Monitor] Ocultos:', Object.keys(canalesOcultos).length, canalesOcultos); };
window.cicResetearOcultos = function() {
  canalesOcultos = {}; canalStatus = {};
  localStorage.removeItem(MON.ocultosKey);
  localStorage.removeItem(MON.statusKey);
  console.log('[Monitor] Reset OK — recarga la página');
};
window.cicRecargarCanales = function() { cargarCanalesJSON(); cargarRadiosJSON(); };
