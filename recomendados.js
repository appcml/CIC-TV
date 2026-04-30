// ═══════════════════════════════════════════════════════════════
// recomendados.js — CIC TV v4
// Barra de recomendaciones con carrusel infinito
// Incluye: partidos de fútbol, canales favoritos, frecuentes
// ═══════════════════════════════════════════════════════════════

var REC = {
  tickerMs:    8000,   // avance automático cada 8s
  visibles:    6,      // ítems visibles simultáneamente
};

var recItems   = [];
var recIdx     = 0;
var recAutoTmr = null;

// ════════════════════════════════════
// ARRANQUE
// ════════════════════════════════════
window.addEventListener('load', function() {
  setTimeout(arrancar, 2500);
});

async function arrancar() {
  buildItems();
  renderBar();
  startAuto();
  // Reconstruir cada 5 min (llegan nuevos canales)
  setInterval(function() { buildItems(); renderBar(); }, 5 * 60 * 1000);
  // Buscar partidos en vivo
  buscarPartidos();
  setInterval(buscarPartidos, 10 * 60 * 1000);
}

// ════════════════════════════════════
// CONSTRUIR ÍTEMS
// Prioridad: EN VIVO → Favoritos → Frecuentes → Recomendados por categoría
// ════════════════════════════════════
function buildItems() {
  var items = [];
  var src = (typeof allTV !== 'undefined' ? allTV : []);
  var favIds = JSON.parse(localStorage.getItem('cicFavs3') || '[]');
  var vistas = JSON.parse(localStorage.getItem('cicVistas') || '{}');

  // 1. Favoritos marcados
  favIds.forEach(function(id) {
    var ch = src.find(function(c){ return c.id === id; });
    if (!ch) return;
    items.push({
      tipo:   'fav',
      label:  ch.name,
      sub:    '⭐ Favorito · ' + ch.cat,
      emoji:  '⭐',
      logo:   ch.logo || '',
      accion: function(closure_ch){ return function(){ if(closure_ch.type==='radio'){setMode('radio');} else {if(typeof setMode==='function')setMode('tv');} playFromSide(closure_ch.id); }; }(ch),
      ch:     ch,
    });
  });

  // 2. Canales más vistos (historial local)
  var vistos = Object.entries(vistas)
    .sort(function(a,b){ return b[1] - a[1]; })
    .slice(0, 5);
  vistos.forEach(function(entry) {
    var id = entry[0], n = entry[1];
    var ch = src.find(function(c){ return c.id === id; });
    if (!ch) return;
    if (favIds.indexOf(id) !== -1) return; // ya está en favoritos
    items.push({
      tipo:   'frecuente',
      label:  ch.name,
      sub:    '📺 ' + n + ' vistas · ' + ch.cat,
      emoji:  '🔥',
      logo:   ch.logo || '',
      accion: function(closure_ch){ return function(){ if(closure_ch.type==='radio'){setMode('radio');} else {if(typeof setMode==='function')setMode('tv');} playFromSide(closure_ch.id); }; }(ch),
      ch:     ch,
    });
  });

  // 3. Canales deportivos destacados
  var deportes = src.filter(function(c){ return c.cat === 'Deportes'; }).slice(0, 10);
  deportes.forEach(function(ch) {
    if (items.find(function(i){ return i.ch && i.ch.id === ch.id; })) return;
    items.push({
      tipo:   'deporte',
      label:  ch.name,
      sub:    '⚽ Deportes · ' + (ch.co || ''),
      emoji:  '⚽',
      logo:   ch.logo || '',
      accion: function(closure_ch){ return function(){ if(closure_ch.type==='radio'){setMode('radio');} else {if(typeof setMode==='function')setMode('tv');} playFromSide(closure_ch.id); }; }(ch),
      ch:     ch,
    });
  });

  // 4. Noticias destacadas
  var noticias = src.filter(function(c){ return c.cat === 'Noticias'; }).slice(0, 8);
  noticias.forEach(function(ch) {
    if (items.find(function(i){ return i.ch && i.ch.id === ch.id; })) return;
    items.push({
      tipo:   'noticia',
      label:  ch.name,
      sub:    '📰 Noticias · ' + (ch.co || ''),
      emoji:  '📰',
      logo:   ch.logo || '',
      accion: function(closure_ch){ return function(){ if(closure_ch.type==='radio'){setMode('radio');} else {if(typeof setMode==='function')setMode('tv');} playFromSide(closure_ch.id); }; }(ch),
      ch:     ch,
    });
  });

  // 5. Si hay muy pocos, completar con más canales variados
  if (items.length < 10) {
    src.slice(0, 30).forEach(function(ch) {
      if (items.find(function(i){ return i.ch && i.ch.id === ch.id; })) return;
      items.push({
        tipo:   'canal',
        label:  ch.name,
        sub:    ch.cat + ' · ' + (ch.co || ''),
        emoji:  '📺',
        logo:   ch.logo || '',
        accion: function(closure_ch){ return function(){ if(closure_ch.type==='radio'){setMode('radio');} else {if(typeof setMode==='function')setMode('tv');} playFromSide(closure_ch.id); }; }(ch),
        ch:     ch,
      });
    });
  }

  recItems = items;
}

