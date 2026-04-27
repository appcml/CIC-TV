// ═══════════════════════════════════════════════════════════
// monitor.js — CIC TV v3
// Sistema de detección automática de canales caídos
// - Verifica canales en segundo plano al cargar
// - Oculta canales que no responden
// - Busca URLs alternativas en iptv-org
// - Reverifica cada 30 minutos
// ═══════════════════════════════════════════════════════════

var MON = {
  jsonUrl:      null,
  checkMs:      30 * 60 * 1000,  // reverificar cada 30 min
  batchSize:    15,               // canales por lote simultáneo
  timeoutMs:    8000,             // timeout por canal
  maxFallos:    3,                // fallos para ocultar
  storeKey:     'cicCanalesExtra',
  statusKey:    'cicCanalStatus',
  ocultosKey:   'cicCanalesOcultos',
};

// Estado
var canalStatus  = {};   // id → { fallos, vivo, ts }
var canalesOcultos = {}; // id → true
var monActivo    = false;

// ════════════════════════════════════
// ARRANQUE
// ════════════════════════════════════
window.addEventListener('load', function() {
  var base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
  MON.jsonUrl = base + 'canales.json';

  // Cargar estado guardado
  try { canalStatus   = JSON.parse(localStorage.getItem(MON.statusKey)  || '{}'); } catch(e) { canalStatus = {}; }
  try { canalesOcultos = JSON.parse(localStorage.getItem(MON.ocultosKey) || '{}'); } catch(e) { canalesOcultos = {}; }

  // Aplicar ocultos inmediatamente (antes de renderizar)
  setTimeout(function() {
    aplicarOcultos();
    cargarCanalesJSON();
    // Primera verificación a los 10 segundos de cargar
    setTimeout(iniciarVerificacion, 10000);
    // Reverificar cada 30 minutos
    setInterval(function() {
      iniciarVerificacion();
      // También reverificar los ocultos por si volvieron
      setTimeout(reverificarOcultos, 5000);
    }, MON.checkMs);
  }, 3000);
});

// ════════════════════════════════════
// APLICAR OCULTOS AL INICIO
// Ocultar canales que ya sabemos que fallan
// ════════════════════════════════════
function aplicarOcultos() {
  var ocultos = Object.keys(canalesOcultos);
  if (!ocultos.length) return;
  var antes = allTV.length;
  allTV = allTV.filter(function(c) {
    return !canalesOcultos[c.id || c.url];
  });
  var ocultados = antes - allTV.length;
  if (ocultados > 0) {
    monLog('Ocultados ' + ocultados + ' canales caídos del inicio');
    if (typeof renderSideList === 'function') renderSideList();
    if (typeof updateAll === 'function') updateAll();
  }
}

// ════════════════════════════════════
// VERIFICACIÓN EN SEGUNDO PLANO
// Prueba todos los canales en lotes
// ════════════════════════════════════
async function iniciarVerificacion() {
  if (monActivo) return;
  monActivo = true;
  monLog('Iniciando verificación de ' + allTV.length + ' canales...');

  var canales = allTV.slice(); // copia para no modificar mientras iteramos
  var caidos = 0, vivos = 0;

  // Procesar en lotes para no saturar
  for (var i = 0; i < canales.length; i += MON.batchSize) {
    var lote = canales.slice(i, i + MON.batchSize);
    await verificarLote(lote);
    // Pequeña pausa entre lotes
    await esperar(500);
  }

  // Contar resultados
  Object.values(canalStatus).forEach(function(s) {
    if (s.vivo) vivos++; else caidos++;
  });

  monLog('Verificación completa: ' + vivos + ' vivos, ' + caidos + ' caídos');
  guardarStatus();
  monActivo = false;
}

