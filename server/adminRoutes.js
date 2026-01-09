const express = require('express');
const { query, get, execute } = require('./database');
const { enviarEmail } = require('../service/emailService');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configurações compartilhadas
const UPLOAD_CONFIG = {
  limits: { fileSize: 2 * 1024 * 1024 },
  allowedFormats: ['.png', '.jpg', '.jpeg', '.webp'],
  errorMessage: 'Formato inválido. Use PNG, JPG ou WEBP.'
};

// Helper: Validar campos obrigatórios
function validarCampos(campos, body) {
  const faltantes = campos.filter(campo => !body[campo]);
  if (faltantes.length > 0) {
    return `Campos obrigatórios faltando: ${faltantes.join(', ')}`;
  }
  return null;
}

// Helper: Registrar atividade
async function registrarAtividade(tipo, descricao, usuario) {
  try {
    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      [tipo, descricao, usuario]
    );
  } catch (error) {
    console.error('Erro ao registrar atividade:', error);
  }
}

// Helper: Obter professor por ID
async function obterProfessor(id) {
  return await get('SELECT * FROM professores WHERE id = ?', [id]);
}

// Helper: Obter vaga com professor
async function obterVagaComProfessor(id) {
  return await get(`
    SELECT v.*, p.nome AS professor_nome 
    FROM vagas v 
    LEFT JOIN professores p ON v.professor_id = p.id 
    WHERE v.id = ?
  `, [id]);
}

