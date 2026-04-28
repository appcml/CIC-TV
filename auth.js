// ═══════════════════════════════════════════════════════════
// auth.js — CIC TV
// Sistema de registro, login y sincronización con Supabase
// ═══════════════════════════════════════════════════════════

const SB = {
  url: 'https://jrmzywlfmgobhwsoaogx.supabase.co',
  key: 'sb_publishable_YidKlw3onv8xWFwAKRatsg_fkkH1ZPO',
};

// Estado de sesión
var sbUser    = null;
var sbSession = null;

// ════════════════════════════════════
// INICIALIZAR
// ════════════════════════════════════
window.addEventListener('load', function() {
  setTimeout(initAuth, 500);
});

async function initAuth() {
  // Restaurar sesión guardada
  var saved = localStorage.getItem('cic_session');
  if (saved) {
    try {
      sbSession = JSON.parse(saved);
      sbUser    = sbSession.user;
      // Verificar que el token sigue válido
      var ok = await verificarSesion();
      if (ok) {
        onLogin(sbUser);
      } else {
        // Token expirado — intentar refrescar
        await refrescarToken();
      }
    } catch(e) {
      localStorage.removeItem('cic_session');
    }
  }
  renderAuthBtn();
}

// ════════════════════════════════════
// RENDER BOTÓN AUTH EN HEADER
// ════════════════════════════════════
function renderAuthBtn() {
  var header = document.querySelector('.hd-right') || document.querySelector('header');
  if (!header) return;

  // Crear o actualizar botón de usuario
  var existing = document.getElementById('auth-btn-wrap');
  if (existing) existing.remove();

  var wrap = document.createElement('div');
  wrap.id = 'auth-btn-wrap';
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:8px;';

  if (sbUser) {
    var nombre = sbUser.user_metadata?.nombre || sbUser.email?.split('@')[0] || 'Usuario';
    wrap.innerHTML =
      '<button onclick="abrirPerfil()" style="'
      + 'background:rgba(230,63,110,0.15);border:1px solid var(--accent);'
      + 'color:var(--text);padding:4px 10px;border-radius:20px;cursor:pointer;'
      + 'font-size:11px;display:flex;align-items:center;gap:6px;white-space:nowrap;">'
      + '<span style="width:22px;height:22px;border-radius:50%;background:var(--accent);'
      + 'color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">'
      + nombre[0].toUpperCase() + '</span>'
      + '<span>' + nombre + '</span>'
      + '</button>';
  } else {
    wrap.innerHTML =
      '<button onclick="abrirModal(\'login\')" style="'
      + 'background:rgba(230,63,110,0.15);border:1px solid var(--accent);'
      + 'color:var(--text);padding:5px 12px;border-radius:20px;cursor:pointer;'
      + 'font-size:11px;white-space:nowrap;">'
      + '👤 Iniciar sesión'
      + '</button>';
  }

  // Insertar antes del botón de actualizar
  var btnRefresh = document.getElementById('btnRefresh') || header.lastElementChild;
  if (btnRefresh && btnRefresh.parentNode === header) {
    header.insertBefore(wrap, btnRefresh);
  } else {
    header.appendChild(wrap);
  }
}

