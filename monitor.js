// ═══════════════════════════════════════════════════════════
// monitor.js — CIC TV
// Sistema de auto-actualización y salud de canales
// - Lee canales.json (generado por GitHub Actions cada 6h)
// - Verifica canales caídos cada 30 minutos
// - Auto-reemplaza canales muertos desde iptv-org
// - Actualiza contadores del sidebar en tiempo real
// ═══════════════════════════════════════════════════════════

var MON = {
  jsonUrl:        null,          // se calcula dinámicamente
  checkMs:        30 * 60 * 1000, // verificar cada 30 min
  batchSize:      10,            // canales a verificar por lote
  maxFallos:      3,             // fallos antes de marcar caído
  storeKey:       'cicCanalesExtra',
  statusKey:      'cicCanalStatus',
};

// Estado interno
var monTimer      = null;
var canalStatus   = {};  // id → { fallos, vivo, ultimoCheck }
var cargando      = false;

// ════════════════════════════════════
// ARRANQUE
// ════════════════════════════════════
window.addEventListener('load', function() {
  // Calcular URL del JSON (mismo dominio que la app)
  var base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
  MON.jsonUrl = base + 'canales.json';

  // Cargar status guardado
  try { canalStatus = JSON.parse(localStorage.getItem(MON.statusKey) || '{}'); }
  catch(e) { canalStatus = {}; }

  // Esperar a que la app base cargue, luego cargar canales.json
  setTimeout(function() {
    cargarCanalesJSON();
  }, 4000);

  // Verificar salud cada 30 minutos
  monTimer = setInterval(function() {
    verificarSaludLote();
  }, MON.checkMs);

  // Primera verificación a los 5 minutos de arrancar
  setTimeout(verificarSaludLote, 5 * 60 * 1000);
});

// ════════════════════════════════════
// CARGAR canales.json
// ════════════════════════════════════
async function cargarCanalesJSON() {
  if (cargando) return;
  cargando = true;

  try {
    var url = MON.jsonUrl + '?t=' + Date.now();
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { cargando = false; return; }

    var data = await res.json();
    if (!data.canales || !data.canales.length) { cargando = false; return; }

    monLog('canales.json: ' + data.canales.length + ' canales | vivos: ' + (data.stats && data.stats.vivos || '?'));

    var agregados = 0;
    var actualizados = 0;

    data.canales.forEach(function(ch) {
      if (!ch.url || !ch.name) return;

      // Aplicar estado guardado localmente (fallos conocidos)
      var status = canalStatus[ch.id || ch.url];
      if (status) {
        ch.vivo   = status.vivo !== false; // si no tenemos info, asumir vivo
        ch.fallos = status.fallos || 0;
      }

      // Solo agregar canales marcados como vivos (o sin datos de salud)
      if (ch.vivo === false && (ch.fallos || 0) >= MON.maxFallos) return;

      // Mapear tipo según categoría
      ch.type = ch.type || 'tv';

      // Verificar si ya existe en allTV o allRadio
      var fuente = (ch.type === 'radio') ? allRadio : allTV;
      var existe = fuente.find(function(c) { return c.url === ch.url; });

      if (!existe) {
        fuente.push(ch);
        agregados++;
      } else {
        // Actualizar logo si el existente no tiene
        if (!existe.logo && ch.logo) { existe.logo = ch.logo; actualizados++; }
      }
    });

    monLog('Canales agregados: ' + agregados + ' | logos actualizados: ' + actualizados);

    // Actualizar contadores del sidebar
    if (typeof updateAll === 'function') updateAll();
    if (typeof applyFilter === 'function') applyFilter();
    if (typeof renderSideList === 'function') renderSideList();

    if (agregados > 0 && typeof showToast === 'function') {
      showToast('📡 ' + agregados + ' canales nuevos cargados');
    }

  } catch(e) {
    monLog('Error cargando canales.json: ' + e.message);
  }
  cargando = false;
}

// ════════════════════════════════════
// VERIFICAR SALUD — lote de canales
// Cada 30 min verifica un lote de los canales más sospechosos
// ════════════════════════════════════
async function verificarSaludLote() {
  var todos = allTV.concat(allRadio);
  if (!todos.length) return;

  // Priorizar: primero con más fallos, luego los no verificados
  var ordenados = todos.slice().sort(function(a, b) {
    var fa = (canalStatus[a.id || a.url] || {}).fallos || 0;
    var fb = (canalStatus[b.id || b.url] || {}).fallos || 0;
    return fb - fa;
  });

  var lote = ordenados.slice(0, MON.batchSize);
  monLog('Verificando salud de ' + lote.length + ' canales...');

  var caidos = 0;
  await Promise.allSettled(lote.map(async function(ch) {
    var vivo = await pingCanal(ch.url);
    var key  = ch.id || ch.url;

    if (!canalStatus[key]) canalStatus[key] = { fallos: 0, vivo: true };

    if (vivo) {
      canalStatus[key].fallos = 0;
      canalStatus[key].vivo   = true;
    } else {
      canalStatus[key].fallos = (canalStatus[key].fallos || 0) + 1;
      canalStatus[key].vivo   = false;
      caidos++;

      // Si falla 3+ veces → buscar reemplazo
      if (canalStatus[key].fallos >= MON.maxFallos) {
        monLog('Canal caído: ' + ch.name + ' (fallos: ' + canalStatus[key].fallos + ')');
        buscarReemplazo(ch);
      }
    }
    canalStatus[key].ultimoCheck = Date.now();
  }));

  // Guardar status
  try { localStorage.setItem(MON.statusKey, JSON.stringify(canalStatus)); }
  catch(e) {}

  if (caidos > 0) monLog(caidos + ' canales caídos detectados en este lote');
}

