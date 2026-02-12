// ==================== CONFIGURACIÓN ====================

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : 'https://chess-app-backend-ykak.onrender.com/api';

// Estado de autenticación
let currentUser = null;
let authToken = null;

// Estado del juego
let board = [];
let currentTurn = 'white';
let selectedPiece = null;
let moves = [];
let capturedPieces = { white: [], black: [] };
let gameMode = null;
let isAIThinking = false;
let moveHistory = [];
let castleRights = {
  white: { kingside: true, queenside: true },
  black: { kingside: true, queenside: true }
};
let enPassantTarget = null;
let lastMove = null;

// Elementos del DOM
const authScreen = document.getElementById('auth-screen');
const modeScreen = document.getElementById('mode-screen');
const gameScreen = document.getElementById('game-screen');
const boardElement = document.getElementById('board');
const turnInfo = document.getElementById('turn-info');

// ==================== INICIALIZACIÓN ====================

function initBoard() {
  board = [
    ['♜','♞','♝','♛','♚','♝','♞','♜'],
    ['♟','♟','♟','♟','♟','♟','♟','♟'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['♙','♙','♙','♙','♙','♙','♙','♙'],
    ['♖','♘','♗','♕','♔','♗','♘','♖']
  ];
  currentTurn = 'white';
  selectedPiece = null;
  moves = [];
  moveHistory = [];
  capturedPieces = { white: [], black: [] };
  castleRights = {
    white: { kingside: true, queenside: true },
    black: { kingside: true, queenside: true }
  };
  enPassantTarget = null;
  lastMove = null;
  isAIThinking = false;
}

// ==================== AUTENTICACIÓN ====================

function showMessage(message, isError = false) {
  const authMessage = document.getElementById('auth-message');
  authMessage.textContent = message;
  authMessage.className = isError ? 'message error' : 'message success';
  setTimeout(() => authMessage.className = 'message', 5000);
}

document.getElementById('show-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
});

document.getElementById('show-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
});

document.getElementById('register-btn')?.addEventListener('click', async () => {
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  if (!username || !email || !password) {
    showMessage('Todos los campos son requeridos', true);
    return;
  }

  try {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();
    if (response.ok) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      showMessage('¡Registro exitoso!', false);
      setTimeout(showModeScreen, 1000);
    } else {
      showMessage(data.error || 'Error al registrarse', true);
    }
  } catch (error) {
    showMessage('Error de conexión con el servidor', true);
  }
});

document.getElementById('login-btn')?.addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showMessage('Usuario y contraseña son requeridos', true);
    return;
  }

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (response.ok) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      showMessage('¡Login exitoso!', false);
      setTimeout(showModeScreen, 1000);
    } else {
      showMessage(data.error || 'Credenciales inválidas', true);
    }
  } catch (error) {
    showMessage('Error de conexión con el servidor', true);
  }
});

