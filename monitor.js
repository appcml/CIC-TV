// ═══════════════════════════════════════════════════════════════
// monitor.js — CIC TV v4
// Auto-detección, ocultamiento, reparación y descubrimiento
// ═══════════════════════════════════════════════════════════════

var MON = {
  checkMs:   30 * 60 * 1000,
  batchSize: 15,
  timeoutMs: 8000,
  maxFallos: 3,
  statusKey: 'cicCanalStatus',
  ocultosKey:'cicCanalesOcultos',
};

var canalStatus   = {};
var canalesOcultos = {};
var monActivo     = false;
var monJsonUrl    = '';

// ════════════════════════════════════
// ARRANQUE
// ════════════════════════════════════
window.addEventListener('load', function() {
  var base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
  monJsonUrl = base;

  try { canalStatus    = JSON.parse(localStorage.getItem(MON.statusKey)   || '{}'); } catch(e) { canalStatus = {}; }
  try { canalesOcultos = JSON.parse(localStorage.getItem(MON.ocultosKey)  || '{}'); } catch(e) { canalesOcultos = {}; }

  setTimeout(function() {
    aplicarOcultos();
    cargarCanalesJSON();    // cargar TV desde canales.json
    cargarRadiosJSON();     // cargar radios desde radios.json
    setTimeout(iniciarVerificacion, 12000);
    setInterval(function() {
      iniciarVerificacion();
      setTimeout(reverificarOcultos, 5000);
      // Recargar JSON periódicamente para nuevos canales
      setTimeout(cargarCanalesJSON, 10000);
      setTimeout(cargarRadiosJSON,  15000);
    }, MON.checkMs);
  }, 3000);
});

// ════════════════════════════════════
// APLICAR OCULTOS AL INICIO
// ════════════════════════════════════
function aplicarOcultos() {
  var antes = allTV.length;
  allTV = allTV.filter(function(c) { return !canalesOcultos[c.id || c.url]; });
  var ocultados = antes - allTV.length;
  if (ocultados > 0) {
    monLog('Ocultados ' + ocultados + ' canales caidos del inicio');
    if (typeof renderSideList === 'function') renderSideList();
  }
}

