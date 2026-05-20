// ═══════════════════════════════════════════════════════════════
// monitor.js — CIC TV v6
// Lee canales desde GitHub raw divididos por categoría
// El bot actualizar.py genera estos archivos cada 6h
// ═══════════════════════════════════════════════════════════════

var MON = {
  checkMs:    30 * 60 * 1000,
  ocultosKey: 'cicCanalesOcultos',
  statusKey:  'cicCanalStatus',
};

var canalesOcultos = {};
var canalStatus    = {};
// URL base — lee directo desde GitHub raw (siempre actualizado)
var GITHUB_RAW = 'https://raw.githubusercontent.com/appcml/CIC-TV/main/';

// ════════════════════════════════════
// ARRANQUE
// ════════════════════════════════════
window.addEventListener('load', function() {
  try { canalesOcultos = JSON.parse(localStorage.getItem(MON.ocultosKey) || '{}'); } catch(e) { canalesOcultos = {}; }
  try { canalStatus    = JSON.parse(localStorage.getItem(MON.statusKey)  || '{}'); } catch(e) { canalStatus = {}; }

  setTimeout(function() {
    aplicarOcultos();
    cargarTodosLosCanales();
    cargarRadiosJSON();
    setInterval(function() {
      cargarTodosLosCanales();
      cargarRadiosJSON();
    }, MON.checkMs);
  }, 3000);
});

// ════════════════════════════════════
// CARGAR TODOS LOS CANALES
// Lee canales.json desde GitHub raw
// Si es muy grande, lo carga igual — los browsers modernos lo manejan bien
// ════════════════════════════════════
async function cargarTodosLosCanales() {
  var urls  = new Set(allTV.map(function(c){ return c.url; }));
  var total = 0;

  // Archivo principal con todos los canales
  try {
    var res = await fetch(GITHUB_RAW + 'canales.json', {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      var data = await res.json();
      var lista = data.canales || [];
      lista.forEach(function(ch) {
        if (!ch.url || !ch.name) return;
        if (canalesOcultos[ch.id || ch.url]) return;
        if (urls.has(ch.url)) return;
        // Solo URLs HTTPS o HTTP con dominio (no IPs directas)
        if (/^http:\/\/\d+\.\d+\.\d+\.\d+/.test(ch.url)) return;
        ch.type = ch.type || 'tv';
        allTV.push(ch);
        urls.add(ch.url);
        total++;
      });
      monLog('canales.json: ' + total + ' canales cargados desde GitHub');
    }
  } catch(e) {
    monLog('Error canales.json: ' + e.message);
  }

  if (total > 0) {
    if (typeof renderSideList === 'function' && !window.isFavMode) setTimeout(renderSideList, 500);
    if (typeof updateAll      === 'function') setTimeout(updateAll,      600);
    if (typeof showToast      === 'function') showToast('📡 ' + total + ' canales cargados');
    // Si el usuario está viendo favoritos, refrescarlos con los canales recién cargados
    if ((window.isFavMode || window._favPendingRefresh) && typeof showFavs === 'function') {
      window._favPendingRefresh = false;
      setTimeout(showFavs, 700);
    }
  }
}

// Mantener compatibilidad con código que llama cargarCanalesJSON
function cargarCanalesJSON() { return cargarTodosLosCanales(); }

// ════════════════════════════════════
// CARGAR radios.json
// ════════════════════════════════════
async function cargarRadiosJSON() {
  try {
    var res = await fetch(GITHUB_RAW + 'radios.json', { cache: 'no-store' });
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
      monLog(agregadas + ' radios nuevas desde GitHub');
      if (typeof updateAll === 'function') setTimeout(updateAll, 300);
      if ((window.isFavMode || window._favPendingRefresh) && typeof showFavs === 'function') {
        window._favPendingRefresh = false;
        setTimeout(showFavs, 500);
      }
    }
  } catch(e) { monLog('radios.json: ' + e.message); }
}

// ════════════════════════════════════
// APLICAR OCULTOS AL INICIO
// ════════════════════════════════════
function aplicarOcultos() {
  if (!Object.keys(canalesOcultos).length) return;
  var antes = allTV.length;
  allTV = allTV.filter(function(c) {
    return !canalesOcultos[c.id || c.url];
  });
  var n = antes - allTV.length;
  if (n > 0) monLog('Ocultados ' + n + ' canales al inicio');
}

