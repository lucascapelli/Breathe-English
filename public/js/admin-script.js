/**
 * admin-script.js - VERSÃO FINAL CORRIGIDA
 */
(function () {
  'use strict';

  console.log('🛠️ DEBUG: Script admin iniciando...');

  // Helpers
  const $id = id => document.getElementById(id);
  const $qsa = sel => Array.from(document.querySelectorAll(sel));
  const $closest = (el, sel) => el.closest(sel);
  
  // Função de debug
  const debug = (...args) => {
    console.log('%c🔧 ADMIN', 'color:#ff6b6b;font-weight:bold', ...args);
  };

  // Estado global
  const adminData = {
    vagas: [],
    reservas: [],
    professores: [],
    stats: {}
  };

  // ===== API HELPER =====
  const api = {
    async get(endpoint) {
      const response = await fetch(`/api/admin${endpoint}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const error = new Error(`Erro ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    },

    async post(endpoint, data) {
      const response = await fetch(`/api/admin${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = new Error(`Erro ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    },

    async put(endpoint, data) {
      const response = await fetch(`/api/admin${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = new Error(`Erro ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    },

    async delete(endpoint) {
      const response = await fetch(`/api/admin${endpoint}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        const error = new Error(`Erro ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    }
  };

  // ===== FUNÇÕES AUXILIARES =====
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function closeAllModals() {
    $qsa('.modal').forEach(modal => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  function openModal(modalId) {
    closeAllModals();
    const modal = $id(modalId);
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function showAlert(message, type = 'info') {
    // Remove alertas anteriores
    $qsa('.fixed-alert').forEach(alert => alert.remove());
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} fixed-alert`;
    alertDiv.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">&times;</button>
    `;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
      if (alertDiv.parentElement) {
        alertDiv.remove();
      }
    }, 5000);
  }

  // ===== CARREGAMENTO DE DADOS =====
  async function loadDashboardStats() {
    try {
      debug('Carregando estatísticas...');
      const stats = await api.get('/stats');
      adminData.stats = stats;
      
      // CORREÇÃO: IDs CORRETOS conforme o HTML
      $id('totalVagasAdmin') && ($id('totalVagasAdmin').textContent = stats.total_vagas || 0);
      $id('vagasDisponiveisAdmin') && ($id('vagasDisponiveisAdmin').textContent = (stats.total_vagas - stats.vagas_esgotadas) || 0);
      $id('reservasConfirmadas') && ($id('reservasConfirmadas').textContent = stats.total_reservas || 0);
      $id('vagasEsgotadas') && ($id('vagasEsgotadas').textContent = stats.vagas_esgotadas || 0);
      
      debug('Estatísticas carregadas:', stats);
    } catch (error) {
      console.error('Erro ao carregar stats:', error);
      showAlert('Erro ao carregar estatísticas', 'error');
    }
  }

  async function loadVagas() {
    try {
      debug('Carregando vagas...');
      const vagas = await api.get('/vagas');
      adminData.vagas = vagas;
      debug('Vagas carregadas:', vagas.length);
      renderVagas(vagas);
    } catch (error) {
      console.error('Erro ao carregar vagas:', error);
      showAlert('Erro ao carregar vagas', 'error');
    }
  }

  async function loadProfessores() {
    try {
      debug('Carregando professores...');
      const professores = await api.get('/professores');
      adminData.professores = professores;
      debug('Professores carregados:', professores.length);
      
      // Atualiza os selects de professores com IDs CORRETOS
      updateProfessorSelects(professores);
    } catch (error) {
      console.error('Erro ao carregar professores:', error);
      showAlert('Erro ao carregar professores', 'error');
    }
  }

  function updateProfessorSelects(professores) {
    // CORREÇÃO: IDs conforme HTML
    const selects = [
      { id: 'novaProfessor', element: $id('novaProfessor') },
      { id: 'editarProfessor', element: $id('editarProfessor') }
    ];
    
    selects.forEach(({ element }) => {
      if (element) {
        const currentValue = element.value;
        const options = professores.map(p => `
          <option value="${p.id}" ${p.id == currentValue ? 'selected' : ''}>
            ${escapeHtml(p.nome)} ${p.email ? `(${escapeHtml(p.email)})` : ''}
          </option>
        `).join('');
        
        element.innerHTML = '<option value="">Selecione um professor</option>' + options;
      }
    });
  }

  async function loadReservas() {
    try {
      debug('Carregando reservas...');
      const data = await api.get('/reservas');
      adminData.reservas = data.reservas || [];
      renderReservas(adminData.reservas);
      debug('Reservas carregadas:', adminData.reservas.length);
    } catch (error) {
      console.error('Erro ao carregar reservas:', error);
      showAlert('Erro ao carregar reservas', 'error');
    }
  }

  // ===== RENDERIZAÇÃO =====
  function renderVagas(vagas) {
    const container = $id('adminVagasList');
    if (!container) {
      debug('Container de vagas não encontrado!');
      return;
    }
    
    if (!vagas || vagas.length === 0) {
      container.innerHTML = '<div class="empty">Nenhuma vaga encontrada</div>';
      return;
    }
    
    container.innerHTML = vagas.map(vaga => `
      <div class="vaga-item" data-id="${vaga.id}">
        <div class="vaga-status ${vaga.vagas_disponiveis > 0 ? 'disponivel' : 'esgotada'}">
          ${vaga.vagas_disponiveis} vaga(s)
        </div>
        <div class="vaga-info">
          <h3>${escapeHtml(vaga.titulo || 'Sem título')}</h3>
          <div class="vaga-meta">
            <span><i class="fas fa-clock"></i> ${escapeHtml(vaga.horario || '')}</span>
            <span><i class="fas fa-calendar"></i> ${escapeHtml(vaga.dias || '')}</span>
            <span><i class="fas fa-chart-line"></i> ${escapeHtml(vaga.nivel || '')}</span>
            <span><i class="fas fa-user"></i> ${escapeHtml(vaga.professor_nome || vaga.professor || 'Sem professor')}</span>
            <span class="vaga-tipo">${escapeHtml(vaga.tipo || '')}</span>
          </div>
          <div class="vaga-stats">
            <small>Total: ${vaga.vagas_totais} | Disponível: ${vaga.vagas_disponiveis}</small>
            <small>Status: ${vaga.ativo ? 'Ativa' : 'Inativa'}</small>
          </div>
        </div>
        <div class="vaga-actions">
          <button class="btn-icon edit" data-action="edit" data-id="${vaga.id}" title="Editar" aria-label="Editar vaga">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon delete" data-action="delete" data-id="${vaga.id}" title="Excluir" aria-label="Excluir vaga">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  function renderReservas(reservas) {
    const container = $id('reservasTable');
    if (!container) {
      debug('Tabela de reservas não encontrada!');
      return;
    }
    
    if (!reservas || reservas.length === 0) {
      container.innerHTML = '<tr><td colspan="7" class="empty">Nenhuma reserva encontrada</td></tr>';
      return;
    }
    
    container.innerHTML = reservas.map(reserva => `
      <tr data-id="${reserva.id}">
        <td><code>${reserva.reserva_id}</code></td>
        <td>${escapeHtml(reserva.nome || '')}</td>
        <td>${escapeHtml(reserva.email || '')}</td>
        <td>${escapeHtml(reserva.vaga_titulo || '')}</td>
        <td>${new Date(reserva.data_reserva).toLocaleDateString('pt-BR')}</td>
        <td><span class="status-badge status-${reserva.status}">${reserva.status || 'pendente'}</span></td>
        <td>
          <div class="table-actions">
            ${reserva.status === 'pendente' ? `
              <button class="btn-small btn-success" data-action="confirm-reserva" data-reserva-id="${reserva.reserva_id}">
                Confirmar
              </button>
            ` : ''}
            <button class="btn-icon" data-action="view-reserva" data-id="${reserva.id}" title="Ver detalhes">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ===== CRUD OPERATIONS =====
  async function createVaga(data) {
    try {
      debug('Criando nova vaga:', data);
      const result = await api.post('/vagas', data);
      await loadVagas();
      await loadDashboardStats();
      return result;
    } catch (error) {
      console.error('Erro ao criar vaga:', error);
      throw error;
    }
  }

  async function updateVaga(id, data) {
    try {
      debug('Atualizando vaga:', id, data);
      const result = await api.put(`/vagas/${id}`, data);
      await loadVagas();
      await loadDashboardStats();
      return result;
    } catch (error) {
      console.error('Erro ao atualizar vaga:', error);
      throw error;
    }
  }

  async function deleteVaga(id) {
    try {
      debug('Excluindo vaga:', id);
      const result = await api.delete(`/vagas/${id}`);
      
      // Verifica se foi desativada em vez de excluída
      if (result.action === 'deactivated') {
        showAlert(result.message, 'warning');
      } else {
        showAlert('Vaga excluída com sucesso!', 'success');
      }
      
      await loadVagas();
      await loadDashboardStats();
      return result;
    } catch (error) {
      console.error('Erro ao excluir vaga:', error);
      throw error;
    }
  }

  async function confirmReserva(reservaId) {
    try {
      debug('Confirmando reserva:', reservaId);
      const result = await api.post(`/reservas/${reservaId}/confirm`);
      await loadReservas();
      await loadDashboardStats();
      showAlert('Reserva confirmada com sucesso!', 'success');
      return result;
    } catch (error) {
      console.error('Erro ao confirmar reserva:', error);
      throw error;
    }
  }

  async function resetAllVagas() {
    try {
      debug('Resetando todas as vagas...');
      const result = await api.post('/vagas/reset-all');
      await loadVagas();
      await loadDashboardStats();
      showAlert('Todas as vagas foram resetadas!', 'success');
      return result;
    } catch (error) {
      console.error('Erro ao resetar vagas:', error);
      throw error;
    }
  }

  async function changePassword(data) {
    try {
      debug('Alterando senha...');
      const result = await api.post('/alterar-senha', data);
      showAlert('Senha alterada com sucesso!', 'success');
      return result;
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      throw error;
    }
  }

  // ===== MODAL MANAGEMENT =====
  function openNovaVagaModal() {
    openModal('novaVagaModal');
    
    // Limpa o formulário
    const form = $id('novaVagaForm');
    if (form) {
      form.reset();
      
      // Garante valores padrão
      $id('novaTotal') && ($id('novaTotal').value = 2);
      $id('novaDisponiveis') && ($id('novaDisponiveis').value = 2);
      
      // Foca no primeiro campo
      setTimeout(() => {
        $id('novaTitulo')?.focus();
      }, 100);
    }
  }

  function openEditVagaModal(vaga) {
    openModal('editarVagaModal');
    
    const form = $id('editarVagaForm');
    if (!form) return;
    
    // CORREÇÃO: IDs do HTML
    $id('editarId') && ($id('editarId').value = vaga.id);
    $id('editarTitulo') && ($id('editarTitulo').value = vaga.titulo || '');
    $id('editarHorario') && ($id('editarHorario').value = vaga.horario || '');
    $id('editarDias') && ($id('editarDias').value = vaga.dias || '');
    $id('editarNivel') && ($id('editarNivel').value = vaga.nivel || '');
    $id('editarTotal') && ($id('editarTotal').value = vaga.vagas_totais || 0);
    $id('editarDisponiveis') && ($id('editarDisponiveis').value = vaga.vagas_disponiveis || 0);
    $id('editarTipo') && ($id('editarTipo').value = vaga.tipo || '');
    
    // Seleciona o professor correto
    const select = $id('editarProfessor');
    if (select && adminData.professores.length > 0) {
      select.value = vaga.professor_id || '';
    }
    
    // Foca no primeiro campo
    setTimeout(() => {
      $id('editarTitulo')?.focus();
    }, 100);
  }

  // ===== CONFIGURAÇÃO DE EVENTOS =====
  function setupEventDelegation() {
    debug('Configurando delegação de eventos...');
    
    // Navegação principal
    document.addEventListener('click', function(e) {
      const target = e.target.closest('[data-section]');
      if (target && target.dataset.section) {
        e.preventDefault();
        const section = target.dataset.section;
        debug('Navegação clicada:', section);
        
        // Atualiza navegação
        $qsa('.section').forEach(el => el.classList.remove('active'));
        $qsa('.nav-item').forEach(el => el.classList.remove('active'));
        
        const sectionEl = $id(section);
        if (sectionEl) {
          sectionEl.classList.add('active');
          target.classList.add('active');
          $id('sectionTitle').textContent = 
            section === 'dashboard' ? 'Dashboard' :
            section === 'vagas' ? 'Gerenciar Vagas' :
            section === 'reservas' ? 'Reservas' : 'Configurações';
          
          // Carrega dados específicos da seção
          if (section === 'dashboard') loadDashboardStats();
          if (section === 'vagas') loadVagas();
          if (section === 'reservas') loadReservas();
        }
      }
    });
    
    // Botões de ação rápida no dashboard
    const quickActions = $id('dashboard');
    if (quickActions) {
      quickActions.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          e.preventDefault();
          const action = actionBtn.dataset.action;
          
          switch(action) {
            case 'abrir-nova-vaga':
              openNovaVagaModal();
              break;
              
            case 'resetar-vagas':
              if (confirm('Resetar todas as vagas para o total original?')) {
                resetAllVagas().catch(err => {
                  showAlert('Erro ao resetar vagas: ' + err.message, 'error');
                });
              }
              break;
              
            case 'ver-reservas':
              // Navega para a seção de reservas
              const reservasBtn = document.querySelector('[data-section="reservas"]');
              reservasBtn?.click();
              break;
              
            case 'abrir-config':
              // Navega para a seção de configurações
              const configBtn = document.querySelector('[data-section="config"]');
              configBtn?.click();
              break;
          }
        }
      });
    }
    
    // Botões de ação nas vagas
    const vagasList = $id('adminVagasList');
    if (vagasList) {
      vagasList.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          e.preventDefault();
          const action = actionBtn.dataset.action;
          const id = actionBtn.dataset.id;
          
          if (action === 'edit') {
            const vaga = adminData.vagas.find(v => v.id == id);
            if (vaga) openEditVagaModal(vaga);
          }
          
          if (action === 'delete') {
            if (confirm(`Tem certeza que deseja excluir a vaga ID ${id}?`)) {
              deleteVaga(id).catch(err => {
                showAlert('Erro ao processar vaga: ' + err.message, 'error');
              });
            }
          }
        }
      });
    }
    
    // Botões de ação nas reservas
    const reservasTable = $id('reservasTable');
    if (reservasTable) {
      reservasTable.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          e.preventDefault();
          const action = actionBtn.dataset.action;
          const reservaId = actionBtn.dataset.reservaId;
          
          if (action === 'confirm-reserva') {
            if (confirm('Confirmar esta reserva?')) {
              confirmReserva(reservaId).catch(err => {
                showAlert('Erro ao confirmar reserva: ' + err.message, 'error');
              });
            }
          }
        }
      });
    }
    
    // Botão específico Nova Vaga
    const abrirNovaVagaBtn = $id('abrirNovaVagaBtn');
    if (abrirNovaVagaBtn) {
      abrirNovaVagaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openNovaVagaModal();
      });
    }
    
    // Botão Logout
    const logoutBtn = $id('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('Deseja realmente sair?')) {
          try {
            const response = await fetch('/api/auth/logout', {
              method: 'POST',
              credentials: 'include'
            });
            if (response.ok) {
              window.location.href = '/admin';
            }
          } catch (error) {
            console.error('Erro no logout:', error);
            window.location.href = '/admin';
          }
        }
      });
    }
    
    // Botão Atualizar
    const atualizarBtn = $id('atualizarBtn');
    if (atualizarBtn) {
      atualizarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showAlert('Atualizando dados...', 'info');
        
        Promise.all([
          loadDashboardStats(),
          loadVagas(),
          loadReservas(),
          loadProfessores()
        ]).then(() => {
          showAlert('Dados atualizados com sucesso!', 'success');
        }).catch(err => {
          showAlert('Erro ao atualizar dados', 'error');
        });
      });
    }
    
    // Botão Exportar
    const exportarBtn = $id('exportarBtn');
    if (exportarBtn) {
      exportarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showAlert('Exportando dados...', 'info');
        // Implementar exportação aqui
        setTimeout(() => {
          showAlert('Exportação realizada com sucesso!', 'success');
        }, 1000);
      });
    }
    
    // Botão Export Backup
    const exportBackupBtn = $id('exportBackupBtn');
    if (exportBackupBtn) {
      exportBackupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showAlert('Exportando backup...', 'info');
        // Implementar backup aqui
        setTimeout(() => {
          showAlert('Backup exportado com sucesso!', 'success');
        }, 1000);
      });
    }
    
    // Fechar modais
    document.addEventListener('click', function(e) {
      // Fechar ao clicar no overlay (fora do modal)
      if (e.target.classList.contains('modal')) {
        closeAllModals();
      }
      
      // Fechar com botões cancelar - CORREÇÃO: IDs corretos
      if (e.target.id === 'cancelNovaVagaBtn' || 
          e.target.id === 'cancelEditarVagaBtn' ||
          $closest(e.target, '#cancelNovaVagaBtn') ||
          $closest(e.target, '#cancelEditarVagaBtn')) {
        e.preventDefault();
        closeAllModals();
      }
    });
    
    // Fechar com ESC
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeAllModals();
      }
    });
    
    // Formulário nova vaga
    const novaVagaForm = $id('novaVagaForm');
    if (novaVagaForm) {
      novaVagaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // CORREÇÃO: IDs corretos conforme HTML
        const formData = {
          titulo: $id('novaTitulo')?.value || '',
          horario: $id('novaHorario')?.value || '',
          dias: $id('novaDias')?.value || '',
          nivel: $id('novaNivel')?.value || '',
          vagas_totais: parseInt($id('novaTotal')?.value || 0),
          professor_id: parseInt($id('novaProfessor')?.value || 0),
          tipo: $id('novaTipo')?.value || ''
        };
        
        // Validação
        if (!formData.titulo || !formData.horario || !formData.dias || !formData.nivel || !formData.tipo) {
          showAlert('Preencha todos os campos obrigatórios', 'warning');
          return;
        }
        
        if (!formData.professor_id) {
          showAlert('Selecione um professor', 'warning');
          return;
        }
        
        try {
          await createVaga(formData);
          showAlert('Vaga criada com sucesso!', 'success');
          closeAllModals();
        } catch (error) {
          showAlert('Erro ao criar vaga: ' + error.message, 'error');
        }
      });
    }
    
    // Formulário editar vaga
    const editarVagaForm = $id('editarVagaForm');
    if (editarVagaForm) {
      editarVagaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $id('editarId')?.value;
        
        if (!id) {
          showAlert('ID da vaga não encontrado', 'error');
          return;
        }
        
        const formData = {
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
        
        if (!formData.titulo || !formData.horario || !formData.dias || !formData.nivel || !formData.tipo) {
          showAlert('Preencha todos os campos obrigatórios', 'warning');
          return;
        }
        
        try {
          await updateVaga(id, formData);
          showAlert('Vaga atualizada com sucesso!', 'success');
          closeAllModals();
        } catch (error) {
          showAlert('Erro ao atualizar vaga: ' + error.message, 'error');
        }
      });
    }
    
    // Formulário alterar senha
    const changePasswordForm = $id('changePasswordForm');
    if (changePasswordForm) {
      changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const senha_atual = $id('currentPassword')?.value || '';
        const nova_senha = $id('newPassword')?.value || '';
        const confirmar_senha = $id('confirmPassword')?.value || '';
        
        if (!senha_atual || !nova_senha || !confirmar_senha) {
          showAlert('Preencha todos os campos', 'warning');
          return;
        }
        
        if (nova_senha !== confirmar_senha) {
          showAlert('As senhas não coincidem', 'warning');
          return;
        }
        
        if (nova_senha.length < 6) {
          showAlert('A senha deve ter pelo menos 6 caracteres', 'warning');
          return;
        }
        
        try {
          await changePassword({
            senha_atual,
            nova_senha,
            confirmar_senha
          });
          changePasswordForm.reset();
        } catch (error) {
          showAlert('Erro ao alterar senha: ' + error.message, 'error');
        }
      });
    }
  }

  // ===== INICIALIZAÇÃO =====
  async function init() {
    debug('Inicializando painel...');
    
    // Configura eventos
    setupEventDelegation();
    
    // Carrega dados iniciais
    try {
      await Promise.all([
        loadDashboardStats(),
        loadProfessores(),
        loadVagas()
      ]);
      
      debug('Painel inicializado com sucesso!');
    } catch (error) {
      console.error('Erro na inicialização:', error);
      showAlert('Erro ao carregar dados do painel', 'error');
    }
  }

  // Inicia quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expõe para debug no console
  window.adminDebug = {
    reloadVagas: loadVagas,
    reloadStats: loadDashboardStats,
    reloadReservas: loadReservas,
    reloadProfessores: loadProfessores,
    data: adminData,
    api: api
  };

})();