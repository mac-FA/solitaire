/* =====================================================================
 * Spider
 * 104 Karten, 10 Tableaus, 5 Stocks à 10 Karten, 8 Sequenzen sammeln
 * Schwierigkeiten: 1, 2 oder 4 Farben
 * ===================================================================*/

(function (global) {
  'use strict';

  class Spider {
    constructor(opts = {}) {
      this.suits = (opts.suits === 1 || opts.suits === 2 || opts.suits === 4) ? opts.suits : 1;
      this.board = null;
      this.tableau = new Array(10).fill(null).map(() => []);
      this.completed = []; // Liste der abgelegten K-A-Sequenzen
      this.stocks = []; // Array von Arrays (5 Stapel à 10 Karten)
      this.slots = { tableaus: [], stock: null, done: null };
      this.allCards = [];
      this.undo = Cards.makeUndoStack();
      this.moves = 0;
      this.onChange = null;
      this.onWin = null;
    }

    static optsUI(current) {
      return `
        <div class="opts-row">
          <label>Schwierigkeit (Anzahl Farben)</label>
          <div class="choices" data-key="suits">
            <button data-val="1" class="${current.suits===1?'active':''}">1 Farbe — leicht</button>
            <button data-val="2" class="${current.suits===2?'active':''}">2 Farben — mittel</button>
            <button data-val="4" class="${current.suits===4?'active':''}">4 Farben — schwer</button>
          </div>
        </div>`;
    }

    title() { return 'Spider'; }
    subtitle() { return this.suits + (this.suits === 1 ? ' Farbe' : ' Farben'); }

    rules() { return `
      <h3>Ziel</h3>
      <p>Sammle <b>acht vollständige Sequenzen</b> (König bis Ass in einer Farbe). Jede fertige Sequenz verschwindet automatisch vom Spielfeld.</p>
      <h3>Tableau</h3>
      <ul>
        <li>Karten werden <b>absteigend</b> gestapelt — beim Ablegen ist die Farbe egal.</li>
        <li><b>Verschoben</b> werden können nur Karten, die eine geschlossene, gleichfarbige Sequenz bilden.</li>
        <li>Auf ein leeres Feld darf jede Karte oder Sequenz.</li>
      </ul>
      <h3>Stock</h3>
      <ul>
        <li>Klick auf den Stock teilt eine Karte pro Spalte aus.</li>
        <li>Voraussetzung: <b>keine Spalte ist leer</b>.</li>
      </ul>
      <h3>Schwierigkeit</h3>
      <ul>
        <li><b>1 Farbe</b>: einfach — alle Karten sind ♠.</li>
        <li><b>2 Farben</b>: mittel — ♠ und ♥.</li>
        <li><b>4 Farben</b>: klassisch und am schwersten.</li>
      </ul>`; }

    setup(boardEl) {
      this.board = boardEl;
      boardEl.innerHTML = '';
      this.allCards.length = 0;
      this.undo.clear();
      this.moves = 0;
      this.tableau = new Array(10).fill(null).map(() => []);
      this.completed = [];
      this.stocks = [];

      const deck = Cards.shuffle(Cards.makeSpiderDeck(this.suits));
      // 54 Karten austeilen: erste 4 Spalten je 6, restliche 6 Spalten je 5; nur oberste face-up
      for (let col = 0; col < 10; col++) {
        const n = col < 4 ? 6 : 5;
        for (let i = 0; i < n; i++) {
          const c = deck.pop();
          c.faceUp = (i === n - 1);
          this.tableau[col].push(c);
        }
      }
      // Rest = 50 Karten -> 5 Stocks à 10
      for (let s = 0; s < 5; s++) {
        const pile = [];
        for (let i = 0; i < 10; i++) {
          const c = deck.pop();
          c.faceUp = false;
          pile.push(c);
        }
        this.stocks.push(pile);
      }

      // Slots
      this.slots.tableaus = [];
      for (let i = 0; i < 10; i++) {
        const s = Cards.makeSlot('', 'tableau');
        this.slots.tableaus.push(s);
        boardEl.appendChild(s);
      }
      this.slots.stock = Cards.makeSlot('↻', 'stock');
      boardEl.appendChild(this.slots.stock);
      this.slots.done = Cards.makeSlot('★', 'foundation foundation-hint');
      boardEl.appendChild(this.slots.done);

      // Karten rendern
      const all = [...this.tableau.flat(), ...this.stocks.flat()];
      for (const c of all) {
        const el = Cards.renderCardEl(c);
        boardEl.appendChild(el);
        this.allCards.push(c);
      }

      this.layout(false);

      Cards.attachPointer(boardEl, {
        getCard: (id) => this.allCards.find(c => c.id === id),
        onPickup: (card) => this.pickup(card),
        onDrop:   (payload, x, y) => this.drop(payload, x, y),
        onTap:    (card) => this.tap(card),
        onTapEmpty: (e) => this.tapEmpty(e)
      });

      this.notify();
    }

    layout(animate = true) {
      // 10 Tableau-Spalten — engste Variante, Cap etwas niedriger
      Cards.fitCardSize(this.board, 'tableau', 10, { maxW: 130 });
      const m = Cards.metrics(this.board);
      const top1 = m.gap;
      const left0 = m.gap;

      // 10 Tableaus oben
      for (let i = 0; i < 10; i++) {
        const s = this.slots.tableaus[i];
        s.style.left = (left0 + i * (m.w + m.gap)) + 'px';
        s.style.top = top1 + 'px';
      }
      // Stock + Done rechts/unten — wir setzen sie unten rechts in der Bar
      const boardW = this.board.clientWidth;
      const stockY = top1; // gleiche Reihe — rechts vom letzten Tableau? Wir setzen sie unter den Stock-Bereich
      // Lege Stock unten in der Bar darunter:
      // Stock-Stapel-Platz: bottom right corner. Done-Slot daneben.
      // Wir nutzen die rechte Hälfte der Spielfläche. Einfach: setze Stock-Slot ins Eck rechts oben über dem ersten Tableau? Nein, lieber separat:
      // Wir verschieben Stock unten links, Done unten rechts.
      // Spielhöhe wird unten berechnet.

      // Cards in Tableaus
      for (let col = 0; col < 10; col++) {
        const pile = this.tableau[col];
        const x = left0 + col * (m.w + m.gap);
        let y = top1;
        for (let i = 0; i < pile.length; i++) {
          const c = pile[i];
          Cards.placeCard(c, x, y, i + 1, animate);
          if (c.faceUp && c.el.classList.contains('face-down')) Cards.setFaceUp(c, true);
          if (!c.faceUp && !c.el.classList.contains('face-down')) Cards.setFaceUp(c, false);
          c.el.classList.toggle('covered', c.faceUp && i < pile.length - 1);
          y += c.faceUp ? m.fanDown : m.fanDownTight;
        }
      }

      // Maximal-Y für Spalten ermitteln
      let maxBottom = top1 + m.h;
      for (let col = 0; col < 10; col++) {
        const p = this.tableau[col];
        let y = top1;
        for (let i = 0; i < p.length; i++) y += p[i].faceUp ? m.fanDown : m.fanDownTight;
        if (y > maxBottom) maxBottom = y + m.h;
      }

      // Stock unten links
      const stockArea = maxBottom + m.gap;
      this.slots.stock.style.left = left0 + 'px';
      this.slots.stock.style.top = stockArea + 'px';

      // Stock-Karten gestapelt mit kleinem Offset pro verbleibendem Stock
      let sx = left0;
      for (let s = 0; s < this.stocks.length; s++) {
        const pile = this.stocks[s];
        for (let i = 0; i < pile.length; i++) {
          Cards.placeCard(pile[i], sx + (s * 6), stockArea + (s * 2), 100 + s * 20 + i, animate);
          if (pile[i].faceUp) Cards.setFaceUp(pile[i], false);
        }
      }
      // Done-Slot rechts daneben
      const doneX = left0 + (m.w + m.gap) * 1 + 30;
      this.slots.done.style.left = doneX + 'px';
      this.slots.done.style.top = stockArea + 'px';

      // Abgelegte K-A-Sequenzen rechts daneben gestapelt anzeigen (zwei Karten symbolisch: oben + unten)
      // Wir behalten alle Karten der Sequenzen als unten platziert
      let cx = doneX;
      for (let i = 0; i < this.completed.length; i++) {
        const seq = this.completed[i];
        for (let j = 0; j < seq.length; j++) {
          Cards.placeCard(seq[j], cx, stockArea, 300 + i * 14 + j, animate);
        }
        cx += Math.round(m.w * 0.35);
      }

      this.board.style.minHeight = (stockArea + m.h + m.gap) + 'px';
    }

    findCardLocation(card) {
      for (let col = 0; col < 10; col++) {
        const idx = this.tableau[col].indexOf(card);
        if (idx >= 0) return { kind: 'tableau', col, idx };
      }
      for (let s = 0; s < this.stocks.length; s++) {
        if (this.stocks[s].includes(card)) return { kind: 'stock', s };
      }
      return null;
    }

    pickup(card) {
      const loc = this.findCardLocation(card);
      if (!loc) return null;
      if (loc.kind !== 'tableau') return null;
      if (!card.faceUp) return null;
      const pile = this.tableau[loc.col];
      const stack = pile.slice(loc.idx);
      // Spider: Sequenz muss gleiche Farbe + absteigend sein
      for (let i = 0; i < stack.length - 1; i++) {
        const a = stack[i], b = stack[i+1];
        if (a.rank !== b.rank + 1) return null;
        if (a.suit !== b.suit) return null;
      }
      return { from: loc, cards: stack };
    }

    canPlaceOnTableau(card, col) {
      const dest = this.tableau[col];
      if (dest.length === 0) return true;
      const top = dest[dest.length-1];
      if (!top.faceUp) return false;
      return top.rank === card.rank + 1; // Farbe egal beim Ablegen, nur für Sequenz wichtig
    }

    drop(payload, x, y) {
      const { cards, from } = payload;
      const target = this.hitTest(x, y);
      if (!target) return false;
      if (!this.canPlaceOnTableau(cards[0], target.col)) return false;
      this.applyMove(from, target, cards);
      return true;
    }

    hitTest(x, y) {
      const m = Cards.metrics(this.board);
      for (let col = 0; col < 10; col++) {
        const slot = this.slots.tableaus[col];
        const sx = parseFloat(slot.style.left), sy = parseFloat(slot.style.top);
        const pile = this.tableau[col];
        let bottom = sy + m.h;
        if (pile.length) bottom = pile[pile.length-1].y + m.h;
        if (x >= sx - 6 && x <= sx + m.w + 6 && y >= sy - 6 && y <= bottom + 30) {
          return { kind: 'tableau', col };
        }
      }
      return null;
    }

    applyMove(from, to, cards) {
      const fromPile = this.tableau[from.col];
      const removed = fromPile.splice(fromPile.length - cards.length, cards.length);
      this.tableau[to.col].push(...removed);

      let flipped = null;
      const remaining = this.tableau[from.col];
      if (remaining.length && !remaining[remaining.length-1].faceUp) {
        Cards.setFaceUp(remaining[remaining.length-1], true);
        flipped = remaining[remaining.length-1];
      }

      // Komplette Sequenz K..A in Zielspalte abräumen
      const removedSeq = this.checkAndRemoveSequence(to.col);
      this.undo.push({ type: 'move', from, to, count: cards.length, flipped, removedSeq });
      this.moves++;
      this.layout(true);
      this.notify();
      this.checkWin();
    }

    checkAndRemoveSequence(col) {
      const pile = this.tableau[col];
      if (pile.length < 13) return null;
      const last13 = pile.slice(-13);
      // K..A gleicher Farbe?
      for (let i = 0; i < 13; i++) {
        const c = last13[i];
        if (!c.faceUp) return null;
        if (c.rank !== 13 - i) return null;
        if (c.suit !== last13[0].suit) return null;
      }
      const removed = pile.splice(pile.length - 13, 13);
      this.completed.push(removed);
      // Karte aufdecken
      if (pile.length && !pile[pile.length-1].faceUp) {
        Cards.setFaceUp(pile[pile.length-1], true);
      }
      Cards.toast('Sequenz fertig!');
      return { col, cards: removed };
    }

    tap(card) {
      const loc = this.findCardLocation(card);
      if (!loc) return;
      // Stock-Tap: deal-out
      if (loc.kind === 'stock') {
        this.dealStock();
      }
    }

    tapEmpty(e) {
      // Stock-Slot Klick?
      const rect = this.board.getBoundingClientRect();
      const x = e.clientX - rect.left + this.board.scrollLeft;
      const y = e.clientY - rect.top + this.board.scrollTop;
      const sx = parseFloat(this.slots.stock.style.left);
      const sy = parseFloat(this.slots.stock.style.top);
      const m = Cards.metrics(this.board);
      if (x >= sx && x <= sx + m.w + 40 && y >= sy && y <= sy + m.h) {
        this.dealStock();
      }
    }

    dealStock() {
      if (this.stocks.length === 0) {
        Cards.toast('Kein Stock mehr.');
        return;
      }
      // Regel: Alle 10 Tableaus müssen mindestens eine Karte haben
      for (let col = 0; col < 10; col++) {
        if (this.tableau[col].length === 0) {
          Cards.toast('Erst alle leeren Spalten füllen.');
          return;
        }
      }
      const pile = this.stocks.pop();
      // 10 Karten austeilen, je 1 pro Spalte
      for (let col = 0; col < 10; col++) {
        const c = pile[col];
        Cards.setFaceUp(c, true);
        this.tableau[col].push(c);
      }
      // Sequenzen checken
      const removed = [];
      for (let col = 0; col < 10; col++) {
        const seq = this.checkAndRemoveSequence(col);
        if (seq) removed.push(seq);
      }
      this.undo.push({ type: 'deal', removedSeqs: removed });
      this.moves++;
      this.layout(true);
      this.notify();
      this.checkWin();
    }

    doUndo() {
      const a = this.undo.pop();
      if (!a) return;
      if (a.type === 'move') {
        // Erst Sequenz wiederherstellen, falls eine entfernt wurde
        if (a.removedSeq) {
          this.completed.pop();
          this.tableau[a.removedSeq.col].push(...a.removedSeq.cards);
        }
        if (a.flipped) Cards.setFaceUp(a.flipped, false);
        const fromPile = this.tableau[a.to.col];
        const toPile = this.tableau[a.from.col];
        const moved = fromPile.splice(fromPile.length - a.count, a.count);
        toPile.push(...moved);
      } else if (a.type === 'deal') {
        // Sequenzen zurück, dann je 1 Karte pro Spalte
        for (let i = a.removedSeqs.length - 1; i >= 0; i--) {
          const seq = a.removedSeqs[i];
          this.completed.pop();
          this.tableau[seq.col].push(...seq.cards);
        }
        const pile = [];
        for (let col = 9; col >= 0; col--) {
          const c = this.tableau[col].pop();
          Cards.setFaceUp(c, false);
          pile.unshift(c);
        }
        this.stocks.push(pile);
      }
      this.moves++;
      this.layout(true);
      this.notify();
    }

    checkWin() {
      if (this.completed.length === 8) {
        if (this.onWin) this.onWin();
      }
    }

    notify() {
      if (this.onChange) this.onChange({ moves: this.moves });
    }

    destroy() {
      if (this.board) this.board.innerHTML = '';
    }
  }

  global.Spider = Spider;
})(window);