// ════════════════════════════════════
// REGISTRAR FALLO
// ════════════════════════════════════
function registrarFallo(ch) {
  if (!ch) return;
  var key = ch.id || ch.url;
  if (!canalStatus[key]) canalStatus[key] = { fallos: 0 };
  canalStatus[key].fallos++;
  canalStatus[key].ts = Date.now();
  monLog('Fallo ' + canalStatus[key].fallos + '/3: ' + ch.name);
  if (canalStatus[key].fallos >= 3) {
    canalesOcultos[key] = true;
    allTV = allTV.filter(function(c){ return (c.id || c.url) !== key; });
    monLog('Canal ocultado: ' + ch.name);
    guardarStatus();
    buscarAlternativaFondo(ch);
    if (!window._monRenderPending) {
      window._monRenderPending = true;
      setTimeout(function() {
        window._monRenderPending = false;
        if (typeof renderSideList === 'function' && !window.isFavMode) renderSideList();
        if (typeof updateAll      === 'function') updateAll();
      }, 500);
    }
  } else {
    guardarStatus();
  }
}

// ════════════════════════════════════
// BUSCAR ALTERNATIVA EN FONDO
// ════════════════════════════════════
async function buscarAlternativaFondo(ch) {
  var FUENTES_OK = {
    'Noticias':       'https://iptv-org.github.io/iptv/categories/news.m3u',
    'Deportes':       'https://iptv-org.github.io/iptv/categories/sports.m3u',
    'Películas':      'https://iptv-org.github.io/iptv/categories/movies.m3u',
    'Música':         'https://iptv-org.github.io/iptv/categories/music.m3u',
    'Infantil':       'https://iptv-org.github.io/iptv/categories/kids.m3u',
    'Documentales':   'https://iptv-org.github.io/iptv/categories/documentary.m3u',
    'Entretenimiento':'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
  };
  var nombre   = (ch.name || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
  var palabras = nombre.split(/\s+/).filter(function(p){ return p.length > 2; });
  if (!palabras.length) return;
  var urlFuente = FUENTES_OK[ch.cat] || (ch.co ? 'https://iptv-org.github.io/iptv/countries/' + ch.co.toLowerCase() + '.m3u' : null);
  if (!urlFuente) return;
  try {
    var r = await fetch(urlFuente, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return;
    var candidatos = parsearM3URapido(await r.text());
    var match = candidatos.find(function(c) {
      if (!c.url || c.url === ch.url) return false;
      if (allTV.find(function(x){ return x.url === c.url; })) return false;
      if (/^http:\/\/\d+\.\d+\.\d+\.\d+/.test(c.url)) return false;
      var cn = c.name.toLowerCase();
      return palabras.some(function(p){ return cn.indexOf(p) !== -1; });
    });
    if (match) {
      allTV.push({ id:(ch.id||'x')+'_alt', name:ch.name, cat:ch.cat, co:ch.co, type:ch.type||'tv', logo:ch.logo||match.logo||'', url:match.url });
      monLog('Reemplazo: ' + ch.name);
      if (typeof renderSideList === 'function' && !window.isFavMode) setTimeout(renderSideList, 200);
      if (typeof updateAll      === 'function') setTimeout(updateAll,      250);
      if (typeof showToast      === 'function') showToast('✅ Canal actualizado: ' + ch.name);
    }
  } catch(e) { monLog('Sin reemplazo: ' + ch.name); }
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
      cur.url = l; canales.push(Object.assign({}, cur)); cur = {};
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

// Debug
window.cicVerificarSalud  = function() { monLog('TV: ' + allTV.length + ' | Radio: ' + allRadio.length); };
window.cicMostrarOcultos  = function() { console.log('[Monitor] Ocultos:', Object.keys(canalesOcultos).length); };
window.cicResetearOcultos = function() {
  canalesOcultos = {}; canalStatus = {};
  localStorage.removeItem(MON.ocultosKey);
  localStorage.removeItem(MON.statusKey);
  console.log('[Monitor] Reset OK — recarga');
};
window.cicRecargarCanales = function() { cargarTodosLosCanales(); cargarRadiosJSON(); };
