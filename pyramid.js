/* =====================================================================
 * Pyramide
 * 28 Karten in 7 Reihen (1..7). Paare = 13 entfernen.
 * Stock -> Waste. Könige (13) einzeln entfernbar.
 * ===================================================================*/

(function (global) {
  'use strict';

  class Pyramid {
    constructor(opts = {}) {
      this.board = null;
      this.pyramid = []; // Array von Reihen, jede Reihe Array von Karten (oder null nach Entfernen)
      this.stock = [];
      this.waste = [];
      this.removed = []; // entfernte Karten (für Anzeige optional)
      this.slots = { pyramid: [], stock: null, waste: null, done: null };
      this.allCards = [];
      this.undo = Cards.makeUndoStack();
      this.moves = 0;
      this.selected = null; // Card
      this.onChange = null;
      this.onWin = null;
      this.recyclesLeft = 2; // 3 Durchgänge insgesamt (Stock 2x recyceln)
    }

    static optsUI() { return ''; }

    title() { return 'Pyramide'; }
    subtitle() { return 'Paare = 13'; }

    rules() { return `
      <h3>Ziel</h3>
      <p>Entferne alle 28 Karten der Pyramide.</p>
      <h3>Karten paaren</h3>
      <ul>
        <li>Wähle zwei Karten, die zusammen <b>13</b> ergeben — sie verschwinden.</li>
        <li>Werte: A = 1, J = 11, Q = 12.</li>
        <li>Ein <b>König (K = 13)</b> wird mit einem einzelnen Klick entfernt.</li>
        <li>Beispielpaare: A+Q · 2+J · 3+10 · 4+9 · 5+8 · 6+7</li>
      </ul>
      <h3>Verfügbarkeit</h3>
      <p>Eine Karte ist nur <b>auswählbar</b>, wenn keine weitere Karte auf ihr liegt. In der Pyramide werden Karten erst frei, wenn die zwei darunterliegenden bereits entfernt sind.</p>
      <h3>Stock &amp; Waste</h3>
      <ul>
        <li>Klick auf den Stock legt eine Karte aufs Waste — die kann mit jeder verfügbaren Pyramidenkarte gepaart werden.</li>
        <li>Der Stock darf <b>zweimal</b> erneut durchgegangen werden.</li>
      </ul>`; }

    setup(boardEl) {
      this.board = boardEl;
      boardEl.innerHTML = '';
      this.allCards.length = 0;
      this.undo.clear();
      this.moves = 0;
      this.pyramid = [];
      this.stock = []; this.waste = []; this.removed = [];
      this.selected = null;
      this.recyclesLeft = 2;

      const deck = Cards.shuffle(Cards.makeDeck(1));
      for (let row = 0; row < 7; row++) {
        const arr = [];
        for (let i = 0; i <= row; i++) {
          const c = deck.pop();
          c.faceUp = true;
          arr.push(c);
        }
        this.pyramid.push(arr);
      }
      this.stock = deck;
      for (const c of this.stock) c.faceUp = false;

      // Slots
      this.slots.pyramid = []; // pro Reihe nur visuell egal
      this.slots.stock = Cards.makeSlot('↺', 'stock');
      this.slots.waste = Cards.makeSlot('', 'waste');
      this.slots.done = Cards.makeSlot('★', 'foundation foundation-hint');
      boardEl.appendChild(this.slots.stock);
      boardEl.appendChild(this.slots.waste);
      boardEl.appendChild(this.slots.done);

      // Karten rendern
      const all = [...this.pyramid.flat(), ...this.stock];
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
      // Pyramide: Basisreihe 7 Karten mit 0.55*w-Step (Gesamtbreite 4.3*w).
      // Höhe muss ebenfalls reichen: Pyramide (4.3*h) + Stock-Reihe (h) + Lücken.
      this.board.style.minHeight = ''; // alte min-height vom letzten Layout entfernen
      const boardH = this.board.clientHeight || 600;
      const baseGap = 14;
      const reservedV = baseGap * 3 + 20; // oben + unten + Stock-Spacing
      const maxCardH = (boardH - reservedV) / 5.3; // 4.3*h Pyramide + h Stockreihe
      const maxCardWFromHeight = Math.floor(maxCardH * 78 / 110);
      Cards.fitCardSize(this.board, 'pyramid', 7, { maxW: Math.min(180, maxCardWFromHeight) });
      const m = Cards.metrics(this.board);
      const boardW = this.board.clientWidth || 800;
      const left0 = m.gap;
      const top1 = m.gap;
      // Pyramide zentrieren. Bottom-Reihe = 7 Karten, Breite = 7*w + 6*halfgap
      const colStep = m.w * 0.55; // Überlappung
      const rowStep = m.h * 0.55;
      const bottomWidth = 6 * colStep + m.w;
      const baseX = Math.max(left0, (boardW - bottomWidth) / 2);

      for (let row = 0; row < 7; row++) {
        const cards = this.pyramid[row];
        const rowOffsetX = baseX + ((6 - row) * colStep) / 2; // grob
        // Genauer: bottom row centered at baseX..baseX+6*colStep. Reihe r ist auf den Mitten der unteren Karten.
        for (let i = 0; i <= row; i++) {
          const c = cards[i];
          if (!c) continue;
          const x = baseX + i * colStep + (6 - row) * (colStep / 2);
          const y = top1 + row * rowStep;
          Cards.placeCard(c, x, y, row * 10 + i + 1, animate);
          // Verdeckte Pyramidenkarte: Symbol neben die Zahl in den oberen
          // sichtbaren Streifen schieben (sonst läge es unter der Folgereihe).
          c.el.classList.toggle('covered', !this.isExposed(row, i));
        }
      }

      // Stock + Waste unter der Pyramide
      const pyrBottom = top1 + 6 * rowStep + m.h;
      const stockY = pyrBottom + m.gap + 10;
      this.slots.stock.style.left = left0 + 'px';
      this.slots.stock.style.top = stockY + 'px';
      this.slots.waste.style.left = (left0 + m.w + m.gap) + 'px';
      this.slots.waste.style.top = stockY + 'px';
      this.slots.done.style.left = (left0 + (m.w + m.gap) * 3) + 'px';
      this.slots.done.style.top = stockY + 'px';

      // Stock
      for (let i = 0; i < this.stock.length; i++) {
        Cards.placeCard(this.stock[i], left0, stockY, 100 + i, animate);
        if (this.stock[i].faceUp) Cards.setFaceUp(this.stock[i], false);
      }
      // Waste
      const wasteX = left0 + m.w + m.gap;
      for (let i = 0; i < this.waste.length; i++) {
        Cards.placeCard(this.waste[i], wasteX, stockY, 200 + i, animate);
        if (!this.waste[i].faceUp) Cards.setFaceUp(this.waste[i], true);
      }
      // Entfernte: rechts neben Done (gestapelt unsichtbar oder symbolisch)
      const doneX = left0 + (m.w + m.gap) * 3;
      for (let i = 0; i < this.removed.length; i++) {
        Cards.placeCard(this.removed[i], doneX, stockY, 300 + i, animate);
        if (!this.removed[i].faceUp) Cards.setFaceUp(this.removed[i], true);
      }

      this.board.style.minHeight = (stockY + m.h + m.gap) + 'px';
    }

    findCardLocation(card) {
      for (let row = 0; row < 7; row++) {
        const arr = this.pyramid[row];
        const idx = arr.indexOf(card);
        if (idx >= 0) return { kind: 'pyramid', row, idx };
      }
      if (this.waste.length && this.waste[this.waste.length-1] === card) return { kind: 'waste' };
      if (this.stock.includes(card)) return { kind: 'stock' };
      return null;
    }

    isExposed(row, idx) {
      if (row === 6) return true;
      const below = this.pyramid[row + 1];
      if (!below) return true;
      const left = below[idx];
      const right = below[idx + 1];
      return !left && !right;
    }

    isAvailable(card) {
      const loc = this.findCardLocation(card);
      if (!loc) return false;
      if (loc.kind === 'pyramid') return this.isExposed(loc.row, loc.idx);
      if (loc.kind === 'waste') return true;
      return false;
    }

    pickup(card) {
      // Wir nutzen Click-to-Select, kein Drag.
      return null;
    }

    drop() { return false; }

    tap(card) {
      if (this.stock.includes(card)) { this.drawStock(); return; }
      if (!this.isAvailable(card)) return;

      // König = 13 -> einzeln entfernen
      if (card.rank === 13) {
        this.removeCards([card]);
        this.selected = null;
        return;
      }

      if (!this.selected) {
        this.selected = card;
        card.el.classList.add('selected');
        return;
      }
      if (this.selected === card) {
        card.el.classList.remove('selected');
        this.selected = null;
        return;
      }
      if (this.selected.rank + card.rank === 13) {
        const pair = [this.selected, card];
        this.selected.el.classList.remove('selected');
        this.selected = null;
        this.removeCards(pair);
        return;
      }
      // Andere Auswahl
      this.selected.el.classList.remove('selected');
      this.selected = card;
      card.el.classList.add('selected');
    }

    tapEmpty(e) {
      // Stock-Slot Klick?
      const rect = this.board.getBoundingClientRect();
      const x = e.clientX - rect.left + this.board.scrollLeft;
      const y = e.clientY - rect.top + this.board.scrollTop;
      const m = Cards.metrics();
      const sx = parseFloat(this.slots.stock.style.left);
      const sy = parseFloat(this.slots.stock.style.top);
      if (x >= sx && x <= sx + m.w && y >= sy && y <= sy + m.h) {
        this.drawStock();
      }
      // Klick außerhalb -> Auswahl aufheben
      if (this.selected) {
        this.selected.el.classList.remove('selected');
        this.selected = null;
      }
    }

    drawStock() {
      if (this.stock.length === 0) {
        if (this.recyclesLeft <= 0) {
          Cards.toast('Stock leer.');
          return;
        }
        const recycled = this.waste.splice(0, this.waste.length).reverse();
        for (const c of recycled) Cards.setFaceUp(c, false);
        for (const c of recycled) this.stock.push(c);
        this.recyclesLeft--;
        this.undo.push({ type: 'recycle' });
        this.moves++;
        this.layout(true);
        this.notify();
        return;
      }
      const c = this.stock.pop();
      Cards.setFaceUp(c, true);
      this.waste.push(c);
      this.undo.push({ type: 'draw' });
      this.moves++;
      this.layout(true);
      this.notify();
    }

    removeCards(cards) {
      const removedFrom = [];
      for (const c of cards) {
        const loc = this.findCardLocation(c);
        if (loc.kind === 'pyramid') {
          this.pyramid[loc.row][loc.idx] = null;
          removedFrom.push({ loc, card: c });
        } else if (loc.kind === 'waste') {
          this.waste.pop();
          removedFrom.push({ loc, card: c });
        }
        this.removed.push(c);
      }
      this.undo.push({ type: 'remove', items: removedFrom });
      this.moves++;
      this.layout(true);
      this.notify();
      this.checkWin();
    }

    doUndo() {
      const a = this.undo.pop();
      if (!a) return;
      if (a.type === 'draw') {
        const c = this.waste.pop();
        Cards.setFaceUp(c, false);
        this.stock.push(c);
      } else if (a.type === 'recycle') {
        const back = this.stock.splice(0, this.stock.length).reverse();
        for (const c of back) Cards.setFaceUp(c, true);
        this.waste.push(...back);
        this.recyclesLeft++;
      } else if (a.type === 'remove') {
        for (let i = a.items.length - 1; i >= 0; i--) {
          const it = a.items[i];
          this.removed.pop();
          if (it.loc.kind === 'pyramid') {
            this.pyramid[it.loc.row][it.loc.idx] = it.card;
          } else if (it.loc.kind === 'waste') {
            this.waste.push(it.card);
          }
        }
      }
      this.moves++;
      this.layout(true);
      this.notify();
    }

    checkWin() {
      const pyrLeft = this.pyramid.flat().some(c => c !== null);
      if (!pyrLeft) {
        if (this.onWin) this.onWin();
      }
    }

    notify() { if (this.onChange) this.onChange({ moves: this.moves }); }
    destroy() { if (this.board) this.board.innerHTML = ''; }
  }

  global.Pyramid = Pyramid;
})(window);
