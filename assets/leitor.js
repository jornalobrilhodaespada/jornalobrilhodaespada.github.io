/* =====================================================================
   O Brilho da Espada — site do leitor
   Abertura, entrada por e-mail, leitura estilo revista (página que vira
   com o dedo ou o mouse), edições anteriores, PDF e registro de leitura.
   Tudo é estático (GitHub Pages); só o registro de leitura fala com o
   Google Apps Script, sem atrasar a leitura.
   ===================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var reduzido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RE_SLUG = /^\d{4}$/;
  var RE_ARQ = /^[A-Za-z0-9._-]{1,80}\.jpg$/;
  var RE_REGISTRO = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,200}\/exec$/;
  var RE_EMAIL = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

  /* ---------- armazenamento (pode estar bloqueado: nunca quebra a leitura) ---------- */
  function guarda(tipo) {
    var mem = {};
    return {
      ler: function (k) { try { var v = window[tipo].getItem(k); return v == null ? (mem[k] == null ? null : mem[k]) : v; } catch (e) { return mem[k] == null ? null : mem[k]; } },
      gravar: function (k, v) {
        if (v == null) delete mem[k]; else mem[k] = String(v);
        try { if (v == null) window[tipo].removeItem(k); else window[tipo].setItem(k, String(v)); } catch (e) { /* só memória */ }
      }
    };
  }
  var local = guarda('localStorage');
  var sessao = guarda('sessionStorage');

  /* ---------- textos ---------- */
  function numero(slug) { return String(parseInt(slug, 10) || slug); }
  function mesExtenso(mesNome) {
    var m = /^([A-Za-zçÇ]+) (\d{4})$/.exec(String(mesNome || ''));
    return m ? m[1].toLowerCase() + ' de ' + m[2] : '';
  }
  function rotuloEdicao(ed) {
    var mes = mesExtenso(ed.mesNome);
    return 'Edição nº ' + numero(ed.slug) + (mes ? ', ' + mes : '');
  }
  var tAviso = null;
  function aviso(msg, ms) {
    var a = $('aviso');
    a.textContent = msg;
    a.classList.add('mostrar');
    clearTimeout(tAviso);
    tAviso = setTimeout(function () { a.classList.remove('mostrar'); }, ms || 2800);
  }

  /* ---------- dados publicados ---------- */
  function lerJson(url) {
    return fetch(url, {cache: 'no-cache'}).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }
  function validarLista(d) {
    var l = (d && Array.isArray(d.edicoes)) ? d.edicoes : [];
    return l.filter(function (e) {
      return e && RE_SLUG.test(e.slug) && e.mini && RE_ARQ.test(String(e.mini.arquivo || '').split('/').pop());
    }).map(function (e) {
      return {slug: e.slug, mesNome: String(e.mesNome || '').slice(0, 40), paginas: Math.max(1, Math.min(200, e.paginas | 0)),
        mini: 'dados/edicoes/' + e.slug + '/' + String(e.mini.arquivo).split('/').pop()};
    });
  }
  function validarManifesto(m, slug) {
    if (!m || m.slug !== slug || !Array.isArray(m.paginas) || !m.paginas.length) throw new Error('Edição incompleta.');
    var n = Math.min(200, m.paginas.length);
    var paginas = m.paginas.slice(0, n).map(function (p) {
      if (!RE_ARQ.test(String(p.arquivo))) throw new Error('Arquivo inválido.');
      return {
        arquivo: p.arquivo, w: p.w | 0 || 1920, h: p.h | 0 || 1357, tipo: String(p.tipo || 'pagina'), titulo: String(p.titulo || '').slice(0, 90),
        links: (Array.isArray(p.links) ? p.links : []).slice(0, 60).filter(function (l) { return l && (l.ir | 0) >= 0 && (l.ir | 0) < n; })
          .map(function (l) { var c = function (v) { return Math.max(0, Math.min(100, +v || 0)); }; return {x: c(l.x), y: c(l.y), w: c(l.w), h: c(l.h), ir: l.ir | 0}; })
      };
    });
    var mini = m.miniaturas && RE_ARQ.test(String(m.miniaturas.arquivo)) ? m.miniaturas.arquivo : '';
    return {slug: slug, mesNome: String(m.mesNome || '').slice(0, 40), paginas: paginas, mini: mini};
  }

  var E = {site: {}, lista: [], man: null, manifestos: {}};
  var pedidoDados = Promise.all([
    lerJson('dados/site.json').catch(function () { return {}; }),
    /* 404 = nada publicado ainda (a lista só nasce na primeira publicação) */
    lerJson('dados/edicoes.json').catch(function (e) { if (e.status === 404) return {edicoes: []}; throw e; }).then(validarLista)
  ]);

  /* =====================================================================
     ABERTURA
     ===================================================================== */
  function abertura() {
    var ab = $('abertura');
    return new Promise(function (resolve) {
      var feito = false;
      function terminar() {
        if (feito) return;
        feito = true;
        sessao.gravar('obe_abertura', '1');
        ab.classList.add('saindo');
        document.removeEventListener('keydown', terminar);
        setTimeout(function () { ab.hidden = true; }, 520);
        resolve();
      }
      if (sessao.ler('obe_abertura')) { ab.hidden = true; resolve(); return; }
      ab.addEventListener('click', terminar);
      document.addEventListener('keydown', terminar);
      var img = $('abCapa');
      var comecar = function () { ab.classList.add('rodando'); };
      var espera = img.decode ? img.decode().catch(function () {}) : Promise.resolve();
      Promise.race([espera, new Promise(function (r) { setTimeout(r, 650); })]).then(comecar);
      pedidoDados.then(function (d) { if (d[1][0]) $('abLegenda').textContent = rotuloEdicao(d[1][0]); }).catch(function () {});
      setTimeout(terminar, reduzido ? 1500 : 4300);
    });
  }

  /* =====================================================================
     ENTRADA POR E-MAIL
     ===================================================================== */
  var Email = {
    atual: function () { var e = local.ler('obe_email') || ''; return RE_EMAIL.test(e) ? e : ''; },
    pedir: function () {
      return new Promise(function (resolve) {
        var p = $('portao');
        p.hidden = false;
        $('ptEmail').value = '';
        $('ptErro').hidden = true;
        setTimeout(function () { $('ptEmail').focus(); }, 80);
        $('ptForm').onsubmit = function (ev) {
          ev.preventDefault();
          var e = $('ptEmail').value.trim().toLowerCase();
          if (!RE_EMAIL.test(e) || e.length > 120) {
            $('ptErro').textContent = 'Confira o e-mail. Ele precisa ter o formato nome@provedor.com.';
            $('ptErro').hidden = false;
            $('ptEmail').focus();
            return;
          }
          local.gravar('obe_email', e);
          if ((local.ler('obe_gestor_email') || '') !== e) { local.gravar('obe_gestor', null); local.gravar('obe_gestor_email', null); }
          p.hidden = true;
          resolve(e);
        };
      });
    }
  };

  /* =====================================================================
     REGISTRO DE LEITURA (não atrasa nada; se falhar, tenta na próxima visita)
     ===================================================================== */
  var Registro = {
    url: function () { return RE_REGISTRO.test(String(E.site.registro || '')) ? E.site.registro : ''; },
    fila: function () { try { var f = JSON.parse(local.ler('obe_fila') || '[]'); return Array.isArray(f) ? f : []; } catch (e) { return []; } },
    guardarFila: function (f) { local.gravar('obe_fila', JSON.stringify(f.slice(-20))); },
    enviar: function (corpo) {
      var url = Registro.url();
      if (!url) return Promise.resolve(false);
      return fetch(url, {method: 'POST', body: JSON.stringify(corpo), keepalive: true, credentials: 'omit'})
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (r && typeof r.gestor === 'string' && RE_REGISTRO.test(r.gestor)) {
            local.gravar('obe_gestor', r.gestor);
            local.gravar('obe_gestor_email', corpo.email);
            mostrarGestor();
          }
          return true;
        })
        .catch(function () {
          var f = Registro.fila();
          f.push(corpo);
          Registro.guardarFila(f);
          return false;
        });
    },
    leitura: function (slug) {
      var email = Email.atual();
      if (!email) return;
      var chave = 'obe_reg_' + slug + '_' + email;
      if (sessao.ler(chave)) return;
      sessao.gravar(chave, '1');
      Registro.enviar({acao: 'acesso', email: email, ed: slug, ua: String(navigator.userAgent || '').slice(0, 300),
        tela: (screen.width | 0) + 'x' + (screen.height | 0)});
    },
    pendentes: function () {
      var f = Registro.fila();
      if (!f.length || !Registro.url()) return;
      Registro.guardarFila([]);
      f.forEach(function (c, i) { setTimeout(function () { Registro.enviar(c); }, 1500 + i * 400); });
    }
  };
  function mostrarGestor() {
    var g = local.ler('obe_gestor');
    var ok = g && RE_REGISTRO.test(g) && local.ler('obe_gestor_email') === Email.atual();
    $('mGestor').hidden = !ok;
    if (ok) $('mGestor').href = g;
  }

  /* =====================================================================
     O LIVRO (páginas que viram)
     ===================================================================== */
  var Livro = (function () {
    var livro = $('livro'), esq = $('ladoEsq'), dir = $('ladoDir'), folha = $('folha'),
      frente = $('faceFrente'), verso = $('faceVerso'), sombra = $('sombraBase');
    var man = null, n = 0, pag = 0, modo = 'unica', W = 0, H = 0, R = 1920 / 1357;
    var anim = null, gesto = null;
    var cache = {};
    var aoMudar = function () {};

    function base() { return 'dados/edicoes/' + man.slug + '/'; }
    function url(k) { return base() + man.paginas[k].arquivo; }

    function carregar(k) {
      if (!man || k < 0 || k >= n) return Promise.resolve(null);
      var c = cache[man.slug + k];
      if (c) return c.p;
      var img = new Image();
      img.decoding = 'async';
      img.alt = '';
      var p = new Promise(function (res) {
        img.onload = function () { (img.decode ? img.decode() : Promise.resolve()).catch(function () {}).then(function () { res(img); }); };
        img.onerror = function () { delete cache[man.slug + k]; res(null); };
      });
      img.src = url(k);
      cache[man.slug + k] = {p: p, img: img};
      return p;
    }
    function pronto(k) {
      var c = man && cache[man.slug + k];
      return !!(c && c.img.complete && c.img.naturalWidth);
    }
    function preCarregar() {
      var ordem = modo === 'dupla' ? [pag + 1, pag + 2, pag + 3, pag + 4, pag - 1, pag - 2] : [pag + 1, pag + 2, pag - 1, pag + 3];
      ordem.reduce(function (p, k) { return p.then(function () { return carregar(k); }); }, carregar(pag));
    }
    function miniatura(el, k) {
      if (!man.mini) return;
      el.style.backgroundImage = 'url("' + base() + man.mini + '")';
      el.style.backgroundSize = '100% ' + (n * 100) + '%';
      el.style.backgroundPosition = '0 ' + (n > 1 ? (k / (n - 1) * 100) : 0) + '%';
    }
    /** Uma página: miniatura (aparece na hora) e a imagem nítida por cima. */
    function pagina(k, comElos) {
      var d = document.createElement('div');
      d.className = 'pg';
      if (k < 0 || k >= n) return null;
      miniatura(d, k);
      var img = document.createElement('img');
      img.alt = 'Página ' + (k + 1) + (man.paginas[k].titulo ? ': ' + man.paginas[k].titulo : '');
      img.draggable = false;
      if (pronto(k)) img.className = 'ok';
      else carregar(k).then(function (x) { if (x) img.className = 'ok'; });
      img.src = url(k);
      d.appendChild(img);
      if (comElos) {
        man.paginas[k].links.forEach(function (l) {
          var b = document.createElement('a');
          b.className = 'elo';
          b.href = '#/' + man.slug + '/' + (l.ir + 1);
          b.setAttribute('aria-label', 'Ir para a página ' + (l.ir + 1) + (man.paginas[l.ir].titulo ? ': ' + man.paginas[l.ir].titulo : ''));
          b.style.left = l.x + '%';
          b.style.top = l.y + '%';
          b.style.width = l.w + '%';
          b.style.height = l.h + '%';
          d.appendChild(b);
        });
      }
      return d;
    }
    function papel() {
      var d = document.createElement('div');
      d.className = 'pg-papel';
      return d;
    }
    function colocar(alvo, el) {
      alvo.textContent = '';
      alvo.classList.toggle('vazio', !el);
      if (el) alvo.appendChild(el);
    }
    function colocarFace(face, el) {
      var luz = face.querySelector('.luz');
      face.textContent = '';
      if (el) face.appendChild(el);
      face.appendChild(luz);
    }

    /* ----- tamanho e modo (uma página ou página dupla) ----- */
    function medir() {
      var palco = $('palco');
      var cs = getComputedStyle(palco);
      var aw = palco.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var ah = palco.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (man && man.paginas[0]) R = man.paginas[0].w / man.paginas[0].h;
      var h1 = Math.min(ah, aw / R);
      var h2 = Math.min(ah, aw / (2 * R));
      /* página dupla só quando cada página ainda fica grande o bastante para ler (telas largas, 1920 px ou mais) */
      modo = (n > 2 && aw >= 1500 && h2 >= h1 * 0.64) ? 'dupla' : 'unica';
      H = Math.max(80, Math.floor(modo === 'dupla' ? h2 : h1));
      W = Math.floor(H * R * (modo === 'dupla' ? 2 : 1));
      livro.style.width = W + 'px';
      livro.style.height = H + 'px';
      livro.style.perspective = Math.round(H * R * 2.6) + 'px';
      livro.classList.toggle('dupla', modo === 'dupla');
      livro.classList.toggle('unica', modo === 'unica');
      folha.style.left = modo === 'dupla' ? '50%' : '0';
      folha.style.width = modo === 'dupla' ? '50%' : '100%';
    }

    function esqDir(k) {
      if (modo === 'unica') return [null, k];
      var s = Math.floor((k + 1) / 2);
      return [2 * s - 1, 2 * s];
    }
    function desenhar() {
      if (!man) return;
      var ld = esqDir(pag);
      if (modo === 'dupla') {
        var temE = ld[0] >= 0 && ld[0] < n, temD = ld[1] < n;
        colocar(esq, temE ? pagina(ld[0], true) : null);
        colocar(dir, temD ? pagina(ld[1], true) : null);
        livro.classList.toggle('so-dir', !temE);
        livro.classList.toggle('so-esq', !temD);
      } else {
        livro.classList.remove('so-dir', 'so-esq');
        colocar(dir, pagina(pag, true));
      }
      preCarregar();
      aoMudar(pag);
    }
    function alvoDe(d) {
      if (modo === 'unica') { var t = pag + d; return t >= 0 && t < n ? t : null; }
      var s = Math.floor((pag + 1) / 2) + d;
      if (s < 0 || s > Math.floor(n / 2)) return null;
      return s === 0 ? 0 : 2 * s - 1;
    }

    /* ----- a virada ----- */
    function preparar(d) {
      var alvo = alvoDe(d);
      if (alvo == null) return null;
      var v = {d: d, alvo: alvo};
      if (modo === 'unica') {
        if (d > 0) { colocarFace(frente, pagina(pag)); colocar(dir, pagina(alvo)); v.a0 = 0; v.a1 = -180; }
        else { colocarFace(frente, pagina(alvo)); v.a0 = -180; v.a1 = 0; }
        colocarFace(verso, papel());
      } else {
        var ld = esqDir(pag), L = ld[0], Rr = ld[1];
        if (d > 0) {
          colocarFace(frente, pagina(Rr));
          colocarFace(verso, pagina(Rr + 1));
          colocar(dir, pagina(Rr + 2));
          livro.classList.toggle('so-esq', !(Rr + 2 < n));
          v.a0 = 0; v.a1 = -180;
        } else {
          colocarFace(frente, pagina(L - 1));
          colocarFace(verso, pagina(L));
          colocar(esq, pagina(L - 2));
          livro.classList.toggle('so-dir', !(L - 2 >= 0));
          v.a0 = -180; v.a1 = 0;
        }
      }
      [frente, verso].forEach(function (f) { var a = f.querySelector('.elo'); if (a) a.remove(); });
      folha.hidden = false;
      aplicar(v.a0);
      return v;
    }
    function aplicar(a) {
      var t = -a / 180;
      var meio = Math.sin(t * Math.PI);
      folha.style.transform = 'rotateY(' + a.toFixed(2) + 'deg)';
      frente.style.setProperty('--sombra', (Math.min(1, t * 1.4)).toFixed(3));
      verso.style.setProperty('--sombra', (Math.min(1, (1 - t) * 1.4)).toFixed(3));
      var brilho = (meio * 0.6).toFixed(3), luzx = (-55 + 110 * t).toFixed(1) + '%';
      [frente, verso].forEach(function (f) { f.style.setProperty('--brilho', brilho); f.style.setProperty('--luzx', luzx); });
      folha.style.opacity = modo === 'unica' && t > 0.6 ? String(Math.max(0, 1 - (t - 0.6) / 0.4)) : '1';
      var frenteDir = !(modo === 'dupla' && t > 0.5);
      sombra.style.left = modo === 'dupla' ? (frenteDir ? '50%' : '0') : '0';
      sombra.style.width = modo === 'dupla' ? '50%' : '100%';
      sombra.style.background = frenteDir
        ? 'linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,0) ' + Math.round(20 + 60 * (1 - t)) + '%)'
        : 'linear-gradient(270deg, rgba(0,0,0,.45), rgba(0,0,0,0) ' + Math.round(20 + 60 * t) + '%)';
      sombra.style.opacity = (meio * 0.85).toFixed(3);
    }
    function suave(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function saida(x) { return 1 - Math.pow(1 - x, 3); }
    function tween(de, para, ms, curva) {
      return new Promise(function (res) {
        var t0 = performance.now();
        function passo(agora) {
          var x = Math.min(1, (agora - t0) / ms);
          aplicar(de + (para - de) * curva(x));
          if (x < 1) anim = requestAnimationFrame(passo); else { anim = null; res(); }
        }
        anim = requestAnimationFrame(passo);
      });
    }
    function concluir(v, completou) {
      folha.hidden = true;
      sombra.style.opacity = '0';
      if (completou) pag = v.alvo;
      desenhar();
    }
    function virar(d) {
      if (!man || anim || gesto) return;
      if (alvoDe(d) == null) return;
      if (reduzido) { pag = alvoDe(d); desenhar(); return; }
      var v = preparar(d);
      tween(v.a0, v.a1, 720, suave).then(function () { concluir(v, true); });
    }
    function irPara(k) {
      if (!man) return;
      k = Math.max(0, Math.min(n - 1, k | 0));
      if (anim) { cancelAnimationFrame(anim); anim = null; folha.hidden = true; }
      pag = k;
      desenhar();
    }

    /* ----- gestos: arrastar vira a página; toque nas bordas vira; toque no meio amplia ----- */
    function ligarGestos() {
      livro.addEventListener('pointerdown', function (e) {
        if (!man || anim || e.button > 0) return;
        if (e.target.closest && e.target.closest('.elo')) return;
        gesto = {x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId, v: null, p: 0, ult: [], bloqueado: false};
        try { livro.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
      });
      livro.addEventListener('pointermove', function (e) {
        if (!gesto || e.pointerId !== gesto.id) return;
        var dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0;
        if (!gesto.v && !gesto.bloqueado) {
          if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
          var d = dx < 0 ? 1 : -1;
          if (alvoDe(d) == null || reduzido) { gesto.bloqueado = true; return; }
          gesto.v = preparar(d);
        }
        if (!gesto.v) return;
        var largura = modo === 'dupla' ? W / 2 : W;
        gesto.p = Math.max(0, Math.min(1, (gesto.v.d > 0 ? -dx : dx) / (largura * 1.1)));
        aplicar(gesto.v.a0 + (gesto.v.a1 - gesto.v.a0) * gesto.p);
        gesto.ult.push([performance.now(), dx]);
        if (gesto.ult.length > 5) gesto.ult.shift();
      });
      function soltar(e) {
        if (!gesto || e.pointerId !== gesto.id) return;
        var g = gesto;
        gesto = null;
        var dx = e.clientX - g.x0, dt = performance.now() - g.t0;
        if (g.v) {
          var vel = 0;
          if (g.ult.length > 1) { var a = g.ult[0], b = g.ult[g.ult.length - 1]; vel = (b[1] - a[1]) / Math.max(1, b[0] - a[0]); }
          var aFavor = g.v.d > 0 ? -vel : vel;
          var completa = g.p > 0.33 || (aFavor > 0.45 && g.p > 0.1);
          var atual = g.v.a0 + (g.v.a1 - g.v.a0) * g.p;
          var resto = completa ? 1 - g.p : g.p;
          tween(atual, completa ? g.v.a1 : g.v.a0, Math.max(160, 520 * resto), saida).then(function () { concluir(g.v, completa); });
          return;
        }
        if (g.bloqueado || Math.abs(dx) > 10 || dt > 450 || e.type === 'pointercancel') return;
        var r = livro.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        if (x < 0.32) virar(-1);
        else if (x > 0.68) virar(1);
        else Lupa.abrir(modo === 'dupla' ? (x < 0.5 ? esqDir(pag)[0] : esqDir(pag)[1]) : pag, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }
      livro.addEventListener('pointerup', soltar);
      livro.addEventListener('pointercancel', soltar);
      livro.addEventListener('mousemove', function (e) {
        var r = livro.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        livro.style.cursor = e.target.closest('.elo') ? 'pointer' : (x < 0.32 && alvoDe(-1) != null) || (x > 0.68 && alvoDe(1) != null) ? 'pointer' : (x >= 0.32 && x <= 0.68 ? 'zoom-in' : 'default');
      });
    }
    ligarGestos();

    function abrir(m, k) {
      man = m;
      n = m.paginas.length;
      pag = Math.max(0, Math.min(n - 1, k | 0));
      folha.hidden = true;
      medir();
      desenhar();
    }
    return {
      abrir: abrir, virar: virar, irPara: irPara,
      remedir: function () { if (man && !anim && !gesto) { medir(); desenhar(); } },
      pag: function () { return pag; }, total: function () { return n; }, modo: function () { return modo; },
      paginasVisiveis: function () { var ld = esqDir(pag); return modo === 'dupla' ? [ld[0], ld[1]].filter(function (k) { return k >= 0 && k < n; }) : [pag]; },
      podeVoltar: function () { return alvoDe(-1) != null; }, podeAvancar: function () { return alvoDe(1) != null; },
      url: function (k) { return url(k); }, miniatura: function (el, k) { miniatura(el, k); },
      aoMudar: function (fn) { aoMudar = fn; }
    };
  })();

  /* =====================================================================
     LUPA (página ampliada)
     ===================================================================== */
  var Lupa = {
    abrir: function (k, fx, fy) {
      if (!E.man || k == null || k < 0) return;
      var lp = $('lupa'), img = $('lpImg'), rolo = $('lpRolo');
      var largura = Math.max(window.innerWidth, Math.min(E.man.paginas[k].w, window.innerWidth * 2));
      img.style.width = largura + 'px';
      img.alt = 'Página ' + (k + 1) + ' ampliada';
      img.src = Livro.url(k);
      Camadas.abrir(lp);
      var alt = largura / (E.man.paginas[k].w / E.man.paginas[k].h);
      rolo.scrollLeft = Math.max(0, largura * (fx || 0.5) - window.innerWidth / 2);
      rolo.scrollTop = Math.max(0, alt * (fy || 0.5) - window.innerHeight / 2);
      var x0 = 0, y0 = 0;
      rolo.onpointerdown = function (e) { x0 = e.clientX; y0 = e.clientY; };
      rolo.onclick = function (e) { if (Math.abs(e.clientX - x0) < 6 && Math.abs(e.clientY - y0) < 6) Camadas.fechar(); };
    }
  };

  /* =====================================================================
     CAMADAS (gaveta, grade, lupa, menu): uma de cada vez, Esc fecha
     ===================================================================== */
  var Camadas = (function () {
    var aberta = null, voltarFoco = null;
    function abrir(el) {
      fechar();
      voltarFoco = document.activeElement;
      el.hidden = false;
      aberta = el;
      var foco = el.querySelector('[aria-current=true] button, [aria-current=true], .fechar, button');
      if (foco) setTimeout(function () { try { foco.focus(); } catch (e) { /* ok */ } }, 30);
    }
    function fechar() {
      if (!aberta) return;
      aberta.hidden = true;
      if (aberta === $('menu')) $('btMenu').setAttribute('aria-expanded', 'false');
      aberta = null;
      if (voltarFoco && voltarFoco.focus) try { voltarFoco.focus(); } catch (e) { /* ok */ }
    }
    document.addEventListener('click', function (e) {
      if (!aberta) return;
      if (e.target.closest('[data-fechar]') || e.target === aberta) { fechar(); return; }
      if (aberta === $('menu') && !e.target.closest('#menu') && !e.target.closest('#btMenu')) fechar();
    });
    return {abrir: abrir, fechar: fechar, aberta: function () { return aberta; }};
  })();

  /* =====================================================================
     TELA DO LEITOR
     ===================================================================== */
  function rota() {
    var m = /^#\/(\d{4})(?:\/(\d{1,3}))?\/?$/.exec(location.hash || '');
    return m ? {slug: m[1], pag: m[2] ? (parseInt(m[2], 10) - 1) : 0} : null;
  }
  function rotular() {
    var n = Livro.total(), vis = Livro.paginasVisiveis();
    var txt = vis.length === 2 ? (vis[0] + 1) + ' e ' + (vis[1] + 1) + ' de ' + n : (vis[0] + 1) + ' de ' + n;
    $('contador').textContent = txt;
    var tr = $('trilha');
    tr.max = String(n);
    tr.value = String(Livro.pag() + 1);
    tr.style.setProperty('--p', (n > 1 ? Livro.pag() / (n - 1) * 100 : 100) + '%');
    $('btAnt').disabled = !Livro.podeVoltar();
    $('btProx').disabled = !Livro.podeAvancar();
    var p = E.man.paginas[vis[0]];
    $('livro').setAttribute('aria-label', 'Página ' + txt + (p && p.titulo ? ': ' + p.titulo : ''));
    var hash = '#/' + E.man.slug + (Livro.pag() ? '/' + (Livro.pag() + 1) : '');
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  Livro.aoMudar(rotular);

  function avisoPalco(html, botao) {
    var a = $('avisoPalco');
    a.innerHTML = html;
    if (botao) {
      var b = document.createElement('button');
      b.className = 'botao';
      b.textContent = botao.texto;
      b.onclick = botao.fn;
      a.appendChild(b);
    }
    a.hidden = false;
    $('livro').hidden = true;
  }

  var pedidoAtual = 0;
  function abrirEdicao(slug, k) {
    var ed = E.lista.filter(function (x) { return x.slug === slug; })[0];
    if (!ed) {
      if (E.lista.length) { history.replaceState(null, '', '#/' + E.lista[0].slug); abrirEdicao(E.lista[0].slug, 0); }
      return;
    }
    if (E.man && E.man.slug === slug) { Livro.irPara(k); return; }
    var meu = ++pedidoAtual;
    $('edAtual').textContent = rotuloEdicao(ed);
    var p = E.manifestos[slug] || lerJson('dados/edicoes/' + slug + '/manifesto.json?v=' + encodeURIComponent(ed.paginas + '-' + slug)).then(function (m) {
      var v = validarManifesto(m, slug);
      E.manifestos[slug] = Promise.resolve(v);
      return v;
    });
    p.then(function (man) {
      if (meu !== pedidoAtual) return;
      E.man = man;
      $('avisoPalco').hidden = true;
      $('livro').hidden = false;
      document.title = rotuloEdicao(ed) + ' — O Brilho da Espada';
      Livro.abrir(man, k);
      Registro.leitura(slug);
      if (!local.ler('obe_dica') && window.innerWidth < 700 && window.innerHeight > window.innerWidth) {
        local.gravar('obe_dica', '1');
        setTimeout(function () { aviso('Dica: gire o celular para ver a página maior, ou toque no meio da página para ampliar.', 7000); }, 900);
      }
    }).catch(function () {
      if (meu !== pedidoAtual) return;
      avisoPalco('<b>Não foi possível abrir esta edição.</b><span>Confira a internet e tente de novo.</span>',
        {texto: 'Tentar de novo', fn: function () { delete E.manifestos[slug]; E.man = null; abrirEdicao(slug, k); }});
    });
  }
  function seguirRota() {
    var r = rota();
    if (!E.lista.length) return;
    if (!r) { abrirEdicao(E.lista[0].slug, 0); return; }
    abrirEdicao(r.slug, r.pag);
  }

  /* ----- edições ----- */
  function abrirGaveta() {
    var ol = $('gvLista');
    ol.textContent = '';
    E.lista.forEach(function (ed) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gv-item';
      if (E.man && E.man.slug === ed.slug) b.setAttribute('aria-current', 'true');
      var mini = document.createElement('span');
      mini.className = 'miniatura';
      mini.style.backgroundImage = 'url("' + ed.mini + '")';
      mini.style.backgroundSize = '100% ' + (ed.paginas * 100) + '%';
      mini.style.backgroundPosition = '0 0';
      var txt = document.createElement('span');
      var t1 = document.createElement('span'); t1.className = 'gv-num'; t1.textContent = 'Edição nº ' + numero(ed.slug);
      var t2 = document.createElement('span'); t2.className = 'gv-mes'; t2.textContent = (mesExtenso(ed.mesNome) || '') + (ed.paginas ? (mesExtenso(ed.mesNome) ? ', ' : '') + ed.paginas + ' páginas' : '');
      txt.appendChild(t1); txt.appendChild(t2);
      if (E.man && E.man.slug === ed.slug) { var t3 = document.createElement('span'); t3.className = 'gv-lendo'; t3.textContent = 'Você está lendo esta'; txt.appendChild(t3); }
      b.appendChild(mini); b.appendChild(txt);
      b.onclick = function () { Camadas.fechar(); location.hash = '#/' + ed.slug; };
      li.appendChild(b);
      ol.appendChild(li);
    });
    Camadas.abrir($('gaveta'));
  }
  /* ----- todas as páginas ----- */
  function abrirGrade() {
    if (!E.man) return;
    var ol = $('grLista');
    ol.textContent = '';
    var vis = Livro.paginasVisiveis();
    E.man.paginas.forEach(function (p, k) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gr-item';
      if (vis.indexOf(k) >= 0) b.setAttribute('aria-current', 'true');
      var mini = document.createElement('span');
      mini.className = 'miniatura';
      Livro.miniatura(mini, k);
      var r = document.createElement('span');
      r.className = 'gr-rotulo';
      var num = document.createElement('b');
      num.textContent = String(k + 1);
      r.appendChild(num);
      r.appendChild(document.createTextNode(p.titulo || ''));
      b.appendChild(mini); b.appendChild(r);
      b.onclick = function () { Camadas.fechar(); Livro.irPara(k); };
      li.appendChild(b);
      ol.appendChild(li);
    });
    Camadas.abrir($('grade'));
  }

  /* ----- PDF (montado aqui no aparelho, a partir das páginas publicadas) ----- */
  var gerandoPdf = false;
  function carregarScript(src) {
    return new Promise(function (res, rej) {
      if (window.jspdf) { res(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('script')); };
      document.head.appendChild(s);
    });
  }
  function baixarPdf() {
    if (!E.man || gerandoPdf) return;
    gerandoPdf = true;
    var man = E.man, n = man.paginas.length;
    $('btPdf').disabled = true;
    aviso('Preparando o PDF…', 60000);
    carregarScript('assets/vendor/jspdf.umd.min.js').then(function () {
      var doc = new window.jspdf.jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4', compress: true});
      var k = 0;
      function proxima() {
        if (k >= n) return Promise.resolve();
        aviso('Preparando o PDF: página ' + (k + 1) + ' de ' + n, 60000);
        return fetch('dados/edicoes/' + man.slug + '/' + man.paginas[k].arquivo).then(function (r) {
          if (!r.ok) throw new Error('img');
          return r.arrayBuffer();
        }).then(function (buf) {
          if (k > 0) doc.addPage('a4', 'landscape');
          doc.addImage(new Uint8Array(buf), 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
          man.paginas[k].links.forEach(function (l) {
            doc.link(l.x * 2.97, l.y * 2.1, l.w * 2.97, l.h * 2.1, {pageNumber: l.ir + 1});
          });
          k++;
          return proxima();
        });
      }
      return proxima().then(function () {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(doc.output('blob'));
        /* nome sem acentos: alguns navegadores trocam nomes acentuados por "download" */
        a.download = ('O Brilho da Espada - Edicao ' + man.slug + (man.mesNome ? ' - ' + man.mesNome : '') + '.pdf')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ._-]/g, '');
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        aviso('PDF pronto. Confira a pasta de downloads.', 4000);
      });
    }).catch(function () {
      aviso('Não foi possível gerar o PDF. Confira a internet e tente de novo.', 5000);
    }).then(function () {
      gerandoPdf = false;
      $('btPdf').disabled = false;
    });
  }
  function compartilhar() {
    var url = location.href.split('#')[0] + (E.man ? '#/' + E.man.slug + (Livro.pag() ? '/' + (Livro.pag() + 1) : '') : '');
    var titulo = E.man ? rotuloEdicao(E.lista.filter(function (x) { return x.slug === E.man.slug; })[0] || E.man) + ' — O Brilho da Espada' : 'O Brilho da Espada';
    if (navigator.share) {
      navigator.share({title: titulo, url: url}).catch(function () {});
      return;
    }
    var ok = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { aviso('Link copiado.'); }, function () { aviso(url, 6000); });
      ok = true;
    }
    if (!ok) aviso(url, 6000);
  }
  function telaCheia() {
    var d = document;
    if (d.fullscreenElement) { d.exitFullscreen().catch(function () {}); return; }
    if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(function () {});
  }
  function trocarEmail() {
    Camadas.fechar();
    local.gravar('obe_email', null);
    $('mGestor').hidden = true;
    Email.pedir().then(function () {
      mostrarGestor();
      if (E.man) { var s = E.man.slug; Registro.leitura(s); }
    });
  }

  function ligarTela() {
    $('btAnt').onclick = function () { Livro.virar(-1); };
    $('btProx').onclick = function () { Livro.virar(1); };
    $('btEdicoes').onclick = abrirGaveta;
    $('btPaginas').onclick = abrirGrade;
    $('btPdf').onclick = baixarPdf;
    $('btCompartilhar').onclick = compartilhar;
    $('btTela').onclick = telaCheia;
    if (!document.fullscreenEnabled) {
      $('btTela').hidden = true;
      var mt = document.querySelector('[data-m=tela]');
      if (mt) mt.remove();
    }
    $('btMenu').onclick = function (e) {
      e.stopPropagation();
      if (Camadas.aberta() === $('menu')) { Camadas.fechar(); return; }
      Camadas.abrir($('menu'));
      $('btMenu').setAttribute('aria-expanded', 'true');
    };
    $('menu').addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]');
      if (!b) return;
      var acao = b.getAttribute('data-m');
      Camadas.fechar();
      if (acao === 'pdf') baixarPdf();
      else if (acao === 'compartilhar') compartilhar();
      else if (acao === 'tela') telaCheia();
      else if (acao === 'email') trocarEmail();
    });
    var tr = $('trilha');
    tr.addEventListener('input', function () {
      tr.style.setProperty('--p', (tr.max > 1 ? (tr.value - 1) / (tr.max - 1) * 100 : 100) + '%');
      $('contador').textContent = tr.value + ' de ' + tr.max;
    });
    tr.addEventListener('change', function () { Livro.irPara(parseInt(tr.value, 10) - 1); });
    window.addEventListener('hashchange', seguirRota);
    document.addEventListener('keydown', function (e) {
      if ($('leitor').hidden) return;
      if (e.key === 'Escape') { Camadas.fechar(); return; }
      if (Camadas.aberta() && Camadas.aberta() !== $('menu')) return;
      var alvo = e.target;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); Livro.virar(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); Livro.virar(-1); }
      else if (e.key === 'Home') { e.preventDefault(); Livro.irPara(0); }
      else if (e.key === 'End') { e.preventDefault(); Livro.irPara(Livro.total() - 1); }
    });
    var tRes = null;
    window.addEventListener('resize', function () { clearTimeout(tRes); tRes = setTimeout(Livro.remedir, 120); });
  }

  /* =====================================================================
     INÍCIO
     ===================================================================== */
  function mostrarLeitor() {
    var l = $('leitor');
    l.hidden = false;
    l.classList.add('entrando');
    document.body.classList.remove('carregando');
  }
  function iniciar() {
    ligarTela();
    var dados = pedidoDados.then(function (d) {
      E.site = d[0] || {};
      E.lista = d[1] || [];
      return true;
    }, function () { return false; });
    abertura().then(function () { return dados; }).then(function (ok) {
      var email = Email.atual();
      return (email ? Promise.resolve(email) : Email.pedir()).then(function () { return ok; });
    }).then(function (ok) {
      mostrarLeitor();
      mostrarGestor();
      if (!ok) {
        avisoPalco('<b>Não foi possível carregar o jornal.</b><span>Confira a internet e tente de novo.</span>', {texto: 'Tentar de novo', fn: function () { location.reload(); }});
        return;
      }
      if (!E.lista.length) {
        avisoPalco('<b>Nenhuma edição publicada ainda.</b><span>Volte em breve.</span>');
        $('btEdicoes').disabled = true;
        $('btPaginas').disabled = true;
        $('btPdf').disabled = true;
        return;
      }
      seguirRota();
      Registro.pendentes();
    });
  }
  iniciar();
})();
