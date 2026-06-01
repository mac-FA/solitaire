/* =====================================================================
 * Klondike
 * Stock -> Waste, 7 Tableaus, 4 Fundamente
 * ===================================================================*/

(function (global) {
  'use strict';

  class Klondike {
    constructor(opts = {}) {
      this.draw = opts.draw === 3 ? 3 : 1;   // Karten pro Ziehen
      this.recycles = -1; // unbegrenzt
      this.board = null;
      this.tableau = [[], [], [], [], [], [], []]; // 7
      this.foundation = [[], [], [], []];           // 4 (S H D C in Anzeige beliebig)
      this.stock = [];
      this.waste = [];
      this.slots = { stock: null, waste: null, foundations: [], tableaus: [] };
      this.allCards = [];
      this.undo = Cards.makeUndoStack();
      this.moves = 0;
      this.selected = null; // { from, cards }
      this.onChange = null;
      this.onWin = null;
    }

    static optsUI(current) {
      return `
        <div class="opts-row">
          <label>Karten pro Ziehen</label>
          <div class="choices" data-key="draw">
            <button data-val="1" class="${current.draw===1?'active':''}">1 Karte</button>
            <button data-val="3" class="${current.draw===3?'active':''}">3 Karten</button>
          </div>
        </div>`;
    }

    title()    { return 'Klondike'; }
    subtitle() { return this.draw === 3 ? 'Draw 3' : 'Draw 1'; }

    rules() { return `
      <h3>Ziel</h3>
      <p>Bringe alle 52 Karten geordnet auf die vier Fundamente — pro Farbe von Ass bis König.</p>
      <h3>Tableau (die 7 Spalten)</h3>
      <ul>
        <li>Karten werden <b>absteigend</b> und in <b>abwechselnden Farben</b> gestapelt (z. B. schwarze 7 auf rote 8).</li>
        <li>Nur ein <b>König</b> darf auf ein leeres Feld gelegt werden.</li>
        <li>Eine geordnete Folge kann komplett umgesetzt werden.</li>
      </ul>
      <h3>Stock &amp; Waste</h3>
      <ul>
        <li>Klick auf den Stock zieht eine (oder drei) Karte(n) auf das Waste.</li>
        <li>Ist der Stock leer, kann er beliebig oft neu durchblättert werden.</li>
      </ul>
      <h3>Tipps</h3>
      <ul>
        <li>Eine Karte <b>antippen</b> schickt sie automatisch aufs Fundament, falls möglich.</li>
        <li>Eigene Züge mit <kbd>U</kbd>/<kbd>Z</kbd> zurücknehmen, <kbd>N</kbd> startet ein neues Spiel.</li>
      </ul>`; }

    setup(boardEl) {
      this.board = boardEl;
      boardEl.innerHTML = '';
      this.allCards.length = 0;
      this.undo.clear();
      this.moves = 0;
      this.selected = null;

      // Deck
      const deck = Cards.shuffle(Cards.makeDeck(1));
      // 7 Tableaus
      for (let col = 0; col < 7; col++) this.tableau[col] = [];
      this.foundation = [[], [], [], []];
      this.stock = []; this.waste = [];

      for (let col = 0; col < 7; col++) {
        for (let i = 0; i <= col; i++) {
          const card = deck.pop();
          card.faceUp = (i === col);
          this.tableau[col].push(card);
        }
      }
      // Rest -> Stock (face-down)
      this.stock = deck;
      for (const c of this.stock) c.faceUp = false;

      // Slots
      this.slots.stock = Cards.makeSlot('↺', 'stock');
      this.slots.waste = Cards.makeSlot('', 'waste');
      this.slots.foundations = [];
      for (let i = 0; i < 4; i++) {
        const s = Cards.makeSlot(['♠','♥','♦','♣'][i], 'foundation foundation-hint');
        this.slots.foundations.push(s);
      }
      this.slots.tableaus = [];
      for (let i = 0; i < 7; i++) this.slots.tableaus.push(Cards.makeSlot('', 'tableau'));

      boardEl.appendChild(this.slots.stock);
      boardEl.appendChild(this.slots.waste);
      for (const s of this.slots.foundations) boardEl.appendChild(s);
      for (const s of this.slots.tableaus) boardEl.appendChild(s);

      // Karten-Elemente erzeugen
      const allInPlay = [...this.stock, ...this.waste, ...this.tableau.flat(), ...this.foundation.flat()];
      for (const c of allInPlay) {
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
      // alte Layout-Höhe verwerfen, damit clientHeight die echte
      // sichtbare Höhe liefert (nicht die aufgeblähte minHeight).
      this.board.style.minHeight = '';
      // 7 Tableau-Spalten; eine Top-Reihe darüber. Höhen-Cap verhindert
      // zu hohe Karten auf niedrigen Laptop-Screens.
      Cards.fitCardSize(this.board, 'tableau', 7, { maxW: 160, vCap: 9, vTopRows: 1 });
      const m = Cards.metrics(this.board);
      const top1 = m.gap;
      const left0 = Cards.centerStart(this.board, 7);
      // Top row: stock, waste, gap, foundation x4
      const stockX = left0;
      const wasteX = left0 + (m.w + m.gap);
      const foundX0 = left0 + (m.w + m.gap) * 3;

      this.slots.stock.style.left = stockX + 'px';
      this.slots.stock.style.top = top1 + 'px';
      this.slots.waste.style.left = wasteX + 'px';
      this.slots.waste.style.top = top1 + 'px';
      for (let i = 0; i < 4; i++) {
        const s = this.slots.foundations[i];
        s.style.left = (foundX0 + i * (m.w + m.gap)) + 'px';
        s.style.top = top1 + 'px';
      }
      // Tableau row
      const top2 = top1 + m.h + m.gap + 12;
      for (let i = 0; i < 7; i++) {
        const s = this.slots.tableaus[i];
        s.style.left = (left0 + i * (m.w + m.gap)) + 'px';
        s.style.top = top2 + 'px';
      }

      // Karten positionieren
      // Stock
      for (let i = 0; i < this.stock.length; i++) {
        Cards.placeCard(this.stock[i], stockX, top1, i + 1, animate);
        if (this.stock[i].faceUp) Cards.setFaceUp(this.stock[i], false);
      }
      // Waste (max 3 leicht gefächert bei Draw3)
      for (let i = 0; i < this.waste.length; i++) {
        let off = 0;
        if (this.draw === 3 && this.waste.length > 0) {
          const lastN = Math.min(3, this.waste.length);
          const idx = i - (this.waste.length - lastN);
          if (idx >= 0) off = idx * Math.round(m.w * 0.25);
        }
        Cards.placeCard(this.waste[i], wasteX + off, top1, i + 1, animate);
        if (!this.waste[i].faceUp) Cards.setFaceUp(this.waste[i], true);
      }
      // Foundations
      for (let f = 0; f < 4; f++) {
        const pile = this.foundation[f];
        const x = foundX0 + f * (m.w + m.gap);
        for (let i = 0; i < pile.length; i++) {
          Cards.placeCard(pile[i], x, top1, i + 1, animate);
          if (!pile[i].faceUp) Cards.setFaceUp(pile[i], true);
        }
      }
      // Tableau — mit adaptiver Fächer-Stauchung pro Spalte
      const availH = this.board.clientHeight - top2 - m.gap;
      let maxBottom = top2 + m.h;
      for (let col = 0; col < 7; col++) {
        const pile = this.tableau[col];
        const x = left0 + col * (m.w + m.gap);
        const steps = Cards.fanSteps(pile, m.h, availH);
        let y = top2;
        for (let i = 0; i < pile.length; i++) {
          const c = pile[i];
          Cards.placeCard(c, x, y, i + 1, animate);
          // Sicherstellen, dass face-up Status visuell stimmt
          if (c.faceUp && c.el.classList.contains('face-down')) Cards.setFaceUp(c, true);
          if (!c.faceUp && !c.el.classList.contains('face-down')) Cards.setFaceUp(c, false);
          // Symbol-Slide: alle Karten außer der obersten in der Spalte
          c.el.classList.toggle('covered', c.faceUp && i < pile.length - 1);
          y += c.faceUp ? steps.up : steps.down;
        }
        const bottom = y - (pile.length ? (pile[pile.length-1].faceUp ? steps.up : steps.down) : 0) + m.h;
        if (bottom > maxBottom) maxBottom = bottom;
      }
      // Stock/Waste/Foundation top-Karte = nie covered
      for (const c of [...this.stock, ...this.waste, ...this.foundation.flat()]) {
        c.el.classList.remove('covered');
      }

      // Sicherheits-Scroll nur falls eine Spalte trotz Stauchung überläuft
      this.board.style.minHeight = (maxBottom + m.gap) + 'px';
    }

    // ---- Spielzug-Quellen identifizieren ---------------------------
    findCardLocation(card) {
      if (this.waste.length && this.waste[this.waste.length-1] === card) return { kind: 'waste' };
      for (let i = 0; i < 4; i++) {
        const f = this.foundation[i];
        if (f.length && f[f.length-1] === card) return { kind: 'foundation', col: i };
      }
      for (let col = 0; col < 7; col++) {
        const idx = this.tableau[col].indexOf(card);
        if (idx >= 0) return { kind: 'tableau', col, idx };
      }
      if (this.stock.includes(card)) return { kind: 'stock' };
      return null;
    }

    pickup(card) {
      const loc = this.findCardLocation(card);
      if (!loc) return null;
      if (loc.kind === 'stock') return null;
      if (loc.kind === 'tableau') {
        if (!card.faceUp) return null;
        const pile = this.tableau[loc.col];
        // Sequenz prüfen: ab idx muss abwechselnde Farben absteigend sein
        const stack = pile.slice(loc.idx);
        for (let i = 0; i < stack.length - 1; i++) {
          const a = stack[i], b = stack[i+1];
          if (a.rank !== b.rank + 1) return null;
          if (a.red === b.red) return null;
        }
        return { from: loc, cards: stack };
      }
      if (loc.kind === 'waste') {
        return { from: loc, cards: [card] };
      }
      if (loc.kind === 'foundation') {
        return { from: loc, cards: [card] };
      }
      return null;
    }

    canPlaceOnTableau(card, col) {
      const dest = this.tableau[col];
      if (dest.length === 0) return card.rank === 13;
      const top = dest[dest.length-1];
      if (!top.faceUp) return false;
      return (top.rank === card.rank + 1) && (top.red !== card.red);
    }
    canPlaceOnFoundation(card, fi) {
      const dest = this.foundation[fi];
      if (dest.length === 0) return card.rank === 1;
      const top = dest[dest.length-1];
      return (top.suit === card.suit) && (top.rank === card.rank - 1);
    }

    // Drop: x,y in board-koordinaten
    drop(payload, x, y) {
      const { cards, from } = payload;
      const m = Cards.metrics();
      // Bester Drop-Ziel-Slot finden
      const target = this.hitTest(x, y, cards.length === 1);
      if (!target) return false;

      // Validieren
      if (target.kind === 'tableau') {
        if (!this.canPlaceOnTableau(cards[0], target.col)) return false;
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

    hitTest(x, y, allowFoundation) {
      const m = Cards.metrics(this.board);
      // Tableau-Spalten
      for (let col = 0; col < 7; col++) {
        const slot = this.slots.tableaus[col];
        const sx = parseFloat(slot.style.left), sy = parseFloat(slot.style.top);
        const pile = this.tableau[col];
        let bottom = sy + m.h;
        if (pile.length) {
          const last = pile[pile.length-1];
          bottom = last.y + m.h;
        }
        if (x >= sx - 8 && x <= sx + m.w + 8 && y >= sy - 8 && y <= bottom + 30) {
          return { kind: 'tableau', col };
        }
      }
      // Fundamente (nur Single-Card)
      if (allowFoundation) {
        for (let f = 0; f < 4; f++) {
          const slot = this.slots.foundations[f];
          const sx = parseFloat(slot.style.left), sy = parseFloat(slot.style.top);
          if (x >= sx - 8 && x <= sx + m.w + 8 && y >= sy - 8 && y <= sy + m.h + 8) {
            return { kind: 'foundation', col: f };
          }
        }
      }
      return null;
    }

    applyMove(from, to, cards) {
      // entfernen
      const fromPile = this.pileFor(from);
      const removed = fromPile.splice(fromPile.length - cards.length, cards.length);
      // hinzufügen
      const toPile = this.pileFor(to);
      for (const c of removed) toPile.push(c);

      // Karte aufdecken bei tableau
      let flipped = null;
      if (from.kind === 'tableau') {
        const remaining = this.tableau[from.col];
        if (remaining.length && !remaining[remaining.length-1].faceUp) {
          Cards.setFaceUp(remaining[remaining.length-1], true);
          flipped = remaining[remaining.length-1];
        }
      }

      this.undo.push({ type: 'move', from, to, count: cards.length, flipped });
      this.moves++;
      this.layout(true);
      this.notify();
      this.checkWin();
    }

    pileFor(loc) {
      if (loc.kind === 'waste') return this.waste;
      if (loc.kind === 'stock') return this.stock;
      if (loc.kind === 'tableau') return this.tableau[loc.col];
      if (loc.kind === 'foundation') return this.foundation[loc.col];
      return null;
    }

    // Klick (kein Drag)
    tap(card) {
      // Stock-Klick? card auf stock-slot
      // Wir prüfen Position: ist die Karte im Stock?
      if (this.stock.includes(card)) {
        this.drawFromStock();
        return;
      }
      // Doppelklick-ähnlich: versuche Auto-Move zu Fundament
      const loc = this.findCardLocation(card);
      if (!loc) return;
      if (loc.kind === 'tableau') {
        const pile = this.tableau[loc.col];
        if (pile[pile.length-1] !== card) return;
      }
      if (loc.kind === 'foundation') return;
      const pickup = this.pickup(card);
      if (!pickup || pickup.cards.length !== 1) return;
      // erste passende Foundation finden
      for (let f = 0; f < 4; f++) {
        if (this.canPlaceOnFoundation(card, f)) {
          this.applyMove(loc, { kind: 'foundation', col: f }, [card]);
          return;
        }
      }
    }

    tapEmpty(e) {
      // Klick auf Stock-Slot direkt?
      const rect = this.board.getBoundingClientRect();
      const x = e.clientX - rect.left + this.board.scrollLeft;
      const y = e.clientY - rect.top + this.board.scrollTop;
      const sx = parseFloat(this.slots.stock.style.left);
      const sy = parseFloat(this.slots.stock.style.top);
      const m = Cards.metrics(this.board);
      if (x >= sx && x <= sx + m.w && y >= sy && y <= sy + m.h) {
        this.drawFromStock();
      }
    }

    drawFromStock() {
      if (this.stock.length === 0) {
        // Recycle
        if (this.waste.length === 0) return;
        const recycled = this.waste.splice(0, this.waste.length).reverse();
        for (const c of recycled) Cards.setFaceUp(c, false);
        for (const c of recycled) this.stock.push(c);
        this.undo.push({ type: 'recycle', count: recycled.length });
        this.moves++;
        this.layout(true);
        this.notify();
        return;
      }
      const n = Math.min(this.draw, this.stock.length);
      const drawn = [];
      for (let i = 0; i < n; i++) {
        const c = this.stock.pop();
        Cards.setFaceUp(c, true);
        this.waste.push(c);
        drawn.push(c);
      }
      this.undo.push({ type: 'draw', count: n });
      this.moves++;
      this.layout(true);
      this.notify();
    }

    doUndo() {
      const a = this.undo.pop();
      if (!a) return;
      if (a.type === 'draw') {
        for (let i = 0; i < a.count; i++) {
          const c = this.waste.pop();
          Cards.setFaceUp(c, false);
          this.stock.push(c);
        }
      } else if (a.type === 'recycle') {
        for (let i = 0; i < a.count; i++) {
          const c = this.stock.pop();
          Cards.setFaceUp(c, true);
          this.waste.push(c);
        }
        // ursprüngliche Reihenfolge — vereinfacht: Reihenfolge bleibt umgekehrt erhalten
      } else if (a.type === 'move') {
        // ggf. zurückklappen
        if (a.flipped) Cards.setFaceUp(a.flipped, false);
        const fromPile = this.pileFor(a.to);
        const toPile = this.pileFor(a.from);
        const moved = fromPile.splice(fromPile.length - a.count, a.count);
        for (const c of moved) toPile.push(c);
      }
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

    notify() {
      if (this.onChange) this.onChange({ moves: this.moves });
    }

    destroy() {
      if (this.board) this.board.innerHTML = '';
    }
  }

  global.Klondike = Klondike;
})(window);
