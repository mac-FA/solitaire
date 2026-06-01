/* =====================================================================
 * Solitaire — Kern-Engine
 * Karten, Render, Drag, Animation, Layout, Undo
 * ===================================================================*/

(function (global) {
  'use strict';

  // ---- Karten-Konstanten ------------------------------------------------
  const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANK_SYM = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const RED = { H: 1, D: 1 };

  function rankSym(r) {
    return RANK_SYM[r] || String(r);
  }
  function isRed(suit) { return !!RED[suit]; }
  function color(suit) { return isRed(suit) ? 'red' : 'black'; }

  // ---- Karte ------------------------------------------------------------
  let cardIdCounter = 0;
  class Card {
    constructor(rank, suit) {
      this.id = ++cardIdCounter;
      this.rank = rank;
      this.suit = suit;
      this.faceUp = false;
      this.el = null;
      this.x = 0; this.y = 0;
      this.z = 0;
    }
    get red() { return isRed(this.suit); }
    get colorClass() { return this.red ? 'red' : 'black'; }
  }

  // ---- Decks ------------------------------------------------------------
  function makeDeck(decks = 1, suits = SUITS) {
    const out = [];
    for (let d = 0; d < decks; d++) {
      for (const s of suits) {
        for (let r = 1; r <= 13; r++) out.push(new Card(r, s));
      }
    }
    return out;
  }

  // Spider mit reduzierten Farben: gleiche Karte mehrfach
  function makeSpiderDeck(suitCount) {
    // 104 Karten, 2 Decks
    const suits = suitCount === 1 ? ['S']
                : suitCount === 2 ? ['S', 'H']
                : SUITS;
    const out = [];
    // Wir wollen genau 104 Karten = 8 * 13
    // 1 Farbe: 8 mal das gleiche Deck einer Farbe
    // 2 Farben: 4 mal je 13 Karten pro Farbe
    // 4 Farben: 2 mal je 13 Karten pro Farbe
    const copiesPerSuit = 8 / suits.length;
    for (let c = 0; c < copiesPerSuit; c++) {
      for (const s of suits) {
        for (let r = 1; r <= 13; r++) out.push(new Card(r, s));
      }
    }
    return out;
  }

  function shuffle(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---- DOM-Helper -------------------------------------------------------
  function renderCardEl(card) {
    const el = document.createElement('div');
    el.className = 'card ' + card.colorClass + (card.faceUp ? '' : ' face-down');
    el.dataset.cardId = card.id;
    if (card.faceUp) drawFace(el, card);
    card.el = el;
    return el;
  }

  function drawFace(el, card) {
    el.classList.remove('face-down');
    el.classList.add(card.colorClass);
    el.innerHTML = '';
    const r = rankSym(card.rank);
    const s = SUIT_SYM[card.suit];
    const tl = document.createElement('div');
    tl.className = 'corner tl';
    tl.innerHTML = `<span class="r">${r}</span><span class="s">${s}</span>`;
    const br = document.createElement('div');
    br.className = 'corner br';
    br.innerHTML = `<span class="r">${r}</span><span class="s">${s}</span>`;
    const pip = document.createElement('div');
    pip.className = 'pip';
    pip.textContent = s;
    el.appendChild(tl);
    el.appendChild(br);
    el.appendChild(pip);
  }

  function setFaceUp(card, up) {
    card.faceUp = up;
    if (!card.el) return;
    if (up) {
      drawFace(card.el, card);
    } else {
      card.el.classList.add('face-down');
      card.el.classList.remove('red', 'black');
      card.el.innerHTML = '';
    }
  }

  function placeCard(card, x, y, z, animate = true) {
    if (!card.el) return;
    if (!animate) card.el.classList.add('no-anim');
    card.x = x; card.y = y; card.z = z;
    card.el.style.left = x + 'px';
    card.el.style.top = y + 'px';
    card.el.style.zIndex = String(z);
    if (!animate) {
      // force reflow then remove
      void card.el.offsetWidth;
      card.el.classList.remove('no-anim');
    }
  }

  // ---- Layout-Maße ------------------------------------------------------
  function metrics(boardEl) {
    const target = boardEl || document.getElementById('board') || document.documentElement;
    const cs = getComputedStyle(target);
    const w = parseFloat(cs.getPropertyValue('--card-w'));
    const h = parseFloat(cs.getPropertyValue('--card-h'));
    const gap = parseFloat(cs.getPropertyValue('--gap'));
    return { w, h, gap, fanDown: Math.round(h * 0.28), fanDownTight: Math.round(h * 0.18), fanUp: Math.round(h * 0.18) };
  }

  const CARD_RATIO = 110 / 78; // h/w

  /**
   * Berechnet die optimale Kartengröße für die aktuelle Board-Größe und
   * setzt --card-w / --card-h direkt auf dem Board. Es wird das Minimum
   * aus Breiten- und (optionaler) Höhen-Beschränkung gewählt — so passt
   * der Anfangsdeal auch auf niedrigen Laptop-Screens, ohne zu scrollen.
   *
   *  mode:
   *    'tableau': columns Karten + (columns-1) Lücken nebeneinander
   *    'pyramid': 7-Karten-Basis mit 0.55*w Step (Gesamtbreite 4.3*w)
   *  opts.minW, opts.maxW  — Breiten-Caps.
   *  opts.vCap             — Anzahl voll gefächerter Karten, die in der
   *                          Höhe Platz finden sollen (aktiviert Höhen-Cap).
   *  opts.vTopRows         — volle Kartenhöhen oberhalb des Tableaus.
   *  opts.vReserveRows     — volle Kartenhöhen, die unten frei bleiben (z. B. Stock).
   *  opts.vFanRatio        — Fächer-Schritt relativ zur Kartenhöhe (Default 0.30).
   */
  function fitCardSize(boardEl, mode, columns, opts = {}) {
    const boardW = boardEl.clientWidth;
    const boardH = boardEl.clientHeight;
    if (!boardW) return;
    const baseGap = parseFloat(getComputedStyle(boardEl).getPropertyValue('--gap')) || 14;

    // --- Breiten-Beschränkung ---
    let wWidth;
    if (mode === 'pyramid') {
      wWidth = Math.floor((boardW - 2 * baseGap) / 4.3);
    } else {
      wWidth = Math.floor((boardW - 2 * baseGap - (columns - 1) * baseGap) / columns);
    }

    // --- Höhen-Beschränkung (optional) ---
    let wHeight = Infinity;
    if (opts.vCap && boardH) {
      const fan = opts.vFanRatio || 0.30;
      const topRows = opts.vTopRows || 0;
      const reserveRows = opts.vReserveRows || 0;
      // Vertikales Budget (px), das nicht von Kartenhöhe abhängt:
      const constV = baseGap * (2 + topRows + reserveRows) + (topRows > 0 ? 14 : 0);
      // Gesamthöhe = constV + h * heightFactor
      const heightFactor = topRows + reserveRows + (1 + fan * (opts.vCap - 1));
      const hMax = (boardH - constV) / heightFactor;
      wHeight = Math.floor(hMax / CARD_RATIO);
    }

    const minW = opts.minW || 48;
    const maxW = opts.maxW || 150;
    let w = Math.min(wWidth, wHeight);
    w = Math.max(minW, Math.min(maxW, w));
    const h = Math.round(w * CARD_RATIO);
    boardEl.style.setProperty('--card-w', w + 'px');
    boardEl.style.setProperty('--card-h', h + 'px');
  }

  /**
   * Adaptive Fächer-Stauchung: gibt die Schritt-Höhen (offen / verdeckt)
   * für eine Tableau-Spalte zurück, so dass sie möglichst in `availH`
   * passt. Lange Spalten überlappen automatisch enger, statt unten
   * rauszulaufen. Untergrenzen halten die Indizes lesbar.
   */
  function fanSteps(pile, h, availH) {
    const upBase = Math.round(h * 0.30);
    const downBase = Math.round(h * 0.16);
    const N = pile.length;
    if (N <= 1) return { up: upBase, down: downBase };
    let sum = 0;
    for (let i = 0; i < N - 1; i++) sum += pile[i].faceUp ? upBase : downBase;
    const natural = h + sum;
    if (!isFinite(availH) || natural <= availH || sum <= 0) {
      return { up: upBase, down: downBase };
    }
    const scale = (availH - h) / sum;
    // Untergrenzen: offene Karte zeigt weiterhin den Index-Streifen.
    const up = Math.max(Math.round(h * 0.34), Math.floor(upBase * scale));
    const down = Math.max(Math.round(h * 0.09), Math.floor(downBase * scale));
    return { up, down };
  }

  /** Linker Start-X, der eine Reihe aus `columns` Karten horizontal zentriert. */
  function centerStart(boardEl, columns) {
    const m = metrics(boardEl);
    const total = columns * m.w + (columns - 1) * m.gap;
    return Math.max(m.gap, Math.round((boardEl.clientWidth - total) / 2));
  }

  // ---- Drag / Pointer-Engine -------------------------------------------
  /**
   * Game-API erwartet:
   *   onPickup(card) -> { cards:[Card], from:object } | null
   *   onDrop(payload, x, y) -> bool   (Drop akzeptiert?)
   *   onTap(card) -> void              (Klick ohne Drag)
   *   onTapEmpty() -> void
   */
  function attachPointer(boardEl, api) {
    let dragging = null;
    // dragging = { payload, offsets:[{dx,dy}], startPos:[{x,y,z}], startX, startY, moved }

    function findCardEl(target) {
      while (target && target !== boardEl) {
        if (target.classList && target.classList.contains('card')) return target;
        target = target.parentElement;
      }
      return null;
    }

    boardEl.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const cardEl = findCardEl(e.target);
      if (!cardEl) {
        api.onTapEmpty && api.onTapEmpty(e);
        return;
      }
      const cardId = parseInt(cardEl.dataset.cardId, 10);
      const card = api.getCard(cardId);
      if (!card) return;

      const pickup = api.onPickup ? api.onPickup(card) : null;
      // Erlaubt "Tap-Only"-Karten (kein Drag, aber Klick)
      const rect = boardEl.getBoundingClientRect();
      const px = e.clientX - rect.left + boardEl.scrollLeft;
      const py = e.clientY - rect.top + boardEl.scrollTop;

      if (!pickup) {
        // Klick auf nicht-draggbare Karte: merken, evtl. als Tap behandeln
        dragging = { tapOnly: true, card, startX: px, startY: py, moved: false, startTime: performance.now() };
        try { boardEl.setPointerCapture(e.pointerId); } catch(_) {}
        return;
      }

      const cards = pickup.cards;
      const offsets = cards.map(c => ({ dx: c.x - px, dy: c.y - py }));
      const startPos = cards.map(c => ({ x: c.x, y: c.y, z: c.z }));
      for (const c of cards) {
        c.el.classList.add('dragging');
        c.el.style.zIndex = String(10000 + cards.indexOf(c));
      }
      dragging = { payload: pickup, cards, offsets, startPos, startX: px, startY: py, moved: false, card, startTime: performance.now() };
      try { boardEl.setPointerCapture(e.pointerId); } catch(_) {}
    });

    boardEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = boardEl.getBoundingClientRect();
      const px = e.clientX - rect.left + boardEl.scrollLeft;
      const py = e.clientY - rect.top + boardEl.scrollTop;
      const dx = px - dragging.startX, dy = py - dragging.startY;
      if (!dragging.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) dragging.moved = true;
      if (dragging.tapOnly) return;
      if (!dragging.moved) return;
      for (let i = 0; i < dragging.cards.length; i++) {
        const c = dragging.cards[i];
        const o = dragging.offsets[i];
        c.el.style.left = (px + o.dx) + 'px';
        c.el.style.top = (py + o.dy) + 'px';
      }
      api.onDragMove && api.onDragMove(px, py, dragging.payload);
    });

    function endDrag(e) {
      if (!dragging) return;
      const cur = dragging;
      dragging = null;
      try { boardEl.releasePointerCapture(e.pointerId); } catch(_) {}

      if (cur.tapOnly) {
        if (!cur.moved) api.onTap && api.onTap(cur.card, e);
        return;
      }

      if (!cur.moved) {
        // Tap auf draggbare Karte: erst Position zurück, dann Tap
        for (let i = 0; i < cur.cards.length; i++) {
          const c = cur.cards[i];
          c.el.classList.remove('dragging');
          placeCard(c, cur.startPos[i].x, cur.startPos[i].y, cur.startPos[i].z, false);
        }
        api.onTap && api.onTap(cur.card, e);
        api.onDragEnd && api.onDragEnd();
        return;
      }

      const rect = boardEl.getBoundingClientRect();
      const px = e.clientX - rect.left + boardEl.scrollLeft;
      const py = e.clientY - rect.top + boardEl.scrollTop;
      const accepted = api.onDrop ? api.onDrop(cur.payload, px, py) : false;
      if (!accepted) {
        // zurückspringen
        for (let i = 0; i < cur.cards.length; i++) {
          const c = cur.cards[i];
          c.el.classList.remove('dragging');
          placeCard(c, cur.startPos[i].x, cur.startPos[i].y, cur.startPos[i].z, true);
        }
      } else {
        for (const c of cur.cards) c.el.classList.remove('dragging');
      }
      api.onDragEnd && api.onDragEnd();
    }
    boardEl.addEventListener('pointerup', endDrag);
    boardEl.addEventListener('pointercancel', endDrag);
  }

  // ---- Slot --------------------------------------------------------------
  function makeSlot(label, cls) {
    const el = document.createElement('div');
    el.className = 'slot' + (cls ? ' ' + cls : '');
    if (label) el.textContent = label;
    return el;
  }

  // ---- Toast / Sieg -----------------------------------------------------
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1600);
  }

  function celebrateWin(text) {
    const overlay = document.getElementById('win-overlay');
    document.getElementById('win-text').textContent = text || 'Sehr schön gespielt.';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    // Konfetti
    const colors = ['#d6a85a', '#c0392b', '#f4ede0', '#3b5a7a', '#2f7a5d'];
    const board = document.getElementById('board');
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDuration = (2 + Math.random() * 2.5) + 's';
      c.style.animationDelay = (Math.random() * 0.6) + 's';
      c.style.transform = `rotate(${Math.random()*360}deg)`;
      board.appendChild(c);
      setTimeout(() => c.remove(), 5500);
    }
  }

  function hideWin() {
    const overlay = document.getElementById('win-overlay');
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  // ---- Timer ------------------------------------------------------------
  function makeTimer(onTick) {
    let start = 0, raf = null, paused = false, accum = 0;
    function tick() {
      if (paused) return;
      onTick(elapsed());
      raf = requestAnimationFrame(tick);
    }
    function elapsed() {
      return accum + (start ? (performance.now() - start) : 0);
    }
    return {
      start() { if (!start) { start = performance.now(); raf = requestAnimationFrame(tick); } },
      stop()  { if (start) { accum += performance.now() - start; start = 0; } if (raf) cancelAnimationFrame(raf); raf = null; },
      reset() { accum = 0; start = 0; if (raf) cancelAnimationFrame(raf); raf = null; onTick(0); },
      elapsed
    };
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = (s % 60).toString().padStart(2, '0');
    return m + ':' + ss;
  }

  // ---- Undo-Stack -------------------------------------------------------
  function makeUndoStack() {
    const stack = [];
    return {
      push(action) { stack.push(action); },
      pop() { return stack.pop(); },
      clear() { stack.length = 0; },
      get size() { return stack.length; }
    };
  }

  // ---- Export -----------------------------------------------------------
  global.Cards = {
    Card, SUITS, SUIT_SYM, RANK_SYM,
    rankSym, isRed, color,
    makeDeck, makeSpiderDeck, shuffle,
    renderCardEl, drawFace, setFaceUp, placeCard,
    metrics, fitCardSize, fanSteps, centerStart, attachPointer, makeSlot,
    toast, celebrateWin, hideWin,
    makeTimer, formatTime, makeUndoStack
  };

})(window);
