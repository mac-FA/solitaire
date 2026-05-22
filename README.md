# Solitaire — Karten & Geduld

Eine schlichte, augenfreundliche Solitaire-PWA in Vanilla-JS mit vier klassischen Varianten:

- **Klondike** — Der bekannte Standard. Ziehmodus 1 oder 3 Karten wählbar.
- **Spider** — 10 Spalten, 8 Sequenzen sammeln. 1 / 2 / 4 Farben.
- **FreeCell** — Alle Karten offen, 4 Freizellen, strategisches Spiel.
- **Pyramide** — Karten paaren, die zusammen 13 ergeben.

## Bedienung

- **Ziehen**: Karten mit der Maus oder dem Finger ziehen und ablegen.
- **Tippen**: Eine Karte antippen schickt sie auf das Fundament (wenn möglich).
- **Stock klicken**: Neue Karte(n) aufdecken.
- **Zurück (↶)**: Letzten Zug rückgängig machen.
- **Neu (↻)**: Frisches Spiel starten.

### Tastatur

| Taste | Aktion |
| --- | --- |
| `U` / `Z` | Zug zurücknehmen |
| `N` | Neues Spiel |
| `F` | Vollbild |
| `Esc` | Zurück ins Menü |

## Features

- Dark Mode + Light Mode
- Vollbild-Modus
- Optimiert für Laptop und Android-Mobile (Pointer-Events, Touch-Gesten)
- Smooth-Animationen für jeden Zug
- Installierbar als PWA, läuft offline
- Statistik: Züge & Zeit
- Undo (unbegrenzt)
- Konfetti bei Sieg

## Lokal starten

Einfach in einem Browser öffnen — keine Build-Tools nötig.
Für PWA-Test (Service Worker) lokal via einfachem HTTP-Server:

```powershell
# z.B.
npx serve .
# oder Python:
python -m http.server
```

## Deploy auf GitHub Pages

Ordner pushen, in den Repository-Settings "Pages" auf den `main`-Branch + `/` (root) stellen.

## Struktur

```
Solitaire/
├── index.html
├── styles.css
├── app.js            # Menü, Routing, Theme, Fullscreen, Timer
├── cards.js          # Karten-Engine: Render, Pointer-Drag, Layout
├── klondike.js
├── spider.js
├── freecell.js
├── pyramid.js
├── manifest.webmanifest
├── sw.js
├── icon.svg
└── README.md
```
