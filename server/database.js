const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

/* =======================
   CONFIG & LOGGER
======================= */

const isDev = process.env.NODE_ENV === 'development';

const log = (...args) => isDev && console.log('ℹ️', ...args);
const warn = (...args) => console.warn('⚠️', ...args);
const errorLog = (...args) => console.error('❌', ...args);

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  debug: false,
  authPlugins: {
    mysql_native_password: () =>
      require('mysql2/lib/auth_plugins/mysql_native_password')
  },
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined
};

const MAX_ATTEMPTS = 3;
let pool;

/* =======================
   CONEXÃO
======================= */

async function connectWithRetry() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      log(`Tentando conexão MySQL (${attempt}/${MAX_ATTEMPTS})`);

      pool = mysql.createPool(DB_CONFIG);
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();

      log('Conexão MySQL estabelecida');
      return pool;

    } catch (err) {
      errorLog(`Falha na conexão (${attempt})`, err.code || err.message);
      if (attempt === MAX_ATTEMPTS) throw err;
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
}

/* =======================
   INIT DATABASE
======================= */

async function initializeDatabase() {
  if (pool) return pool;

  await connectWithRetry();
  await criarTabelas();
  return pool;
}

/* =======================
   QUERY HELPERS - CORRIGIDO
======================= */

async function query(sql, params = []) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    conn.release();
  }
}

// FUNÇÃO get CORRIGIDA
async function get(sql, params = []) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, params);
    return rows && rows.length > 0 ? rows[0] : null;
  } finally {
    conn.release();
  }
}

// Ou se preferir manter a versão curta, mas corrigida:
// const get = async (sql, params = []) => {
//   const rows = await query(sql, params);
//   return rows && rows.length > 0 ? rows[0] : null;
// };

const execute = async (sql, params = []) => {
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(sql, params);
    return result;
  } finally {
    conn.release();
  }
};

/* =======================
   TRANSACTION
======================= */

async function transaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* =======================
   SCHEMA & SEED
======================= */

// No database.js, atualize a função criarTabelas:

async function criarTabelas() {
  log('Criando/verificando tabelas');

  // Tabela professores
  await query(`
    CREATE TABLE IF NOT EXISTS professores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      telefone VARCHAR(50),
      observacoes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Tabela vagas (com professor_id como foreign key)
  await query(`
    CREATE TABLE IF NOT EXISTS vagas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(200),
      horario VARCHAR(100),
      dias VARCHAR(100),
      nivel VARCHAR(50),
      vagas_totais INT DEFAULT 2,
      vagas_disponiveis INT DEFAULT 2,
      professor VARCHAR(100),
      tipo VARCHAR(100),
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      professor_id INT,
      FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Tabela reservas (com ON DELETE CASCADE)
  await query(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vaga_id INT NOT NULL,
      nome VARCHAR(200) NOT NULL,
      email VARCHAR(200) NOT NULL,
      telefone VARCHAR(50) NOT NULL,
      nivel_aluno VARCHAR(50),
      objetivo TEXT,
      reserva_id VARCHAR(100) UNIQUE,
      data_reserva DATETIME NOT NULL,
      status ENUM('pendente','confirmada','cancelada') DEFAULT 'pendente',
      observacoes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (vaga_id) REFERENCES vagas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS administradores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE,
      password_hash VARCHAR(255),
      nome VARCHAR(200),
      email VARCHAR(200),
      is_super_admin BOOLEAN DEFAULT FALSE,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Tabela atividades
  await query(`
    CREATE TABLE IF NOT EXISTS atividades (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(50),
      descricao TEXT,
      usuario VARCHAR(100),
      data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tipo (tipo),
      INDEX idx_data (data)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Tabela configuracoes
  await query(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave VARCHAR(100) PRIMARY KEY,
      valor TEXT,
      descricao TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Verifica se tem professores
  const professoresCount = await get('SELECT COUNT(*) as count FROM professores');
  if (professoresCount.count === 0) {
    await execute(
      `INSERT INTO professores (nome, email, telefone) VALUES 
      ('Professor João Silva', 'joao@exemplo.com', '(11) 99999-9999'),
      ('Professora Maria Santos', 'maria@exemplo.com', '(11) 88888-8888'),
      ('Professor Pedro Oliveira', 'pedro@exemplo.com', '(11) 77777-7777')`
    );
    log('Professores padrão criados');
  }

  const admin = await get(
    'SELECT id FROM administradores WHERE username = ?',
    ['admin']
  );

  if (!admin) {
    const hash = await bcrypt.hash('admin123', 10);
    await execute(
      `INSERT INTO administradores 
       (username, password_hash, nome, email, is_super_admin)
       VALUES (?, ?, ?, ?, 1)`,
      ['admin', hash, 'Administrador', process.env.ADMIN_EMAIL || 'admin@exemplo.com']
    );
    warn('Admin padrão criado (admin / admin123)');
  }
}
/* =======================
   HEALTH & STATS
======================= */

async function checkHealth() {
  try {
    await query('SELECT 1');
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

/* =======================
   EXPORTS
======================= */

module.exports = {
  initializeDatabase,
  query,
  get,
  execute,
  transaction,
  checkHealth
};
