const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== VALIDACIÓN DE CONFIGURACIÓN ====================

if (!process.env.JWT_SECRET) {
  console.error('❌ ERROR CRÍTICO: JWT_SECRET no configurado en .env');
  console.error('Por favor crea un archivo .env con JWT_SECRET=tu-clave-secreta-muy-segura');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR CRÍTICO: DATABASE_URL no configurado en .env');
  console.error('Por favor configura DATABASE_URL en tu archivo .env');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ==================== MIDDLEWARE ====================

// CORS MANUAL - Configuración agresiva para garantizar funcionamiento
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = NODE_ENV === 'production' 
    ? ['https://chess-app22.netlify.app']
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];
  
  if (allowedOrigins.includes(origin) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  }
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// CORS adicional con el paquete
app.use(cors({
  origin: NODE_ENV === 'production' 
    ? 'https://chess-app22.netlify.app'
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10kb' }));

// Rate limiting simple
const requestCounts = new Map();

function simpleRateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
      requestCounts.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const record = requestCounts.get(ip);
    
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({ 
        error: 'Demasiadas solicitudes. Por favor intenta más tarde.' 
      });
    }
    
    record.count++;
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(ip);
    }
  }
}, 60 * 60 * 1000);

app.use('/api', simpleRateLimit(100, 15 * 60 * 1000));

// ==================== CONFIGURACIÓN BD ====================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ==================== INICIALIZACIÓN BD ====================

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT username_length CHECK (char_length(username) >= 3),
        CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        winner VARCHAR(20) NOT NULL,
        moves TEXT[] NOT NULL,
        move_count INTEGER NOT NULL,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT winner_check CHECK (winner IN ('Blancas', 'Negras', 'Empate'))
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at DESC);
    `);

    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar base de datos:', error);
    throw error;
  }
}

// ==================== VALIDACIONES ====================

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 100;
}

function validateUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 100;
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim();
}

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
}

// ==================== MANEJO DE ERRORES ====================

function handleDatabaseError(error, res) {
  console.error('Error de base de datos:', error);
  
  if (error.code === '23505') {
    if (error.constraint && error.constraint.includes('username')) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    if (error.constraint && error.constraint.includes('email')) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    return res.status(400).json({ error: 'Registro duplicado' });
  }
  
  if (error.code === '23503') {
    return res.status(400).json({ error: 'Referencia inválida' });
  }
  
  if (error.code === '23514') {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  
  return res.status(500).json({ error: 'Error interno del servidor' });
}

// ==================== RUTAS DE AUTENTICACIÓN ====================

app.post('/api/register', async (req, res) => {
  try {
    let { username, email, password } = req.body;

    username = sanitizeInput(username);
    email = sanitizeInput(email);

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    if (!validateUsername(username)) {
      return res.status(400).json({ 
        error: 'Usuario debe tener 3-20 caracteres alfanuméricos (a-z, 0-9, _)' 
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ 
        error: 'La contraseña debe tener entre 6 y 100 caracteres' 
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username.toLowerCase(), email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.post('/api/login', async (req, res) => {
  try {
    let { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    username = sanitizeInput(username);

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.get('/api/verify', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error al verificar token:', error);
    res.status(500).json({ error: 'Error al verificar token' });
  }
});

// ==================== RUTAS DE JUEGO ====================

app.post('/api/games', authenticateToken, async (req, res) => {
  try {
    const { winner, moves } = req.body;
    const userId = req.user.id;

    if (!winner || !moves) {
      return res.status(400).json({ error: 'Datos de partida incompletos' });
    }

    if (!Array.isArray(moves)) {
      return res.status(400).json({ error: 'Los movimientos deben ser un array' });
    }

    if (!['Blancas', 'Negras', 'Empate'].includes(winner)) {
      return res.status(400).json({ error: 'Ganador inválido' });
    }

    if (moves.length === 0 || moves.length > 500) {
      return res.status(400).json({ error: 'Número de movimientos inválido' });
    }

    const moveRegex = /^[a-h][1-8][a-h][1-8]$/;
    for (const move of moves) {
      if (!moveRegex.test(move)) {
        return res.status(400).json({ error: 'Formato de movimiento inválido' });
      }
    }

    const result = await pool.query(
      'INSERT INTO games (user_id, winner, moves, move_count) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, winner, moves, moves.length]
    );

    res.status(201).json({
      message: 'Partida guardada exitosamente',
      game: result.rows[0]
    });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.get('/api/games', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const result = await pool.query(
      'SELECT id, winner, move_count, played_at FROM games WHERE user_id = $1 ORDER BY played_at DESC LIMIT $2',
      [userId, limit]
    );

    res.json({ games: result.rows });
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_games,
        SUM(CASE WHEN winner = 'Blancas' THEN 1 ELSE 0 END) as white_wins,
        SUM(CASE WHEN winner = 'Negras' THEN 1 ELSE 0 END) as black_wins,
        SUM(CASE WHEN winner = 'Empate' THEN 1 ELSE 0 END) as draws,
        AVG(move_count) as avg_moves,
        MAX(played_at) as last_game
      FROM games 
      WHERE user_id = $1
    `, [userId]);

    res.json({ stats: stats.rows[0] });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ==================== RUTAS PRINCIPALES ====================

app.get('/', (req, res) => {
  res.json({ 
    message: 'Chess App Backend API',
    version: '1.0.0',
    endpoints: {
      auth: ['/api/register', '/api/login', '/api/verify'],
      games: ['/api/games', '/api/stats'],
      health: '/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== INICIO DEL SERVIDOR ====================

async function startServer() {
  try {
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log('');
      console.log('========================================');
      console.log(`🚀 Servidor Chess App ejecutándose`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`🌍 Entorno: ${NODE_ENV}`);
      console.log(`📁 Directorio: ${__dirname}`);
      console.log('========================================');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error fatal al iniciar servidor:', error);
    process.exit(1);
  }
}

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de conexiones:', err);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️ SIGTERM recibido, cerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n⚠️ SIGINT recibido, cerrando servidor...');
  await pool.end();
  process.exit(0);
});

startServer();
