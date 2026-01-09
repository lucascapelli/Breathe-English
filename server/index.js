require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const MySQLStore = require('express-mysql-session')(session);

const { initializeDatabase } = require('./database');
const authRoutes = require('./auth');
const adminRoutes = require('./adminRoutes');
const publicRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

/* ======================
   CONFIGURAÇÃO DE PATHS
====================== */
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const adminDir = path.join(projectRoot, 'admin');

console.log('=== DIRETÓRIOS ===');
console.log('Público:', publicDir);
console.log('Admin:', adminDir);

function dump(name, mod) {
  console.log(`${name}: type=${typeof mod}`, mod && mod.constructor ? `ctor=${mod.constructor.name}` : '');
  if (mod && typeof mod === 'object') {
    try { console.log(`${name} keys:`, Object.keys(mod).slice(0,10)); } catch(e) {}
  }
}

dump('authRoutes', authRoutes);
dump('adminRoutes', adminRoutes);
dump('publicRoutes', publicRoutes);


/* ======================
   MIDDLEWARES
====================== */
app.use(cors({ credentials: true, origin: true }));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  );
  next();
});

/* ======================
   SESSÃO
====================== */
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
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

/* ======================
   LOGGER MINIMALISTA
====================== */
app.use((req, res, next) => {
  // IGNORA TUDO que não seja HTML/API
  if (/\.(css|js|png|jpg|jpeg|svg|ico|map|woff|woff2|ttf|eot|webp|gif)$/i.test(req.path)) {
    return next();
  }
  
  const role = req.session?.isAdmin ? 'ADMIN' : 'PUBLIC';
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path} | ${role}`);
  next();
});

// Adicione isso em index.js depois das outras rotas, antes do app.listen
app.get('/debug/vagas', async (req, res) => {
    console.log('Debug: Acessando rota /api/vagas');
    const { query } = require('./database');
    try {
        const vagas = await query(`
            SELECT v.*, p.nome AS professor_nome
            FROM vagas v
            LEFT JOIN professores p ON v.professor_id = p.id
            WHERE v.ativo = 1
            ORDER BY v.created_at DESC
        `);
        console.log(`Debug: ${vagas.length} vagas encontradas`);
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

/* ======================
   API ROUTES PRIMEIRO
====================== */
app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!req.session?.isAdmin });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', (req, res, next) => {
  if (!req.session?.isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}, adminRoutes);
app.use('/api', publicRoutes);

/* ======================
   ARQUIVOS ESTÁTICOS DO ADMIN (APENAS CSS/JS/IMAGENS)
====================== */
// Serve apenas arquivos específicos, NÃO HTML
app.use(express.static(publicDir));


/* ======================
   ROTAS HTML DO ADMIN (MANUALMENTE)
====================== */

// 1. Login (PÚBLICO)
app.get('/admin', (req, res) => {
  if (req.session?.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  
  const loginPath = path.join(adminDir, 'login.html');
  if (fs.existsSync(loginPath)) {
    res.sendFile(loginPath);
  } else {
    res.status(404).send('Login não encontrado');
  }
});

// 2. Dashboard (PROTEGIDO)
app.get('/admin/dashboard', (req, res) => {
  if (!req.session?.isAdmin) {
    return res.redirect('/admin');
  }
  
  const dashboardPath = path.join(adminDir, 'dashboard.html');
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
  } else {
    res.status(404).send('Dashboard não encontrado');
  }
});

// 3. Outras páginas do admin
app.get('/admin/:page', (req, res) => {
  if (!req.session?.isAdmin) {
    return res.redirect('/admin');
  }
  
  const page = req.params.page;
  const pagePath = path.join(adminDir, `${page}.html`);
  
  if (fs.existsSync(pagePath)) {
    res.sendFile(pagePath);
  } else {
    res.status(404).send('Página não encontrada');
  }
});

// Rota pública para servir fotos de professores
app.use('/uploads/professores', express.static(path.join(__dirname, 'admin', 'uploads', 'professores')));


/* ======================
   ARQUIVOS ESTÁTICOS DO SITE PÚBLICO
====================== */
app.use(express.static(publicDir, { 
  maxAge: 86400000,
  index: 'index.html'
}));

/* ======================
   FALLBACK - SPA PÚBLICA
   (APENAS PARA ROTAS NÃO ADMIN)
====================== */
app.get('*', (req, res) => {
  // Se for rota do admin, não cai aqui
  if (req.path.startsWith('/admin')) {
    return res.status(404).send('Página admin não encontrada');
  }
  
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Site não encontrado');
  }
});

/* ======================
   INICIALIZAÇÃO
====================== */
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