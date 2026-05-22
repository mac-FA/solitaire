/* =====================================================================
 * App-Schale: Menü, Routing, Settings (Dark/Light, Vollbild), Timer
 * ===================================================================*/

(function () {
  'use strict';

  const STORAGE = {
    theme: 'sol.theme',
    klondike: 'sol.klondike',
    spider: 'sol.spider'
  };

  const elMenu = document.getElementById('menu');
  const elGame = document.getElementById('game');
  const elBoard = document.getElementById('board');
  const elTitle = document.getElementById('game-title');
  const elSub = document.getElementById('game-sub');
  const elMoves = document.getElementById('stat-moves');
  const elTime = document.getElementById('stat-time');

  let game = null;
  let timer = null;

  // ---- Theme ---------------------------------------------------------
  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', theme === 'light' ? '#2f7a5d' : '#0f3d2e');
    try { localStorage.setItem(STORAGE.theme, theme); } catch (_) {}
  }
  function toggleTheme() {
    const cur = document.body.dataset.theme || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }
  applyTheme((() => { try { return localStorage.getItem(STORAGE.theme) || 'dark'; } catch (_) { return 'dark'; } })());

  // ---- Fullscreen -----------------------------------------------------
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) { /* ignorieren */ }
  }

  // ---- Optionen-Dialog -----------------------------------------------
  function loadVariantOpts(variant) {
    try {
      const v = localStorage.getItem('sol.' + variant);
      return v ? JSON.parse(v) : {};
    } catch (_) { return {}; }
  }
  function saveVariantOpts(variant, opts) {
    try { localStorage.setItem('sol.' + variant, JSON.stringify(opts)); } catch (_) {}
  }

  function showOptions(variant, defaults, render, onStart) {
    const overlay = document.getElementById('opts-overlay');
    const title = document.getElementById('opts-title');
    const body = document.getElementById('opts-body');
    const start = document.getElementById('btn-opts-start');
    const cancel = document.getElementById('btn-opts-cancel');
    const current = Object.assign({}, defaults, loadVariantOpts(variant));

    const variantTitles = {
      klondike: 'Klondike — Optionen',
      spider: 'Spider — Optionen',
      freecell: 'FreeCell',
      pyramid: 'Pyramide'
    };
    title.textContent = variantTitles[variant];
    body.innerHTML = render(current);

    function refresh() { body.innerHTML = render(current); attach(); }
    function attach() {
      body.querySelectorAll('.choices').forEach(group => {
        const key = group.dataset.key;
        group.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', () => {
            const val = btn.dataset.val;
            current[key] = isNaN(+val) ? val : +val;
            refresh();
          });
        });
      });
    }
    attach();

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    const close = () => {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      start.removeEventListener('click', onStartClick);
      cancel.removeEventListener('click', close);
    };
    const onStartClick = () => {
      saveVariantOpts(variant, current);
      close();
      onStart(current);
    };
    start.addEventListener('click', onStartClick);
    cancel.addEventListener('click', close);
  }

  // ---- Spiel starten -------------------------------------------------
  function startGame(variant, opts) {
    if (game && game.destroy) game.destroy();

    const map = { klondike: window.Klondike, spider: window.Spider, freecell: window.FreeCell, pyramid: window.Pyramid };
    const Klass = map[variant];
    if (!Klass) return;
    game = new Klass(opts || {});

    elTitle.textContent = game.title();
    elSub.textContent = game.subtitle();

    game.onChange = ({ moves }) => { elMoves.textContent = moves; };
    game.onWin = () => {
      timer && timer.stop();
      const ms = timer ? timer.elapsed() : 0;
      const txt = `Züge: ${elMoves.textContent} · Zeit: ${Cards.formatTime(ms)}`;
      Cards.celebrateWin(txt);
    };

    elMenu.classList.add('hidden');
    elGame.classList.remove('hidden');
    elGame.setAttribute('aria-hidden', 'false');

    // Setup nach dem Sichtbarmachen (für korrekte Maße)
    requestAnimationFrame(() => {
      elBoard.style.minHeight = '';  // alte Layouthöhe verwerfen
      elBoard.scrollTop = 0;
      elBoard.scrollLeft = 0;
      game.setup(elBoard);

      // Timer
      if (timer) timer.stop();
      timer = Cards.makeTimer((ms) => { elTime.textContent = Cards.formatTime(ms); });
      timer.reset();
      timer.start();
    });
  }

  function backToMenu() {
    if (game && game.destroy) { game.destroy(); game = null; }
    if (timer) { timer.stop(); timer = null; }
    elGame.classList.add('hidden');
    elGame.setAttribute('aria-hidden', 'true');
    elMenu.classList.remove('hidden');
    Cards.hideWin();
  }

  // ---- Menü-Buttons --------------------------------------------------
  document.querySelectorAll('.variant-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.variant;
      if (v === 'klondike') {
        showOptions(v, { draw: 1 }, window.Klondike.optsUI, (opts) => startGame(v, opts));
      } else if (v === 'spider') {
        showOptions(v, { suits: 1 }, window.Spider.optsUI, (opts) => startGame(v, opts));
      } else if (v === 'freecell') {
        startGame(v, {});
      } else if (v === 'pyramid') {
        startGame(v, {});
      }
    });
  });

  // Theme + Fullscreen
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-theme2').addEventListener('click', toggleTheme);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.getElementById('btn-fs2').addEventListener('click', toggleFullscreen);

  // Spiel-Bar
  document.getElementById('btn-back').addEventListener('click', backToMenu);
  document.getElementById('btn-undo').addEventListener('click', () => { game && game.doUndo && game.doUndo(); });
  document.getElementById('btn-new').addEventListener('click', () => {
    if (!game) return;
    const variant = (game instanceof window.Klondike) ? 'klondike'
                  : (game instanceof window.Spider) ? 'spider'
                  : (game instanceof window.FreeCell) ? 'freecell'
                  : 'pyramid';
    // Behalte aktuelle Optionen
    const opts = loadVariantOpts(variant);
    startGame(variant, opts);
  });

  // Win-Overlay
  document.getElementById('btn-win-new').addEventListener('click', () => {
    Cards.hideWin();
    document.getElementById('btn-new').click();
  });
  document.getElementById('btn-win-menu').addEventListener('click', () => {
    Cards.hideWin();
    backToMenu();
  });

  // Resize -> layout neu
  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (game && game.layout) game.layout(false); }, 80);
  });

  // Tastenkürzel
  window.addEventListener('keydown', (e) => {
    if (elGame.classList.contains('hidden')) return;
    if (e.key === 'Escape') backToMenu();
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U') {
      game && game.doUndo && game.doUndo();
    } else if (e.key === 'n' || e.key === 'N') {
      document.getElementById('btn-new').click();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
  });

})();
