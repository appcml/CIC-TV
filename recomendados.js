// ═══════════════════════════════════════════════════════════════
// recomendados.js — Sistema de recomendaciones CIC TV v2
// Fuente: futbollibretv.su
// Lógica: scraping → decodificar Base64 → stream directo en player
// ═══════════════════════════════════════════════════════════════

const REC = {
  url:        'https://futbollibretv.su/',
  proxies: [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://api.codetabs.com/v1/proxy?quest=',
  ],
  tickerMs:   5000,
  liveCheckMs: 5 * 60 * 1000,
  calMs:       12 * 60 * 60 * 1000,
  storeKey:   'cicPartidosHoy',
  prefsKey:   'cicPrefs',
};

// Estado
var recItems   = [];
var recIdx     = 0;
var recAutoTmr = null;
var partidosHoy = [];
var prefs      = loadPrefs();

// ════════════════════════════════════
// ARRANQUE
// ════════════════════════════════════
window.addEventListener('load', function() {
  setTimeout(arrancar, 2500);
});

async function arrancar() {
  log('Arrancando...');
  await fetchCalendario();
  buildItems();
  renderBar();
  startAuto();
  setInterval(checkEnVivo, REC.liveCheckMs);
  setInterval(fetchCalendario, REC.calMs);
}

// ════════════════════════════════════
// FETCH CALENDARIO
// ════════════════════════════════════
async function fetchCalendario() {
  log('Descargando calendario...');
  var html = await proxyFetch(REC.url);
  if (!html) { usarCache(); return; }
  var partidos = parsearHTML(html);
  log('Partidos: ' + partidos.length);
  if (partidos.length) {
    partidosHoy = partidos;
    guardarCache(partidos);
    buildItems();
    renderBar();
  } else {
    usarCache();
  }
}

// ════════════════════════════════════
// PARSEAR HTML
// ════════════════════════════════════
function parsearHTML(html) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var partidos = [];
  var vistos = {};

  // Buscar todos los links de eventos con ?r=BASE64
  var links = doc.querySelectorAll('a[href*="/eventos/"]');
  links.forEach(function(a) {
    var href   = a.getAttribute('href') || '';
    var base64 = extraerBase64(href);
    if (!base64) return;

    // Subir en el DOM para encontrar el contexto del partido
    var fila   = a.closest('tr') || a.closest('li') || a.parentElement;
    var texto  = fila ? fila.textContent.trim() : '';
    var horaM  = texto.match(/(\d{1,2}:\d{2})/);
    var hora   = horaM ? horaM[1] : '';

    // Buscar nombre del partido (Equipo A vs Equipo B)
    var nombreM = texto.match(/([A-Za-z\u00C0-\u024F][^\n<]{3,35}\s+(?:vs?\.?|-)\s+[A-Za-z\u00C0-\u024F][^\n<]{2,30})/i);
    if (!nombreM) return;
    var nombre = normalizarNombre(nombreM[1]);
    if (nombre.length < 8) return;

    var key = nombre.toLowerCase().replace(/\s/g,'').slice(0,20);
    if (!vistos[key]) {
      vistos[key] = {
        hora:    hora,
        nombre:  nombre,
        liga:    detectarLiga(nombre),
        enVivo:  esEnVivo(hora),
        canales: [],
      };
      partidos.push(vistos[key]);
    }

    var canalNombre = (a.textContent || '').trim() || 'Canal';
    vistos[key].canales.push({
      nombre: canalNombre,
      href:   href,
      base64: base64,
      stream: null,
    });
  });

  return partidos.length ? partidos : parsearRegex(html);
}