async function verifyToken() {
  const token = localStorage.getItem('authToken');
  if (!token) return false;

  try {
    const response = await fetch(`${API_URL}/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      authToken = token;
      currentUser = data.user;
      return true;
    } else {
      localStorage.removeItem('authToken');
      return false;
    }
  } catch (error) {
    return false;
  }
}

// ==================== NAVEGACIÓN ====================

function showModeScreen() {
  authScreen.style.display = 'none';
  modeScreen.style.display = 'flex';
  gameScreen.style.display = 'none';
}

function showGameScreen() {
  authScreen.style.display = 'none';
  modeScreen.style.display = 'none';
  gameScreen.style.display = 'flex';
  document.getElementById('username-display').textContent = `👤 ${currentUser.username}`;
  initBoard();
  renderBoard();
}

document.getElementById('mode-vs-ai')?.addEventListener('click', () => {
  gameMode = 'ai';
  document.getElementById('game-mode-text').textContent = '🤖 VS Computadora';
  document.getElementById('black-player').textContent = 'Computadora (IA)';
  document.getElementById('white-player').textContent = currentUser.username;
  showGameScreen();
});

document.getElementById('mode-vs-player')?.addEventListener('click', () => {
  gameMode = 'player';
  document.getElementById('game-mode-text').textContent = '👥 VS Jugador';
  document.getElementById('black-player').textContent = 'Jugador 2';
  document.getElementById('white-player').textContent = currentUser.username;
  showGameScreen();
});

document.getElementById('back-to-menu')?.addEventListener('click', () => {
  localStorage.removeItem('authToken');
  authToken = null;
  currentUser = null;
  modeScreen.style.display = 'none';
  authScreen.style.display = 'flex';
});

document.getElementById('back-btn')?.addEventListener('click', () => {
  gameScreen.style.display = 'none';
  showModeScreen();
});

// ==================== UTILIDADES DE AJEDREZ ====================

function isPieceWhite(piece) {
  return ['♖','♘','♗','♕','♔','♙'].includes(piece);
}

function isPieceBlack(piece) {
  return ['♜','♞','♝','♛','♚','♟'].includes(piece);
}

function getPieceType(piece) {
  const types = {
    '♔': 'king', '♚': 'king',
    '♕': 'queen', '♛': 'queen',
    '♖': 'rook', '♜': 'rook',
    '♗': 'bishop', '♝': 'bishop',
    '♘': 'knight', '♞': 'knight',
    '♙': 'pawn', '♟': 'pawn'
  };
  return types[piece] || null;
}

function findKing(color) {
  const kingPiece = color === 'white' ? '♔' : '♚';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === kingPiece) {
        return { row, col };
      }
    }
  }
  return null;
}

function isSquareUnderAttack(row, col, byColor) {
  for (let fromRow = 0; fromRow < 8; fromRow++) {
    for (let fromCol = 0; fromCol < 8; fromCol++) {
      const piece = board[fromRow][fromCol];
      if (!piece) continue;
      
      if ((byColor === 'white' && isPieceWhite(piece)) || 
          (byColor === 'black' && isPieceBlack(piece))) {
        if (canPieceAttack(fromRow, fromCol, row, col)) {
          return true;
        }
      }
    }
  }
  return false;
}

function canPieceAttack(fromRow, fromCol, toRow, toCol) {
  const piece = board[fromRow][fromCol];
  if (!piece) return false;
  
  const pieceType = getPieceType(piece);
  const isWhite = isPieceWhite(piece);
  
  switch (pieceType) {
    case 'pawn':
      const direction = isWhite ? -1 : 1;
      return Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction;
    case 'rook':
      return isValidRookMove(fromRow, fromCol, toRow, toCol);
    case 'knight':
      return isValidKnightMove(fromRow, fromCol, toRow, toCol);
    case 'bishop':
      return isValidBishopMove(fromRow, fromCol, toRow, toCol);
    case 'queen':
      return isValidQueenMove(fromRow, fromCol, toRow, toCol);
    case 'king':
      return isValidKingMove(fromRow, fromCol, toRow, toCol);
    default:
      return false;
  }
}

function isInCheck(color) {
  const king = findKing(color);
  if (!king) return false;
  return isSquareUnderAttack(king.row, king.col, color === 'white' ? 'black' : 'white');
}

function wouldBeInCheck(fromRow, fromCol, toRow, toCol, color) {
  const originalPiece = board[toRow][toCol];
  const movingPiece = board[fromRow][fromCol];
  
  board[toRow][toCol] = movingPiece;
  board[fromRow][fromCol] = null;
  
  const inCheck = isInCheck(color);
  
  board[fromRow][fromCol] = movingPiece;
  board[toRow][toCol] = originalPiece;
  
  return inCheck;
}

// ==================== VALIDACIÓN DE MOVIMIENTOS ====================

function isValidPawnMove(fromRow, fromCol, toRow, toCol, isWhite) {
  const direction = isWhite ? -1 : 1;
  const startRow = isWhite ? 6 : 1;
  
  // Movimiento hacia adelante
  if (fromCol === toCol && !board[toRow][toCol]) {
    if (toRow === fromRow + direction) return true;
    if (fromRow === startRow && toRow === fromRow + 2 * direction && !board[fromRow + direction][toCol]) {
      return true;
    }
  }
  
  // Captura diagonal
  if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction) {
    const target = board[toRow][toCol];
    if (target && ((isWhite && isPieceBlack(target)) || (!isWhite && isPieceWhite(target)))) {
      return true;
    }
    // En passant
    if (enPassantTarget && enPassantTarget.row === toRow && enPassantTarget.col === toCol) {
      return true;
    }
  }
  
  return false;
}

function isValidRookMove(fromRow, fromCol, toRow, toCol) {
  if (fromRow !== toRow && fromCol !== toCol) return false;
  
  const rowStep = fromRow === toRow ? 0 : (toRow > fromRow ? 1 : -1);
  const colStep = fromCol === toCol ? 0 : (toCol > fromCol ? 1 : -1);
  
  let row = fromRow + rowStep;
  let col = fromCol + colStep;
  
  while (row !== toRow || col !== toCol) {
    if (board[row][col]) return false;
    row += rowStep;
    col += colStep;
  }
  
  return true;
}

function isValidKnightMove(fromRow, fromCol, toRow, toCol) {
  const rowDiff = Math.abs(fromRow - toRow);
  const colDiff = Math.abs(fromCol - toCol);
  return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
}

function isValidBishopMove(fromRow, fromCol, toRow, toCol) {
  if (Math.abs(fromRow - toRow) !== Math.abs(fromCol - toCol)) return false;
  
  const rowStep = toRow > fromRow ? 1 : -1;
  const colStep = toCol > fromCol ? 1 : -1;
  
  let row = fromRow + rowStep;
  let col = fromCol + colStep;
  
  while (row !== toRow || col !== toCol) {
    if (board[row][col]) return false;
    row += rowStep;
    col += colStep;
  }
  
  return true;
}

function isValidQueenMove(fromRow, fromCol, toRow, toCol) {
  return isValidRookMove(fromRow, fromCol, toRow, toCol) || 
         isValidBishopMove(fromRow, fromCol, toRow, toCol);
}

function isValidKingMove(fromRow, fromCol, toRow, toCol) {
  const rowDiff = Math.abs(fromRow - toRow);
  const colDiff = Math.abs(fromCol - toCol);
  return rowDiff <= 1 && colDiff <= 1;
}

function canCastle(color, side) {
  const row = color === 'white' ? 7 : 0;
  const kingCol = 4;
  const rookCol = side === 'kingside' ? 7 : 0;
  
  if (!castleRights[color][side]) return false;
  if (isInCheck(color)) return false;
  
  const step = side === 'kingside' ? 1 : -1;
  const end = side === 'kingside' ? 7 : 0;
  
  for (let col = kingCol + step; col !== end; col += step) {
    if (board[row][col]) return false;
    if (isSquareUnderAttack(row, col, color === 'white' ? 'black' : 'white')) return false;
  }
  
  return true;
}

function isValidMove(fromRow, fromCol, toRow, toCol) {
  if (fromRow === toRow && fromCol === toCol) return false;
  if (toRow < 0 || toRow > 7 || toCol < 0 || toCol > 7) return false;

  const piece = board[fromRow][fromCol];
  const target = board[toRow][toCol];
  
  if (!piece) return false;
  
  if (target && ((isPieceWhite(piece) && isPieceWhite(target)) || 
                 (isPieceBlack(piece) && isPieceBlack(target)))) {
    return false;
  }

  const pieceType = getPieceType(piece);
  const isWhite = isPieceWhite(piece);
  const color = isWhite ? 'white' : 'black';

  let isValid = false;

  switch (pieceType) {
    case 'pawn':
      isValid = isValidPawnMove(fromRow, fromCol, toRow, toCol, isWhite);
      break;
    case 'rook':
      isValid = isValidRookMove(fromRow, fromCol, toRow, toCol);
      break;
    case 'knight':
      isValid = isValidKnightMove(fromRow, fromCol, toRow, toCol);
      break;
    case 'bishop':
      isValid = isValidBishopMove(fromRow, fromCol, toRow, toCol);
      break;
    case 'queen':
      isValid = isValidQueenMove(fromRow, fromCol, toRow, toCol);
      break;
    case 'king':
      isValid = isValidKingMove(fromRow, fromCol, toRow, toCol);
      // Enroque
      if (!isValid && fromRow === toRow && Math.abs(fromCol - toCol) === 2) {
        const side = toCol > fromCol ? 'kingside' : 'queenside';
        isValid = canCastle(color, side);
      }
      break;
    default:
      return false;
  }

  if (!isValid) return false;
  
  // No puede dejarse en jaque
  return !wouldBeInCheck(fromRow, fromCol, toRow, toCol, color);
}

function getAllValidMoves(color) {
  const validMoves = [];
  for (let fromRow = 0; fromRow < 8; fromRow++) {
    for (let fromCol = 0; fromCol < 8; fromCol++) {
      const piece = board[fromRow][fromCol];
      if (!piece) continue;
      if ((color === 'white' && !isPieceWhite(piece)) || 
          (color === 'black' && !isPieceBlack(piece))) continue;
      
      for (let toRow = 0; toRow < 8; toRow++) {
        for (let toCol = 0; toCol < 8; toCol++) {
          if (isValidMove(fromRow, fromCol, toRow, toCol)) {
            validMoves.push({ fromRow, fromCol, toRow, toCol, piece });
          }
        }
      }
    }
  }
  return validMoves;
}

// ==================== CONDICIONES DE FIN DE JUEGO ====================

function isCheckmate(color) {
  if (!isInCheck(color)) return false;
  return getAllValidMoves(color).length === 0;
}

function isStalemate(color) {
  if (isInCheck(color)) return false;
  return getAllValidMoves(color).length === 0;
}

function checkGameEnd() {
  // Jaque mate
  if (isCheckmate(currentTurn)) {
    const winner = currentTurn === 'white' ? 'Negras' : 'Blancas';
    setTimeout(() => {
      showWinnerAnimation(`¡Jaque Mate! ${winner} ganan 🏆`);
      saveGameToServer(winner);
      setTimeout(resetGame, 3000);
    }, 100);
    return true;
  }
  
  // Ahogado
  if (isStalemate(currentTurn)) {
    setTimeout(() => {
      showWinnerAnimation('¡Tablas por Ahogado! 🤝');
      saveGameToServer('Empate');
      setTimeout(resetGame, 3000);
    }, 100);
    return true;
  }
  
  // Rey capturado (no debería pasar pero por si acaso)
  const whiteKing = findKing('white');
  const blackKing = findKing('black');
  if (!whiteKing || !blackKing) {
    const winner = !blackKing ? 'Blancas' : 'Negras';
    setTimeout(() => {
      showWinnerAnimation(`${winner} ganan 🏆`);
      saveGameToServer(winner);
      setTimeout(resetGame, 3000);
    }, 100);
    return true;
  }
  
  return false;
}

// ==================== PROMOCIÓN DE PEONES ====================

function showPromotionModal(row, col, color) {
  const modal = document.getElementById('promotion-modal');
  const piecesContainer = document.getElementById('promotion-pieces');
  
  const pieces = color === 'white' 
    ? ['♕', '♖', '♗', '♘'] 
    : ['♛', '♜', '♝', '♞'];
  
  piecesContainer.innerHTML = '';
  
  pieces.forEach(piece => {
    const div = document.createElement('div');
    div.className = `promotion-piece ${color}`;
    div.textContent = piece;
    div.addEventListener('click', () => {
      board[row][col] = piece;
      modal.style.display = 'none';
      renderBoard();
      
      // Continuar el juego
      currentTurn = currentTurn === 'white' ? 'black' : 'white';
      
      if (checkGameEnd()) return;
      
      renderBoard();
      
      if (gameMode === 'ai' && currentTurn === 'black') {
        makeAIMove();
      }
    });
    piecesContainer.appendChild(div);
  });
  
  modal.style.display = 'flex';
}

function checkPromotion(row, col) {
  const piece = board[row][col];
  if (getPieceType(piece) === 'pawn') {
    if ((isPieceWhite(piece) && row === 0) || (isPieceBlack(piece) && row === 7)) {
      const color = isPieceWhite(piece) ? 'white' : 'black';
      showPromotionModal(row, col, color);
      return true;
    }
  }
  return false;
}

// ==================== IA MEJORADA CON MINIMAX ====================

function evaluateBoard() {
  const pieceValues = {
    'pawn': 100,
    'knight': 320,
    'bishop': 330,
    'rook': 500,
    'queen': 900,
    'king': 20000
  };
  
  let score = 0;
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      
      const pieceType = getPieceType(piece);
      const value = pieceValues[pieceType] || 0;
      
      if (isPieceBlack(piece)) {
        score += value;
      } else {
        score -= value;
      }
      
      // Bonus por control del centro
      const centerBonus = (3 - Math.abs(3.5 - row)) + (3 - Math.abs(3.5 - col));
      if (isPieceBlack(piece)) {
        score += centerBonus * 5;
      } else {
        score -= centerBonus * 5;
      }
    }
  }
  
  return score;
}

function minimax(depth, isMaximizing, alpha, beta) {
  if (depth === 0) {
    return evaluateBoard();
  }
  
  const color = isMaximizing ? 'black' : 'white';
  const moves = getAllValidMoves(color);
  
  if (moves.length === 0) {
    if (isInCheck(color)) {
      return isMaximizing ? -999999 : 999999;
    }
    return 0;
  }
  
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const capturedPiece = board[move.toRow][move.toCol];
      board[move.toRow][move.toCol] = board[move.fromRow][move.fromCol];
      board[move.fromRow][move.fromCol] = null;
      
      const evaluation = minimax(depth - 1, false, alpha, beta);
      
      board[move.fromRow][move.fromCol] = board[move.toRow][move.toCol];
      board[move.toRow][move.toCol] = capturedPiece;
      
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const capturedPiece = board[move.toRow][move.toCol];
      board[move.toRow][move.toCol] = board[move.fromRow][move.fromCol];
      board[move.fromRow][move.fromCol] = null;
      
      const evaluation = minimax(depth - 1, true, alpha, beta);
      
      board[move.fromRow][move.fromCol] = board[move.toRow][move.toCol];
      board[move.toRow][move.toCol] = capturedPiece;
      
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function makeAIMove() {
  if (isAIThinking) return;
  isAIThinking = true;
  
  setTimeout(() => {
    const validMoves = getAllValidMoves('black');
    
    if (validMoves.length === 0) {
      isAIThinking = false;
      checkGameEnd();
      return;
    }
    
    let bestMove = validMoves[0];
    let bestScore = -Infinity;
    
    for (const move of validMoves) {
      const capturedPiece = board[move.toRow][move.toCol];
      board[move.toRow][move.toCol] = board[move.fromRow][move.fromCol];
      board[move.fromRow][move.fromCol] = null;
      
      const score = minimax(2, false, -Infinity, Infinity);
      
      board[move.fromRow][move.fromCol] = board[move.toRow][move.toCol];
      board[move.toRow][move.toCol] = capturedPiece;
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    
    const movingPiece = board[bestMove.fromRow][bestMove.fromCol];
    const pieceType = getPieceType(movingPiece);
    
    // Detectar enroque
    const isCastling = pieceType === 'king' && Math.abs(bestMove.fromCol - bestMove.toCol) === 2;
    
    if (isCastling) {
      // Realizar enroque
      const side = bestMove.toCol > bestMove.fromCol ? 'kingside' : 'queenside';
      const rookFromCol = side === 'kingside' ? 7 : 0;
      const rookToCol = side === 'kingside' ? 5 : 3;
      
      // Mover rey
      board[bestMove.toRow][bestMove.toCol] = movingPiece;
      board[bestMove.fromRow][bestMove.fromCol] = null;
      
      // Mover torre
      board[bestMove.toRow][rookToCol] = '♜';
      board[bestMove.toRow][rookFromCol] = null;
      
      // Eliminar derechos de enroque
      castleRights.black.kingside = false;
      castleRights.black.queenside = false;
    } else {
      // Ejecutar movimiento normal
      const capturedPiece = board[bestMove.toRow][bestMove.toCol];
      if (capturedPiece && isPieceWhite(capturedPiece)) {
        capturedPieces.black.push(capturedPiece);
        updateCapturedPieces();
      }
      
      board[bestMove.toRow][bestMove.toCol] = board[bestMove.fromRow][bestMove.fromCol];
      board[bestMove.fromRow][bestMove.fromCol] = null;
      
      // Actualizar derechos de enroque si se mueve el rey
      if (pieceType === 'king') {
        castleRights.black.kingside = false;
        castleRights.black.queenside = false;
      }
      
      // Actualizar derechos de enroque si se mueve una torre
      if (pieceType === 'rook' && bestMove.fromRow === 0) {
        if (bestMove.fromCol === 0) castleRights.black.queenside = false;
        if (bestMove.fromCol === 7) castleRights.black.kingside = false;
      }
    }
    
    lastMove = bestMove;
    
    const fromFile = String.fromCharCode(97 + bestMove.fromCol);
    const fromRank = 8 - bestMove.fromRow;
    const toFile = String.fromCharCode(97 + bestMove.toCol);
    const toRank = 8 - bestMove.toRow;
    moves.push(`${fromFile}${fromRank}${toFile}${toRank}`);
    
    // Promoción automática de peón de IA
    if (getPieceType(board[bestMove.toRow][bestMove.toCol]) === 'pawn' && bestMove.toRow === 7) {
      board[bestMove.toRow][bestMove.toCol] = '♛';
    }
    
    currentTurn = 'white';
    isAIThinking = false;
    
    renderBoard();
    checkGameEnd();
  }, 800);
}

// ==================== RENDERIZADO ====================

function renderBoard() {
  boardElement.innerHTML = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement('div');
      square.classList.add('square');
      if ((row + col) % 2 === 0) square.classList.add('light');
      else square.classList.add('dark');

      const piece = board[row][col];
      if (piece) {
        const pieceElement = document.createElement('span');
        pieceElement.classList.add('piece');
        pieceElement.classList.add(isPieceWhite(piece) ? 'white' : 'black');
        pieceElement.textContent = piece;
        square.appendChild(pieceElement);
      }

      square.addEventListener('click', () => handleSquareClick(row, col));
      boardElement.appendChild(square);
    }
  }
  
  const turnEmoji = currentTurn === 'white' ? '⚪' : '⚫';
  const turnText = currentTurn === 'white' ? 'Blancas' : 'Negras';
  turnInfo.innerHTML = `<div class="turn-icon">${turnEmoji}</div><div>Turno: <strong>${turnText}</strong></div>`;
  
  // Mostrar si está en jaque
  if (isInCheck(currentTurn)) {
    turnInfo.innerHTML += '<div style="color: #ff6b6b; font-weight: bold; margin-top: 5px;">⚠️ ¡JAQUE!</div>';
  }
}

function handleSquareClick(row, col) {
  if (gameMode === 'ai' && currentTurn === 'black') return;
  if (isAIThinking) return;
  
  if (selectedPiece) {
    if (isValidMove(selectedPiece.row, selectedPiece.col, row, col)) {
      const movingPiece = board[selectedPiece.row][selectedPiece.col];
      const pieceType = getPieceType(movingPiece);
      const isWhite = isPieceWhite(movingPiece);
      const color = isWhite ? 'white' : 'black';
      
      // Detectar enroque
      const isCastling = pieceType === 'king' && Math.abs(selectedPiece.col - col) === 2;
      
      if (isCastling) {
        // Realizar enroque
        const side = col > selectedPiece.col ? 'kingside' : 'queenside';
        const rookFromCol = side === 'kingside' ? 7 : 0;
        const rookToCol = side === 'kingside' ? 5 : 3;
        const rook = color === 'white' ? '♖' : '♜';
        
        // Mover rey
        board[row][col] = movingPiece;
        board[selectedPiece.row][selectedPiece.col] = null;
        
        // Mover torre
        board[row][rookToCol] = rook;
        board[row][rookFromCol] = null;
        
        // Eliminar derechos de enroque
        castleRights[color].kingside = false;
        castleRights[color].queenside = false;
      } else {
        // Capturar pieza
        const capturedPiece = board[row][col];
        if (capturedPiece) {
          if (isPieceWhite(capturedPiece)) capturedPieces.black.push(capturedPiece);
          else capturedPieces.white.push(capturedPiece);
          updateCapturedPieces();
        }
        
        // Manejar en passant
        if (pieceType === 'pawn' && enPassantTarget && 
            row === enPassantTarget.row && col === enPassantTarget.col) {
          const captureRow = isWhite ? row + 1 : row - 1;
          const capturedPawn = board[captureRow][col];
          if (capturedPawn) {
            if (isPieceWhite(capturedPawn)) capturedPieces.black.push(capturedPawn);
            else capturedPieces.white.push(capturedPawn);
            board[captureRow][col] = null;
            updateCapturedPieces();
          }
        }
        
        // Mover pieza
        board[row][col] = movingPiece;
        board[selectedPiece.row][selectedPiece.col] = null;
        
        // Actualizar derechos de enroque si se mueve el rey
        if (pieceType === 'king') {
          castleRights[color].kingside = false;
          castleRights[color].queenside = false;
        }
        
        // Actualizar derechos de enroque si se mueve una torre
        if (pieceType === 'rook') {
          if (isWhite && selectedPiece.row === 7) {
            if (selectedPiece.col === 0) castleRights.white.queenside = false;
            if (selectedPiece.col === 7) castleRights.white.kingside = false;
          } else if (!isWhite && selectedPiece.row === 0) {
            if (selectedPiece.col === 0) castleRights.black.queenside = false;
            if (selectedPiece.col === 7) castleRights.black.kingside = false;
          }
        }
        
        // Actualizar en passant
        enPassantTarget = null;
        if (pieceType === 'pawn' && Math.abs(selectedPiece.row - row) === 2) {
          enPassantTarget = { row: (selectedPiece.row + row) / 2, col };
        }
      }
      
      lastMove = { fromRow: selectedPiece.row, fromCol: selectedPiece.col, toRow: row, toCol: col };
      
      const fromFile = String.fromCharCode(97 + selectedPiece.col);
      const fromRank = 8 - selectedPiece.row;
      const toFile = String.fromCharCode(97 + col);
      const toRank = 8 - row;
      moves.push(`${fromFile}${fromRank}${toFile}${toRank}`);
      
      selectedPiece = null;
      
      // Verificar promoción de peón
      if (checkPromotion(row, col)) {
        return; // El modal de promoción manejará el resto
      }
      
      currentTurn = currentTurn === 'white' ? 'black' : 'white';
      
      if (checkGameEnd()) {
        renderBoard();
        return;
      }
      
      renderBoard();
      
      if (gameMode === 'ai' && currentTurn === 'black') {
        makeAIMove();
      }
    } else {
      selectedPiece = null;
      renderBoard();
    }
  } else {
    const piece = board[row][col];
    if (piece && ((currentTurn === 'white' && isPieceWhite(piece)) || 
                  (currentTurn === 'black' && isPieceBlack(piece)))) {
      selectedPiece = {row, col};
      renderBoard();
      highlightSelected(row, col);
    }
  }
}

function highlightSelected(row, col) {
  const squares = boardElement.children;
  const index = row * 8 + col;
  squares[index].classList.add('selected');
  
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8);
    const c = i % 8;
    if (isValidMove(row, col, r, c)) {
      squares[i].classList.add('possible-move');
    }
  }
}

function updateCapturedPieces() {
  const whiteCaptured = document.querySelector('#captured-black .pieces-container');
  const blackCaptured = document.querySelector('#captured-white .pieces-container');
  
  whiteCaptured.innerHTML = capturedPieces.white.map(p => {
    return `<span class="piece white">${p}</span>`;
  }).join('');
  
  blackCaptured.innerHTML = capturedPieces.black.map(p => {
    return `<span class="piece black">${p}</span>`;
  }).join('');
}

function showWinnerAnimation(message) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.9); display: flex; align-items: center;
    justify-content: center; z-index: 10000; animation: fadeIn 0.5s ease-out;
  `;
  
  const messageBox = document.createElement('div');
  messageBox.style.cssText = `
    background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
    padding: 40px 60px; border-radius: 20px; font-size: 2.5rem;
    font-weight: bold; color: #1a1a2e; text-align: center;
    box-shadow: 0 20px 60px rgba(255, 215, 0, 0.8);
  `;
  messageBox.textContent = message;
  
  overlay.appendChild(messageBox);
  document.body.appendChild(overlay);
  
  setTimeout(() => document.body.removeChild(overlay), 2800);
}

async function saveGameToServer(winner) {
  if (!authToken) return;
  try {
    await fetch(`${API_URL}/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ winner, moves })
    });
  } catch (error) {
    console.error('Error al guardar partida:', error);
  }
}

function resetGame() {
  initBoard();
  renderBoard();
  updateCapturedPieces();
}

// ==================== CONTROLES ====================

document.getElementById('reset-btn')?.addEventListener('click', () => {
  if (confirm('¿Reiniciar la partida actual?')) resetGame();
});

document.getElementById('show-history-btn')?.addEventListener('click', async () => {
  if (!authToken) return;
  try {
    const response = await fetch(`${API_URL}/games`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = data.games.length === 0 
      ? '<p style="text-align: center; color: #999;">No hay partidas guardadas</p>'
      : data.games.map((game, i) => `
          <div class="history-item">
            <strong>🏆 Partida #${data.games.length - i}</strong><br>
            📅 ${new Date(game.played_at).toLocaleString('es-ES')}<br>
            ${game.winner === 'Blancas' ? '⚪' : game.winner === 'Negras' ? '⚫' : '🤝'} 
            Resultado: <strong>${game.winner}</strong><br>
            ♟️ Movimientos: ${game.move_count}
          </div>
        `).join('');
    document.getElementById('history-modal').style.display = 'flex';
  } catch (error) {
    alert('Error al cargar historial');
  }
});

document.getElementById('show-stats-btn')?.addEventListener('click', async () => {
  if (!authToken) return;
  try {
    const response = await fetch(`${API_URL}/stats`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    const stats = data.stats;
    document.getElementById('stats-content').innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
        <div class="stat-card"><h3>🎮 Partidas</h3><div class="stat-value">${stats.total_games || 0}</div></div>
        <div class="stat-card"><h3>⚪ Victorias Blancas</h3><div class="stat-value">${stats.white_wins || 0}</div></div>
        <div class="stat-card"><h3>⚫ Victorias Negras</h3><div class="stat-value">${stats.black_wins || 0}</div></div>
        <div class="stat-card"><h3>🤝 Empates</h3><div class="stat-value">${stats.draws || 0}</div></div>
        <div class="stat-card"><h3>♟️ Promedio Mov.</h3><div class="stat-value">${stats.avg_moves ? parseFloat(stats.avg_moves).toFixed(1) : 0}</div></div>
      </div>
    `;
    document.getElementById('stats-modal').style.display = 'flex';
  } catch (error) {
    alert('Error al cargar estadísticas');
  }
});

document.getElementById('close-history')?.addEventListener('click', () => {
  document.getElementById('history-modal').style.display = 'none';
});

document.getElementById('close-stats')?.addEventListener('click', () => {
  document.getElementById('stats-modal').style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) e.target.style.display = 'none';
});

// ==================== INICIALIZACIÓN ====================

(async function init() {
  const isAuthenticated = await verifyToken();
  if (isAuthenticated) showModeScreen();
})();