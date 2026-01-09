const express = require('express');
const { query, get, execute } = require('./database');
const { enviarEmail } = require('../service/emailService');

const router = express.Router();

// Helper: Validar campos obrigatórios
function validarCampos(campos, body) {
  const faltantes = campos.filter(campo => !body[campo]);
  if (faltantes.length > 0) {
    return `Campos obrigatórios faltando: ${faltantes.join(', ')}`;
  }
  return null;
}

// ======================
// ROTAS PÚBLICAS - VAGAS
// ======================
router.get('/', async (req, res) => {
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
    console.error('Erro ao buscar vagas:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/vagas/:id', async (req, res) => {
  try {
    const vaga = await get(`
      SELECT v.*, p.nome AS professor_nome
      FROM vagas v
      LEFT JOIN professores p ON v.professor_id = p.id
      WHERE v.id = ? AND v.ativo = 1
    `, [req.params.id]);

    if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
    res.json(vaga);
  } catch (error) {
    console.error('Erro ao buscar vaga:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ======================
// RESERVAS
// ======================
const camposReserva = ['vaga_id', 'nome', 'email', 'telefone'];

router.post('/reservas', async (req, res) => {
  const erro = validarCampos(camposReserva, req.body);
  if (erro) return res.status(400).json({ error: erro });

  const { vaga_id, nome, email, telefone, nivel_aluno, objetivo } = req.body;

  try {
    const vaga = await get('SELECT * FROM vagas WHERE id = ? AND ativo = 1', [vaga_id]);
    if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
    if (vaga.vagas_disponiveis <= 0) return res.status(400).json({ error: 'Vaga esgotada' });

    const reserva_id = 'RES' + Date.now() + Math.random().toString(36).slice(2, 9);

    await execute('START TRANSACTION');

    await execute(
      `INSERT INTO reservas 
        (vaga_id, nome, email, telefone, nivel_aluno, objetivo, reserva_id, data_reserva, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'pendente', NOW(), NOW())`,
      [vaga_id, nome, email, telefone, nivel_aluno || 'Não informado', objetivo || '', reserva_id]
    );

    await execute(
      'UPDATE vagas SET vagas_disponiveis = GREATEST(0, vagas_disponiveis - 1) WHERE id = ?',
      [vaga_id]
    );

    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario, data) VALUES (?, ?, ?, NOW())',
      ['reserva', `Nova reserva: ${nome} para vaga ${vaga_id}`, 'sistema']
    );

    await execute('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Reserva criada com sucesso!',
      reserva_id
    });

    // Notificação em background
    enviarNotificacaoReserva(
      reserva_id,
      { nome, email, telefone, nivel_aluno, objetivo },
      vaga
    );

  } catch (error) {
    try { await execute('ROLLBACK'); } catch (e) {}
    console.error('Erro ao criar reserva:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Helper: Enviar notificação de reserva
async function enviarNotificacaoReserva(reserva_id, dados, vaga) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;

    const adminHtml = `
      <h2>📩 Nova reserva</h2>
      <p><b>Reserva ID:</b> ${reserva_id}</p>
      <p><b>Nome:</b> ${dados.nome}</p>
      <p><b>Email:</b> ${dados.email}</p>
      <p><b>WhatsApp:</b> ${dados.telefone}</p>
      <p><b>Nível:</b> ${dados.nivel_aluno || 'Não informado'}</p>
      <p><b>Objetivo:</b> ${dados.objetivo || ''}</p>
      <p><b>Vaga:</b> ${vaga.titulo || `ID ${vaga.id}`}</p>
      <p><b>Horário:</b> ${vaga.horario || ''}</p>
    `;

    await enviarEmail({
      to: adminEmail,
      subject: `📩 Nova reserva – ${vaga.titulo || 'Vaga ' + vaga.id}`,
      html: adminHtml
    });

    console.log('Notificação para admin enviada.');
  } catch (err) {
    console.warn('Erro ao enviar email para admin:', err);
  }
}

module.exports = router;