function parsearRegex(html) {
  var partidos = [];
  var vistos   = {};
  var bloques  = html.split(/<tr[\s>]/i);

  bloques.forEach(function(bloque) {
    var horaM   = bloque.match(/(\d{1,2}:\d{2})/);
    var hora    = horaM ? horaM[1] : '';
    var nombreM = bloque.match(/([A-Za-z\u00C0-\u024F][^<\n]{3,35}\s+(?:vs?\.?|-)\s+[A-Za-z\u00C0-\u024F][^<\n]{2,30})/i);
    if (!nombreM) return;
    var nombre = normalizarNombre(nombreM[1]);
    if (nombre.length < 8) return;
    var key = nombre.toLowerCase().replace(/\s/g,'').slice(0,20);

    var reLink = /href="([^"]*\/eventos\/\?r=([A-Za-z0-9+\/=]+))"/g;
    var m;
    while ((m = reLink.exec(bloque)) !== null) {
      var href = m[1], base64 = m[2];
      if (!vistos[key]) {
        vistos[key] = { hora:hora, nombre:nombre, liga:detectarLiga(nombre), enVivo:esEnVivo(hora), canales:[] };
        partidos.push(vistos[key]);
      }
      // Intentar sacar nombre del canal del contexto
      var antes = bloque.substring(Math.max(0, m.index - 100), m.index);
      var cnM   = antes.match(/>([^<]{1,20})<[^>]*$/);
      var cn    = cnM ? cnM[1].trim() : 'Canal';
      vistos[key].canales.push({ nombre:cn||'Canal', href:href, base64:base64, stream:null });
    }
  });
  return partidos;
}

// ════════════════════════════════════
// RESOLVER STREAM DESDE BASE64
// ════════════════════════════════════
async function resolverStream(canal) {
  if (canal.stream) return canal.stream;
  try {
    var decoded = atob(canal.base64);
    log('Decodificado: ' + decoded);

    // Si ya es m3u8 directo
    if (/\.m3u8/i.test(decoded)) { canal.stream = decoded; return decoded; }

    // Fetch de la página intermediaria
    var html = await proxyFetch(decoded);
    if (!html) { canal.stream = decoded; return decoded; }

    // Buscar m3u8 en el HTML
    var patrones = [
      /file\s*:\s*["']([^"']+\.m3u8[^"']*)/i,
      /source\s*:\s*["']([^"']+\.m3u8[^"']*)/i,
      /src\s*=\s*["']([^"']+\.m3u8[^"']*)/i,
      /"(https?:\/\/[^"]+\.m3u8[^"]*)"/,
      /'(https?:\/\/[^']+\.m3u8[^']*)'/,
    ];
    for (var i = 0; i < patrones.length; i++) {
      var m = html.match(patrones[i]);
      if (m) { canal.stream = m[1]; log('Stream: ' + m[1]); return m[1]; }
    }

    // Buscar iframe con src
    var ifrM = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (ifrM) {
      var html2 = await proxyFetch(ifrM[1]);
      if (html2) {
        for (var j = 0; j < patrones.length; j++) {
          var m2 = html2.match(patrones[j]);
          if (m2) { canal.stream = m2[1]; return m2[1]; }
        }
      }
    }

    canal.stream = decoded;
    return decoded;
  } catch(e) {
    log('Error stream: ' + e.message);
    return null;
  }
}

