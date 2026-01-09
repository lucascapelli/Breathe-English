/**
 * admin-script.js - VERSÃO CORRIGIDA (funcionamento completo dos professores)
 */
(function () {
  'use strict';

  console.log('🛠️ DEBUG: Script admin iniciando...');

  // ===== Estado único =====
  const adminData = {
    vagas: [],
    reservas: [],
    professores: [],
    stats: {},
    professorEditando: null
  };

  // ===== Helpers =====
  const $id = id => document.getElementById(id);
  const $qsa = sel => Array.from(document.querySelectorAll(sel));
  const $closest = (el, sel) => el && el.closest ? el.closest(sel) : null;
  const debug = (...args) => console.log('%c🔧 ADMIN', 'color:#ff6b6b;font-weight:bold', ...args);

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showAlert(message, type = 'info') {
    $qsa('.fixed-alert').forEach(a => a.remove());
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} fixed-alert`;
    alertDiv.setAttribute('role', 'status');
    alertDiv.innerHTML = `<span>${escapeHtml(message)}</span><button aria-label="Fechar">&times;</button>`;
    alertDiv.querySelector('button').addEventListener('click', () => alertDiv.remove());
    document.body.appendChild(alertDiv);
    setTimeout(() => { if (alertDiv.parentElement) alertDiv.remove(); }, 5000);
  }

  // Função para validar o arquivo de imagem antes de enviar
  function validarArquivoImagem(file) {
    // Verificar tamanho (5MB em bytes)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return { valido: false, erro: 'O arquivo é muito grande. Tamanho máximo: 5MB.' };
    }

    // Verificar extensão
    const extensoesPermitidas = ['.png', '.jpg', '.jpeg', '.webp'];
    const nomeArquivo = file.name;
    const extensao = nomeArquivo.slice(nomeArquivo.lastIndexOf('.')).toLowerCase();
    if (!extensoesPermitidas.includes(extensao)) {
      return { valido: false, erro: 'Formato de arquivo inválido. Use apenas PNG, JPG, JPEG ou WEBP.' };
    }

    return { valido: true };
  }

  // Função para formatar número de telefone
  function formatarTelefone(telefone) {
    // Remove tudo que não é número
    let numeros = telefone.replace(/\D/g, '');
    
    // Limita a 11 dígitos (máximo para celular brasileiro com DDD)
    numeros = numeros.substring(0, 11);
    
    // Aplica a máscara
    if (numeros.length <= 2) {
      return numeros;
    } else if (numeros.length <= 7) {
      return `(${numeros.substring(0, 2)}) ${numeros.substring(2)}`;
    } else if (numeros.length <= 10) {
      return `(${numeros.substring(0, 2)}) ${numeros.substring(2, 6)}-${numeros.substring(6)}`;
    } else {
      return `(${numeros.substring(0, 2)}) ${numeros.substring(2, 7)}-${numeros.substring(7)}`;
    }
  }

  // Função para validar número de telefone de forma mais rigorosa
  function validarTelefone(telefone) {
    // Remove formatação
    const numeros = telefone.replace(/\D/g, '');
    
    // Verifica se tem pelo menos 10 dígitos (DDD + número)
    if (numeros.length < 10) {
      return { valido: false, erro: 'Número de telefone incompleto. Mínimo 10 dígitos (DDD + número).' };
    }
    
    // Verifica se tem mais de 11 dígitos (máximo)
    if (numeros.length > 11) {
      return { valido: false, erro: 'Número de telefone inválido. Máximo 11 dígitos.' };
    }
    
    // Verifica se o DDD é válido (11 a 99)
    const ddd = parseInt(numeros.substring(0, 2));
    if (ddd < 11 || ddd > 99) {
      return { valido: false, erro: 'DDD inválido. Deve estar entre 11 e 99.' };
    }
    
    // Verifica se o número é composto apenas por dígitos válidos
    // Primeiro dígito após o DDD deve ser 9 para celular (se for 11 dígitos) ou 2-5 para fixo (se for 10 dígitos)
    if (numeros.length === 11) {
      const primeiroNumero = parseInt(numeros.charAt(2));
      if (primeiroNumero !== 9) {
        return { valido: false, erro: 'Número de celular inválido. Deve começar com 9 após o DDD.' };
      }
    } else if (numeros.length === 10) {
      const primeiroNumero = parseInt(numeros.charAt(2));
      if (primeiroNumero < 2 || primeiroNumero > 5) {
        return { valido: false, erro: 'Número fixo inválido. Deve começar com 2 a 5 após o DDD.' };
      }
    }
    
    // Verifica se há apenas dígitos (dupla verificação)
    if (!/^\d+$/.test(numeros)) {
      return { valido: false, erro: 'Telefone deve conter apenas números.' };
    }
    
    return { valido: true };
  }

  function closeAllModals() {
    $qsa('.modal').forEach(m => {
      m.classList.remove('active');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  function openModal(id) {
    closeAllModals();
    const modal = $id(id);
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  // ===== API helper =====
  const api = {
    async request(endpoint, opts = {}) {
      const res = await fetch(`/api/admin${endpoint}`, { credentials: 'include', ...opts });
      if (!res.ok) {
        const err = new Error(`Erro ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    get: (e) => api.request(e),
    post: (e, d) => api.request(e, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
    put: (e, d) => api.request(e, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
    delete: (e) => api.request(e, { method: 'DELETE' })
  };

  // ===== Carregadores =====
  async function loadDashboardStats() {
    try {
      const stats = await api.get('/stats');
      adminData.stats = stats || {};
      $id('totalVagasAdmin') && ($id('totalVagasAdmin').textContent = stats.total_vagas || 0);
      $id('vagasDisponiveisAdmin') && ($id('vagasDisponiveisAdmin').textContent = ((stats.total_vagas || 0) - (stats.vagas_esgotadas || 0)));
      $id('reservasConfirmadas') && ($id('reservasConfirmadas').textContent = stats.total_reservas || 0);
      $id('vagasEsgotadas') && ($id('vagasEsgotadas').textContent = stats.vagas_esgotadas || 0);
    } catch (err) {
      console.error('Erro stats', err);
      showAlert('Erro ao carregar estatísticas', 'error');
    }
  }

  async function loadVagas() {
    try {
      const vagas = await api.get('/vagas');
      adminData.vagas = Array.isArray(vagas) ? vagas : (vagas || []);
      renderVagas(adminData.vagas);
    } catch (err) {
      console.error('Erro vagas', err);
      showAlert('Erro ao carregar vagas', 'error');
    }
  }

  async function loadReservas() {
    try {
      const res = await api.get('/reservas');
      adminData.reservas = (res && res.reservas) ? res.reservas : [];
      renderReservas(adminData.reservas);
    } catch (err) {
      console.error('Erro reservas', err);
      showAlert('Erro ao carregar reservas', 'error');
    }
  }

  async function loadProfessores() {
    try {
      const resp = await api.get('/professores');
      adminData.professores = Array.isArray(resp) ? resp : (resp || []);
      renderProfessoresList();
      updateProfessorSelects();
    } catch (err) {
      console.error('Erro professores', err);
      showAlert('Erro ao carregar professores', 'error');
    }
  }

  // ===== Helpers Professores =====
  function updateProfessorSelects(list = adminData.professores) {
    const ids = ['novaProfessor', 'editarProfessor'];
    ids.forEach(id => {
      const el = $id(id);
      if (!el) return;
      const cur = el.value;
      const opts = list.map(p => `<option value="${p.id}" ${p.id == cur ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('');
      el.innerHTML = '<option value="">Selecione um professor</option>' + opts;
    });
  }

  function getProfessoresContainer() {
    return $id('adminProfessoresList');
  }

  function renderProfessoresList() {
    const container = getProfessoresContainer();
    if (!container) return;
    const list = adminData.professores || [];

    if (!list.length) {
      container.innerHTML = '<div class="empty">Nenhum professor cadastrado</div>';
      return;
    }

    container.innerHTML = list.map(p => `
      <div class="vaga-admin-item" data-id="${p.id}">
        <div class="prof-left">
          <img src="${p.foto || '/img/default-prof.png'}" alt="${escapeHtml(p.nome)}" class="prof-thumb"/>
          <div class="prof-meta">
            <strong>${escapeHtml(p.nome)}</strong>
            <small>${escapeHtml(p.email || '')}</small>
            <small class="telefone-display">${p.telefone ? formatarTelefone(p.telefone) : 'Não informado'}</small>
            <small>Preço: R$${p.preco ? parseFloat(p.preco).toFixed(2) : 'N/A'}</small>
          </div>
        </div>
        <div class="prof-actions">
          <button class="action-icon-btn" data-action="edit-prof" data-id="${p.id}" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="action-icon-btn" data-action="del-prof" data-id="${p.id}" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  // ===== Renders =====
  function renderVagas(vagas) {
    const container = $id('adminVagasList');
    if (!container) return;
    if (!vagas || vagas.length === 0) { container.innerHTML = '<div class="empty">Nenhuma vaga encontrada</div>'; return; }

    container.innerHTML = vagas.map(v => `
      <div class="vaga-item" data-id="${v.id}">
        <div class="vaga-status ${v.vagas_disponiveis > 0 ? 'disponivel' : 'esgotada'}">${v.vagas_disponiveis} vaga(s)</div>
        <div class="vaga-info">
          <h3>${escapeHtml(v.titulo || 'Sem título')}</h3>
          <div class="vaga-meta">
            <span>${escapeHtml(v.horario || '')}</span>
            <span>${escapeHtml(v.dias || '')}</span>
            <span>${escapeHtml(v.nivel || '')}</span>
            <span>${escapeHtml(v.professor_nome || v.professor || 'Sem professor')}</span>
          </div>
        </div>
        <div class="vaga-actions">
          <button class="btn-icon edit" data-action="edit" data-id="${v.id}" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="btn-icon delete" data-action="delete" data-id="${v.id}" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  function renderReservas(reservas) {
    const container = $id('reservasTable');
    if (!container) return;
    if (!reservas || reservas.length === 0) { container.innerHTML = '<tr><td colspan="7" class="empty">Nenhuma reserva encontrada</td></tr>'; return; }

    container.innerHTML = reservas.map(r => `
      <tr data-id="${r.id}">
        <td><code>${r.reserva_id}</code></td>
        <td>${escapeHtml(r.nome || '')}</td>
        <td>${escapeHtml(r.email || '')}</td>
        <td>${escapeHtml(r.vaga_titulo || '')}</td>
        <td>${r.data_reserva ? new Date(r.data_reserva).toLocaleDateString('pt-BR') : ''}</td>
        <td><span class="status-badge status-${r.status}">${r.status || 'pendente'}</span></td>
        <td>
          <div class="table-actions">
            ${r.status === 'pendente' ? 
              `<button class="btn-small btn-success" data-action="confirm-reserva" data-reserva-id="${r.reserva_id}">Confirmar</button>` 
              : ''}
            <button class="btn-icon" data-action="view-reserva" data-id="${r.id}" title="Visualizar">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn-icon btn-danger" data-action="delete-reserva" data-id="${r.id}" title="Excluir">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ===== CRUD Professores =====
  async function createProfessor(data) {
    const res = await api.post('/professores', data);
    await loadProfessores();
    return res;
  }

  async function updateProfessor(id, data) {
    const res = await api.put(`/professores/${id}`, data);
    await loadProfessores();
    return res;
  }

  async function deleteProfessor(id) {
  if (
    !confirm(
      'Tem certeza que deseja excluir este professor?\n\n' +
      'ATENÇÃO: Todas as vagas e reservas associadas a este professor também serão excluídas.'
    )
  ) return;

  try {
    const res = await api.delete(`/professores/${id}`);

    showAlert(
      res.message || 'Professor excluído com sucesso!',
      'success'
    );

    // 🔄 Recarregar TUDO (cascade afeta vagas e reservas)
    await Promise.all([
      loadProfessores(),
      loadVagas(),
      loadReservas(),
      loadDashboardStats()
    ]);

  } catch (err) {
    console.error(err);

    if (err.status === 404) {
      showAlert('Professor não encontrado', 'error');
    } else {
      showAlert('Erro ao excluir professor', 'error');
    }
  }
}

  // ===== CRUD Vagas =====
  async function createVaga(data) {
    const res = await api.post('/vagas', data);
    await Promise.all([loadVagas(), loadDashboardStats()]);
    return res;
  }

  async function updateVaga(id, data) {
    const res = await api.put(`/vagas/${id}`, data);
    await Promise.all([loadVagas(), loadDashboardStats()]);
    return res;
  }

  async function deleteVaga(id) {
    const res = await api.delete(`/vagas/${id}`);
    if (res && res.action === 'deactivated') showAlert(res.message, 'warning');
    else showAlert('Vaga excluída', 'success');
    await Promise.all([loadVagas(), loadDashboardStats()]);
    return res;
  }

  async function confirmReserva(reservaId) {
    const res = await api.post(`/reservas/${reservaId}/confirm`);
    await Promise.all([loadReservas(), loadDashboardStats()]);
    showAlert('Reserva confirmada', 'success');
    return res;
  }

  // Função para excluir reserva
  async function deleteReserva(id) {
    if (!confirm('Tem certeza que deseja excluir esta reserva?\n\nEsta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const res = await api.delete(`/reservas/${id}`);
      
      // Atualizar estatísticas e lista de reservas
      await Promise.all([loadReservas(), loadDashboardStats()]);
      showAlert(res.message || 'Reserva excluída com sucesso!', 'success');
      return res;
    } catch (err) {
      console.error(err);
      showAlert('Erro ao excluir reserva', 'error');
    }
  }

  async function resetAllVagas() {
    const res = await api.post('/vagas/reset-all');
    await loadVagas();
    showAlert('Todas as vagas foram resetadas!', 'success');
    return res;
  }

  async function changePassword(data) {
    const res = await api.post('/alterar-senha', data);
    showAlert('Senha alterada com sucesso!', 'success');
    return res;
  }

  // ===== Event delegation =====
  function setupEventDelegation() {
    // Navigation
    document.addEventListener('click', function (e) {
      const nav = e.target.closest('[data-section]');
      if (nav && nav.dataset.section) {
        e.preventDefault();
        const section = nav.dataset.section;
        $qsa('.section').forEach(s => s.classList.remove('active'));
        $qsa('.nav-item').forEach(n => n.classList.remove('active'));
        const sectionEl = $id(section);
        if (sectionEl) {
          sectionEl.classList.add('active');
          nav.classList.add('active');
          const title = section === 'dashboard' ? 'Dashboard' :
            section === 'vagas' ? 'Gerenciar Vagas' :
              section === 'reservas' ? 'Reservas' :
                section === 'professores' ? 'Professores' :
                  'Configurações';
          $id('sectionTitle') && ($id('sectionTitle').textContent = title);
          if (section === 'dashboard') loadDashboardStats();
          if (section === 'vagas') loadVagas();
          if (section === 'reservas') loadReservas();
          if (section === 'professores') loadProfessores();
        }
      }
    });

    // Dashboard actions
    $id('dashboard')?.addEventListener('click', function (e) {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      e.preventDefault();
      const action = actionBtn.dataset.action;
      if (action === 'abrir-nova-vaga') openModal('novaVagaModal');
      if (action === 'resetar-vagas' && confirm('Resetar todas as vagas?')) resetAllVagas();
      if (action === 'ver-reservas') document.querySelector('[data-section="reservas"]')?.click();
      if (action === 'abrir-config') document.querySelector('[data-section="config"]')?.click();
    });

    // Vagas list actions
    $id('adminVagasList')?.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'edit') {
        const vaga = adminData.vagas.find(v => String(v.id) === String(id));
        if (vaga) {
          openModal('editarVagaModal');
          $id('editarId') && ($id('editarId').value = vaga.id);
          $id('editarTitulo') && ($id('editarTitulo').value = vaga.titulo || '');
          $id('editarHorario') && ($id('editarHorario').value = vaga.horario || '');
          $id('editarDias') && ($id('editarDias').value = vaga.dias || '');
          $id('editarNivel') && ($id('editarNivel').value = vaga.nivel || '');
          $id('editarTotal') && ($id('editarTotal').value = vaga.vagas_totais || 0);
          $id('editarDisponiveis') && ($id('editarDisponiveis').value = vaga.vagas_disponiveis || 0);
          $id('editarTipo') && ($id('editarTipo').value = vaga.tipo || '');
          $id('editarProfessor') && ($id('editarProfessor').value = vaga.professor_id || '');
        }
      } else if (action === 'delete' && confirm('Excluir vaga?')) {
        deleteVaga(btn.dataset.id).catch(err => showAlert('Erro ao excluir: ' + err.message, 'error'));
      }
    });

    // Reservas actions
    $id('reservasTable')?.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      
      if (btn.dataset.action === 'confirm-reserva' && confirm('Confirmar esta reserva?')) {
        confirmReserva(btn.dataset.reservaId).catch(err => showAlert('Erro: ' + err.message, 'error'));
      }
      
      // Adicionar este bloco para exclusão
      if (btn.dataset.action === 'delete-reserva') {
        deleteReserva(btn.dataset.id).catch(err => showAlert('Erro: ' + err.message, 'error'));
      }
    });

    // Botão para abrir nova vaga
    $id('abrirNovaVagaBtn')?.addEventListener('click', e => {
      e.preventDefault();
      openModal('novaVagaModal');
    });

    // Botão para abrir novo professor
    $id('abrirNovoProfessorBtn')?.addEventListener('click', e => {
      e.preventDefault();
      // Resetar o formulário e título
      const form = $id('novoProfessorForm');
      if (form) {
        form.reset();
        form.dataset.editId = '';
      }
      const modalTitle = $id('novoProfessorModal')?.querySelector('h2');
      if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-plus"></i> Adicionar Novo Professor';
      }
      $id('professorFotoPreview').style.display = 'none';
      openModal('novoProfessorModal');
    });

    // Cancelar novo professor
    $id('cancelNovoProfessorBtn')?.addEventListener('click', e => {
      e.preventDefault();
      closeAllModals();
    });

    // Logout
    $id('logoutBtn')?.addEventListener('click', async e => {
      e.preventDefault();
      if (!confirm('Deseja realmente sair?')) return;
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/admin';
      } catch (err) {
        console.error(err);
        window.location.href = '/admin';
      }
    });

    // Atualizar tudo
    $id('atualizarBtn')?.addEventListener('click', async e => {
      e.preventDefault();
      showAlert('Atualizando...', 'info');
      try {
        await Promise.all([loadDashboardStats(), loadVagas(), loadReservas(), loadProfessores()]);
        showAlert('Dados atualizados', 'success');
      } catch (err) {
        showAlert('Erro ao atualizar', 'error');
      }
    });

    // Fechar modais
    document.addEventListener('click', function (e) {
      if (e.target.classList && e.target.classList.contains('modal')) closeAllModals();
      if ($closest(e.target, '#cancelNovaVagaBtn') ||
        $closest(e.target, '#cancelEditarVagaBtn')) {
        e.preventDefault();
        closeAllModals();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAllModals();
    });

    // Delegar eventos de professores (editar e excluir)
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      // Editar professor
      if (btn.dataset.action === 'edit-prof') {
        e.preventDefault();
        const profId = btn.dataset.id;
        const professor = adminData.professores.find(p => String(p.id) === String(profId));

        if (professor) {
          // Preencher formulário
          $id('professorNome').value = professor.nome || '';
          $id('professorEmail').value = professor.email || '';
          
          // Formatar telefone ao carregar para edição
          const telefoneFormatado = professor.telefone ? formatarTelefone(professor.telefone) : '';
          $id('professorTelefone').value = telefoneFormatado;
          
          $id('professorPreco').value = professor.preco || '';
          $id('professorObservacoes').value = professor.observacoes || '';

          // Pré-visualização da foto existente
          const preview = $id('professorFotoPreview');
          if (professor.foto) {
            preview.src = professor.foto;
            preview.style.display = 'block';
          } else {
            preview.style.display = 'none';
          }

          // Marcar que está editando
          const form = $id('novoProfessorForm');
          if (form) {
            form.dataset.editId = profId;
          }

          // Atualizar título do modal
          const modalTitle = $id('novoProfessorModal')?.querySelector('h2');
          if (modalTitle) {
            modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Professor';
          }

          openModal('novoProfessorModal');
        }
      }

      // Excluir professor
      if (btn.dataset.action === 'del-prof') {
        e.preventDefault();
        const profId = btn.dataset.id;
        deleteProfessor(profId);
      }
    });

    // Formatação automática do telefone enquanto digita com prevenção de caracteres não numéricos
    $id('professorTelefone')?.addEventListener('input', function (e) {
      // Permite apenas números, parênteses, espaço e hífen
      const telefone = e.target.value.replace(/[^\d()\s-]/g, '');
      
      const cursorPos = e.target.selectionStart;
      const telefoneFormatado = formatarTelefone(telefone);
      e.target.value = telefoneFormatado;
      
      // Mantém o cursor na posição correta após formatação
      const diff = telefoneFormatado.length - telefone.length;
      e.target.setSelectionRange(cursorPos + diff, cursorPos + diff);
    });

    // Previne entrada de caracteres inválidos no telefone
    $id('professorTelefone')?.addEventListener('keydown', function (e) {
      // Permite: backspace, delete, tab, escape, enter, setas
      if ([46, 8, 9, 27, 13, 110, 190].indexOf(e.keyCode) !== -1 ||
        // Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && (e.ctrlKey || e.metaKey)) ||
        (e.keyCode === 67 && (e.ctrlKey || e.metaKey)) ||
        (e.keyCode === 86 && (e.ctrlKey || e.metaKey)) ||
        (e.keyCode === 88 && (e.ctrlKey || e.metaKey)) ||
        // Home, End, Left, Right
        (e.keyCode >= 35 && e.keyCode <= 39)) {
        return;
      }
      
      // Permite apenas números
      if ((e.keyCode < 48 || e.keyCode > 57) && (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault();
      }
    });

    // Pré-visualização da foto ao selecionar arquivo
    $id('professorFoto')?.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
          const preview = $id('professorFotoPreview');
          preview.src = event.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    // Formulário de professor (CRIAÇÃO E EDIÇÃO) com validação de imagem e telefone
    $id('novoProfessorForm')?.addEventListener('submit', async function (e) {
      e.preventDefault();

      // Validação básica dos campos obrigatórios
      const nome = $id('professorNome').value.trim();
      const email = $id('professorEmail').value.trim();
      const telefone = $id('professorTelefone').value.trim();

      if (!nome) {
        showAlert('O nome do professor é obrigatório', 'error');
        return;
      }

      if (!email) {
        showAlert('O email do professor é obrigatório', 'error');
        return;
      }

      // Validação simples de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showAlert('Por favor, insira um email válido', 'error');
        return;
      }

      // Validação da foto, se houver
      const fotoFile = $id('professorFoto').files[0];
      if (fotoFile) {
        const validacaoImagem = validarArquivoImagem(fotoFile);
        if (!validacaoImagem.valido) {
          showAlert(validacaoImagem.erro, 'error');
          return;
        }
      }

      // Validação do telefone (apenas se preenchido)
      if (telefone) {
        const validacaoTelefone = validarTelefone(telefone);
        if (!validacaoTelefone.valido) {
          showAlert(validacaoTelefone.erro, 'error');
          return;
        }
      }

      const formData = new FormData();
      formData.append('nome', nome);
      formData.append('email', email);
      
      // Remove formatação do telefone antes de enviar (apenas se preenchido)
      if (telefone) {
        const telefoneLimpo = telefone.replace(/\D/g, '');
        formData.append('telefone', telefoneLimpo);
      }
      
      const preco = $id('professorPreco').value;
      if (preco) {
        formData.append('preco', preco);
      }
      
      const observacoes = $id('professorObservacoes').value.trim();
      if (observacoes) {
        formData.append('observacoes', observacoes);
      }

      if (fotoFile) {
        formData.append('foto', fotoFile);
      }

      try {
        const editId = this.dataset.editId;

        const res = await fetch(
          editId
            ? `/api/admin/professores/${editId}`
            : `/api/admin/professores`,
          {
            method: editId ? 'PUT' : 'POST',
            credentials: 'include',
            body: formData
          }
        );

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Erro ao salvar professor');
        }

        const data = await res.json();
        showAlert(
          editId ? 'Professor atualizado com sucesso!' : 'Professor criado com sucesso!',
          'success'
        );

        await loadProfessores();
        closeAllModals();
        this.reset();
        delete this.dataset.editId;
        $id('professorFotoPreview').style.display = 'none';

      } catch (err) {
        console.error(err);
        showAlert(err.message, 'error');
      }
    });

    // Formulário nova vaga
    $id('novaVagaForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        titulo: $id('novaTitulo')?.value || '',
        horario: $id('novaHorario')?.value || '',
        dias: $id('novaDias')?.value || '',
        nivel: $id('novaNivel')?.value || '',
        vagas_totais: parseInt($id('novaTotal')?.value || 0),
        professor_id: parseInt($id('novaProfessor')?.value || 0),
        tipo: $id('novaTipo')?.value || ''
      };

      if (!payload.titulo || !payload.horario || !payload.dias || !payload.nivel || !payload.tipo) {
        showAlert('Preencha todos os campos obrigatórios', 'warning');
        return;
      }
      if (!payload.professor_id) {
        showAlert('Selecione um professor', 'warning');
        return;
      }

      try {
        await createVaga(payload);
        closeAllModals();
        showAlert('Vaga criada', 'success');
      } catch (err) {
        showAlert('Erro criar vaga: ' + err.message, 'error');
      }
    });

    // Formulário editar vaga
    $id('editarVagaForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const id = $id('editarId')?.value;
      if (!id) {
        showAlert('ID da vaga não encontrado', 'error');
        return;
      }

      const payload = {
        titulo: $id('editarTitulo')?.value || '',
        horario: $id('editarHorario')?.value || '',
        dias: $id('editarDias')?.value || '',
        nivel: $id('editarNivel')?.value || '',
        vagas_totais: parseInt($id('editarTotal')?.value || 0),
        vagas_disponiveis: parseInt($id('editarDisponiveis')?.value || 0),
        professor_id: parseInt($id('editarProfessor')?.value || 0),
        tipo: $id('editarTipo')?.value || '',
        ativo: 1
      };

      if (!payload.titulo || !payload.horario || !payload.dias || !payload.nivel || !payload.tipo) {
        showAlert('Preencha todos os campos obrigatórios', 'warning');
        return;
      }

      try {
        await updateVaga(id, payload);
        closeAllModals();
        showAlert('Vaga atualizada', 'success');
      } catch (err) {
        showAlert('Erro atualizar vaga: ' + err.message, 'error');
      }
    });

    // Formulário alterar senha
    $id('changePasswordForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const senha_atual = $id('currentPassword')?.value || '';
      const nova_senha = $id('newPassword')?.value || '';
      const confirmar_senha = $id('confirmPassword')?.value || '';

      if (!senha_atual || !nova_senha || !confirmar_senha) {
        showAlert('Preencha todos os campos', 'warning');
        return;
      }
      if (nova_senha !== confirmar_senha) {
        showAlert('Senhas não coincidem', 'warning');
        return;
      }
      if (nova_senha.length < 6) {
        showAlert('Senha precisa ter ao menos 6 caracteres', 'warning');
        return;
      }

      try {
        await changePassword({ senha_atual, nova_senha, confirmar_senha });
        $id('changePasswordForm').reset();
      } catch (err) {
        showAlert('Erro ao alterar senha', 'error');
      }
    });
  }

  // ===== Init =====
  async function init() {
    debug('Inicializando painel...');
    setupEventDelegation();
    try {
      await Promise.all([loadDashboardStats(), loadProfessores(), loadVagas()]);
      debug('Painel inicializado com sucesso!');
    } catch (err) {
      console.error('Erro init', err);
      showAlert('Erro ao carregar dados do painel', 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();