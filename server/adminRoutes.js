const express = require('express');
const { query, get, execute } = require('./database');
const { enviarEmail } = require('../service/emailService'); // <-- ADICIONAR
const router = express.Router();
const bcrypt = require('bcryptjs');


// fetch compat (Node 18+ tem global.fetch; caso contrário usa node-fetch)
let _fetch = global.fetch;
try {
  if (!_fetch) _fetch = require('node-fetch');
} catch (e) {
  _fetch = null;
  console.warn('node-fetch não disponível e global.fetch não encontrado. EmailJS não funcionará sem fetch.');
}

async function sendEmailViaEmailJS(templateParams) {
  const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID } = process.env;
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_USER_ID) return;
  if (!_fetch) return;

  const payload = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id: EMAILJS_USER_ID,
    template_params: templateParams
  };

  try {
    const resp = await _fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn('EmailJS retornou erro:', resp.status, text);
    } else {
      console.log('EmailJS: email solicitado com sucesso.');
    }
  } catch (err) {
    console.error('Erro ao chamar EmailJS:', err);
  }
}

// DASHBOARD STATS
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

// LISTAR VAGAS (com join professores)
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

// CRIAR NOVA VAGA - CORRIGIDA
// CRIAR NOVA VAGA - CORRIGIDA (ROTA COMPLETA)
router.post('/vagas', async (req, res) => {
  const { titulo, horario, dias, nivel, vagas_totais, professor_id, tipo } = req.body;

  if (!titulo || !horario || !dias || !nivel || !vagas_totais || !professor_id || !tipo) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  try {
    // Busca o nome do professor
    const professor = await get('SELECT nome FROM professores WHERE id = ?', [professor_id]);
    if (!professor) {
      return res.status(400).json({ error: 'Professor não encontrado' });
    }

    const result = await execute(
      `INSERT INTO vagas 
       (titulo, horario, dias, nivel, vagas_totais, vagas_disponiveis, professor_id, professor, tipo) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [titulo, horario, dias, nivel, vagas_totais, vagas_totais, professor_id, professor.nome, tipo]
    );

    const novaVaga = await get('SELECT v.*, p.nome AS professor_nome FROM vagas v LEFT JOIN professores p ON v.professor_id = p.id WHERE v.id = ?', [result.insertId]);

    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      ['vaga', `Nova vaga criada: ${titulo}`, req.session.username]
    );

    res.status(201).json(novaVaga);
  } catch (error) {
    console.error('Erro ao criar vaga:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ATUALIZAR VAGA - CORRIGIDA (ROTA COMPLETA)
router.put('/vagas/:id', async (req, res) => {
  const { id } = req.params;
  const { titulo, horario, dias, nivel, vagas_totais, vagas_disponiveis, professor_id, tipo, ativo } = req.body;

  try {
    let professor_nome = null;

    // Se foi passado professor_id, busca o nome
    if (professor_id) {
      const professor = await get('SELECT nome FROM professores WHERE id = ?', [professor_id]);
      professor_nome = professor ? professor.nome : null;
    } else {
      // Se não foi passado, mantém o nome atual
      const vagaAtual = await get('SELECT professor FROM vagas WHERE id = ?', [id]);
      professor_nome = vagaAtual ? vagaAtual.professor : null;
    }

    await execute(
      `UPDATE vagas SET 
          titulo = ?, horario = ?, dias = ?, nivel = ?, 
          vagas_totais = ?, vagas_disponiveis = ?, 
          professor_id = ?, professor = ?, tipo = ?, ativo = ?
       WHERE id = ?`,
      [
        titulo, horario, dias, nivel,
        vagas_totais, vagas_disponiveis,
        professor_id, professor_nome, tipo, ativo, id
      ]
    );

    const vagaAtualizada = await get('SELECT v.*, p.nome AS professor_nome FROM vagas v LEFT JOIN professores p ON v.professor_id = p.id WHERE v.id = ?', [id]);

    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      ['vaga', `Vaga atualizada: ${titulo}`, req.session.username]
    );

    res.json(vagaAtualizada);
  } catch (error) {
    console.error('Erro ao atualizar vaga:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// EXCLUIR VAGA (ATUALIZADA PARA LIDAR COM FOREIGN KEY)
router.delete('/vagas/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Verifica se existem reservas para esta vaga
    const reservasCount = await get('SELECT COUNT(*) as count FROM reservas WHERE vaga_id = ?', [id]);

    if (reservasCount.count > 0) {
      // Opção 1: Desativar a vaga em vez de excluir
      await execute('UPDATE vagas SET ativo = 0 WHERE id = ?', [id]);
      await execute(
        'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
        ['vaga', `Vaga ID: ${id} desativada (tem ${reservasCount.count} reservas)`, req.session.username]
      );

      return res.json({
        success: true,
        message: 'Vaga desativada (não pode ser excluída pois tem reservas associadas)',
        action: 'deactivated'
      });

      // Opção 2: Se quiser realmente excluir, descomente abaixo:
      // await execute('DELETE FROM reservas WHERE vaga_id = ?', [id]);
      // await execute('DELETE FROM vagas WHERE id = ?', [id]);
    } else {
      // Se não tem reservas, exclui normalmente
      await execute('DELETE FROM vagas WHERE id = ?', [id]);
      await execute(
        'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
        ['vaga', `Vaga excluída ID: ${id}`, req.session.username]
      );
    }

    res.json({ success: true, message: 'Operação realizada com sucesso' });
  } catch (error) {
    console.error('Erro ao processar vaga:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});
// RESETAR TODAS AS VAGAS
router.post('/vagas/reset-all', async (req, res) => {
  try {
    await execute('UPDATE vagas SET vagas_disponiveis = vagas_totais WHERE ativo = 1');
    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      ['sistema', 'Todas as vagas foram resetadas', req.session.username]
    );
    res.json({ success: true, message: 'Todas as vagas foram resetadas' });
  } catch (error) {
    console.error('Erro ao resetar vagas:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// LISTAR RESERVAS
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

// CONFIRMAR RESERVA (ADMIN)
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

    // depois de atualizar status e inserir atividade, enviar email de confirmação ao aluno
    if (reserva) {
      (async () => {
        try {
          // email pro aluno
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

          // opcional: aviso para admin também
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
      })();
    }


    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao confirmar reserva' });
  }
});

module.exports = router;

// ALTERAR SENHA DO ADMIN - COMPLETA E CORRIGIDA
router.post('/alterar-senha', async (req, res) => {
  const { senha_atual, nova_senha, confirmar_senha } = req.body;

  console.log('Tentando alterar senha para usuário:', req.session.username);

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
    // Busca o admin atual pelo username da sessão
    const username = req.session.username || 'admin';
    console.log('Buscando admin:', username);

    const admin = await get('SELECT * FROM administradores WHERE username = ?', [username]);

    if (!admin) {
      console.log('Admin não encontrado:', username);
      return res.status(404).json({ error: 'Administrador não encontrado' });
    }

    console.log('Admin encontrado, verificando senha...');

    // Verifica senha atual
    const senhaValida = await bcrypt.compare(senha_atual, admin.password_hash);
    if (!senhaValida) {
      console.log('Senha atual incorreta');
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    console.log('Senha válida, gerando nova hash...');

    // Atualiza a senha
    const novaHash = await bcrypt.hash(nova_senha, 10);

    await execute(
      'UPDATE administradores SET password_hash = ?, updated_at = NOW() WHERE username = ?',
      [novaHash, username]
    );

    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      ['senha', 'Senha alterada com sucesso', username]
    );

    console.log('Senha alterada com sucesso para:', username);

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

// =====================
// ROTAS CRUD PROFESSORES
// =====================

// Listar todos os professores
router.get('/professores', async (req, res) => {
  try {
    const professores = await query('SELECT * FROM professores ORDER BY nome ASC');
    res.json(professores);
  } catch (err) {
    console.error('Erro ao buscar professores:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Criar novo professor
router.post('/professores', async (req, res) => {
  const { nome, email, telefone, observacoes } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

  try {
    const result = await execute(
      'INSERT INTO professores (nome, email, telefone, observacoes) VALUES (?, ?, ?, ?)',
      [nome, email || '', telefone || '', observacoes || '']
    );

    const novoProfessor = await get('SELECT * FROM professores WHERE id = ?', [result.insertId]);

    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      ['professor', `Professor criado: ${nome}`, req.session.username]
    );

    res.status(201).json(novoProfessor);
  } catch (err) {
    console.error('Erro ao criar professor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Atualizar professor
router.put('/professores/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, email, telefone, observacoes } = req.body;

  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

  try {
    await execute(
      'UPDATE professores SET nome = ?, email = ?, telefone = ?, observacoes = ?, updated_at = NOW() WHERE id = ?',
      [nome, email || '', telefone || '', observacoes || '', id]
    );

    const professorAtualizado = await get('SELECT * FROM professores WHERE id = ?', [id]);

    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      ['professor', `Professor atualizado: ${nome}`, req.session.username]
    );

    res.json(professorAtualizado);
  } catch (err) {
    console.error('Erro ao atualizar professor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Deletar professor
router.delete('/professores/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const professor = await get('SELECT * FROM professores WHERE id = ?', [id]);
    if (!professor) return res.status(404).json({ error: 'Professor não encontrado' });

    await execute('DELETE FROM professores WHERE id = ?', [id]);

    await execute(
      'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
      ['professor', `Professor excluído: ${professor.nome}`, req.session.username]
    );

    res.json({ success: true, message: 'Professor excluído com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar professor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});