// ════════════════════════════════════
// BUSCAR PARTIDOS EN VIVO (Claude API)
// ════════════════════════════════════
async function buscarPartidos() {
  try {
    var hoy = new Date().toLocaleDateString('es-ES', {
      weekday:'long', year:'numeric', month:'long', day:'numeric'
    });
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: 'Busca partidos de fútbol en vivo HOY. Responde SOLO con JSON válido sin markdown. '
              + 'Formato: [{"hora":"HH:MM","nombre":"Equipo A vs Equipo B","liga":"Liga","enVivo":true}]',
        messages: [{
          role: 'user',
          content: 'Partidos de fútbol en vivo hoy ' + hoy + '. Dame máximo 8 partidos, especialmente de ligas de Sudamérica y Europa.'
        }]
      })
    });

    var data = await response.json();
    var texto = (data.content || []).map(function(b){ return b.text || ''; }).join('');
    var match = texto.match(/\[[\s\S]*\]/);
    if (!match) return;

    var partidos = JSON.parse(match[0]);
    if (!Array.isArray(partidos) || !partidos.length) return;

    // Insertar partidos al inicio de recItems
    var itemsPartidos = partidos.map(function(p) {
      return {
        tipo:    p.enVivo ? 'vivo' : 'partido',
        label:   p.nombre,
        sub:     (p.enVivo ? '🔴 EN VIVO · ' : '⏰ ' + p.hora + ' · ') + p.liga,
        emoji:   '⚽',
        logo:    '',
        accion:  function(){ buscarCanalPartido(p.nombre); },
        partido: p,
      };
    });

    // Mezclar: partidos primero, luego el resto
    recItems = itemsPartidos.concat(
      recItems.filter(function(i){ return !i.partido; })
    );
    renderBar();
    console.log('[Rec] ' + partidos.length + ' partidos cargados');
  } catch(e) {
    console.log('[Rec] Sin partidos: ' + e.message);
  }
}

// Buscar canal donde se transmite el partido
function buscarCanalPartido(nombrePartido) {
  var src = (typeof allTV !== 'undefined' ? allTV : []);
  var palabras = nombrePartido.toLowerCase().split(/[\s\-vs]+/).filter(function(p){ return p.length > 3; });
  // Buscar en canales deportivos
  var candidato = src.find(function(ch) {
    if (ch.cat !== 'Deportes') return false;
    var n = ch.name.toLowerCase();
    return palabras.some(function(p){ return n.indexOf(p) !== -1; });
  });
  if (candidato) {
    if (typeof playFromSide === 'function') playFromSide(candidato);
  } else {
    // Ir a categoría Deportes
    if (typeof setCat === 'function') setCat('Deportes');
    if (typeof showToast === 'function') showToast('⚽ Busca el partido en Deportes');
  }
}