// ════════════════════════════════════
// MODAL DE AUTH
// ════════════════════════════════════
function abrirModal(modo) {
  // Eliminar modal anterior si existe
  var old = document.getElementById('auth-modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99999;'
    + 'display:flex;align-items:center;justify-content:center;padding:20px;'
    + 'backdrop-filter:blur(4px);';

  modal.innerHTML = `
    <div style="background:var(--bg2,#1a1a2e);border:1px solid var(--accent,#e63f6e);
      border-radius:16px;width:100%;max-width:380px;padding:28px;position:relative;">

      <!-- Cerrar -->
      <button onclick="cerrarModal()" style="position:absolute;top:12px;right:14px;
        background:none;border:none;color:var(--text2,#9090b0);font-size:18px;cursor:pointer;">✕</button>

      <!-- Logo -->
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;font-weight:800;color:var(--accent,#e63f6e);">CIC TV</div>
        <div style="font-size:12px;color:var(--text2,#9090b0);margin-top:4px;">Sincroniza tus canales favoritos</div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid var(--border,rgba(255,255,255,0.1));margin-bottom:20px;">
        <button id="tab-login" onclick="switchTab('login')" style="flex:1;padding:8px;background:none;border:none;
          color:${modo==='login'?'var(--accent,#e63f6e)':'var(--text2,#9090b0)'};
          border-bottom:2px solid ${modo==='login'?'var(--accent,#e63f6e)':'transparent'};
          cursor:pointer;font-size:13px;font-weight:600;transition:all .2s;">
          Iniciar sesión
        </button>
        <button id="tab-register" onclick="switchTab('register')" style="flex:1;padding:8px;background:none;border:none;
          color:${modo==='register'?'var(--accent,#e63f6e)':'var(--text2,#9090b0)'};
          border-bottom:2px solid ${modo==='register'?'var(--accent,#e63f6e)':'transparent'};
          cursor:pointer;font-size:13px;font-weight:600;transition:all .2s;">
          Registrarse
        </button>
      </div>

      <!-- Formulario Login -->
      <div id="form-login" style="display:${modo==='login'?'block':'none'}">
        <div style="margin-bottom:14px;">
          <input id="login-email" type="email" placeholder="Correo electrónico"
            style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,0.15));
            background:var(--bg3,rgba(255,255,255,0.05));color:var(--text,#f0f0f8);font-size:14px;outline:none;box-sizing:border-box;"
            onkeydown="if(event.key==='Enter')doLogin()">
        </div>
        <div style="margin-bottom:18px;position:relative;">
          <input id="login-pass" type="password" placeholder="Contraseña"
            style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,0.15));
            background:var(--bg3,rgba(255,255,255,0.05));color:var(--text,#f0f0f8);font-size:14px;outline:none;box-sizing:border-box;"
            onkeydown="if(event.key==='Enter')doLogin()">
        </div>
        <button onclick="doLogin()" id="btn-login"
          style="width:100%;padding:12px;background:var(--accent,#e63f6e);color:#fff;border:none;
          border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .2s;">
          Iniciar sesión
        </button>
        <div style="text-align:center;margin-top:12px;">
          <button onclick="doReset()" style="background:none;border:none;color:var(--text2,#9090b0);
            font-size:12px;cursor:pointer;text-decoration:underline;">
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>

      <!-- Formulario Registro -->
      <div id="form-register" style="display:${modo==='register'?'block':'none'}">
        <div style="margin-bottom:12px;">
          <input id="reg-nombre" type="text" placeholder="Tu nombre"
            style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,0.15));
            background:var(--bg3,rgba(255,255,255,0.05));color:var(--text,#f0f0f8);font-size:14px;outline:none;box-sizing:border-box;"
            onkeydown="if(event.key==='Enter')doRegister()">
        </div>
        <div style="margin-bottom:12px;">
          <input id="reg-email" type="email" placeholder="Correo electrónico"
            style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,0.15));
            background:var(--bg3,rgba(255,255,255,0.05));color:var(--text,#f0f0f8);font-size:14px;outline:none;box-sizing:border-box;"
            onkeydown="if(event.key==='Enter')doRegister()">
        </div>
        <div style="margin-bottom:18px;">
          <input id="reg-pass" type="password" placeholder="Contraseña (mín. 6 caracteres)"
            style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,0.15));
            background:var(--bg3,rgba(255,255,255,0.05));color:var(--text,#f0f0f8);font-size:14px;outline:none;box-sizing:border-box;"
            onkeydown="if(event.key==='Enter')doRegister()">
        </div>
        <button onclick="doRegister()" id="btn-register"
          style="width:100%;padding:12px;background:var(--accent,#e63f6e);color:#fff;border:none;
          border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .2s;">
          Crear cuenta
        </button>
      </div>

      <!-- Mensaje de error/éxito -->
      <div id="auth-msg" style="margin-top:14px;padding:10px 14px;border-radius:8px;
        font-size:13px;text-align:center;display:none;"></div>

      <!-- Beneficios -->
      <div style="margin-top:18px;padding:12px;background:rgba(230,63,110,0.08);
        border-radius:10px;border:1px solid rgba(230,63,110,0.2);">
        <div style="font-size:11px;color:var(--text2,#9090b0);line-height:1.7;">
          ✅ Favoritos sincronizados en todos tus dispositivos<br>
          ✅ Historial de canales vistos<br>
          ✅ Tus preferencias siempre disponibles<br>
          ✅ 100% gratis
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  // Cerrar al hacer clic fuera
  modal.addEventListener('click', function(e) {
    if (e.target === modal) cerrarModal();
  });
  // Focus en primer campo
  setTimeout(function() {
    var inp = document.getElementById(modo === 'login' ? 'login-email' : 'reg-nombre');
    if (inp) inp.focus();
  }, 100);
}

function switchTab(tab) {
  var isLogin = tab === 'login';
  document.getElementById('form-login').style.display    = isLogin ? 'block' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none'  : 'block';
  var tL = document.getElementById('tab-login');
  var tR = document.getElementById('tab-register');
  if (tL) { tL.style.color = isLogin ? 'var(--accent,#e63f6e)' : 'var(--text2,#9090b0)'; tL.style.borderBottom = isLogin ? '2px solid var(--accent,#e63f6e)' : '2px solid transparent'; }
  if (tR) { tR.style.color = !isLogin ? 'var(--accent,#e63f6e)' : 'var(--text2,#9090b0)'; tR.style.borderBottom = !isLogin ? '2px solid var(--accent,#e63f6e)' : '2px solid transparent'; }
  mostrarAuthMsg('', '');
}

function cerrarModal() {
  var m = document.getElementById('auth-modal');
  if (m) m.remove();
}

function mostrarAuthMsg(msg, tipo) {
  var el = document.getElementById('auth-msg');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display    = 'block';
  el.style.background = tipo === 'error' ? 'rgba(255,60,60,0.15)' : 'rgba(0,200,100,0.15)';
  el.style.color      = tipo === 'error' ? '#ff6b6b' : '#00c864';
  el.style.border     = '1px solid ' + (tipo === 'error' ? 'rgba(255,60,60,0.3)' : 'rgba(0,200,100,0.3)');
  el.textContent      = msg;
}

function setBtnLoading(id, loading) {
  var btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled    = loading;
  btn.style.opacity = loading ? '0.6' : '1';
  if (loading) btn.textContent = '⏳ Procesando...';
}

// ════════════════════════════════════
// REGISTRO
// ════════════════════════════════════
async function doRegister() {
  var nombre = (document.getElementById('reg-nombre')?.value || '').trim();
  var email  = (document.getElementById('reg-email')?.value  || '').trim();
  var pass   = (document.getElementById('reg-pass')?.value   || '').trim();

  if (!nombre) { mostrarAuthMsg('Ingresa tu nombre', 'error'); return; }
  if (!email || !email.includes('@')) { mostrarAuthMsg('Correo inválido', 'error'); return; }
  if (pass.length < 6) { mostrarAuthMsg('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

  setBtnLoading('btn-register', true);

  var res = await sbFetch('/auth/v1/signup', {
    email, password: pass,
    data: { nombre },
  });

  if (res.error) {
    setBtnLoading('btn-register', false);
    var msg = res.error.message || 'Error al registrarse';
    if (msg.includes('already registered')) msg = 'Este correo ya está registrado — intenta iniciar sesión';
    mostrarAuthMsg(msg, 'error');
    return;
  }

  // Intentar login inmediato (funcione o no la confirmación)
  var loginRes = await sbFetch('/auth/v1/token?grant_type=password', {
    email, password: pass,
  });

  setBtnLoading('btn-register', false);

  if (loginRes.access_token || loginRes.session) {
    var session = loginRes.access_token ? loginRes : loginRes.session;
    guardarSesion(session);
    onLogin(session.user || loginRes.user);
    cerrarModal();
    if (typeof showToast === 'function') showToast('¡Bienvenido a CIC TV, ' + nombre + '! 🎉');
    return;
  }

  // Si Supabase aún exige confirmación
  if (loginRes.error && loginRes.error.message && loginRes.error.message.includes('not confirmed')) {
    mostrarAuthMsg('✅ Cuenta creada. Ya puedes iniciar sesión.', 'ok');
    setTimeout(function(){ switchTab('login'); }, 1500);
    return;
  }

  // Fallback
  mostrarAuthMsg('✅ Cuenta creada. Inicia sesión.', 'ok');
  setTimeout(function(){ switchTab('login'); }, 1500);
}

// ════════════════════════════════════
// LOGIN
// ════════════════════════════════════
async function doLogin() {
  var email = (document.getElementById('login-email')?.value || '').trim();
  var pass  = (document.getElementById('login-pass')?.value  || '').trim();

  if (!email) { mostrarAuthMsg('Ingresa tu correo', 'error'); return; }
  if (!pass)  { mostrarAuthMsg('Ingresa tu contraseña', 'error'); return; }

  setBtnLoading('btn-login', true);

  var res = await sbFetch('/auth/v1/token?grant_type=password', {
    email, password: pass,
  });

  setBtnLoading('btn-login', false);

  if (res.error) {
    var msg = res.error.message || 'Error al iniciar sesión';
    if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
      msg = 'Correo o contraseña incorrectos';
    } else if (msg.includes('Email not confirmed')) {
      // Intentar confirmar automáticamente via admin
      msg = 'Debes confirmar tu correo. Ve a Supabase → Authentication → Users, clic en tu usuario y confirma el email manualmente, o desactiva "Confirm email" en Sign In/Providers.';
    } else if (msg.includes('Too many requests')) {
      msg = 'Demasiados intentos. Espera unos minutos.';
    }
    mostrarAuthMsg(msg, 'error');
    setBtnLoading('btn-login', false);
    return;
  }

  // Verificar que tengamos sesión válida
  if (!res.access_token && !res.session) {
    mostrarAuthMsg('Error al iniciar sesión. Intenta de nuevo.', 'error');
    setBtnLoading('btn-login', false);
    return;
  }

  var session = res.access_token ? res : res.session;
  guardarSesion(session);
  onLogin(session.user || res.user);
  cerrarModal();
  if (typeof showToast === 'function') showToast('¡Bienvenido de vuelta! 👋');
}

// ════════════════════════════════════
// RESET CONTRASEÑA
// ════════════════════════════════════
async function doReset() {
  var email = (document.getElementById('login-email')?.value || '').trim();
  if (!email) { mostrarAuthMsg('Ingresa tu correo primero', 'error'); return; }
  var res = await sbFetch('/auth/v1/recover', { email });
  if (res.error) { mostrarAuthMsg('Error: ' + res.error.message, 'error'); return; }
  mostrarAuthMsg('✅ Revisa tu correo para restablecer tu contraseña', 'ok');
}

// ════════════════════════════════════
// LOGOUT
// ════════════════════════════════════
async function doLogout() {
  if (sbSession?.access_token) {
    await sbFetch('/auth/v1/logout', {}, 'POST', sbSession.access_token);
  }
  localStorage.removeItem('cic_session');
  sbUser = sbSession = null;
  onLogout();
  cerrarPerfil();
  renderAuthBtn();
  if (typeof showToast === 'function') showToast('Sesión cerrada');
}

// ════════════════════════════════════
// PANEL DE PERFIL
// ════════════════════════════════════
function abrirPerfil() {
  var old = document.getElementById('perfil-panel');
  if (old) { old.remove(); return; }

  var meta   = sbUser?.user_metadata || sbUser?.raw_user_meta_data || {};
  var nombre = meta.nombre || meta.name || meta.full_name || sbUser?.email?.split('@')[0] || 'Usuario';
  var email  = sbUser?.email || '';

  var panel = document.createElement('div');
  panel.id = 'perfil-panel';
  panel.style.cssText =
    'position:fixed;top:56px;right:12px;z-index:9999;'
    + 'background:var(--bg2,#1a1a2e);border:1px solid var(--accent,#e63f6e);'
    + 'border-radius:14px;padding:18px;width:240px;'
    + 'box-shadow:0 8px 32px rgba(0,0,0,0.4);';

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:38px;height:38px;border-radius:50%;background:var(--accent,#e63f6e);
        color:#fff;display:flex;align-items:center;justify-content:center;
        font-size:16px;font-weight:700;flex-shrink:0;">
        ${nombre[0].toUpperCase()}
      </div>
      <div style="overflow:hidden;">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nombre}</div>
        <div style="font-size:11px;color:var(--text2,#9090b0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${email}</div>
      </div>
    </div>
    <hr style="border:none;border-top:1px solid var(--border,rgba(255,255,255,0.1));margin:0 0 12px;">
    <div style="display:flex;flex-direction:column;gap:6px;">
      <button onclick="sincronizarFavoritos()" style="width:100%;padding:9px;background:rgba(230,63,110,0.1);
        border:1px solid rgba(230,63,110,0.3);border-radius:8px;color:var(--text,#f0f0f8);
        font-size:12px;cursor:pointer;text-align:left;">
        🔄 Sincronizar favoritos
      </button>
      <button onclick="verEstadisticas()" style="width:100%;padding:9px;background:rgba(255,255,255,0.05);
        border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;color:var(--text,#f0f0f8);
        font-size:12px;cursor:pointer;text-align:left;">
        📊 Mis estadísticas
      </button>
      <button onclick="doLogout()" style="width:100%;padding:9px;background:rgba(255,60,60,0.1);
        border:1px solid rgba(255,60,60,0.3);border-radius:8px;color:#ff6b6b;
        font-size:12px;cursor:pointer;text-align:left;">
        🚪 Cerrar sesión
      </button>
    </div>
    <div id="perfil-stats" style="margin-top:12px;font-size:11px;color:var(--text2,#9090b0);"></div>
  `;

  document.body.appendChild(panel);
  cargarEstadisticasPerfil();

  // Cerrar al hacer clic fuera
  setTimeout(function() {
    document.addEventListener('click', function cerrarFuera(e) {
      if (!panel.contains(e.target) && !document.getElementById('auth-btn-wrap')?.contains(e.target)) {
        panel.remove();
        document.removeEventListener('click', cerrarFuera);
      }
    });
  }, 100);
}

function cerrarPerfil() {
  var p = document.getElementById('perfil-panel');
  if (p) p.remove();
}

async function cargarEstadisticasPerfil() {
  if (!sbUser) return;
  var el = document.getElementById('perfil-stats');
  if (!el) return;
  var favs = await sbGet('/rest/v1/favoritos?select=count', true);
  var hist = await sbGet('/rest/v1/historial?select=count', true);
  var nFavs = favs?.[0]?.count || 0;
  var nHist = hist?.[0]?.count || 0;
  el.innerHTML = '⭐ ' + nFavs + ' favoritos &nbsp;·&nbsp; 📺 ' + nHist + ' canales vistos';
}

async function verEstadisticas() {
  cerrarPerfil();
  if (!sbUser) return;
  var hist = await sbGet('/rest/v1/historial?order=vistas.desc&limit=10');
  if (!hist || !hist.length) { if (typeof showToast === 'function') showToast('Aún no tienes historial'); return; }
  var msg = 'Tus canales más vistos:\n' + hist.map(function(h, i) {
    return (i+1) + '. ' + h.canal_name + ' (' + h.vistas + ' vistas)';
  }).join('\n');
  alert(msg);
}

// ════════════════════════════════════
// SINCRONIZACIÓN DE FAVORITOS
// ════════════════════════════════════
async function sincronizarFavoritos() {
  if (!sbUser) { abrirModal('login'); return; }
  if (typeof showToast === 'function') showToast('🔄 Sincronizando favoritos...');

  // 1. Subir favoritos locales a la nube
  var favsLocales = JSON.parse(localStorage.getItem('cicFavs3') || '[]');
  var allSrc = (typeof allTV !== 'undefined' ? allTV : []).concat(typeof allRadio !== 'undefined' ? allRadio : []);

  for (var i = 0; i < favsLocales.length; i++) {
    var cid = favsLocales[i];
    var ch  = allSrc.find(function(c){ return c.id === cid; });
    if (!ch) continue;
    await sbUpsert('/rest/v1/favoritos', {
      user_id:    sbUser.id,
      canal_id:   ch.id,
      canal_name: ch.name,
      canal_url:  ch.url,
      canal_cat:  ch.cat,
      canal_co:   ch.co,
      canal_logo: ch.logo || '',
    });
  }

  // 2. Descargar favoritos de la nube
  var favNube = await sbGet('/rest/v1/favoritos?select=canal_id');
  if (favNube && favNube.length) {
    var idsNube = favNube.map(function(f){ return f.canal_id; });
    // Merge con locales
    var merged = [...new Set([...favsLocales, ...idsNube])];
    localStorage.setItem('cicFavs3', JSON.stringify(merged));
    // Actualizar UI
    if (typeof favs !== 'undefined') { window.favs = merged; }
    if (typeof renderSideList === 'function') renderSideList();
    if (typeof updateAll === 'function') updateAll();
  }

  if (typeof showToast === 'function') showToast('✅ Favoritos sincronizados');
}

// Subir vista de canal a historial
async function subirHistorial(ch) {
  if (!sbUser || !ch) return;
  await sbUpsert('/rest/v1/historial', {
    user_id:     sbUser.id,
    canal_id:    ch.id,
    canal_name:  ch.name,
    canal_url:   ch.url,
    canal_cat:   ch.cat,
    canal_co:    ch.co,
    canal_logo:  ch.logo || '',
    vistas:      1,
    ultima_vista: new Date().toISOString(),
  }, 'canal_id,user_id');
}

// Subir cambio de favorito
async function subirFavorito(ch, agregar) {
  if (!sbUser || !ch) return;
  if (agregar) {
    await sbUpsert('/rest/v1/favoritos', {
      user_id:    sbUser.id,
      canal_id:   ch.id,
      canal_name: ch.name,
      canal_url:  ch.url,
      canal_cat:  ch.cat,
      canal_co:   ch.co,
      canal_logo: ch.logo || '',
    });
  } else {
    await sbDelete('/rest/v1/favoritos?canal_id=eq.' + ch.id + '&user_id=eq.' + sbUser.id);
  }
}

// ════════════════════════════════════
// EVENTOS DE LA APP
// ════════════════════════════════════
function onLogin(user) {
  sbUser = user;
  console.log('[Auth] Login exitoso:', user?.email);
  renderAuthBtn();
  // Sincronizar favoritos al hacer login
  setTimeout(sincronizarFavoritos, 2000);
}

function onLogout() {
  sbUser = sbSession = null;
  renderAuthBtn();
}

// ════════════════════════════════════
// HELPERS SUPABASE API
// ════════════════════════════════════
async function sbFetch(path, body, method, token) {
  try {
    var res = await fetch(SB.url + path, {
      method:  method || 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SB.key,
        'Authorization': 'Bearer ' + (token || SB.key),
      },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch(e) {
    return { error: { message: e.message } };
  }
}

async function sbGet(path, count) {
  try {
    var headers = {
      'apikey':        SB.key,
      'Authorization': 'Bearer ' + (sbSession?.access_token || SB.key),
    };
    if (count) headers['Prefer'] = 'count=exact';
    var res = await fetch(SB.url + path, { headers });
    return await res.json();
  } catch(e) { return null; }
}

async function sbUpsert(path, data, onConflict) {
  try {
    var url = SB.url + path;
    if (onConflict) url += '?on_conflict=' + onConflict;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SB.key,
        'Authorization': 'Bearer ' + (sbSession?.access_token || SB.key),
        'Prefer':        'resolution=merge-duplicates',
      },
      body: JSON.stringify(data),
    });
  } catch(e) {}
}

async function sbDelete(path) {
  try {
    await fetch(SB.url + path, {
      method: 'DELETE',
      headers: {
        'apikey':        SB.key,
        'Authorization': 'Bearer ' + (sbSession?.access_token || SB.key),
      },
    });
  } catch(e) {}
}

function guardarSesion(session) {
  sbSession = session;
  sbUser    = session.user;
  localStorage.setItem('cic_session', JSON.stringify(session));
}

async function verificarSesion() {
  if (!sbSession?.access_token) return false;
  var res = await sbGet('/auth/v1/user');
  return res && res.id && !res.error;
}

async function refrescarToken() {
  if (!sbSession?.refresh_token) return;
  var res = await sbFetch('/auth/v1/token?grant_type=refresh_token', {
    refresh_token: sbSession.refresh_token,
  });
  if (res.access_token) {
    guardarSesion(res);
    onLogin(res.user);
  } else {
    localStorage.removeItem('cic_session');
    sbUser = sbSession = null;
    renderAuthBtn();
  }
}