// ════════════════════════════════════
// CONSTRUIR ITEMS
// ════════════════════════════════════
function buildItems() {
  var items   = [];
  var favsApp = JSON.parse(localStorage.getItem('cicFavs3') || '[]');

  // 1. Partidos en vivo priorizados
  var enVivo = priorizarPorPrefs(partidosHoy.filter(function(p){ return p.enVivo; }));

  enVivo.forEach(function(p) {
    var cic = buscarCanalCIC(p.nombre);
    if (cic) {
      items.push(mkItem('🔴', p.hora + ' · ' + p.nombre + ' · ' + cic.name, p,
        function(c){ return function(){ reproducirCanalCIC(c); }; }(cic), true));
    } else {
      p.canales.forEach(function(canal) {
        items.push(mkItem('🔴', p.hora + ' · ' + p.nombre + ' · ' + canal.nombre, p,
          function(c,pa){ return function(){ reproducirFutbolLibre(c, pa); }; }(canal, p), true));
      });
      if (!p.canales.length) {
        items.push(mkItem('🔴', p.hora + ' · ' + p.nombre, p, null, true));
      }
    }
  });

  // 2. Próximos partidos
  partidosHoy
    .filter(function(p){ return !p.enVivo && esFuturo(p.hora); })
    .slice(0, 5)
    .forEach(function(p) {
      items.push(mkItem('⏰', p.hora + ' · ' + p.nombre, p, null, false));
    });

  // 3. Sin partidos → favoritos del usuario
  if (!items.length) {
    var src = [];
    if (typeof allTV    !== 'undefined') src = src.concat(allTV);
    if (typeof allRadio !== 'undefined') src = src.concat(allRadio);
    src.filter(function(c){ return favsApp.includes(c.id); })
       .slice(0, 8)
       .forEach(function(c) {
         items.push(mkItem('⭐', c.name + ' · ' + c.cat, null,
           function(ch){ return function(){ reproducirCanalCIC(ch); }; }(c), false));
       });
  }

  // 4. Mensaje vacío
  if (!items.length) {
    items.push(mkItem('📺', 'Sin partidos en vivo · Los próximos aparecerán aquí', null, null, false));
  }

  recItems = items;
  if (recIdx >= recItems.length) recIdx = 0;
}

function mkItem(emoji, label, partido, accion, enVivo) {
  return { emoji:emoji, label:label, partido:partido, accion:accion, enVivo:enVivo };
}

// ════════════════════════════════════
// RENDER
// ════════════════════════════════════
function renderBar() {
  var track = document.getElementById('rec-track');
  if (!track || !recItems.length) return;

  track.innerHTML = recItems.map(function(item, i) {
    var activo = i === recIdx
      ? 'background:rgba(230,63,110,0.18);border-bottom:2px solid #e63f6e;'
      : '';
    var cursor = item.accion ? 'cursor:pointer;' : 'cursor:default;opacity:0.75;';
    var dot = item.enVivo
      ? '<span style="width:6px;height:6px;border-radius:50%;background:#e63f6e;display:inline-block;margin-right:5px;flex-shrink:0;animation:pulse 1.5s infinite;"></span>'
      : '';
    return '<div class="rec-item" data-idx="' + i + '" onclick="recClick(' + i + ')" style="'
      + 'display:inline-flex;align-items:center;flex-shrink:0;'
      + 'padding:0 14px;height:35px;box-sizing:border-box;'
      + 'border-right:1px solid rgba(255,255,255,0.07);'
      + "font-family:'DM Sans',sans-serif;font-size:11px;"
      + 'color:#f0f0f8;white-space:nowrap;transition:background .2s;'
      + cursor + activo + '">'
      + dot
      + '<span style="margin-right:5px;">' + item.emoji + '</span>'
      + '<span>' + item.label + '</span>'
      + '</div>';
  }).join('');

  // Scroll al activo
  var items = track.querySelectorAll('.rec-item');
  var offset = 0;
  for (var i = 0; i < recIdx && i < items.length; i++) {
    offset += items[i].offsetWidth;
  }
  track.style.transform = 'translateX(-' + offset + 'px)';
}

// ════════════════════════════════════
// NAVEGACIÓN (llamadas desde index.html)
// ════════════════════════════════════
function recNext() {
  if (!recItems.length) return;
  recIdx = (recIdx + 1) % recItems.length;
  renderBar();
  resetAuto();
}

function recPrev() {
  if (!recItems.length) return;
  recIdx = (recIdx - 1 + recItems.length) % recItems.length;
  renderBar();
  resetAuto();
}

function recClick(idx) {
  var item = recItems[idx];
  if (!item) return;
  recIdx = idx;
  renderBar();
  if (item.partido) registrarVista(item.partido);
  if (item.accion) item.accion();
}

// ════════════════════════════════════
// AUTO AVANCE
// ════════════════════════════════════
function startAuto() {
  recAutoTmr = setInterval(function() {
    recIdx = (recIdx + 1) % (recItems.length || 1);
    renderBar();
  }, REC.tickerMs);
}

function resetAuto() {
  clearInterval(recAutoTmr);
  startAuto();
}

