# Gomoku (Five-in-a-Row)

A browser-based Gomoku game with neon styling and a depth‑7 minimax AI (alpha‑beta, open‑four aware). Play locally or host as static files (GitHub Pages ready).

## Features
- 13x13 / 15x15 / 19x19 boards
- Human vs Human or Human vs AI (minimax depth 7)
- Threat-aware: blocks open-ended fours and finishes wins
- Highlights: last moves outlined; winning line glows with X overlay

## Quick start (local)
Open `index.html` directly in your browser (no build needed). If your browser blocks local module imports, run a tiny server:
```sh
python -m http.server 8000
# then visit http://localhost:8000/
```

## Hosting (GitHub Pages)
Files to deploy: `index.html`, `gomoku-ai.js`, `.nojekyll` (optional but recommended).
1. Push to your repo’s `main` branch with those files at the root.
2. In GitHub: Settings → Pages → Source = `main` / `/ (root)` → Save.
3. After Pages deploys, visit `https://<user>.github.io/<repo>/`.

## How to play
- Click a cell to place a stone. Black moves first.
- Dropdowns: choose opponent (AI or Human), AI color, and board size. Restart resets the game.
- Last moves for both players show a blue square frame; winning stones glow and display an “X”.

## AI notes
- Depth‑7 minimax with alpha‑beta pruning.
- Pre-move checks: immediate win, block opponent win, create/block open fours.
- Heuristic favors open threats and central/adjacent positioning.

## Files
- `index.html` – UI, board logic, styling.
- `gomoku-ai.js` – Minimax AI and heuristics.
- `.nojekyll` – Prevents GitHub Pages from processing files (safe to keep).

## Contributing
Feel free to open issues/PRs for UX tweaks, stronger AI heuristics, or performance improvements on large boards.***