async function verificarLote(lote) {
  await Promise.allSettled(lote.map(async function(ch) {
    var key = ch.id || ch.url;
    var vivo = await pingCanal(ch.url);

    if (!canalStatus[key]) canalStatus[key] = { fallos: 0, vivo: true };

    if (vivo) {
      // Canal vivo — resetear fallos
      canalStatus[key].fallos = 0;
      canalStatus[key].vivo   = true;
      canalStatus[key].ts     = Date.now();
      // Si estaba oculto, volvió — mostrarlo
      if (canalesOcultos[key]) {
        delete canalesOcultos[key];
        if (!allTV.find(function(c){ return (c.id||c.url) === key; })) {
          allTV.push(ch);
        }
        monLog('Canal recuperado: ' + ch.name);
        if (typeof renderSideList === 'function') setTimeout(renderSideList, 100);
      }
    } else {
      // Canal caído — incrementar fallos
      canalStatus[key].fallos = (canalStatus[key].fallos || 0) + 1;
      canalStatus[key].vivo   = false;
      canalStatus[key].ts     = Date.now();

      if (canalStatus[key].fallos >= MON.maxFallos) {
        // Ocultar de la lista
        if (!canalesOcultos[key]) {
          canalesOcultos[key] = true;
          allTV = allTV.filter(function(c){ return (c.id||c.url) !== key; });
          monLog('Canal ocultado (' + canalStatus[key].fallos + ' fallos): ' + ch.name);
          if (typeof renderSideList === 'function') setTimeout(renderSideList, 100);
          if (typeof updateAll === 'function') setTimeout(updateAll, 150);
          // Buscar alternativa en segundo plano
          buscarAlternativaFondo(ch);
        }
      } else {
        monLog('Canal con fallo ' + canalStatus[key].fallos + '/' + MON.maxFallos + ': ' + ch.name);
      }
    }
  }));
}

// ════════════════════════════════════
// PING DE CANAL
// HEAD request con timeout
// ════════════════════════════════════
async function pingCanal(url) {
  if (!url) return false;
  // Saltar URLs que sabemos que no se pueden verificar con HEAD
  if (url.includes('youtube') || url.includes('twitch')) return true;

  try {
    var controller = new AbortController();
    var timer = setTimeout(function(){ controller.abort(); }, MON.timeoutMs);
    var res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      cache:  'no-store',
      mode:   'no-cors', // evitar error CORS — solo nos importa si responde
    });
    clearTimeout(timer);
    // Con no-cors siempre devuelve type:opaque, status:0 si llegó
    return true; // si no lanzó excepción, el servidor respondió
  } catch(e) {
    // Timeout o error de red — canal caído
    if (e.name === 'AbortError') return false;
    // Otros errores CORS pueden ser falsos negativos
    // Si es error de CORS pero el servidor respondió, asumir vivo
    if (e.message && e.message.includes('CORS')) return true;
    return false;
  }
}