// ════════════════════════════════════
// REPRODUCCIÓN EN PLAYER
// ════════════════════════════════════
function reproducirCanalCIC(canal) {
  if (typeof playFromSide === 'function') playFromSide(canal.id);
  else if (typeof playFromGrid === 'function') playFromGrid(canal.id);
}

async function reproducirFutbolLibre(canal, partido) {
  var ld    = document.getElementById('ld');
  var pp    = document.getElementById('pp');
  var pname = document.getElementById('pname');
  if (ld) ld.classList.add('show');
  if (pp) pp.classList.add('hide');
  if (pname) pname.textContent = partido.nombre + ' · ' + canal.nombre;

  var url = await resolverStream(canal);
  if (!url) {
    if (ld) ld.classList.remove('show');
    var er = document.getElementById('er');
    if (er) er.classList.add('show');
    return;
  }

  var ch = { id:'fl_'+Date.now(), name:partido.nombre+' · '+canal.nombre, cat:'Deportes', co:'', type:'tv', logo:'', url:url };
  if (typeof curCh !== 'undefined') curCh = ch;
  if (typeof pname !== 'undefined' && pname) pname.textContent = ch.name;

  if (typeof playVideo === 'function') {
    playVideo(ch);
  } else {
    var v = document.getElementById('vp');
    if (!v) return;
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      if (window._recHls) window._recHls.destroy();
      window._recHls = new Hls({ enableWorker:true, lowLatencyMode:true });
      window._recHls.loadSource(url);
      window._recHls.attachMedia(v);
      window._recHls.on(Hls.Events.MANIFEST_PARSED, function() {
        if (ld) ld.classList.remove('show');
        v.play().catch(function(){});
      });
      window._recHls.on(Hls.Events.ERROR, function(_, d) {
        if (d.fatal) { if (ld) ld.classList.remove('show'); }
      });
    } else {
      v.src = url; v.load(); v.play().catch(function(){});
      if (ld) ld.classList.remove('show');
    }
  }
}

// ════════════════════════════════════
// BUSCAR CANAL CIC TV EQUIVALENTE
// ════════════════════════════════════
function buscarCanalCIC(nombrePartido) {
  if (typeof allTV === 'undefined') return null;
  var n = nombrePartido.toLowerCase();
  var mapeo = {
    'champions':     ['espn','tnt','dazn','bein'],
    'real madrid':   ['espn','tnt','dazn','bein'],
    'barcelona':     ['espn','tnt','dazn','bein'],
    'liga mx':       ['fox sports','tudn','azteca','canal 5'],
    'premier':       ['espn','star','dazn'],
    'serie a':       ['espn','dazn'],
    'bundesliga':    ['espn','dazn'],
    'ligue 1':       ['espn','dazn'],
    'libertadores':  ['espn','fox sports'],
    'sudamericana':  ['espn','fox sports'],
  };
  for (var clave in mapeo) {
    if (n.includes(clave)) {
      var buscados = mapeo[clave];
      for (var i = 0; i < allTV.length; i++) {
        var cn = allTV[i].name.toLowerCase();
        for (var j = 0; j < buscados.length; j++) {
          if (cn.includes(buscados[j])) return allTV[i];
        }
      }
    }
  }
  return null;
}

// ════════════════════════════════════
// VERIFICAR EN VIVO (cada 5 min)
// ════════════════════════════════════
function checkEnVivo() {
  var cambio = false;
  partidosHoy.forEach(function(p) {
    var nuevo = esEnVivo(p.hora);
    if (nuevo !== p.enVivo) { p.enVivo = nuevo; cambio = true; }
  });
  if (cambio) { buildItems(); renderBar(); }
}

