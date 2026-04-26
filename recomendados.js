// ═══════════════════════════════════════════════════════════════
// recomendados.js — CIC TV v3
// Fetch directo desde navegador (con cookies del usuario)
// Extrae JSON-LD + HTML de futbollibretv.su
// Diseño mejorado: logo + nombre + EN VIVO / hora
// ═══════════════════════════════════════════════════════════════

const REC = {
  url:         'https://futbollibretv.su/',
  tickerMs:    5000,          // avance automático cada 5s
  liveCheckMs: 3 * 60 * 1000, // verificar en vivo cada 3 min
  calMs:       6 * 60 * 60 * 1000, // recargar calendario cada 6h
  storeKey:    'cicPartidosHoy',
  prefsKey:    'cicPrefs',
};

// ── Estado global ──
var recItems    = [];
var recIdx      = 0;
var recAutoTmr  = null;
var partidosHoy = [];
var prefs       = loadPrefs();

// ════════════════════════════════════
// ARRANQUE — espera a que todo cargue
// ════════════════════════════════════
window.addEventListener('load', function() {
  setTimeout(arrancar, 3000);
});

async function arrancar() {
  log('Iniciando sistema de recomendaciones v3...');
  renderBarCargando();
  await fetchCalendario();
  buildItems();
  renderBar();
  startAuto();
  setInterval(checkEnVivo,    REC.liveCheckMs);
  setInterval(fetchCalendario, REC.calMs);
}

// ════════════════════════════════════
// FETCH DIRECTO DESDE NAVEGADOR
// El navegador ya tiene cookies/sesión → no hay 403
// ════════════════════════════════════
async function fetchCalendario() {
  log('Cargando partidos.json...');

  // ── Estrategia 1: leer partidos.json generado por GitHub Actions ──
  // El JSON vive en el mismo dominio → sin CORS, siempre funciona
  try {
    var baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
    var jsonUrl = baseUrl + 'partidos.json?t=' + Date.now(); // evitar caché
    var res = await fetch(jsonUrl, { cache: 'no-store' });
    if (res.ok) {
      var data = await res.json();
      log('partidos.json cargado: ' + (data.total || 0) + ' partidos, generado: ' + (data.generado || '?'));

      // Verificar que es de hoy
      var hoy = new Date().toISOString().slice(0, 10);
      if (data.fecha === hoy && data.partidos && data.partidos.length) {
        partidosHoy = data.partidos.map(function(p) {
          return Object.assign({}, p, { enVivo: esEnVivo(p.hora) });
        });
        guardarCache(partidosHoy);
        buildItems();
        renderBar();
        return;
      } else if (data.partidos && data.partidos.length) {
        // Aunque no sea de hoy, mejor que nada
        log('JSON no es de hoy (' + data.fecha + ') pero lo usamos igual');
        partidosHoy = data.partidos.map(function(p) {
          return Object.assign({}, p, { enVivo: esEnVivo(p.hora) });
        });
        guardarCache(partidosHoy);
        buildItems();
        renderBar();
        return;
      }
    }
  } catch(e) {
    log('Error leyendo partidos.json: ' + e.message);
  }

  // ── Estrategia 2: caché local del día anterior ──
  log('Sin partidos.json — usando caché local');
  usarCache();
}

