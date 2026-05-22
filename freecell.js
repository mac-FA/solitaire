/* =====================================================================
 * FreeCell
 * 8 Tableaus offen, 4 Freizellen, 4 Fundamente
 * ===================================================================*/

(function (global) {
  'use strict';

  class FreeCell {
    constructor(opts = {}) {
      this.board = null;
      this.tableau = new Array(8).fill(null).map(() => []);
      this.cells = [null, null, null, null];
      this.foundation = [[], [], [], []];
      this.slots = { cells: [], foundations: [], tableaus: [] };
      this.allCards = [];
      this.undo = Cards.makeUndoStack();
      this.moves = 0;
      this.onChange = null;
      this.onWin = null;
    }

    static optsUI() { return ''; }

    title() { return 'FreeCell'; }
    subtitle() { return '4 Freizellen'; }

    setup(boardEl) {
      this.board = boardEl;
      boardEl.innerHTML = '';
      this.allCards.length = 0;
      this.undo.clear();
      this.moves = 0;
      this.tableau = new Array(8).fill(null).map(() => []);
      this.cells = [null, null, null, null];
      this.foundation = [[], [], [], []];

      const deck = Cards.shuffle(Cards.makeDeck(1));
      // Erste 4 Spalten: 7 Karten, letzte 4 Spalten: 6 Karten. Alle face-up.
      let idx = 0;
      for (let col = 0; col < 8; col++) {
        const n = col < 4 ? 7 : 6;
        for (let i = 0; i < n; i++) {
          const c = deck.pop();
          c.faceUp = true;
          this.tableau[col].push(c);
        }
      }

      // Slots
      this.slots.cells = [];
      for (let i = 0; i < 4; i++) {
        const s = Cards.makeSlot('', 'cell');
        this.slots.cells.push(s);
        boardEl.appendChild(s);
      }
      this.slots.foundations = [];
      for (let i = 0; i < 4; i++) {
        const s = Cards.makeSlot(['♠','♥','♦','♣'][i], 'foundation foundation-hint');
        this.slots.foundations.push(s);
        boardEl.appendChild(s);
      }
      this.slots.tableaus = [];
      for (let i = 0; i < 8; i++) {
        const s = Cards.makeSlot('', 'tableau');
        this.slots.tableaus.push(s);
        boardEl.appendChild(s);
      }

      const all = this.tableau.flat();
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
      // 8 Tableau-Spalten
      Cards.fitCardSize(this.board, 'tableau', 8, { maxW: 150 });
      const m = Cards.metrics(this.board);
      const left0 = m.gap;
      const top1 = m.gap;
      // 4 Freizellen links, 4 Fundamente rechts, alle in einer Reihe (8 Slots)
      for (let i = 0; i < 4; i++) {
        const s = this.slots.cells[i];
        s.style.left = (left0 + i * (m.w + m.gap)) + 'px';
        s.style.top = top1 + 'px';
      }
      for (let i = 0; i < 4; i++) {
        const s = this.slots.foundations[i];
        s.style.left = (left0 + (4 + i) * (m.w + m.gap)) + 'px';
        s.style.top = top1 + 'px';
      }
      const top2 = top1 + m.h + m.gap + 12;
      for (let i = 0; i < 8; i++) {
        const s = this.slots.tableaus[i];
        s.style.left = (left0 + i * (m.w + m.gap)) + 'px';
        s.style.top = top2 + 'px';
      }

      // Cells
      for (let i = 0; i < 4; i++) {
        const c = this.cells[i];
        if (c) Cards.placeCard(c, left0 + i * (m.w + m.gap), top1, 10 + i, animate);
      }
      // Foundations
      for (let i = 0; i < 4; i++) {
        const pile = this.foundation[i];
        const x = left0 + (4 + i) * (m.w + m.gap);
        for (let j = 0; j < pile.length; j++) {
          Cards.placeCard(pile[j], x, top1, 30 + j, animate);
        }
      }
      // Tableaus
      for (let col = 0; col < 8; col++) {
        const pile = this.tableau[col];
        const x = left0 + col * (m.w + m.gap);
        let y = top2;
        for (let i = 0; i < pile.length; i++) {
          Cards.placeCard(pile[i], x, y, i + 1, animate);
          y += m.fanDown;
        }
      }

      // Höhe
      let maxBottom = top2 + m.h;
      for (let col = 0; col < 8; col++) {
        const len = this.tableau[col].length;
        const bottom = top2 + (len > 0 ? (len - 1) * m.fanDown : 0) + m.h;
        if (bottom > maxBottom) maxBottom = bottom;
      }
      this.board.style.minHeight = (maxBottom + m.gap) + 'px';
    }

    findCardLocation(card) {
      for (let col = 0; col < 8; col++) {
        const idx = this.tableau[col].indexOf(card);
        if (idx >= 0) return { kind: 'tableau', col, idx };
      }
      for (let i = 0; i < 4; i++) {
        if (this.cells[i] === card) return { kind: 'cell', col: i };
      }
      for (let f = 0; f < 4; f++) {
        const p = this.foundation[f];
        if (p.length && p[p.length-1] === card) return { kind: 'foundation', col: f };
      }
      return null;
    }

    emptyCells() { return this.cells.filter(c => c === null).length; }
    emptyTableaus(excludeCol = -1) {
      let n = 0;
      for (let c = 0; c < 8; c++) if (c !== excludeCol && this.tableau[c].length === 0) n++;
      return n;
    }

    maxMoveCount(toEmptyCol) {
      const cells = this.emptyCells();
      const empties = this.emptyTableaus(toEmptyCol >= 0 ? toEmptyCol : -1);
      return (cells + 1) * Math.pow(2, empties);
    }

    pickup(card) {
      const loc = this.findCardLocation(card);
      if (!loc) return null;
      if (loc.kind === 'cell') return { from: loc, cards: [card] };
      if (loc.kind === 'foundation') return { from: loc, cards: [card] };
      if (loc.kind === 'tableau') {
        const pile = this.tableau[loc.col];
        const stack = pile.slice(loc.idx);
        // alternierende Farbe, absteigend
        for (let i = 0; i < stack.length - 1; i++) {
          const a = stack[i], b = stack[i+1];
          if (a.rank !== b.rank + 1) return null;
          if (a.red === b.red) return null;
        }
        return { from: loc, cards: stack };
      }
      return null;
    }

    canPlaceOnTableau(cards, col) {
      const target = this.tableau[col];
      const max = this.maxMoveCount(target.length === 0 ? col : -1);
      if (cards.length > max) return false;
      if (target.length === 0) return true;
      const top = target[target.length-1];
      const head = cards[0];
      return (top.rank === head.rank + 1) && (top.red !== head.red);
    }

    canPlaceOnFoundation(card, fi) {
      const pile = this.foundation[fi];
      if (pile.length === 0) return card.rank === 1;
      const top = pile[pile.length-1];
      return (top.suit === card.suit) && (top.rank === card.rank - 1);
    }

    drop(payload, x, y) {
      const { cards, from } = payload;
      const target = this.hitTest(x, y, cards.length === 1);
      if (!target) return false;
      if (target.kind === 'tableau') {
        if (!this.canPlaceOnTableau(cards, target.col)) return false;
        this.applyMove(from, target, cards);
        return true;
      }
      if (target.kind === 'cell') {
        if (cards.length !== 1) return false;
        if (this.cells[target.col] !== null) return false;
        this.applyMove(from, target, cards);
        return true;
      }
      if (target.kind === 'foundation') {
        if (cards.length !== 1) return false;
        if (!this.canPlaceOnFoundation(cards[0], target.col)) return false;
        this.applyMove(from, target, cards);
        return true;
      }
      return false;
    }

    hitTest(x, y, allowSingle) {
      const m = Cards.metrics(this.board);
      if (allowSingle) {
        for (let i = 0; i < 4; i++) {
          const slot = this.slots.cells[i];
          const sx = parseFloat(slot.style.left), sy = parseFloat(slot.style.top);
          if (x >= sx - 6 && x <= sx + m.w + 6 && y >= sy - 6 && y <= sy + m.h + 6) {
            return { kind: 'cell', col: i };
          }
        }
        for (let i = 0; i < 4; i++) {
          const slot = this.slots.foundations[i];
          const sx = parseFloat(slot.style.left), sy = parseFloat(slot.style.top);
          if (x >= sx - 6 && x <= sx + m.w + 6 && y >= sy - 6 && y <= sy + m.h + 6) {
            return { kind: 'foundation', col: i };
          }
        }
      }
      for (let col = 0; col < 8; col++) {
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
      // entfernen
      if (from.kind === 'tableau') {
        const p = this.tableau[from.col];
        p.splice(p.length - cards.length, cards.length);
      } else if (from.kind === 'cell') {
        this.cells[from.col] = null;
      } else if (from.kind === 'foundation') {
        this.foundation[from.col].pop();
      }
      // einfügen
      if (to.kind === 'tableau') this.tableau[to.col].push(...cards);
      else if (to.kind === 'cell') this.cells[to.col] = cards[0];
      else if (to.kind === 'foundation') this.foundation[to.col].push(...cards);

      this.undo.push({ type: 'move', from, to, count: cards.length });
      this.moves++;
      this.layout(true);
      this.notify();
      this.checkWin();
    }

    tap(card) {
      const loc = this.findCardLocation(card);
      if (!loc) return;
      // Versuch: Auto auf Fundament
      if (loc.kind === 'foundation') return;
      // Nur top der Tableau-Spalte oder Cell oder Foundation-Top
      if (loc.kind === 'tableau') {
        const pile = this.tableau[loc.col];
        if (pile[pile.length-1] !== card) {
          // Mittlere Karte: nur sinnvoll wenn ganzer Stack draggable und auf ein Tableau passt
          return;
        }
      }
      for (let f = 0; f < 4; f++) {
        if (this.canPlaceOnFoundation(card, f)) {
          this.applyMove(loc, { kind: 'foundation', col: f }, [card]);
          return;
        }
      }
      // Sonst: freie Zelle? (Komfort)
      for (let i = 0; i < 4; i++) {
        if (this.cells[i] === null && loc.kind !== 'cell') {
          // nur wenn alleinstehend
          if (loc.kind === 'tableau') {
            const p = this.tableau[loc.col];
            if (p[p.length-1] !== card) return;
          }
          this.applyMove(loc, { kind: 'cell', col: i }, [card]);
          return;
        }
      }
    }

    tapEmpty() {}

    doUndo() {
      const a = this.undo.pop();
      if (!a) return;
      // Bewegung umkehren
      const dest = a.to, src = a.from;
      let cards;
      if (dest.kind === 'tableau') {
        cards = this.tableau[dest.col].splice(this.tableau[dest.col].length - a.count, a.count);
      } else if (dest.kind === 'cell') {
        cards = [this.cells[dest.col]];
        this.cells[dest.col] = null;
      } else if (dest.kind === 'foundation') {
        cards = [this.foundation[dest.col].pop()];
      }
      if (src.kind === 'tableau') this.tableau[src.col].push(...cards);
      else if (src.kind === 'cell') this.cells[src.col] = cards[0];
      else if (src.kind === 'foundation') this.foundation[src.col].push(...cards);
      this.moves++;
      this.layout(true);
      this.notify();
    }

    checkWin() {
      const total = this.foundation.reduce((s, f) => s + f.length, 0);
      if (total === 52) {
        if (this.onWin) this.onWin();
      }
    }

    notify() { if (this.onChange) this.onChange({ moves: this.moves }); }
    destroy() { if (this.board) this.board.innerHTML = ''; }
  }

  global.FreeCell = FreeCell;
})(window);