// ════════════════════════════════════
// PREFERENCIAS Y APRENDIZAJE
// ════════════════════════════════════
function registrarVista(partido) {
  extraerEquipos(partido.nombre).forEach(function(eq) {
    var e = prefs.equipos.find(function(x){ return x.n === eq; });
    if (e) e.v++; else prefs.equipos.push({ n:eq, v:1 });
  });
  if (partido.liga) {
    var l = prefs.ligas.find(function(x){ return x.n === partido.liga; });
    if (l) l.v++; else prefs.ligas.push({ n:partido.liga, v:1 });
  }
  prefs.equipos.sort(function(a,b){ return b.v-a.v; });
  prefs.ligas.sort(function(a,b){ return b.v-a.v; });
  localStorage.setItem(REC.prefsKey, JSON.stringify(prefs));
}

function priorizarPorPrefs(lista) {
  return lista.slice().sort(function(a,b){ return getScore(b)-getScore(a); });
}

function getScore(p) {
  var s = p.enVivo ? 100 : 0;
  var n = p.nombre.toLowerCase();
  prefs.equipos.forEach(function(e){ if (n.includes(e.n.toLowerCase())) s += e.v*10; });
  prefs.ligas.forEach(function(l){ if ((p.liga||'').toLowerCase().includes(l.n.toLowerCase())) s += l.v*5; });
  return s;
}

// ════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════
function extraerBase64(href) {
  var m = href.match(/[?&]r=([A-Za-z0-9+\/=]+)/);
  return m ? m[1] : null;
}

function esEnVivo(hora) {
  if (!hora) return false;
  try {
    var p = hora.split(':');
    var ini = new Date(); ini.setHours(+p[0],+p[1],0,0);
    var fin = new Date(ini.getTime() + 130*60000);
    var ahora = new Date();
    return ahora >= ini && ahora <= fin;
  } catch(e){ return false; }
}

function esFuturo(hora) {
  if (!hora) return false;
  try {
    var p = hora.split(':');
    var ini = new Date(); ini.setHours(+p[0],+p[1],0,0);
    return ini > new Date();
  } catch(e){ return false; }
}

function detectarLiga(nombre) {
  var n = nombre.toLowerCase();
  var map = [
    ['Champions League','champions'],['LaLiga','laliga'],['Liga MX','liga mx'],
    ['Premier League','premier'],['Serie A','serie a'],['Bundesliga','bundesliga'],
    ['Ligue 1','ligue 1'],['Copa Libertadores','libertadores'],
    ['Copa Sudamericana','sudamericana'],['Liga Profesional','liga profesional'],
    ['Primera División','primera división'],['Liga Pro','liga pro'],
  ];
  for (var i=0;i<map.length;i++){ if(n.includes(map[i][1])) return map[i][0]; }
  return 'Fútbol';
}

function normalizarNombre(s) {
  return s.replace(/\s+/g,' ').trim().replace(/\bvs\b/gi,'vs').replace(/\bv\/s\b/gi,'vs');
}

function extraerEquipos(nombre) {
  return nombre.split(/\s+vs\.?\s+|\s+v\/s\s+|\s+-\s+/i)
    .map(function(s){ return s.trim(); })
    .filter(function(s){ return s.length>2; });
}

async function proxyFetch(url) {
  try {
    var r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (r.ok) return await r.text();
  } catch(e){}
  for (var i=0; i<REC.proxies.length; i++) {
    try {
      var r2 = await fetch(REC.proxies[i]+encodeURIComponent(url), { signal: AbortSignal.timeout(9000) });
      if (r2.ok) return await r2.text();
    } catch(e){ continue; }
  }
  return null;
}

function guardarCache(partidos) {
  try { localStorage.setItem(REC.storeKey, JSON.stringify({ fecha:new Date().toDateString(), partidos:partidos })); }
  catch(e){}
}

function usarCache() {
  try {
    var c = JSON.parse(localStorage.getItem(REC.storeKey));
    if (c && c.fecha===new Date().toDateString() && c.partidos.length) {
      partidosHoy = c.partidos;
      log('Caché: '+partidosHoy.length+' partidos');
    }
  } catch(e){}
  buildItems(); renderBar();
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(REC.prefsKey))||{equipos:[],ligas:[]}; }
  catch(e){ return {equipos:[],ligas:[]}; }
}

function log(msg) { console.log('[Recomendados] '+msg); }