// ════════════════════════════════════
// CARGAR canales.json (TV)
// ════════════════════════════════════
async function cargarCanalesJSON() {
  try {
    var res = await fetch(monJsonUrl + 'canales.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    var data = await res.json();
    if (!data.canales || !data.canales.length) return;
    var antes = allTV.length;
    var urls  = new Set(allTV.map(function(c){ return c.url; }));
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
    var antes = allRadio.length;
    var urls  = new Set(allRadio.map(function(r){ return r.url; }));
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
// VERIFICACIÓN EN SEGUNDO PLANO
// ════════════════════════════════════
async function iniciarVerificacion() {
  if (monActivo) return;
  monActivo = true;
  monLog('Verificando ' + allTV.length + ' canales...');
  var canales = allTV.slice();
  for (var i = 0; i < canales.length; i += MON.batchSize) {
    await verificarLote(canales.slice(i, i + MON.batchSize));
    await esperar(400);
  }
  guardarStatus();
  monActivo = false;
  monLog('Verificacion completa');
}

async function verificarLote(lote) {
  await Promise.allSettled(lote.map(async function(ch) {
    var key  = ch.id || ch.url;
    var vivo = await pingCanal(ch.url);
    if (!canalStatus[key]) canalStatus[key] = { fallos: 0, vivo: true };
    if (vivo) {
      canalStatus[key].fallos = 0;
      canalStatus[key].vivo   = true;
      if (canalesOcultos[key]) {
        delete canalesOcultos[key];
        if (!allTV.find(function(c){ return (c.id||c.url) === key; })) allTV.push(ch);
        monLog('Recuperado: ' + ch.name);
        if (!window._monRecPending) {
          window._monRecPending = true;
          setTimeout(function() {
            window._monRecPending = false;
            if (typeof renderSideList === 'function') renderSideList();
          }, 500);
        }
      }
    } else {
      canalStatus[key].fallos = (canalStatus[key].fallos || 0) + 1;
      canalStatus[key].vivo   = false;
      if (canalStatus[key].fallos >= MON.maxFallos && !canalesOcultos[key]) {
        canalesOcultos[key] = true;
        allTV = allTV.filter(function(c){ return (c.id||c.url) !== key; });
        monLog('Ocultado (' + canalStatus[key].fallos + ' fallos): ' + ch.name);
        // Debounce el render para no llamarlo miles de veces seguidas
        if (!window._monRenderPending) {
          window._monRenderPending = true;
          setTimeout(function() {
            window._monRenderPending = false;
            if (typeof renderSideList === 'function') renderSideList();
            if (typeof updateAll      === 'function') updateAll();
          }, 500);
        }
        buscarAlternativaFondo(ch);
      }
    }
  }));
}

// ════════════════════════════════════
// PING
// ════════════════════════════════════
async function pingCanal(url) {
  if (!url) return false;
  if (url.includes('youtube') || url.includes('twitch')) return true;
  try {
    var controller = new AbortController();
    var timer      = setTimeout(function(){ controller.abort(); }, MON.timeoutMs);
    await fetch(url, { method:'HEAD', signal:controller.signal, cache:'no-store', mode:'no-cors' });
    clearTimeout(timer);
    return true;
  } catch(e) {
    if (e.name === 'AbortError') return false;
    if (e.message && e.message.includes('CORS')) return true;
    return false;
  }
}

// ════════════════════════════════════
// REVERIFICAR OCULTOS
// ════════════════════════════════════
async function reverificarOcultos() {
  var ids = Object.keys(canalesOcultos);
  if (!ids.length) return;
  monLog('Reverificando ' + ids.length + ' ocultos...');
  for (var i = 0; i < ids.length; i++) {
    var key = ids[i];
    if (key.startsWith('http')) {
      var vivo = await pingCanal(key);
      if (vivo) {
        delete canalesOcultos[key];
        if (canalStatus[key]) { canalStatus[key].fallos = 0; canalStatus[key].vivo = true; }
        monLog('Oculto recuperado: ' + key.slice(0, 40));
      }
    }
    await esperar(200);
  }
  guardarStatus();
}

// ════════════════════════════════════
// BUSCAR ALTERNATIVA EN FONDO
// Cuando un canal se oculta, busca reemplazo
// ════════════════════════════════════
async function buscarAlternativaFondo(ch) {
  var catSlug = {
    'Deportes':'sports','Noticias':'news','Peliculas':'movies','Películas':'movies',
    'Series':'series','Infantil':'kids','Musica':'music','Música':'music',
    'Documentales':'documentary','Entretenimiento':'entertainment',
  };
  var nombre   = (ch.name || '').toLowerCase().replace(/\s*\([^)]*\)/g,'').trim();
  var palabras = nombre.split(/\s+/).filter(function(p){ return p.length > 2; });
  var urls     = [];
  if (ch.co) urls.push('https://iptv-org.github.io/iptv/countries/' + ch.co.toLowerCase() + '.m3u');
  if (catSlug[ch.cat]) urls.push('https://iptv-org.github.io/iptv/categories/' + catSlug[ch.cat] + '.m3u');
  // Repos extra
  urls.push('https://i.mjh.nz/SamsungTVPlus/all.m3u8');
  urls.push('https://i.mjh.nz/PlutoTV/all.m3u8');

  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetch(urls[i], { signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      var txt        = await r.text();
      var candidatos = parsearM3URapido(txt);
      var match = candidatos.find(function(c) {
        if (!c.url || c.url === ch.url) return false;
        if (allTV.find(function(x){ return x.url === c.url; })) return false;
        var cn = c.name.toLowerCase();
        return palabras.some(function(p){ return cn.indexOf(p) !== -1; });
      });
      if (match) {
        var vivo = await pingCanal(match.url);
        if (vivo) {
          var chNuevo = { id: (ch.id||'x') + '_alt', name: ch.name, cat: ch.cat, co: ch.co, type: ch.type || 'tv', logo: ch.logo || match.logo || '', url: match.url };
          allTV.push(chNuevo);
          monLog('Reemplazo encontrado para ' + ch.name);
          if (typeof renderSideList === 'function') setTimeout(renderSideList, 200);
          if (typeof updateAll      === 'function') setTimeout(updateAll,      250);
          if (typeof showToast      === 'function') showToast('✅ Canal actualizado: ' + ch.name);
          return;
        }
      }
    } catch(e) { continue; }
  }
  monLog('Sin reemplazo para: ' + ch.name);
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
    localStorage.setItem(MON.statusKey,  JSON.stringify(canalStatus));
    localStorage.setItem(MON.ocultosKey, JSON.stringify(canalesOcultos));
  } catch(e) {}
}
function esperar(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }
function monLog(msg) { console.log('[Monitor] ' + msg); }

// Debug desde consola
window.cicVerificarSalud  = function() { iniciarVerificacion(); };
window.cicMostrarOcultos  = function() { console.log('Ocultos:', Object.keys(canalesOcultos).length, canalesOcultos); };
window.cicResetearOcultos = function() { canalesOcultos = {}; canalStatus = {}; localStorage.removeItem(MON.statusKey); localStorage.removeItem(MON.ocultosKey); console.log('Reset OK — recarga la pagina'); };
window.cicRecargarCanales = function() { cargarCanalesJSON(); cargarRadiosJSON(); };
