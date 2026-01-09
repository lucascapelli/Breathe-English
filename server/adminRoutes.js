const express = require('express');
const { query, get, execute } = require('./database');
const { enviarEmail } = require('../service/emailService');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// =====================
// CONFIGURAÇÕES GERAIS
// =====================
const UPLOAD_CONFIG = {
  limits: { fileSize: 5 * 1024 * 1024 },
  allowedFormats: ['.png', '.jpg', '.jpeg', '.webp'],
  errorMessage: 'Formato inválido. Use PNG, JPG ou WEBP.'
};

// =====================
// HELPERS
// =====================
function validarCampos(campos, body) {
  const faltantes = campos.filter(campo => !body[campo]);
  return faltantes.length
    ? `Campos obrigatórios faltando: ${faltantes.join(', ')}`
    : null;
}

async function registrarAtividade(tipo, descricao, usuario) {
  try {
    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      [tipo, descricao, usuario]
    );
  } catch (err) {
    console.error('Erro ao registrar atividade:', err);
  }
}

async function obterProfessor(id) {
  return get('SELECT * FROM professores WHERE id = ?', [id]);
}

async function obterVagaComProfessor(id) {
  return get(`
    SELECT v.*, p.nome AS professor_nome
    FROM vagas v
    LEFT JOIN professores p ON v.professor_id = p.id
    WHERE v.id = ?
  `, [id]);
}



// =====================
// DASHBOARD
// =====================
router.get('/stats', async (req, res) => {
  try {
    const stats = await get(`
      SELECT 
        (SELECT COUNT(*) FROM vagas WHERE ativo = 1) total_vagas,
        (SELECT COUNT(*) FROM reservas) total_reservas,
        (SELECT COUNT(*) FROM reservas WHERE DATE(data_reserva) = CURDATE()) reservas_hoje,
        (SELECT COUNT(*) FROM vagas WHERE vagas_disponiveis = 0 AND ativo = 1) vagas_esgotadas
    `);
    res.json(stats);
  } catch {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// =====================
// VAGAS
// =====================
const camposVaga = [
  'titulo',
  'horario',
  'dias',
  'nivel',
  'vagas_totais',
  'professor_id',
  'tipo'
];

router.get('/vagas', async (_, res) => {
  const vagas = await query(`
    SELECT v.*, p.nome AS professor_nome
    FROM vagas v
    LEFT JOIN professores p ON v.professor_id = p.id
    ORDER BY v.created_at DESC
  `);
  res.json(vagas);
});

router.post('/vagas', async (req, res) => {
  const erro = validarCampos(camposVaga, req.body);
  if (erro) return res.status(400).json({ error: erro });

  const { titulo, horario, dias, nivel, vagas_totais, professor_id, tipo } = req.body;

  const professor = await obterProfessor(professor_id);
  if (!professor) return res.status(400).json({ error: 'Professor não encontrado' });

  const result = await execute(`
    INSERT INTO vagas
    (titulo, horario, dias, nivel, vagas_totais, vagas_disponiveis, professor_id, professor, tipo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    titulo,
    horario,
    dias,
    nivel,
    vagas_totais,
    vagas_totais,
    professor_id,
    professor.nome,
    tipo
  ]);

  const novaVaga = await obterVagaComProfessor(result.insertId);
  await registrarAtividade('vaga', `Nova vaga criada: ${titulo}`, req.session.username);

  res.status(201).json(novaVaga);
});

router.put('/vagas/:id', async (req, res) => {
  const { id } = req.params;
  const {
    titulo,
    horario,
    dias,
    nivel,
    vagas_totais,
    vagas_disponiveis,
    professor_id,
    tipo,
    ativo
  } = req.body;

  const professor = professor_id ? await obterProfessor(professor_id) : null;
  const professor_nome =
    professor?.nome ||
    (await get('SELECT professor FROM vagas WHERE id = ?', [id]))?.professor;

  await execute(`
    UPDATE vagas SET
      titulo = ?,
      horario = ?,
      dias = ?,
      nivel = ?,
      vagas_totais = ?,
      vagas_disponiveis = ?,
      professor_id = ?,
      professor = ?,
      tipo = ?,
      ativo = ?
    WHERE id = ?
  `, [
    titulo,
    horario,
    dias,
    nivel,
    vagas_totais,
    vagas_disponiveis,
    professor_id,
    professor_nome,
    tipo,
    ativo,
    id
  ]);

  const vagaAtualizada = await obterVagaComProfessor(id);
  await registrarAtividade('vaga', `Vaga atualizada: ${titulo}`, req.session.username);

  res.json(vagaAtualizada);
});

router.delete('/vagas/:id', async (req, res) => {
  const { id } = req.params;

  const reservas = await get(
    'SELECT COUNT(*) count FROM reservas WHERE vaga_id = ?',
    [id]
  );

  if (reservas.count > 0) {
    await execute('UPDATE vagas SET ativo = 0 WHERE id = ?', [id]);
    return res.json({ success: true, action: 'deactivated' });
  }

  await execute('DELETE FROM vagas WHERE id = ?', [id]);
  res.json({ success: true });
});

// =====================
// RESERVAS
// =====================
router.get('/reservas', async (_, res) => {
  const reservas = await query(`
    SELECT r.*, v.titulo vaga_titulo, v.horario, v.dias, p.nome professor_nome
    FROM reservas r
    LEFT JOIN vagas v ON r.vaga_id = v.id
    LEFT JOIN professores p ON v.professor_id = p.id
    ORDER BY r.data_reserva DESC
    LIMIT 100
  `);

  res.json({ reservas });
});

router.delete('/reservas/:id', async (req, res) => {
  const { id } = req.params;

  const reserva = await get('SELECT * FROM reservas WHERE id = ?', [id]);
  if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });

  if (reserva.status === 'confirmada') {
    await execute(
      'UPDATE vagas SET vagas_disponiveis = vagas_disponiveis + 1 WHERE id = ?',
      [reserva.vaga_id]
    );
  }

  await execute('DELETE FROM reservas WHERE id = ?', [id]);
  await registrarAtividade(
    'reserva',
    `Reserva excluída: ${reserva.reserva_id}`,
    req.session.username
  );

  res.json({ success: true });
});

router.post('/reservas/:reserva_id/confirm', async (req, res) => {
  const { reserva_id } = req.params;

  await execute(
    'UPDATE reservas SET status = "confirmada" WHERE reserva_id = ?',
    [reserva_id]
  );

  const reserva = await get(`
    SELECT r.*, v.titulo, v.horario, p.nome professor_nome
    FROM reservas r
    LEFT JOIN vagas v ON r.vaga_id = v.id
    LEFT JOIN professores p ON v.professor_id = p.id
    WHERE r.reserva_id = ?
  `, [reserva_id]);

  if (reserva) {
    await enviarEmail({
      to: reserva.email,
      subject: 'Reserva confirmada',
      html: '<p>Sua reserva foi confirmada.</p>'
    });
  }

  res.json({ success: true });
});

// =====================
// UPLOAD PROFESSORES
// =====================
const fotosDir = path.resolve(__dirname, '..', 'admin', 'uploads', 'professores');
if (!fs.existsSync(fotosDir)) fs.mkdirSync(fotosDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, fotosDir),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`);
    }
  }),
  limits: UPLOAD_CONFIG.limits,
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!UPLOAD_CONFIG.allowedFormats.includes(ext)) {
      return cb(new Error(UPLOAD_CONFIG.errorMessage));
    }
    cb(null, true);
  }
});