// ════════════════════════════════════
// REVERIFICAR OCULTOS
// Por si un canal caído volvió
// ════════════════════════════════════
async function reverificarOcultos() {
  var ids = Object.keys(canalesOcultos);
  if (!ids.length) return;
  monLog('Reverificando ' + ids.length + ' canales ocultos...');

  for (var i = 0; i < ids.length; i++) {
    var key    = ids[i];
    var status = canalStatus[key];
    if (!status) continue;
    // Construir canal mínimo para reverificar
    var chRef = { id: key, url: key, name: '?' };
    var vivo = await pingCanal(key.startsWith('http') ? key : '');
    if (vivo) {
      delete canalesOcultos[key];
      canalStatus[key].fallos = 0;
      canalStatus[key].vivo   = true;
      monLog('Canal oculto recuperado: ' + key);
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
    'Deportes':'sports','Noticias':'news','Películas':'movies',
    'Series':'series','Infantil':'kids','Música':'music',
    'Documentales':'documentary','Entretenimiento':'entertainment',
  };

  var urls = [];
  if (ch.co) urls.push('https://iptv-org.github.io/iptv/countries/' + ch.co.toLowerCase() + '.m3u');
  if (catSlug[ch.cat]) urls.push('https://iptv-org.github.io/iptv/categories/' + catSlug[ch.cat] + '.m3u');

  var nombre   = (ch.name || '').toLowerCase().replace(/\s*\([^)]*\)/g,'').trim();
  var palabras = nombre.split(/\s+/).filter(function(p){ return p.length > 2; });

  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetch(urls[i], { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      var txt = await r.text();
      var candidatos = parsearM3URapido(txt);

      // Buscar por nombre similar
      var match = candidatos.find(function(c) {
        if (!c.url || c.url === ch.url) return false;
        // Ya no está en allTV
        if (allTV.find(function(x){ return x.url === c.url; })) return false;
        var cn = c.name.toLowerCase();
        return palabras.some(function(p){ return cn.indexOf(p) !== -1; });
      });

      if (match) {
        // Verificar que el reemplazo esté vivo
        var vivo = await pingCanal(match.url);
        if (vivo) {
          // Agregar el reemplazo con el nombre original
          var chNuevo = {
            id:   ch.id + '_alt',
            name: ch.name,
            cat:  ch.cat,
            co:   ch.co,
            type: ch.type || 'tv',
            logo: ch.logo || match.logo || '',
            url:  match.url,
          };
          allTV.push(chNuevo);
          monLog('✅ Reemplazo encontrado para ' + ch.name + ': ' + match.url);
          if (typeof renderSideList === 'function') setTimeout(renderSideList, 200);
          if (typeof updateAll === 'function') setTimeout(updateAll, 250);
          if (typeof showToast === 'function') showToast('📡 Canal actualizado: ' + ch.name);
          return;
        }
      }
    } catch(e) { continue; }
  }
  monLog('Sin reemplazo para: ' + ch.name);
}

// ════════════════════════════════════
// CARGAR canales.json
// ════════════════════════════════════
async function cargarCanalesJSON() {
  try {
    var res = await fetch(MON.jsonUrl + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    var data = await res.json();
    if (!data.canales || !data.canales.length) return;

    var agregados = 0;
    data.canales.forEach(function(ch) {
      if (!ch.url || !ch.name) return;
      if (canalesOcultos[ch.id || ch.url]) return; // saltar ocultos
      if (allTV.find(function(c){ return c.url === ch.url; })) return; // ya existe
      ch.type = ch.type || 'tv';
      allTV.push(ch);
      agregados++;
    });

    if (agregados > 0) {
      monLog(agregados + ' canales nuevos desde canales.json');
      if (typeof renderSideList === 'function') setTimeout(renderSideList, 300);
      if (typeof updateAll === 'function') setTimeout(updateAll, 350);
      if (typeof showToast === 'function') showToast('📡 ' + agregados + ' canales nuevos cargados');
    }
  } catch(e) {
    monLog('Error canales.json: ' + e.message);
  }
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
      cur = {
        name: nM ? nM[1] : l.split(',').pop().trim(),
        logo: lM ? lM[1] : '',
      };
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
    localStorage.setItem(MON.statusKey,   JSON.stringify(canalStatus));
    localStorage.setItem(MON.ocultosKey,  JSON.stringify(canalesOcultos));
  } catch(e) {}
}

function esperar(ms) {
  return new Promise(function(r){ setTimeout(r, ms); });
}

function monLog(msg) { console.log('[Monitor] ' + msg); }

// Exponer funciones para debug desde consola
window.cicVerificarSalud = function() { iniciarVerificacion(); };
window.cicMostrarOcultos = function() {
  console.log('Canales ocultos:', Object.keys(canalesOcultos).length);
  console.log(canalesOcultos);
};
window.cicResetearOcultos = function() {
  canalesOcultos = {};
  canalStatus    = {};
  localStorage.removeItem(MON.statusKey);
  localStorage.removeItem(MON.ocultosKey);
  console.log('✅ Status reseteado — recarga la página');
};
window.cicRecargarCanales = function() { cargarCanalesJSON(); };