// Configuração Multer para professores
const fotosDir = path.resolve(__dirname, '..', 'admin', 'uploads', 'professores');
if (!fs.existsSync(fotosDir)) fs.mkdirSync(fotosDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, fotosDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`;
      cb(null, name);
    }
  }),
  limits: UPLOAD_CONFIG.limits,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!UPLOAD_CONFIG.allowedFormats.includes(ext)) {
      return cb(new Error(UPLOAD_CONFIG.errorMessage));
    }
    cb(null, true);
  }
});

// =====================
// DASHBOARD
// =====================
router.get('/stats', async (req, res) => {
  try {
    const stats = await get(`
      SELECT 
        (SELECT COUNT(*) FROM vagas WHERE ativo = 1) as total_vagas,
        (SELECT COUNT(*) FROM reservas) as total_reservas,
        (SELECT COUNT(*) FROM reservas WHERE DATE(data_reserva) = CURDATE()) as reservas_hoje,
        (SELECT COUNT(*) FROM vagas WHERE vagas_disponiveis = 0 AND ativo = 1) as vagas_esgotadas
    `);
    res.json(stats);
  } catch (error) {
    console.error('Erro ao buscar stats:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// =====================
// VAGAS - CRUD
// =====================
const camposVaga = ['titulo', 'horario', 'dias', 'nivel', 'vagas_totais', 'professor_id', 'tipo'];

router.get('/vagas', async (req, res) => {
  try {
    const vagas = await query(`
      SELECT v.*, p.nome AS professor_nome
      FROM vagas v
      LEFT JOIN professores p ON v.professor_id = p.id
      ORDER BY v.created_at DESC
    `);
    res.json(vagas);
  } catch (error) {
    console.error('Erro ao buscar vagas:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/vagas', async (req, res) => {
  const erro = validarCampos(camposVaga, req.body);
  if (erro) return res.status(400).json({ error: erro });

  const { titulo, horario, dias, nivel, vagas_totais, professor_id, tipo } = req.body;

  try {
    const professor = await obterProfessor(professor_id);
    if (!professor) return res.status(400).json({ error: 'Professor não encontrado' });

    const result = await execute(
      `INSERT INTO vagas 
       (titulo, horario, dias, nivel, vagas_totais, vagas_disponiveis, professor_id, professor, tipo) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [titulo, horario, dias, nivel, vagas_totais, vagas_totais, professor_id, professor.nome, tipo]
    );

    const novaVaga = await obterVagaComProfessor(result.insertId);
    await registrarAtividade('vaga', `Nova vaga criada: ${titulo}`, req.session.username);
    res.status(201).json(novaVaga);
  } catch (error) {
    console.error('Erro ao criar vaga:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/vagas/:id', async (req, res) => {
  const { id } = req.params;
  const { titulo, horario, dias, nivel, vagas_totais, vagas_disponiveis, professor_id, tipo, ativo } = req.body;

  try {
    let professor_nome = null;
    
    if (professor_id) {
      const professor = await obterProfessor(professor_id);
      professor_nome = professor ? professor.nome : null;
    } else {
      const vagaAtual = await get('SELECT professor FROM vagas WHERE id = ?', [id]);
      professor_nome = vagaAtual ? vagaAtual.professor : null;
    }

    await execute(
      `UPDATE vagas SET 
        titulo = ?, horario = ?, dias = ?, nivel = ?, 
        vagas_totais = ?, vagas_disponiveis = ?, 
        professor_id = ?, professor = ?, tipo = ?, ativo = ?
       WHERE id = ?`,
      [titulo, horario, dias, nivel, vagas_totais, vagas_disponiveis, professor_id, professor_nome, tipo, ativo, id]
    );

    const vagaAtualizada = await obterVagaComProfessor(id);
    await registrarAtividade('vaga', `Vaga atualizada: ${titulo}`, req.session.username);
    res.json(vagaAtualizada);
  } catch (error) {
    console.error('Erro ao atualizar vaga:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/vagas/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const reservasCount = await get('SELECT COUNT(*) as count FROM reservas WHERE vaga_id = ?', [id]);

    if (reservasCount.count > 0) {
      await execute('UPDATE vagas SET ativo = 0 WHERE id = ?', [id]);
      await registrarAtividade('vaga', `Vaga ID: ${id} desativada (tem ${reservasCount.count} reservas)`, req.session.username);
      
      return res.json({
        success: true,
        message: 'Vaga desativada (não pode ser excluída pois tem reservas associadas)',
        action: 'deactivated'
      });
    } else {
      await execute('DELETE FROM vagas WHERE id = ?', [id]);
      await registrarAtividade('vaga', `Vaga excluída ID: ${id}`, req.session.username);
    }

    res.json({ success: true, message: 'Operação realizada com sucesso' });
  } catch (error) {
    console.error('Erro ao processar vaga:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/vagas/reset-all', async (req, res) => {
  try {
    await execute('UPDATE vagas SET vagas_disponiveis = vagas_totais WHERE ativo = 1');
    await registrarAtividade('sistema', 'Todas as vagas foram resetadas', req.session.username);
    res.json({ success: true, message: 'Todas as vagas foram resetadas' });
  } catch (error) {
    console.error('Erro ao resetar vagas:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// =====================
// RESERVAS
// =====================
router.get('/reservas', async (req, res) => {
  try {
    const reservas = await query(`
      SELECT r.*, v.titulo as vaga_titulo, v.horario, v.dias, p.nome AS professor_nome
      FROM reservas r
      LEFT JOIN vagas v ON r.vaga_id = v.id
      LEFT JOIN professores p ON v.professor_id = p.id
      ORDER BY r.data_reserva DESC
      LIMIT 100
    `);
    res.json({ reservas });
  } catch (error) {
    console.error('Erro ao buscar reservas:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/reservas/:reserva_id/confirm', async (req, res) => {
  try {
    const { reserva_id } = req.params;
    await execute('UPDATE reservas SET status = ? WHERE reserva_id = ?', ['confirmada', reserva_id]);
    
    const reserva = await get(`
      SELECT r.*, v.titulo, p.nome AS professor_nome 
      FROM reservas r 
      LEFT JOIN vagas v ON r.vaga_id = v.id
      LEFT JOIN professores p ON v.professor_id = p.id
      WHERE r.reserva_id = ?`, [reserva_id]);

    await execute('INSERT INTO atividades (tipo, descricao, usuario, data) VALUES (?, ?, ?, NOW())',
      ['reserva', `Reserva confirmada: ${reserva_id}`, req.session?.username || 'admin']);

    // Enviar email de confirmação
    if (reserva) {
      enviarConfirmacaoEmail(reserva);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao confirmar reserva' });
  }
});

// Helper: Enviar email de confirmação
async function enviarConfirmacaoEmail(reserva) {
  try {
    await enviarEmail({
      to: reserva.email,
      subject: `✅ Sua reserva ${reserva.reserva_id} foi confirmada`,
      html: `
        <h2>Sua reserva foi confirmada</h2>
        <p>Olá <strong>${reserva.nome}</strong>,</p>
        <p>Sua reserva <b>${reserva.reserva_id}</b> para a vaga <b>${reserva.titulo}</b> foi confirmada.</p>
        <p><b>Professor:</b> ${reserva.professor_nome || '—'}</p>
        <p><b>Horário:</b> ${reserva.horario || '—'}</p>
        <p>Se precisar alterar ou cancelar, responda este e-mail ou acesse o painel.</p>
      `
    });

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await enviarEmail({
        to: adminEmail,
        subject: `Reserva confirmada: ${reserva.reserva_id}`,
        html: `<p>Reserva ${reserva.reserva_id} confirmada por admin.</p>`
      });
    }

    console.log('Emails de confirmação enviados.');
  } catch (e) {
    console.warn('Erro ao enviar email de confirmação:', e);
  }
}

// =====================
// PROFESSORES - CRUD
// =====================
router.get('/professores', async (req, res) => {
  try {
    const professores = await query('SELECT * FROM professores ORDER BY nome ASC');
    res.json(professores);
  } catch (err) {
    console.error('Erro ao buscar professores:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/professores', upload.single('foto'), async (req, res) => {
  const { nome, email, telefone, observacoes } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

  try {
    const fotoPath = req.file ? `/uploads/professores/${req.file.filename}` : null;

    const result = await execute(
      'INSERT INTO professores (nome, email, telefone, observacoes, foto) VALUES (?, ?, ?, ?, ?)',
      [nome, email || '', telefone || '', observacoes || '', fotoPath]
    );

    const novoProfessor = await obterProfessor(result.insertId);
    await registrarAtividade('professor', `Professor criado: ${nome}`, req.session.username);
    res.status(201).json(novoProfessor);
  } catch (err) {
    console.error('Erro ao criar professor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/professores/:id', upload.single('foto'), async (req, res) => {
  const { id } = req.params;
  const { nome, email, telefone, observacoes } = req.body;

  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

  try {
    const fotoPath = req.file ? `/uploads/professores/${req.file.filename}` : null;
    const queryParams = fotoPath 
      ? [nome, email || '', telefone || '', observacoes || '', fotoPath, id]
      : [nome, email || '', telefone || '', observacoes || '', id];

    const querySQL = fotoPath
      ? 'UPDATE professores SET nome = ?, email = ?, telefone = ?, observacoes = ?, foto = ?, updated_at = NOW() WHERE id = ?'
      : 'UPDATE professores SET nome = ?, email = ?, telefone = ?, observacoes = ?, updated_at = NOW() WHERE id = ?';

    await execute(querySQL, queryParams);

    const professorAtualizado = await obterProfessor(id);
    await registrarAtividade('professor', `Professor atualizado: ${nome}`, req.session.username);
    res.json(professorAtualizado);
  } catch (err) {
    console.error('Erro ao atualizar professor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/professores/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const professor = await obterProfessor(id);
    if (!professor) return res.status(404).json({ error: 'Professor não encontrado' });

    await execute('DELETE FROM professores WHERE id = ?', [id]);
    await registrarAtividade('professor', `Professor excluído: ${professor.nome}`, req.session.username);

    res.json({ success: true, message: 'Professor excluído com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar professor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// =====================
// ALTERAR SENHA
// =====================
router.post('/alterar-senha', async (req, res) => {
  const { senha_atual, nova_senha, confirmar_senha } = req.body;

  if (!senha_atual || !nova_senha || !confirmar_senha) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  if (nova_senha !== confirmar_senha) {
    return res.status(400).json({ error: 'As senhas não coincidem' });
  }

  if (nova_senha.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
  }

  try {
    const username = req.session.username || 'admin';
    const admin = await get('SELECT * FROM administradores WHERE username = ?', [username]);

    if (!admin) {
      return res.status(404).json({ error: 'Administrador não encontrado' });
    }

    const senhaValida = await bcrypt.compare(senha_atual, admin.password_hash);
    if (!senhaValida) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    const novaHash = await bcrypt.hash(nova_senha, 10);
    await execute(
      'UPDATE administradores SET password_hash = ?, updated_at = NOW() WHERE username = ?',
      [novaHash, username]
    );

    await registrarAtividade('senha', 'Senha alterada com sucesso', username);

    res.json({
      success: true,
      message: 'Senha alterada com sucesso!',
      username: username
    });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;