// ── Buscar partidos usando API de Anthropic con web_search ──
async function buscarPartidosConClaude() {
  var hoy = new Date().toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: 'Eres un asistente que extrae partidos de fútbol de futbollibretv.su. '
              + 'Responde SOLO con JSON válido, sin texto adicional, sin markdown. '
              + 'Formato exacto: [{"hora":"HH:MM","nombre":"Equipo A vs Equipo B","liga":"Nombre Liga","enVivo":true/false,"canales":[]}]',
        messages: [{
          role: 'user',
          content: 'Busca en https://futbollibretv.su/ los partidos de fútbol de hoy ' + hoy
                 + '. Lista TODOS los partidos con su hora, nombre completo (Equipo A vs Equipo B) y liga. '
                 + 'Responde SOLO con el array JSON, sin explicaciones.',
        }],
      }),
    });

    if (!response.ok) {
      log('Claude API error: ' + response.status);
      return null;
    }

    var data = await response.json();
    log('Claude respondió: ' + JSON.stringify(data).slice(0, 100));

    // Extraer texto de la respuesta
    var texto = '';
    if (data.content) {
      data.content.forEach(function(bloque) {
        if (bloque.type === 'text') texto += bloque.text;
      });
    }

    // Parsear JSON de la respuesta
    texto = texto.trim();
    // Quitar markdown si hay
    // Quitar markdown si hay
    texto = texto.replace(/```[\w]*/g,'').trim();

    // Buscar el array JSON en el texto
    var jsonM = texto.match(/\[[\s\S]*\]/);
    if (!jsonM) { log('No encontré JSON en respuesta'); return null; }

    var partidos = JSON.parse(jsonM[0]);
    if (!Array.isArray(partidos)) return null;

    // Normalizar y marcar en vivo
    return partidos.map(function(p) {
      return {
        hora:    p.hora || '',
        nombre:  normalizarNombre(p.nombre || ''),
        liga:    p.liga || detectarLiga(p.nombre || ''),
        logo:    '',
        enVivo:  p.enVivo || esEnVivo(p.hora || ''),
        canales: p.canales || [],
      };
    }).filter(function(p){ return p.nombre.length > 5; });

  } catch(e) {
    log('Error Claude API: ' + e.message);
    return null;
  }
}

// ── Fetch con múltiples proxies CORS ──
async function fetchConProxies(url) {
  var proxies = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://yacdn.org/proxy/',
  ];
  for (var i = 0; i < proxies.length; i++) {
    try {
      var r = await fetch(proxies[i] + encodeURIComponent(url), {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'text/html', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (r.ok) {
        var txt = await r.text();
        if (txt && txt.length > 500) { log('OK via: ' + proxies[i].slice(0,35)); return txt; }
      }
    } catch(e) { continue; }
  }
  return null;
}

// ── Fetch via iframe oculto ──
// El iframe carga la página con las cookies del usuario
// y devuelve el HTML via postMessage
function fetchViaIframe(url, timeoutMs) {
  return new Promise(function(resolve) {
    var done = false;
    var timer = setTimeout(function() {
      if (!done) { done = true; cleanup(); resolve(null); }
    }, timeoutMs || 8000);

    // Crear iframe oculto
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    iframe.sandbox = 'allow-scripts allow-same-origin';
    document.body.appendChild(iframe);

    function cleanup() {
      clearTimeout(timer);
      try { document.body.removeChild(iframe); } catch(e) {}
    }

    // Escuchar mensaje del iframe
    function onMsg(e) {
      if (e.data && e.data.type === 'cic_html') {
        if (!done) {
          done = true;
          window.removeEventListener('message', onMsg);
          cleanup();
          resolve(e.data.html || null);
        }
      }
    }
    window.addEventListener('message', onMsg);

    iframe.onload = function() {
      try {
        // Inyectar script que manda el HTML al padre
        iframe.contentWindow.postMessage(
          { type: 'cic_html', html: iframe.contentDocument.documentElement.outerHTML },
          '*'
        );
      } catch(e) {
        // Si el iframe es cross-origin no podemos leer — resolver null
        if (!done) { done = true; window.removeEventListener('message', onMsg); cleanup(); resolve(null); }
      }
    };

    iframe.onerror = function() {
      if (!done) { done = true; window.removeEventListener('message', onMsg); cleanup(); resolve(null); }
    };

    iframe.src = url;
  });
}

// ════════════════════════════════════
// EXTRAER JSON-LD (Schema.org)
// FutbolLibre publica datos estructurados
// ════════════════════════════════════
function extraerJSONLD(html) {
  var partidos = [];
  var regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  var match;

  while ((match = regex.exec(html)) !== null) {
    try {
      var data = JSON.parse(match[1]);
      // Puede ser un objeto o un array
      var items = Array.isArray(data) ? data : [data];
      items.forEach(function(item) {
        // Schema: SportsEvent, Event, o items dentro de @graph
        var lista = item['@graph'] || [item];
        lista.forEach(function(ev) {
          var tipo = ev['@type'] || '';
          if (!/event|sport|partido|match/i.test(tipo)) return;

          var nombre = ev.name || ev.headline || '';
          if (!nombre || nombre.length < 5) return;

          // Hora de inicio
          var startDate = ev.startDate || ev.datePublished || '';
          var hora = '';
          if (startDate) {
            // Formato ISO: 2026-04-25T19:00:00
            var fechaM = startDate.match(/T(\d{2}:\d{2})/);
            hora = fechaM ? fechaM[1] : '';
          }

          // Logo / imagen
          var logo = '';
          if (ev.image) {
            logo = typeof ev.image === 'string' ? ev.image : (ev.image.url || ev.image.contentUrl || '');
          }

          // Canales / streams
          var canales = [];
          if (ev.url) canales.push({ nombre: 'Ver partido', href: ev.url, base64: extraerBase64(ev.url), stream: null });

          partidos.push({
            hora:    hora,
            nombre:  normalizarNombre(nombre),
            logo:    logo,
            liga:    ev.sport || ev.organizer || detectarLiga(nombre),
            enVivo:  esEnVivo(hora),
            canales: canales,
          });
        });
      });
    } catch(e) {
      // JSON inválido — ignorar este bloque
    }
  }
  return partidos;
}

// ════════════════════════════════════
// PARSEAR HTML DIRECTO
// Busca la tabla/lista de partidos en el DOM
// ════════════════════════════════════
function parsearHTMLDireto(html) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var partidos = [];
  var vistos   = {};

  // FutbolLibre estructura la página con filas de partidos
  // Cada fila tiene: hora | bandera | "Nombre vs Nombre"
  // Sub-filas con links de canales: /eventos/?r=BASE64

  // ── Buscar filas principales (con hora + "vs") ──
  var filas = doc.querySelectorAll('tr, .event-row, .match-row, [class*="event"], [class*="match"]');

  filas.forEach(function(fila) {
    var texto = fila.textContent || '';

    // Debe tener formato hora
    var horaM = texto.match(/(\d{1,2}:\d{2})/);
    if (!horaM) return;
    var hora = horaM[1];

    // Debe tener "vs" entre dos equipos
    var nombreM = texto.match(/([A-Za-z\u00C0-\u024F][^\n\t<]{2,30})\s+vs\.?\s+([A-Za-z\u00C0-\u024F][^\n\t<]{2,30})/i);
    if (!nombreM) return;

    var nombre = normalizarNombre(nombreM[1].trim() + ' vs ' + nombreM[2].trim());
    // Limpiar basura del JSON-LD que pueda haberse colado
    nombre = nombre.replace(/dateModified.*$/i, '').replace(/description.*$/i, '').trim();
    if (nombre.length < 8 || nombre.length > 60) return;

    // Buscar logo/imagen en la fila
    var img = fila.querySelector('img');
    var logo = img ? (img.src || img.dataset.src || '') : '';

    var key = nombre.toLowerCase().replace(/\s+/g,'').slice(0,15);
    if (vistos[key]) return;

    // Buscar canales (links con /eventos/?r=BASE64)
    var canales = [];
    var links = fila.querySelectorAll('a[href*="/eventos/"]');
    links.forEach(function(a) {
      var href   = a.getAttribute('href') || '';
      var base64 = extraerBase64(href);
      if (!base64) return;
      var cn = (a.textContent || '').trim() || 'Canal';
      // Evitar duplicados
      if (!canales.find(function(c){ return c.base64 === base64; })) {
        canales.push({ nombre: cn, href: href, base64: base64, stream: null });
      }
    });

    vistos[key] = true;
    partidos.push({
      hora:    hora,
      nombre:  nombre,
      logo:    logo,
      liga:    detectarLiga(nombre),
      enVivo:  esEnVivo(hora),
      canales: canales,
    });
  });

  // ── Fallback: regex sobre el HTML si el DOM no funcionó ──
  if (!partidos.length) {
    log('Fallback regex...');
    partidos = parsearRegex(html);
  }

  return partidos;
}

function parsearRegex(html) {
  var partidos = [];
  var vistos   = {};

  // Dividir en bloques por fila de tabla
  var bloques = html.split(/<tr[\s>]/i);
  bloques.forEach(function(bloque) {
    var horaM = bloque.match(/(\d{1,2}:\d{2})/);
    if (!horaM) return;
    var hora = horaM[1];

    var nombreM = bloque.match(/([A-Za-z\u00C0-\u024F][^<\n\t]{2,30})\s+vs\.?\s+([A-Za-z\u00C0-\u024F][^<\n\t]{2,30})/i);
    if (!nombreM) return;

    var nombre = normalizarNombre(nombreM[1].trim() + ' vs ' + nombreM[2].trim());
    nombre = nombre.replace(/dateModified.*$/i,'').replace(/description.*$/i,'').trim();
    if (nombre.length < 8 || nombre.length > 60) return;

    var key = nombre.toLowerCase().replace(/\s+/g,'').slice(0,15);
    if (vistos[key]) return;

    var canales = [];
    var reLink = /href="([^"]*\/eventos\/\?r=([A-Za-z0-9+\/=]+))"/g;
    var m;
    while ((m = reLink.exec(bloque)) !== null) {
      var href = m[1], b64 = m[2];
      // Nombre del canal: buscar texto cercano
      var ctx  = bloque.substring(Math.max(0, m.index-80), m.index);
      var cnM  = ctx.match(/>([A-Za-z][^<]{1,25})<[^>]*$/);
      var cn   = cnM ? cnM[1].trim() : 'Canal';
      if (!canales.find(function(c){ return c.base64===b64; })) {
        canales.push({ nombre:cn, href:href, base64:b64, stream:null });
      }
    }

    vistos[key] = true;
    partidos.push({ hora:hora, nombre:nombre, logo:'', liga:detectarLiga(nombre), enVivo:esEnVivo(hora), canales:canales });
  });

  return partidos;
}

// ════════════════════════════════════
// RESOLVER STREAM DESDE BASE64
// atob(base64) → URL → buscar .m3u8
// ════════════════════════════════════
async function resolverStream(canal) {
  if (canal.stream) return canal.stream;
  try {
    var decoded = atob(canal.base64);
    log('Decodificado: ' + decoded);

    // Ya es m3u8 directo
    if (/\.m3u8/i.test(decoded)) {
      canal.stream = decoded;
      return decoded;
    }

    // Fetch de la página intermediaria (desde el navegador con cookies)
    var res = await fetch(decoded, {
      credentials: 'include',
      headers: { 'Accept': 'text/html', 'Referer': REC.url },
    });
    if (!res.ok) { canal.stream = decoded; return decoded; }
    var html = await res.text();

    // Buscar m3u8 con varios patrones
    var patrones = [
      /file\s*:\s*["']([^"']+\.m3u8[^"']*)/i,
      /source\s*:\s*["']([^"']+\.m3u8[^"']*)/i,
      /src\s*=\s*["']([^"']+\.m3u8[^"']*)/i,
      /"(https?:\/\/[^"]+\.m3u8[^"]*)"/,
      /'(https?:\/\/[^']+\.m3u8[^']*)'/,
      /hls\.loadSource\(["']([^"']+)/i,
      /manifestUri\s*[=:]\s*["']([^"']+)/i,
    ];
    for (var i = 0; i < patrones.length; i++) {
      var m = html.match(patrones[i]);
      if (m && m[1]) { canal.stream = m[1]; log('m3u8: ' + m[1]); return m[1]; }
    }

    // Buscar dentro de un iframe
    var ifrM = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (ifrM) {
      try {
        var res2 = await fetch(ifrM[1], { credentials:'include', headers:{ Referer: decoded } });
        if (res2.ok) {
          var html2 = await res2.text();
          for (var j = 0; j < patrones.length; j++) {
            var m2 = html2.match(patrones[j]);
            if (m2 && m2[1]) { canal.stream = m2[1]; return m2[1]; }
          }
        }
      } catch(e2) {}
    }

    // Último recurso: retornar la URL decodificada
    canal.stream = decoded;
    return decoded;
  } catch(e) {
    log('Error resolverStream: ' + e.message);
    return null;
  }
}

// ── Resolver stream usando Claude API ──
async function resolverStreamConClaude(nombrePartido, nombreCanal) {
  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: 'Responde SOLO con la URL directa del stream m3u8 o la URL del partido. Sin texto adicional.',
        messages: [{
          role: 'user',
          content: 'Busca en futbollibretv.su el stream del partido "'
                 + nombrePartido + '" en el canal "' + nombreCanal
                 + '". Dame solo la URL directa del stream.',
        }],
      }),
    });
    if (!response.ok) return null;
    var data = await response.json();
    var texto = '';
    if (data.content) data.content.forEach(function(b){ if(b.type==='text') texto += b.text; });
    var urlM = texto.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
    return urlM ? urlM[0] : null;
  } catch(e) { return null; }
}

// ════════════════════════════════════
// CONSTRUIR ITEMS DEL TICKER
// ════════════════════════════════════
function buildItems() {
  var items   = [];
  var favsApp = JSON.parse(localStorage.getItem('cicFavs3') || '[]');
  var allSrc  = [];
  if (typeof allTV    !== 'undefined') allSrc = allSrc.concat(allTV);
  if (typeof allRadio !== 'undefined') allSrc = allSrc.concat(allRadio);

  // ── 1. Partidos EN VIVO priorizados por preferencias ──
  var enVivo = priorizarPorPrefs(partidosHoy.filter(function(p){ return p.enVivo; }));

  enVivo.forEach(function(p) {
    var cic = buscarCanalCIC(p.nombre);
    if (cic) {
      // Tenemos el canal en nuestra lista → usar directo
      items.push({
        tipo:    'vivo',
        emoji:   '🔴',
        label:   p.nombre,
        sub:     'EN VIVO · ' + cic.name,
        logo:    p.logo || cic.logo || '',
        partido: p,
        accion:  (function(c){ return function(){ reproducirCanalCIC(c); }; })(cic),
      });
    } else {
      // Usar streams de FutbolLibre
      p.canales.forEach(function(canal) {
        items.push({
          tipo:    'vivo',
          emoji:   '🔴',
          label:   p.nombre,
          sub:     'EN VIVO · ' + canal.nombre,
          logo:    p.logo || '',
          partido: p,
          canal:   canal,
          accion:  (function(c, pa){ return function(){ reproducirFutbolLibre(c, pa); }; })(canal, p),
        });
      });
      if (!p.canales.length) {
        items.push({
          tipo:    'vivo',
          emoji:   '🔴',
          label:   p.nombre,
          sub:     'EN VIVO',
          logo:    p.logo || '',
          partido: p,
          accion:  null,
        });
      }
    }
  });

  // ── 2. Próximos partidos del día ──
  partidosHoy
    .filter(function(p){ return !p.enVivo && esFuturo(p.hora); })
    .slice(0, 5)
    .forEach(function(p) {
      items.push({
        tipo:    'proximo',
        emoji:   '⏰',
        label:   p.nombre,
        sub:     p.hora + ' · ' + (p.liga || 'Fútbol'),
        logo:    p.logo || '',
        partido: p,
        accion:  null,
      });
    });

  // ── 3. Sin partidos → canales frecuentes + favoritos ──
  if (!items.length) {
    // Primero canales frecuentes (los más vistos aunque no sean favoritos)
    var frecuentes = getCanalesFrecuentes(allSrc);
    var mostrados  = {};

    frecuentes.slice(0, 5).forEach(function(c) {
      mostrados[c.id] = true;
      items.push({
        tipo:   'frecuente',
        emoji:  '📺',
        label:  c.name,
        sub:    (c._vistas || 1) + ' vistas · ' + c.cat,
        logo:   c.logo || '',
        accion: (function(ch){ return function(){ reproducirCanalCIC(ch); }; })(c),
      });
    });

    // Luego favoritos no mostrados aún
    var favCanales = allSrc.filter(function(c){ return favsApp.includes(c.id) && !mostrados[c.id]; });
    favCanales.slice(0, 5).forEach(function(c) {
      items.push({
        tipo:   'fav',
        emoji:  '⭐',
        label:  c.name,
        sub:    'Favorito · ' + c.cat,
        logo:   c.logo || '',
        accion: (function(ch){ return function(){ reproducirCanalCIC(ch); }; })(c),
      });
    });
  }

  // ── 4. Vacío total ──
  if (!items.length) {
    items.push({
      tipo:   'info',
      emoji:  '📺',
      label:  'Sin partidos en vivo ahora',
      sub:    'Los próximos eventos aparecerán aquí',
      logo:   '',
      accion: null,
    });
  }

  recItems = items;
  if (recIdx >= recItems.length) recIdx = 0;
}

// ════════════════════════════════════
// RENDER BARRA — DISEÑO MEJORADO
// Logo + Nombre + Sub (EN VIVO / hora)
// ════════════════════════════════════
function renderBarCargando() {
  var track = document.getElementById('rec-track');
  if (!track) return;
  track.innerHTML = '<div style="display:inline-flex;align-items:center;padding:0 14px;height:35px;'
    + "font-family:'DM Sans',sans-serif;font-size:11px;color:#9090b0;"
    + '">⏳ Cargando recomendaciones...</div>';
}

function renderBar() {
  var track = document.getElementById('rec-track');
  if (!track || !recItems.length) return;

  track.innerHTML = recItems.map(function(item, i) {
    var activo = i === recIdx
      ? 'background:rgba(230,63,110,0.18);border-bottom:2px solid #e63f6e;'
      : '';
    var clickable = item.accion ? 'cursor:pointer;' : 'cursor:default;opacity:0.8;';

    // Punto rojo animado para EN VIVO
    var dot = item.tipo === 'vivo'
      ? '<span style="flex-shrink:0;width:7px;height:7px;border-radius:50%;'
        + 'background:#e63f6e;margin-right:6px;animation:pulse 1.5s infinite;"></span>'
      : '';

    // Logo del equipo/canal (si existe)
    var logoHtml = '';
    if (item.logo) {
      logoHtml = '<img src="' + item.logo + '" '
        + 'style="width:20px;height:20px;border-radius:3px;object-fit:contain;'
        + 'margin-right:6px;flex-shrink:0;background:#1a1a26;" '
        + 'onerror="this.style.display=\'none\'" loading="lazy">';
    } else {
      // Emoji como fallback
      logoHtml = '<span style="margin-right:5px;font-size:13px;flex-shrink:0;">'
        + item.emoji + '</span>';
    }

    // Texto: nombre principal + sub (EN VIVO / hora / canal)
    var colorSub = item.tipo === 'vivo' ? '#e63f6e' : '#9090b0';
    var textoHtml = '<span style="display:flex;flex-direction:column;line-height:1.2;">'
      + '<span style="font-size:11px;font-weight:500;color:#f0f0f8;white-space:nowrap;">'
      + escapeHtml(item.label) + '</span>'
      + '<span style="font-size:9px;color:' + colorSub + ';white-space:nowrap;">'
      + escapeHtml(item.sub || '') + '</span>'
      + '</span>';

    return '<div class="rec-item" data-idx="' + i + '" onclick="recClick(' + i + ')" '
      + 'style="display:inline-flex;align-items:center;flex-shrink:0;'
      + 'padding:0 12px;height:35px;box-sizing:border-box;'
      + 'border-right:1px solid rgba(255,255,255,0.07);'
      + 'transition:background .2s;' + clickable + activo + '">'
      + dot + logoHtml + textoHtml
      + '</div>';
  }).join('');

  // Scroll al item activo
  scrollToActive();
}

function scrollToActive() {
  var track = document.getElementById('rec-track');
  if (!track) return;
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
    if (!recItems.length) return;
    recIdx = (recIdx + 1) % recItems.length;
    renderBar();
  }, REC.tickerMs);
}

function resetAuto() {
  clearInterval(recAutoTmr);
  startAuto();
}

// ════════════════════════════════════
// REPRODUCCIÓN EN PLAYER PRINCIPAL
// ════════════════════════════════════
function reproducirCanalCIC(canal) {
  if (typeof playFromSide === 'function') playFromSide(canal.id);
  else if (typeof playFromGrid === 'function') playFromGrid(canal.id);
}

async function reproducirFutbolLibre(canal, partido) {
  // Mostrar loading
  var ld    = document.getElementById('ld');
  var pp    = document.getElementById('pp');
  var pname = document.getElementById('pname');
  var er    = document.getElementById('er');
  if (er) er.classList.remove('show');
  if (pp) pp.classList.add('hide');
  if (ld) ld.classList.add('show');
  if (pname) pname.textContent = partido.nombre + ' · ' + canal.nombre;

  // Resolver stream (decodificar Base64 → m3u8)
  var url = await resolverStream(canal);

  if (!url) {
    if (ld) ld.classList.remove('show');
    if (er) {
      er.classList.add('show');
      var s = er.querySelector('strong');
      if (s) s.textContent = '⚠️ No se pudo obtener el stream';
    }
    return;
  }

  log('Reproduciendo: ' + url);

  // Canal temporal — solo para esta sesión, no se persiste
  var ch = {
    id:   'fl_' + Date.now(),
    name: partido.nombre + ' · ' + canal.nombre,
    cat:  'Deportes',
    co:   '',
    type: 'tv',
    logo: partido.logo || '',
    url:  url,
  };

  // Actualizar estado del player
  if (typeof curCh !== 'undefined') curCh = ch;
  if (typeof sideActive !== 'undefined') sideActive = null;
  if (pname) pname.textContent = ch.name;
  if (typeof updatePlayerFavBtn === 'function') updatePlayerFavBtn();

  // Usar playVideo del player principal
  if (typeof playVideo === 'function') {
    playVideo(ch);
  } else {
    // Fallback directo con HLS.js
    var v = document.getElementById('vp');
    if (!v) return;
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      if (window._recHls) { window._recHls.destroy(); window._recHls = null; }
      window._recHls = new Hls({ enableWorker:true, lowLatencyMode:true, startLevel:-1 });
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
      v.src = url; v.load();
      v.play().catch(function(){});
      if (ld) ld.classList.remove('show');
    }
  }
}

// ════════════════════════════════════
// BUSCAR CANAL EQUIVALENTE EN CIC TV
// Evita usar FutbolLibre si ya tenemos el canal
// ════════════════════════════════════
function buscarCanalCIC(nombrePartido) {
  if (typeof allTV === 'undefined') return null;
  var n = nombrePartido.toLowerCase();
  var mapa = {
    'champions':        ['espn','tnt','bein','s sport'],
    'real madrid':      ['espn','tnt','bein','laliga tv'],
    'barcelona':        ['espn','tnt','bein','laliga tv'],
    'laliga':           ['laliga tv','espn','directv','sky sports laliga'],
    'la liga':          ['laliga tv','espn','directv','sky sports laliga'],
    'liga mx':          ['tudn','fox sports','espn'],
    'premier':          ['espn','tnt','bein'],
    'fa cup':           ['espn','tnt'],
    'serie a':          ['espn','fox sports','directv'],
    'bundesliga':       ['espn 2','directv','disney'],
    'ligue 1':          ['espn','directv'],
    'libertadores':     ['espn','fox sports','deportv','tyc'],
    'sudamericana':     ['espn','fox sports','tyc'],
    'liga profesional': ['tyc sports','espn','fox sports','deportv'],
    'primera division': ['directv','espn','deportv'],
    'liga pro':         ['espn','directv'],
    'brasileirao':      ['espn','fox sports'],
    'eredivisie':       ['espn','directv'],
    'primeira liga':    ['sport tv','directv'],
  };
  for (var clave in mapa) {
    if (n.includes(clave)) {
      var buscados = mapa[clave];
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
// VERIFICAR EN VIVO PERIÓDICO
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
// ── Registrar vista de canal (llamar desde playFromGrid/playFromSide) ──
function registrarVistaCanal(canal) {
  if (!canal || !canal.id) return;
  var vistas = loadVistasCan();
  vistas[canal.id] = (vistas[canal.id] || 0) + 1;
  localStorage.setItem('cicVistasCan', JSON.stringify(vistas));
}

function loadVistasCan() {
  try { return JSON.parse(localStorage.getItem('cicVistasCan')) || {}; }
  catch(e) { return {}; }
}

function getCanalesFrecuentes(src) {
  var vistas = loadVistasCan();
  return src
    .filter(function(c){ return vistas[c.id] && vistas[c.id] > 0; })
    .map(function(c){ return Object.assign({}, c, { _vistas: vistas[c.id] }); })
    .sort(function(a,b){ return b._vistas - a._vistas; });
}

function registrarVista(partido) {
  extraerEquipos(partido.nombre).forEach(function(eq) {
    var e = prefs.equipos.find(function(x){ return x.n === eq; });
    if (e) e.v++; else prefs.equipos.push({ n:eq, v:1 });
  });
  if (partido.liga) {
    var l = prefs.ligas.find(function(x){ return x.n === partido.liga; });
    if (l) l.v++; else prefs.ligas.push({ n:partido.liga, v:1 });
  }
  prefs.equipos.sort(function(a,b){ return b.v - a.v; });
  prefs.ligas.sort(function(a,b){ return b.v - a.v; });
  localStorage.setItem(REC.prefsKey, JSON.stringify(prefs));
}

function priorizarPorPrefs(lista) {
  return lista.slice().sort(function(a,b){ return getScore(b) - getScore(a); });
}

function getScore(p) {
  var s = p.enVivo ? 100 : 0;
  var n = p.nombre.toLowerCase();
  prefs.equipos.forEach(function(e){ if (n.includes(e.n.toLowerCase())) s += e.v * 10; });
  prefs.ligas.forEach(function(l){ if ((p.liga||'').toLowerCase().includes(l.n.toLowerCase())) s += l.v * 5; });
  return s;
}

// ════════════════════════════════════
// CACHÉ LOCAL
// ════════════════════════════════════
function guardarCache(partidos) {
  try {
    localStorage.setItem(REC.storeKey, JSON.stringify({
      fecha:    new Date().toDateString(),
      partidos: partidos,
    }));
  } catch(e) {}
}

function usarCache() {
  try {
    var c = JSON.parse(localStorage.getItem(REC.storeKey));
    if (c && c.fecha === new Date().toDateString() && c.partidos && c.partidos.length) {
      partidosHoy = c.partidos;
      log('Caché: ' + partidosHoy.length + ' partidos');
    } else {
      log('Sin caché válida');
    }
  } catch(e) {}
  buildItems();
  renderBar();
}

// ════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════
function extraerBase64(href) {
  if (!href) return null;
  var m = href.match(/[?&]r=([A-Za-z0-9+\/=]+)/);
  return m ? m[1] : null;
}

function esEnVivo(hora) {
  if (!hora) return false;
  try {
    var p   = hora.split(':');
    var ini = new Date(); ini.setHours(+p[0], +p[1], 0, 0);
    var fin = new Date(ini.getTime() + 130 * 60000);
    var now = new Date();
    return now >= ini && now <= fin;
  } catch(e) { return false; }
}

function esFuturo(hora) {
  if (!hora) return false;
  try {
    var p   = hora.split(':');
    var ini = new Date(); ini.setHours(+p[0], +p[1], 0, 0);
    return ini > new Date();
  } catch(e) { return false; }
}

function detectarLiga(nombre) {
  var n = nombre.toLowerCase();
  var map = [
    ['Champions League','champions'],['LaLiga','laliga'],
    ['Liga MX','liga mx'],['Premier League','premier'],
    ['Serie A','serie a'],['Bundesliga','bundesliga'],
    ['Ligue 1','ligue 1'],['Copa Libertadores','libertadores'],
    ['Copa Sudamericana','sudamericana'],['Liga Profesional','liga profesional'],
    ['Primera División','primera div'],['Liga Pro','liga pro'],
  ];
  for (var i = 0; i < map.length; i++) {
    if (n.includes(map[i][1])) return map[i][0];
  }
  return 'Fútbol';
}

function normalizarNombre(s) {
  return s.replace(/\s+/g,' ').trim()
    .replace(/dateModified.*/i,'').replace(/description.*/i,'')
    .replace(/\bvs\b/gi,'vs').replace(/\bv\/s\b/gi,'vs').trim();
}

function extraerEquipos(nombre) {
  return nombre.split(/\s+vs\.?\s+|\s+v\/s\s+/i)
    .map(function(s){ return s.trim(); })
    .filter(function(s){ return s.length > 2; });
}

function escapeHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(REC.prefsKey)) || { equipos:[], ligas:[] }; }
  catch(e) { return { equipos:[], ligas:[] }; }
}

function log(msg) { console.log('[Recomendados v3] ' + msg); }
