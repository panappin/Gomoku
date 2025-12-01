// Simple Gomoku AI with immediate win/block + proximity heuristic.
// Expects a square board as Array<Array<"black"|"white"|"">>.
(function (global) {
  function findBestMove(board, aiColor) {
    return findBestMoveMinimax(board, aiColor, 7);
  }

  function findBestMoveMinimax(board, aiColor, depth = 3) {
    const size = board.length;
    const opp = aiColor === "black" ? "white" : "black";
    const center = (size - 1) / 2;

    const candidates = generateCandidates(board);
    const allEmpty = allEmptyCells(board);
    if (candidates.length === 0) return null;

    // Immediate win or block check first (use full empties for safety)
    for (const [r, c] of allEmpty) {
      if (isWinningMove(board, r, c, aiColor)) return [r, c];
    }
    for (const [r, c] of allEmpty) {
      if (isWinningMove(board, r, c, opp)) return [r, c];
    }
    // Urgent open-four create/block
    for (const [r, c] of allEmpty) {
      if (createsOpenFour(board, r, c, aiColor)) return [r, c];
    }
    for (const [r, c] of allEmpty) {
      if (createsOpenFour(board, r, c, opp)) return [r, c];
    }

    // Limit branching: sort by heuristic and keep top N
    const scored = candidates.map(([r, c]) => ({
      move: [r, c],
      score: moveScore(board, r, c, aiColor, center),
    }));
    scored.sort((a, b) => b.score - a.score);
    const pruned = scored.slice(0, 12).map((s) => s.move);

    let best = null;
    let bestVal = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    for (const [r, c] of pruned) {
      board[r][c] = aiColor;
      const val = minimax(board, depth - 1, false, aiColor, opp, alpha, beta, center);
      board[r][c] = "";
      if (val > bestVal) {
        bestVal = val;
        best = [r, c];
      }
      alpha = Math.max(alpha, bestVal);
      if (beta <= alpha) break;
    }
    return best || pruned[0] || candidates[0];
  }

  function minimax(board, depth, maximizing, aiColor, opp, alpha, beta, center) {
    const winner = detectWinner(board);
    if (winner === aiColor) return 1e6 + depth; // prefer quicker wins
    if (winner === opp) return -1e6 - depth; // avoid losses
    if (depth === 0) return evaluateBoard(board, aiColor, center);

    const moves = generateCandidates(board);
    if (!moves.length) return 0;

    if (maximizing) {
      let value = -Infinity;
      const ordered = orderMoves(board, moves, aiColor, center);
      for (const [r, c] of ordered) {
        board[r][c] = aiColor;
        value = Math.max(value, minimax(board, depth - 1, false, aiColor, opp, alpha, beta, center));
        board[r][c] = "";
        alpha = Math.max(alpha, value);
        if (beta <= alpha) break;
      }
      return value;
    } else {
      let value = Infinity;
      const ordered = orderMoves(board, moves, opp, center);
      for (const [r, c] of ordered) {
        board[r][c] = opp;
        value = Math.min(value, minimax(board, depth - 1, true, aiColor, opp, alpha, beta, center));
        board[r][c] = "";
        beta = Math.min(beta, value);
        if (beta <= alpha) break;
      }
      return value;
    }
  }

  function orderMoves(board, moves, color, center) {
    return moves
      .map(([r, c]) => ({
        move: [r, c],
        score: moveScore(board, r, c, color, center),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12) // keep a cap per node
      .map((s) => s.move);
  }

  function moveScore(board, r, c, color, center) {
    const adj = adjacencyScore(board, r, c, color);
    const oppAdj = adjacencyScore(board, r, c, color === "black" ? "white" : "black");
    const centerBias = -Math.abs(r - center) - Math.abs(c - center);
    return adj * 2 + oppAdj * 1 + centerBias * 0.1;
  }

  function evaluateBoard(board, aiColor, center) {
    const opp = aiColor === "black" ? "white" : "black";
    const size = board.length;
    let score = 0;

    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const color = board[r][c];
        if (!color) continue;
        for (const [dr, dc] of dirs) {
          const pr = r - dr;
          const pc = c - dc;
          // Only evaluate lines from their starting cell to avoid double count
          if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === color) continue;
          const { length, openEnds } = lineInfo(board, r, c, dr, dc, color);
          if (length >= 5) {
            score += color === aiColor ? 1e6 : -1e6;
            continue;
          }
          const val = patternScore(length, openEnds);
          score += color === aiColor ? val : -val;
        }
      }
    }

    return score;
  }

  function patternScore(length, openEnds) {
    if (length === 4 && openEnds === 2) return 50000; // open four -> must take
    if (length === 4 && openEnds === 1) return 800;
    if (length === 3 && openEnds === 2) return 300;
    if (length === 3 && openEnds === 1) return 60;
    if (length === 2 && openEnds === 2) return 20;
    if (length === 2 && openEnds === 1) return 8;
    if (length === 1 && openEnds === 2) return 2;
    return 0;
  }

  function lineInfo(board, r, c, dr, dc, color) {
    const size = board.length;
    let length = 1;
    let endBlockedPos = false;
    let endBlockedNeg = false;

    // forward
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nc >= 0 && nr < size && nc < size && board[nr][nc] === color) {
      length++;
      nr += dr;
      nc += dc;
    }
    if (!(nr >= 0 && nc >= 0 && nr < size && nc < size) || board[nr][nc] && board[nr][nc] !== color) {
      endBlockedPos = true;
    }

    // backward
    nr = r - dr;
    nc = c - dc;
    while (nr >= 0 && nc >= 0 && nr < size && nc < size && board[nr][nc] === color) {
      length++;
      nr -= dr;
      nc -= dc;
    }
    if (!(nr >= 0 && nc >= 0 && nr < size && nc < size) || board[nr][nc] && board[nr][nc] !== color) {
      endBlockedNeg = true;
    }

    const openEnds = (endBlockedPos ? 0 : 1) + (endBlockedNeg ? 0 : 1);
    return { length, openEnds };
  }

  function detectWinner(board) {
    const size = board.length;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const color = board[r][c];
        if (!color) continue;
        if (hasFiveFrom(board, r, c, color)) return color;
      }
    }
    return null;
  }

  function generateCandidates(board) {
    const size = board.length;
    const near = [];
    const empty = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c]) continue;
        empty.push([r, c]);
        if (neighborsAround(board, r, c, 2)) near.push([r, c]);
      }
    }
    return near.length ? near : empty;
  }

  function neighborsAround(board, r, c, radius = 2) {
    const size = board.length;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
        if (board[nr][nc]) return true;
      }
    }
    return false;
  }

  function isWinningMove(board, r, c, color) {
    if (board[r][c]) return false;
    board[r][c] = color;
    const win = hasFiveFrom(board, r, c, color);
    board[r][c] = "";
    return win;
  }

  function allEmptyCells(board) {
    const size = board.length;
    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!board[r][c]) cells.push([r, c]);
      }
    }
    return cells;
  }

  function createsOpenFour(board, r, c, color) {
    if (board[r][c]) return false;
    board[r][c] = color;
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (const [dr, dc] of dirs) {
      const { length, openEnds } = lineInfo(board, r, c, dr, dc, color);
      if (length === 4 && openEnds === 2) {
        board[r][c] = "";
        return true;
      }
    }
    board[r][c] = "";
    return false;
  }

  function hasFiveFrom(board, r, c, color) {
    const size = board.length;
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (const [dr, dc] of dirs) {
      let count = 1;
      count += countDir(board, r, c, dr, dc, color);
      count += countDir(board, r, c, -dr, -dc, color);
      if (count >= 5) return true;
    }
    return false;
  }

  function countDir(board, r, c, dr, dc, color) {
    const size = board.length;
    let n = 0;
    for (let i = 1; i < 5; i++) {
      const nr = r + dr * i;
      const nc = c + dc * i;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) break;
      if (board[nr][nc] !== color) break;
      n++;
    }
    return n;
  }

  function adjacencyScore(board, r, c, color) {
    const size = board.length;
    let score = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
        if (board[nr][nc] === color) score += 1;
      }
    }
    return score;
  }

  function boardIsEmpty(board) {
    for (const row of board) {
      for (const cell of row) {
        if (cell) return false;
      }
    }
    return true;
  }

  // Attach to global for non-module use.
  global.findBestMove = findBestMove;
  global.findBestMoveMinimax = findBestMoveMinimax;
})(typeof window !== "undefined" ? window : globalThis);