// ════════════════════════════════════
// PING DE CANAL
// Hace HEAD request para verificar si responde
// ════════════════════════════════════
async function pingCanal(url) {
  if (!url) return false;
  try {
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, 8000);
    var res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      cache:  'no-store',
    });
    clearTimeout(timer);
    return res.ok || res.status === 206 || res.status === 403; // 403 puede ser geo-block pero canal vivo
  } catch(e) {
    // Si falla HEAD, intentar GET parcial
    try {
      var controller2 = new AbortController();
      var timer2 = setTimeout(function() { controller2.abort(); }, 8000);
      var res2 = await fetch(url, {
        method: 'GET',
        signal: controller2.signal,
        headers: { Range: 'bytes=0-512' },
        cache: 'no-store',
      });
      clearTimeout(timer2);
      return res2.ok || res2.status === 206;
    } catch(e2) {
      return false;
    }
  }
}

// ════════════════════════════════════
// BUSCAR REEMPLAZO AUTOMÁTICO
// Cuando un canal cae, busca uno equivalente en iptv-org
// ════════════════════════════════════
async function buscarReemplazo(chCaido) {
  var cat    = chCaido.cat || 'General';
  var co     = chCaido.co  || '';
  var nombre = (chCaido.name || '').toLowerCase();

  // Estrategia 1: buscar por país + categoría en iptv-org
  var urls_busqueda = [];
  if (co) {
    urls_busqueda.push(
      'https://iptv-org.github.io/iptv/countries/' + co.toLowerCase() + '.m3u'
    );
  }
  // Estrategia 2: buscar por categoría
  var catMap = {
    'Deportes': 'sports', 'Noticias': 'news', 'Películas': 'movies',
    'Series': 'series', 'Infantil': 'kids', 'Música': 'music',
    'Documentales': 'documentary', 'Entretenimiento': 'entertainment',
  };
  if (catMap[cat]) {
    urls_busqueda.push(
      'https://iptv-org.github.io/iptv/categories/' + catMap[cat] + '.m3u'
    );
  }

  for (var i = 0; i < urls_busqueda.length; i++) {
    var m3u = await fetchM3UBrowser(urls_busqueda[i]);
    if (!m3u) continue;

    var candidatos = parsearM3USimple(m3u, co);

    // Buscar canal con nombre similar
    var match = candidatos.find(function(c) {
      return c.name && c.name.toLowerCase().includes(nombre.substring(0, 5));
    });

    // Si no hay match por nombre, tomar el primero de la categoría
    if (!match && candidatos.length) {
      match = candidatos[Math.floor(Math.random() * Math.min(candidatos.length, 20))];
    }

    if (match && match.url) {
      // Verificar que el reemplazo esté vivo
      var vivo = await pingCanal(match.url);
      if (vivo) {
        monLog('Reemplazo encontrado: ' + chCaido.name + ' → ' + match.name);
        // Reemplazar URL en el array correspondiente
        var fuente = (chCaido.type === 'radio') ? allRadio : allTV;
        var idx = fuente.findIndex(function(c) { return c.url === chCaido.url; });
        if (idx !== -1) {
          fuente[idx].url  = match.url;
          fuente[idx].name = fuente[idx].name; // mantener nombre original
          if (match.logo) fuente[idx].logo = match.logo;
          // Resetear estado
          var key = fuente[idx].id || chCaido.url;
          if (canalStatus[key]) {
            canalStatus[key].fallos = 0;
            canalStatus[key].vivo   = true;
          }
          if (typeof showToast === 'function') {
            showToast('🔄 Canal actualizado: ' + fuente[idx].name);
          }
        }
        return;
      }
    }
  }
  monLog('Sin reemplazo para: ' + chCaido.name);
}

// ════════════════════════════════════
// FETCH M3U DESDE NAVEGADOR
// Usa los mismos proxies CORS que el app principal
// ════════════════════════════════════
async function fetchM3UBrowser(url) {
  var proxies = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
    'https://thingproxy.freeboard.io/fetch/',
  ];

  // Directo primero
  try {
    var r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return await r.text();
  } catch(e) {}

  // Con proxies
  for (var i = 0; i < proxies.length; i++) {
    try {
      var r2 = await fetch(proxies[i] + encodeURIComponent(url), {
        signal: AbortSignal.timeout(10000),
      });
      if (r2.ok) return await r2.text();
    } catch(e) { continue; }
  }
  return null;
}

// ════════════════════════════════════
// PARSEAR M3U SIMPLE (para reemplazos)
// ════════════════════════════════════
function parsearM3USimple(txt, co) {
  var canales = [];
  var lines   = txt.split('\n');
  var cur     = {};
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      var nm = line.match(/,(.+)$/);
      var lm = line.match(/tvg-logo="([^"]*)"/);
      cur = {
        name: nm ? nm[1].trim() : '',
        logo: lm ? lm[1] : '',
        co:   co || '',
        type: 'tv',
      };
    } else if (line && !line.startsWith('#') && cur.name) {
      cur.url = line;
      cur.id  = 'r' + Math.random().toString(36).slice(2, 8);
      canales.push({...cur});
      cur = {};
    }
  }
  return canales;
}

// ════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════
function monLog(msg) {
  console.log('[Monitor] ' + msg);
}

// Exponer función para forzar recarga manual (útil desde consola)
window.cicRecargarCanales = function() {
  monLog('Recarga manual solicitada...');
  cargarCanalesJSON();
};

window.cicVerificarSalud = function() {
  monLog('Verificación de salud manual...');
  verificarSaludLote();
};