// ════════════════════════════════════
// RENDER BARRA — CARRUSEL INFINITO
// Los ítems se muestran en ventana deslizante
// Al llegar al final, vuelve al inicio sin cortes
// ════════════════════════════════════
function renderBar() {
  var track = document.getElementById('rec-track');
  if (!track) return;
  if (!recItems.length) {
    track.innerHTML = '<div style="padding:0 14px;font-size:11px;color:#9090b0;">📺 Cargando canales...</div>';
    return;
  }

  // Crear lista circular: duplicar ítems para el efecto infinito
  var todos = recItems.concat(recItems); // duplicar para carrusel infinito

  track.innerHTML = todos.map(function(item, i) {
    var esActivo = (i % recItems.length) === recIdx;
    var bg = esActivo
      ? 'background:rgba(230,63,110,0.18);border-bottom:2px solid #e63f6e;'
      : 'border-bottom:2px solid transparent;';

    var dot = item.tipo === 'vivo'
      ? '<span style="width:7px;height:7px;border-radius:50%;background:#e63f6e;flex-shrink:0;margin-right:5px;animation:pulse 1.5s infinite;display:inline-block;"></span>'
      : '';

    var logoHtml = item.logo
      ? '<img src="' + item.logo + '" style="width:18px;height:18px;border-radius:3px;object-fit:contain;margin-right:5px;flex-shrink:0;" onerror="this.style.display=\'none\'">'
      : '<span style="margin-right:5px;font-size:12px;">' + item.emoji + '</span>';

    var colorSub = item.tipo === 'vivo' ? '#e63f6e' : (item.tipo === 'partido' ? '#f0a500' : '#9090b0');

    return '<div class="rec-item" onclick="recClick(' + (i % recItems.length) + ')" '
      + 'style="display:inline-flex;align-items:center;padding:0 12px;height:35px;'
      + 'cursor:pointer;flex-shrink:0;min-width:160px;max-width:240px;'
      + 'border-right:1px solid rgba(255,255,255,0.06);' + bg
      + 'transition:background .2s;">'
      + dot + logoHtml
      + '<span style="display:flex;flex-direction:column;line-height:1.2;overflow:hidden;">'
      + '<span style="font-size:11px;font-weight:500;color:#f0f0f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">' + escapeHtml(item.label) + '</span>'
      + '<span style="font-size:9px;color:' + colorSub + ';white-space:nowrap;">' + escapeHtml(item.sub) + '</span>'
      + '</span></div>';
  }).join('');

  scrollToActive();
}

  setTimeout(calibrarAncho, 150);
// Ancho estimado por ítem (evita forced reflow)
var REC_ITEM_W = 185;

function scrollToActive() {
  var track = document.getElementById('rec-track');
  if (!track) return;
  // Usar requestAnimationFrame para no bloquear el hilo principal
  requestAnimationFrame(function() {
    var offset = recIdx * REC_ITEM_W;
    track.style.transform   = 'translateX(-' + offset + 'px)';
    track.style.transition  = 'transform 0.35s ease';
  });
}

// Calibrar ancho real al renderizar por primera vez
function calibrarAncho() {
  var track = document.getElementById('rec-track');
  if (!track) return;
  var item = track.querySelector('.rec-item');
  if (item) REC_ITEM_W = item.getBoundingClientRect().width || 185;
}

// ════════════════════════════════════
// NAVEGACIÓN — CARRUSEL INFINITO
// ════════════════════════════════════
function recNext() {
  if (!recItems.length) return;
  recIdx = (recIdx + 1) % recItems.length;

  var track = document.getElementById('rec-track');
  var items  = track ? track.querySelectorAll('.rec-item') : [];

  // Si llegamos a la mitad (segunda copia), saltar al inicio sin animación
  if (recIdx === 0) {
    track.style.transition = 'none';
    track.style.transform  = 'translateX(0)';
    // Forzar reflow
    track.offsetHeight;
    track.style.transition = 'transform 0.4s ease';
  }

  scrollToActive();
  resetAuto();
}

function recPrev() {
  if (!recItems.length) return;
  recIdx = (recIdx - 1 + recItems.length) % recItems.length;
  scrollToActive();
  resetAuto();
}

function recClick(idx) {
  var item = recItems[idx];
  if (!item || !item.accion) return;
  recIdx = idx;
  renderBar();
  item.accion();
}

// ════════════════════════════════════
// AUTO-AVANCE
// ════════════════════════════════════
function startAuto() {
  clearInterval(recAutoTmr);
  recAutoTmr = setInterval(recNext, REC.tickerMs);
}

function resetAuto() {
  clearInterval(recAutoTmr);
  recAutoTmr = setInterval(recNext, REC.tickerMs);
}

// ════════════════════════════════════
// HELPER
// ════════════════════════════════════
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function log(msg) { console.log('[Rec] ' + msg); }