// =====================
// PROFESSORES (CASCADE)
// =====================
router.get('/professores', async (_, res) => {
  res.json(await query('SELECT * FROM professores ORDER BY nome'));
});

router.post('/professores', upload.single('foto'), async (req, res) => {
  const { nome, email, telefone, observacoes, preco } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

  const foto = req.file ? `/uploads/professores/${req.file.filename}` : null;

  const result = await execute(
    `INSERT INTO professores 
     (nome, email, telefone, observacoes, preco, foto)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      nome,
      email || '',
      telefone || '',
      observacoes || '',
      preco || null,
      foto
    ]
  );

  res.status(201).json(await obterProfessor(result.insertId));
});


// DELETE - COM ON DELETE CASCADE
router.delete('/professores/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const professor = await obterProfessor(id);
    if (!professor) {
      return res.status(404).json({ error: 'Professor não encontrado' });
    }

    await execute('DELETE FROM professores WHERE id = ?', [id]);
    await registrarAtividade(
      'professor',
      `Professor excluído: ${professor.nome}`,
      req.session.username
    );

    res.json({
      success: true,
      message:
        'Professor excluído com sucesso. Todas as vagas e reservas associadas também foram removidas.'
    });
  } catch (err) {
    console.error('Erro ao deletar professor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});
router.put('/professores/:id', upload.single('foto'), async (req, res) => {
  const { id } = req.params;
  const { nome, email, telefone, observacoes, preco } = req.body;

  const professor = await obterProfessor(id);
  if (!professor) {
    return res.status(404).json({ error: 'Professor não encontrado' });
  }

  let foto = professor.foto;
  if (req.file) {
    foto = `/uploads/professores/${req.file.filename}`;
  }

  await execute(
    `UPDATE professores SET
      nome = ?,
      email = ?,
      telefone = ?,
      observacoes = ?,
      preco = ?,
      foto = ?
     WHERE id = ?`,
    [
      nome,
      email || '',
      telefone || '',
      observacoes || '',
      preco || null,
      foto,
      id
    ]
  );

  res.json(await obterProfessor(id));
});


// =====================
// ALTERAR SENHA
// =====================
router.post('/alterar-senha', async (req, res) => {
  const { senha_atual, nova_senha, confirmar_senha } = req.body;

  if (!senha_atual || !nova_senha || nova_senha !== confirmar_senha) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  const admin = await get(
    'SELECT * FROM administradores WHERE username = ?',
    [req.session.username]
  );

  if (!admin || !(await bcrypt.compare(senha_atual, admin.password_hash))) {
    return res.status(400).json({ error: 'Senha incorreta' });
  }

  const hash = await bcrypt.hash(nova_senha, 10);
  await execute(
    'UPDATE administradores SET password_hash = ? WHERE username = ?',
    [hash, admin.username]
  );

  res.json({ success: true });
});

module.exports = router;
