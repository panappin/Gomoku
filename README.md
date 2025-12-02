# Gomoku (Five-in-a-Row)

A browser-based Gomoku game with neon styling, depth‑7 minimax AI (alpha‑beta, open‑four aware), and optional online play via WebSocket relay. Single board size: 13x13. Current version: 0.06.

## Features
- 13 x 13 board (fixed)
- Local Human vs Human or Human vs AI (minimax depth 7)
- Online Human vs Human: room-based, auto color assignment (Green = first, Orange = second), 2-player cap, reconnect state sync
- Threat-aware: blocks open-ended fours and finishes wins
- Highlights: last moves outlined; winning line glows with X overlay

## Quick start (local)
Open `index.html` directly in your browser (no build needed). If your browser blocks local files, run a tiny server:
```sh
python -m http.server 8000
# or
npx http-server -p 8000
# then visit http://localhost:8000/
```

## Hosting (GitHub Pages)
Files to deploy: `index.html`, `gomoku-ai.js`, `.nojekyll`.
1. Push to `main` with those files at repo root.
2. GitHub: Settings → Pages → Source = `main` / root → Save.
3. Visit `https://<user>.github.io/<repo>/`.

## Online play
- Requires a WebSocket relay (e.g., Render/Heroku/Fly). Use the relay WSS URL in the `ws` query param:  
  `https://<your-site>/?room=test123&ws=wss://your-relay.example`
- Mode → Online; auto assigns colors (Green first, Orange second). Room limited to 2. Reconnects request state.

## How to play
- Click a cell to place a stone. Green (first) moves first.
- Controls: Mode (Local/Online), Opponent, AI plays (Green/Orange), Room/connect for Online, Restart.
- Last moves show a blue frame; winning stones glow and display an “X”.

## AI notes
- Depth‑7 minimax with alpha‑beta pruning.
- Pre-move checks: immediate win, block opponent win, create/block open fours.
- Heuristic favors open threats and central/adjacent positioning.

## Files
- `index.html` – UI, board logic, styling.
- `gomoku-ai.js` – Minimax AI and heuristics.
- `server.js` – WebSocket relay (needs hosting for online play).
- `.nojekyll` – Prevents GitHub Pages processing.
- `package.json`, `Procfile` – For hosting the relay (e.g., Render/Heroku).

## Contributing
Issues/PRs welcome for UX polish, stronger AI heuristics, or online robustness.***
