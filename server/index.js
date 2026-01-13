require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const MySQLStore = require('express-mysql-session')(session);

// projectRoot precisa ser declarado antes de qualquer uso
const projectRoot = path.resolve(__dirname, '..');

const { initializeDatabase, query } = require('./database');
const authRoutes = require('./auth');
const adminRoutes = require('./adminRoutes');
const publicRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

/* ==========================
  PATHS
========================== */
const publicDir = path.join(projectRoot, 'public');
const adminDir = path.join(projectRoot, 'admin');
const uploadsDir = path.join(publicDir, 'uploads');

console.log('=== DIRETÓRIOS ===');
console.log('Público:', publicDir);
console.log('Admin:', adminDir);
console.log('Uploads:', uploadsDir);

/* ==========================
   MIDDLEWARES
========================== */
app.use(cors({ credentials: true, origin: true }));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Política de segurança mínima para scripts inline
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  );
  next();
});

/* ==========================
   SESSÃO
========================== */
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

app.use(session({
  name: 'admin_session',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true, // sempre true em produção cloud
    sameSite: 'none', // obrigatório para cross-domain
    maxAge: 24 * 60 * 60 * 1000
  }
}));

/* ==========================
   LOGGER MINIMALISTA
========================== */
app.use((req, res, next) => {
  if (/\.(css|js|png|jpg|jpeg|svg|ico|map|woff|woff2|ttf|eot|webp|gif)$/i.test(req.path)) return next();
  const role = req.session?.isAdmin ? 'ADMIN' : 'PUBLIC';
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path} | ${role}`);
  next();
});

/* ==========================
   SERVIR ARQUIVOS ESTÁTICOS
========================== */
// Middleware customizado para servir uploads de múltiplos diretórios
app.use('/uploads', (req, res, next) => {
  // Tenta primeiro em admin/uploads
  const adminPath = path.join(adminDir, 'uploads', req.path);
  if (fs.existsSync(adminPath)) {
    return express.static(path.join(adminDir, 'uploads'))(req, res, next);
  }
  // Se não encontrar, tenta em public/uploads
  const publicPath = path.join(uploadsDir, req.path);
  if (fs.existsSync(publicPath)) {
    return express.static(uploadsDir)(req, res, next);
  }
  // Se não encontrar em nenhum lugar, passa adiante
  next();
});

app.use(express.static(publicDir, { maxAge: 86400000, index: 'index.html' }));
// Servir arquivos de upload (imagens) corretamente em produção
app.use('/uploads', express.static(path.join(projectRoot, 'uploads')));
app.use('/api', publicRoutes);
/* ==========================
   ROTAS DE AUTENTICAÇÃO
========================== */
app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!req.session?.isAdmin });
});

app.use('/api/auth', authRoutes);

/* ==========================
   ROTAS ADMIN (PROTEGIDAS)
========================== */
app.use('/api/admin', (req, res, next) => {
  if (!req.session?.isAdmin) return res.status(401).json({ error: 'Não autorizado' });
  next();
}, adminRoutes);

/* ==========================
   ROTAS PÚBLICAS
========================== */
app.get('/api/', async (req, res) => {
  try {
    const vagas = await query(`
      SELECT v.*, p.nome AS professor_nome, p.foto AS professor_foto
      FROM vagas v
      LEFT JOIN professores p ON v.professor_id = p.id
      WHERE v.ativo = 1
      ORDER BY v.created_at DESC
    `);
    res.json({
      success: true,
      vagas,
      total: vagas.length,
      disponiveis: vagas.filter(v => v.vagas_disponiveis > 0).length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ==========================
   ROTAS HTML ADMIN
========================== */
const adminPages = ['login', 'dashboard']; // páginas principais

app.get('/admin', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/admin/dashboard');
  const loginPath = path.join(adminDir, 'login.html');
  fs.existsSync(loginPath) ? res.sendFile(loginPath) : res.status(404).send('Login não encontrado');
});

app.get('/admin/dashboard', (req, res) => {
  if (!req.session?.isAdmin) return res.redirect('/admin');
  const dashboardPath = path.join(adminDir, 'dashboard.html');
  fs.existsSync(dashboardPath) ? res.sendFile(dashboardPath) : res.status(404).send('Dashboard não encontrado');
});

app.get('/admin/:page', (req, res) => {
  if (!req.session?.isAdmin) return res.redirect('/admin');
  const pagePath = path.join(adminDir, `${req.params.page}.html`);
  fs.existsSync(pagePath) ? res.sendFile(pagePath) : res.status(404).send('Página não encontrada');
});

/* ==========================
   FALLBACK SPA
========================== */
app.get('*', (req, res) => {
  if (req.path.startsWith('/admin')) return res.status(404).send('Página admin não encontrada');
  const indexPath = path.join(publicDir, 'index.html');
  fs.existsSync(indexPath) ? res.sendFile(indexPath) : res.status(404).send('Site não encontrado');
});

/* ==========================
   DEBUG
========================== */
app.get('/debug/vagas', async (req, res) => {
  try {
    const vagas = await query(`
      SELECT v.*, p.nome AS professor_nome
      FROM vagas v
      LEFT JOIN professores p ON v.professor_id = p.id
      WHERE v.ativo = 1
      ORDER BY v.created_at DESC
    `);
    res.json({
      success: true,
      vagas,
      total: vagas.length,
      disponiveis: vagas.filter(v => v.vagas_disponiveis > 0).length
    });
  } catch (error) {
    console.error('Debug: Erro na query:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ==========================
   INICIALIZAÇÃO
========================== */
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║         SERVIDOR INICIADO           ║
╠══════════════════════════════════════╣
║ 🚀 Porta: ${PORT}                          ║
║ 🌐 Site: http://localhost:${PORT}         ║
║ 🔐 Admin: http://localhost:${PORT}/admin  ║
╚══════════════════════════════════════╝
    `);
  });
}).catch(err => {
  console.error('❌ Falha ao iniciar:', err);
  process.exit(1);
});
