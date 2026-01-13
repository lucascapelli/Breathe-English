const express = require('express');
const { query, get, execute } = require('./database');
const { enviarEmail } = require('../service/emailService');

const router = express.Router();

// =========================
// HELPERS
// =========================
function validarCampos(campos, body) {
  const faltantes = campos.filter(campo => !body[campo]);
  if (faltantes.length > 0) return `Campos obrigatórios faltando: ${faltantes.join(', ')}`;
  return null;
}

// Monta URL absoluta para fotos
function buildFotoUrl(foto) {
  if (!foto) return 'https://placehold.co/100?text=Prof&font=roboto';
  if (/^https?:\/\//.test(foto)) return foto;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseUrl}${foto}`;
}

// Query centralizada para pegar vagas ativas
async function fetchVagas() {
  const vagas = await query(`
    SELECT 
      v.*, 
      p.nome AS professor_nome, 
      p.foto AS professor_foto,
      p.preco AS professor_preco,
      p.email AS professor_email,
      p.telefone AS professor_telefone
    FROM vagas v
    LEFT JOIN professores p ON v.professor_id = p.id
    WHERE v.ativo = 1
    ORDER BY v.created_at DESC
  `);

  // Garante que fotos e nomes tenham fallback
  return vagas.map(v => ({
    ...v,
    professor: v.professor_nome || 'Professor não definido',
    professor_foto: buildFotoUrl(v.professor_foto),
    preco: v.professor_preco || null,
    professor_email: v.professor_email || null,
    professor_telefone: v.professor_telefone || null,
  }));
}

// =========================
// ROTAS VAGAS
// =========================

// GET /api/ -> lista todas as vagas
router.get('/', async (req, res) => {
  try {
    const vagas = await fetchVagas();
    res.json({
      success: true,
      vagas,
      total: vagas.length,
      disponiveis: vagas.filter(v => v.vagas_disponiveis > 0).length,
    });
  } catch (error) {
    console.error('Erro ao buscar vagas (/):', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/vagas -> compatibilidade com frontend
router.get('/vagas', async (req, res) => {
  try {
    const vagas = await fetchVagas();
    res.json({
      success: true,
      vagas,
      total: vagas.length,
      disponiveis: vagas.filter(v => v.vagas_disponiveis > 0).length,
    });
  } catch (error) {
    console.error('Erro ao buscar vagas (/vagas):', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/vagas/:id -> detalhe de uma vaga
router.get('/vagas/:id', async (req, res) => {
  try {
    const resultados = await get(`
      SELECT 
        v.*, 
        p.nome AS professor_nome, 
        p.foto AS professor_foto,
        p.preco AS professor_preco,
        p.email AS professor_email,
        p.telefone AS professor_telefone
      FROM vagas v
      LEFT JOIN professores p ON v.professor_id = p.id
      WHERE v.id = ? AND v.ativo = 1
    `, [req.params.id]);

    if (!resultados || resultados.length === 0) {
      return res.status(404).json({ error: 'Vaga não encontrada' });
    }

    const vaga = resultados[0];

    // Fallback de campos
    vaga.professor = vaga.professor_nome || 'Professor não definido';
    vaga.professor_foto = buildFotoUrl(vaga.professor_foto);
    vaga.preco = vaga.professor_preco || null;
    vaga.professor_email = vaga.professor_email || null;
    vaga.professor_telefone = vaga.professor_telefone || null;

    res.json(vaga);
  } catch (error) {
    console.error('Erro ao buscar vaga:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// =========================
// RESERVAS - VERSÃO CORRIGIDA
// =========================
const camposReserva = ['vaga_id', 'nome', 'email', 'telefone'];

router.post('/reservas', async (req, res) => {
  const erro = validarCampos(camposReserva, req.body);
  if (erro) return res.status(400).json({ error: erro });

  const { vaga_id, nome, email, telefone, nivel_aluno, objetivo } = req.body;

  try {
    // MUDANÇA: usar query() em vez de get() para garantir resultado consistente
    const vagaRes = await query('SELECT * FROM vagas WHERE id = ? AND ativo = 1', [vaga_id]);
    
    console.log('DEBUG - vagaRes:', vagaRes); // Log para debug
    
    if (!vagaRes || vagaRes.length === 0) {
      return res.status(404).json({ error: 'Vaga não encontrada' });
    }

    const vaga = vagaRes[0];
    
    // Validação adicional para garantir que vaga tem a propriedade
    if (typeof vaga.vagas_disponiveis === 'undefined') {
      console.error('Erro: vaga sem vagas_disponiveis', vaga);
      return res.status(500).json({ error: 'Dados da vaga incompletos' });
    }
    
    if (vaga.vagas_disponiveis <= 0) {
      return res.status(400).json({ error: 'Vaga esgotada' });
    }

    const reserva_id = 'RES' + Date.now() + Math.random().toString(36).slice(2, 9);

    await execute('START TRANSACTION');

    await execute(`
      INSERT INTO reservas 
      (vaga_id, nome, email, telefone, nivel_aluno, objetivo, reserva_id, data_reserva, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'pendente', NOW(), NOW())
    `, [vaga_id, nome, email, telefone, nivel_aluno || 'Não informado', objetivo || '', reserva_id]);

    await execute('UPDATE vagas SET vagas_disponiveis = GREATEST(0, vagas_disponiveis - 1) WHERE id = ?', [vaga_id]);

    await execute(`
      INSERT INTO atividades (tipo, descricao, usuario, data)
      VALUES (?, ?, ?, NOW())
    `, ['reserva', `Nova reserva: ${nome} para vaga ${vaga_id}`, 'sistema']);

    await execute('COMMIT');

    res.status(201).json({ success: true, message: 'Reserva criada com sucesso!', reserva_id });

    // Notificação assíncrona
    enviarNotificacaoReserva(reserva_id, { nome, email, telefone, nivel_aluno, objetivo }, vaga);

  } catch (error) {
    try { 
      await execute('ROLLBACK'); 
    } catch (e) {
      console.error('Erro no ROLLBACK:', e);
    }
    console.error('Erro ao criar reserva:', error);
    res.status(500).json({ error: 'Erro interno ao processar reserva' });
  }
});

// =========================
// NOTIFICAÇÃO
// =========================
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