/**
 * admin-script.js - VERSÃO REFATORADA
 * Sistema de gerenciamento administrativo
 */
(function () {
  'use strict';

  // ==================== CONSTANTES ====================
  const CONFIG = {
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.webp'],
    MIN_PASSWORD_LENGTH: 6,
    ALERT_TIMEOUT: 5000
  };

  // ==================== ESTADO GLOBAL ====================
  const state = {
    vagas: [],
    reservas: [],
    professores: [],
    stats: {}
  };

  // ==================== UTILITÁRIOS DOM ====================
  const DOM = {
    get: (id) => document.getElementById(id),
    getAll: (selector) => Array.from(document.querySelectorAll(selector)),
    closest: (el, selector) => el?.closest(selector)
  };

  // ==================== VALIDAÇÕES ====================
  const Validations = {
    email(email) {
      const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return regex.test(email);
    },

    telefone(telefone) {
      const numeros = telefone.replace(/\D/g, '');

      if (numeros.length < 10) {
        return { valido: false, erro: 'Telefone incompleto. Mínimo 10 dígitos.' };
      }

      if (numeros.length > 11) {
        return { valido: false, erro: 'Telefone inválido. Máximo 11 dígitos.' };
      }

      const ddd = parseInt(numeros.substring(0, 2));
      if (ddd < 11 || ddd > 99) {
        return { valido: false, erro: 'DDD inválido.' };
      }

      if (numeros.length === 11) {
        const primeiroDigito = parseInt(numeros.charAt(2));
        if (primeiroDigito !== 9) {
          return { valido: false, erro: 'Celular deve começar com 9 após o DDD.' };
        }
      } else if (numeros.length === 10) {
        const primeiroDigito = parseInt(numeros.charAt(2));
        if (primeiroDigito < 2 || primeiroDigito > 5) {
          return { valido: false, erro: 'Número fixo inválido.' };
        }
      }

      return { valido: true };
    },

    arquivo(file) {
      if (file.size > CONFIG.MAX_FILE_SIZE) {
        return { valido: false, erro: 'Arquivo muito grande. Máximo: 5MB.' };
      }

      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
        return { valido: false, erro: 'Formato inválido. Use PNG, JPG, JPEG ou WEBP.' };
      }

      return { valido: true };
    }
  };

  // ==================== FORMATADORES ====================
  const Formatters = {
    telefone(telefone) {
      let numeros = telefone.replace(/\D/g, '').substring(0, 11);

      if (numeros.length <= 2) return numeros;
      if (numeros.length <= 7) return `(${numeros.substring(0, 2)}) ${numeros.substring(2)}`;
      if (numeros.length <= 10) return `(${numeros.substring(0, 2)}) ${numeros.substring(2, 6)}-${numeros.substring(6)}`;
      return `(${numeros.substring(0, 2)}) ${numeros.substring(2, 7)}-${numeros.substring(7)}`;
    },

    data(date) {
      return date ? new Date(date).toLocaleDateString('pt-BR') : '';
    },

    preco(valor) {
      return valor ? parseFloat(valor).toFixed(2) : 'N/A';
    }
  };

  // ==================== GERENCIADOR DE ALERTAS ====================
  const AlertManager = {
    show(message, type = 'info') {
      this.removeAll();

      const alert = document.createElement('div');
      alert.className = `alert alert-${type} fixed-alert`;
      alert.setAttribute('role', 'status');
      alert.innerHTML = `
        <span>${this._escape(message)}</span>
        <button aria-label="Fechar">&times;</button>
      `;

      alert.querySelector('button').addEventListener('click', () => alert.remove());
      document.body.appendChild(alert);

      setTimeout(() => alert.remove(), CONFIG.ALERT_TIMEOUT);
    },

    removeAll() {
      DOM.getAll('.fixed-alert').forEach(a => a.remove());
    },

    _escape(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  };

  // ==================== GERENCIADOR DE MODAIS ====================
  const ModalManager = {
    open(modalId) {
      this.closeAll();
      const modal = DOM.get(modalId);
      if (!modal) return;

      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    },

    closeAll() {
      DOM.getAll('.modal').forEach(modal => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
      });
    }
  };

  // ==================== API ====================
  const API = {
    async request(endpoint, options = {}) {
      const response = await fetch(`/api/admin${endpoint}`, {
        credentials: 'include',
        ...options
      });

      if (!response.ok) {
        const error = new Error(`Erro ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    },

    get(endpoint) {
      return this.request(endpoint);
    },

    post(endpoint, data) {
      return this.request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    },

    put(endpoint, data) {
      return this.request(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    },

    delete(endpoint) {
      return this.request(endpoint, { method: 'DELETE' });
    },

    async uploadFormData(endpoint, formData, method = 'POST') {
      const response = await fetch(`/api/admin${endpoint}`, {
        method,
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao processar requisição');
      }

      return response.json();
    }
  };

  // ==================== CARREGADORES DE DADOS ====================
  const DataLoaders = {
    async stats() {
      try {
        const stats = await API.get('/stats');
        state.stats = stats || {};

        const updates = {
          totalVagasAdmin: stats.total_vagas || 0,
          vagasDisponiveisAdmin: (stats.total_vagas || 0) - (stats.vagas_esgotadas || 0),
          reservasConfirmadas: stats.total_reservas || 0,
          vagasEsgotadas: stats.vagas_esgotadas || 0
        };

        Object.entries(updates).forEach(([id, value]) => {
          const el = DOM.get(id);
          if (el) el.textContent = value;
        });
      } catch (err) {
        console.error('Erro ao carregar estatísticas:', err);
        AlertManager.show('Erro ao carregar estatísticas', 'error');
      }
    },

    async vagas() {
      try {
        const vagas = await API.get('/vagas');
        state.vagas = Array.isArray(vagas) ? vagas : [];
        Renderers.vagas(state.vagas);
      } catch (err) {
        console.error('Erro ao carregar vagas:', err);
        AlertManager.show('Erro ao carregar vagas', 'error');
      }
    },

    async reservas() {
      try {
        const response = await API.get('/reservas');
        state.reservas = response?.reservas || [];
        Renderers.reservas(state.reservas);
      } catch (err) {
        console.error('Erro ao carregar reservas:', err);
        AlertManager.show('Erro ao carregar reservas', 'error');
      }
    },

    async professores() {
      try {
        const response = await API.get('/professores');
        state.professores = Array.isArray(response) ? response : [];
        Renderers.professores();
        updateProfessorSelects();
      } catch (err) {
        console.error('Erro ao carregar professores:', err);
        AlertManager.show('Erro ao carregar professores', 'error');
      }
    }
  };

  // Função auxiliar para atualizar selects de professor
  function updateProfessorSelects() {
    ['novaProfessor', 'editarProfessor'].forEach(id => {
      const select = DOM.get(id);
      if (!select) return;

      const currentValue = select.value;
      const options = state.professores
        .map(p => `<option value="${p.id}" ${p.id == currentValue ? 'selected' : ''}>${AlertManager._escape(p.nome)}</option>`)
        .join('');

      select.innerHTML = '<option value="">Selecione um professor</option>' + options;
    });
  }

  // ==================== RENDERIZADORES ====================
  const Renderers = {
    vagas(vagas) {
      const container = DOM.get('adminVagasList');
      if (!container) return;

      if (!vagas?.length) {
        container.innerHTML = '<div class="empty">Nenhuma vaga encontrada</div>';
        return;
      }

      container.innerHTML = vagas.map(v => `
        <div class="vaga-item" data-id="${v.id}">
          <div class="vaga-status ${v.vagas_disponiveis > 0 ? 'disponivel' : 'esgotada'}">
            ${v.vagas_disponiveis} vaga(s)
          </div>
          <div class="vaga-info">
            <h3>${AlertManager._escape(v.titulo || 'Sem título')}</h3>
            <div class="vaga-meta">
              <span>${AlertManager._escape(v.horario || '')}</span>
              <span>${AlertManager._escape(v.dias || '')}</span>
              <span>${AlertManager._escape(v.nivel || '')}</span>
              <span>${AlertManager._escape(v.professor_nome || v.professor || 'Sem professor')}</span>
            </div>
          </div>
          <div class="vaga-actions">
            <button class="btn-icon edit" data-action="edit" data-id="${v.id}" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon delete" data-action="delete" data-id="${v.id}" title="Excluir">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `).join('');
    },

    reservas(reservas) {
      const container = DOM.get('reservasTable');
      if (!container) return;

      if (!reservas?.length) {
        container.innerHTML = '<tr><td colspan="7" class="empty">Nenhuma reserva encontrada</td></tr>';
        return;
      }

      container.innerHTML = reservas.map(r => `
        <tr data-id="${r.id}">
          <td><code>${r.reserva_id}</code></td>
          <td>${AlertManager._escape(r.nome || '')}</td>
          <td>${AlertManager._escape(r.email || '')}</td>
          <td>${AlertManager._escape(r.vaga_titulo || '')}</td>
          <td>${Formatters.data(r.data_reserva)}</td>
          <td><span class="status-badge status-${r.status}">${r.status || 'pendente'}</span></td>
          <td>
            <div class="table-actions">
              ${r.status === 'pendente' ? 
                `<button class="btn-small btn-success" data-action="confirm-reserva" data-reserva-id="${r.reserva_id}">
                  Confirmar
                </button>` : ''}
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
    },

    professores() {
      const container = DOM.get('adminProfessoresList');
      if (!container) return;

      if (!state.professores.length) {
        container.innerHTML = '<div class="empty">Nenhum professor cadastrado</div>';
        return;
      }

      container.innerHTML = state.professores.map(p => `
        <div class="vaga-admin-item" data-id="${p.id}">
          <div class="prof-left">
            <img src="${p.foto || '/img/default-prof.png'}" 
                 alt="${AlertManager._escape(p.nome)}" 
                 class="prof-thumb"/>
            <div class="prof-meta">
              <strong>${AlertManager._escape(p.nome)}</strong>
              <small>${AlertManager._escape(p.email || '')}</small>
              <small class="telefone-display">${p.telefone ? Formatters.telefone(p.telefone) : 'Não informado'}</small>
              <small>Preço: R$${Formatters.preco(p.preco)}</small>
            </div>
          </div>
          <div class="prof-actions">
            <button class="action-icon-btn" data-action="edit-prof" data-id="${p.id}" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="action-icon-btn" data-action="del-prof" data-id="${p.id}" title="Excluir">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `).join('');
    }
  };

  // ==================== AÇÕES CRUD ====================
  const Actions = {
    async createVaga(data) {
      const result = await API.post('/vagas', data);
      await Promise.all([DataLoaders.vagas(), DataLoaders.stats()]);
      return result;
    },

    async updateVaga(id, data) {
      const result = await API.put(`/vagas/${id}`, data);
      await Promise.all([DataLoaders.vagas(), DataLoaders.stats()]);
      return result;
    },

    async deleteVaga(id) {
      if (!confirm('Tem certeza que deseja excluir esta vaga?')) return;

      const result = await API.delete(`/vagas/${id}`);
      
      if (result?.action === 'deactivated') {
        AlertManager.show(result.message, 'warning');
      } else {
        AlertManager.show('Vaga excluída com sucesso', 'success');
      }

      await Promise.all([DataLoaders.vagas(), DataLoaders.stats()]);
      return result;
    },

    async confirmReserva(reservaId) {
      if (!confirm('Confirmar esta reserva?')) return;

      await API.post(`/reservas/${reservaId}/confirm`);
      await Promise.all([DataLoaders.reservas(), DataLoaders.stats()]);
      AlertManager.show('Reserva confirmada com sucesso', 'success');
    },

    async deleteReserva(id) {
      if (!confirm('Tem certeza que deseja excluir esta reserva?\n\nEsta ação não pode ser desfeita.')) return;

      await API.delete(`/reservas/${id}`);
      await Promise.all([DataLoaders.reservas(), DataLoaders.stats()]);
      AlertManager.show('Reserva excluída com sucesso', 'success');
    },

    async deleteProfessor(id) {
      if (!confirm(
        'Tem certeza que deseja excluir este professor?\n\n' +
        'ATENÇÃO: Todas as vagas e reservas associadas também serão excluídas.'
      )) return;

      try {
        const result = await API.delete(`/professores/${id}`);
        AlertManager.show(result.message || 'Professor excluído com sucesso', 'success');

        await Promise.all([
          DataLoaders.professores(),
          DataLoaders.vagas(),
          DataLoaders.reservas(),
          DataLoaders.stats()
        ]);
      } catch (err) {
        if (err.status === 404) {
          AlertManager.show('Professor não encontrado', 'error');
        } else {
          AlertManager.show('Erro ao excluir professor', 'error');
        }
      }
    },

    async changePassword(data) {
      await API.post('/alterar-senha', data);
      AlertManager.show('Senha alterada com sucesso', 'success');
    }
  };

  // ==================== MANIPULADORES DE EVENTOS ====================
  const EventHandlers = {
    setupNavigation() {
      document.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-section]');
        if (!nav?.dataset.section) return;

        e.preventDefault();
        const section = nav.dataset.section;

        DOM.getAll('.section').forEach(s => s.classList.remove('active'));
        DOM.getAll('.nav-item').forEach(n => n.classList.remove('active'));

        const sectionEl = DOM.get(section);
        if (!sectionEl) return;

        sectionEl.classList.add('active');
        nav.classList.add('active');

        const titles = {
          dashboard: 'Dashboard',
          vagas: 'Gerenciar Vagas',
          reservas: 'Reservas',
          professores: 'Professores',
          config: 'Configurações'
        };

        const titleEl = DOM.get('sectionTitle');
        if (titleEl) titleEl.textContent = titles[section] || 'Admin';

        // Carregar dados da seção
        const loaders = {
          dashboard: DataLoaders.stats,
          vagas: DataLoaders.vagas,
          reservas: DataLoaders.reservas,
          professores: DataLoaders.professores
        };

        if (loaders[section]) loaders[section]();
      });
    },

    setupModals() {
      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
          ModalManager.closeAll();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') ModalManager.closeAll();
      });
    },

    setupVagasActions() {
      // Botão abrir nova vaga
      DOM.get('abrirNovaVagaBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        ModalManager.open('novaVagaModal');
      });

      // Lista de vagas
      DOM.get('adminVagasList')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        e.preventDefault();
        const { action, id } = btn.dataset;

        if (action === 'edit') {
          const vaga = state.vagas.find(v => String(v.id) === String(id));
          if (!vaga) return;

          ModalManager.open('editarVagaModal');

          const fields = {
            editarId: vaga.id,
            editarTitulo: vaga.titulo,
            editarHorario: vaga.horario,
            editarDias: vaga.dias,
            editarNivel: vaga.nivel,
            editarTotal: vaga.vagas_totais,
            editarDisponiveis: vaga.vagas_disponiveis,
            editarTipo: vaga.tipo,
            editarProfessor: vaga.professor_id
          };

          Object.entries(fields).forEach(([fieldId, value]) => {
            const el = DOM.get(fieldId);
            if (el) el.value = value || '';
          });
        }

        if (action === 'delete') {
          try {
            await Actions.deleteVaga(id);
          } catch (err) {
            AlertManager.show('Erro ao excluir vaga: ' + err.message, 'error');
          }
        }
      });

      // Formulários
      this.setupVagaForms();
    },

    setupVagaForms() {
      // Nova vaga
      DOM.get('novaVagaForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
          titulo: DOM.get('novaTitulo')?.value || '',
          horario: DOM.get('novaHorario')?.value || '',
          dias: DOM.get('novaDias')?.value || '',
          nivel: DOM.get('novaNivel')?.value || '',
          vagas_totais: parseInt(DOM.get('novaTotal')?.value || 0),
          professor_id: parseInt(DOM.get('novaProfessor')?.value || 0),
          tipo: DOM.get('novaTipo')?.value || ''
        };

        if (!payload.titulo || !payload.horario || !payload.dias || !payload.nivel || !payload.tipo) {
          AlertManager.show('Preencha todos os campos obrigatórios', 'warning');
          return;
        }

        if (!payload.professor_id) {
          AlertManager.show('Selecione um professor', 'warning');
          return;
        }

        try {
          await Actions.createVaga(payload);
          ModalManager.closeAll();
          AlertManager.show('Vaga criada com sucesso', 'success');
          e.target.reset();
        } catch (err) {
          AlertManager.show('Erro ao criar vaga: ' + err.message, 'error');
        }
      });

      // Editar vaga
      DOM.get('editarVagaForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = DOM.get('editarId')?.value;
        if (!id) {
          AlertManager.show('ID da vaga não encontrado', 'error');
          return;
        }

        const payload = {
          titulo: DOM.get('editarTitulo')?.value || '',
          horario: DOM.get('editarHorario')?.value || '',
          dias: DOM.get('editarDias')?.value || '',
          nivel: DOM.get('editarNivel')?.value || '',
          vagas_totais: parseInt(DOM.get('editarTotal')?.value || 0),
          vagas_disponiveis: parseInt(DOM.get('editarDisponiveis')?.value || 0),
          professor_id: parseInt(DOM.get('editarProfessor')?.value || 0),
          tipo: DOM.get('editarTipo')?.value || '',
          ativo: 1
        };

        if (!payload.titulo || !payload.horario || !payload.dias || !payload.nivel || !payload.tipo) {
          AlertManager.show('Preencha todos os campos obrigatórios', 'warning');
          return;
        }

        try {
          await Actions.updateVaga(id, payload);
          ModalManager.closeAll();
          AlertManager.show('Vaga atualizada com sucesso', 'success');
        } catch (err) {
          AlertManager.show('Erro ao atualizar vaga: ' + err.message, 'error');
        }
      });

      // Cancelar
      ['cancelNovaVagaBtn', 'cancelEditarVagaBtn'].forEach(btnId => {
        DOM.get(btnId)?.addEventListener('click', (e) => {
          e.preventDefault();
          ModalManager.closeAll();
        });
      });
    },

    setupReservasActions() {
      DOM.get('reservasTable')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        e.preventDefault();

        try {
          if (btn.dataset.action === 'confirm-reserva') {
            await Actions.confirmReserva(btn.dataset.reservaId);
          }

          if (btn.dataset.action === 'delete-reserva') {
            await Actions.deleteReserva(btn.dataset.id);
          }
        } catch (err) {
          AlertManager.show('Erro: ' + err.message, 'error');
        }
      });
    },

    setupProfessoresActions() {
      // Botão novo professor
      DOM.get('abrirNovoProfessorBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        
        const form = DOM.get('novoProfessorForm');
        if (form) {
          form.reset();
          delete form.dataset.editId;
        }

        const modal = DOM.get('novoProfessorModal');
        const title = modal?.querySelector('h2');
        if (title) title.innerHTML = '<i class="fas fa-plus"></i> Adicionar Novo Professor';

        const preview = DOM.get('professorFotoPreview');
        if (preview) preview.style.display = 'none';

        ModalManager.open('novoProfessorModal');
      });

      // Ações na lista
      document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        // Editar professor
        if (btn.dataset.action === 'edit-prof') {
          e.preventDefault();
          const professor = state.professores.find(p => String(p.id) === String(btn.dataset.id));
          if (!professor) return;

          const fields = {
            professorNome: professor.nome,
            professorEmail: professor.email,
            professorTelefone: professor.telefone ? Formatters.telefone(professor.telefone) : '',
            professorPreco: professor.preco,
            professorObservacoes: professor.observacoes
          };

          Object.entries(fields).forEach(([fieldId, value]) => {
            const el = DOM.get(fieldId);
            if (el) el.value = value || '';
          });

          const preview = DOM.get('professorFotoPreview');
          if (preview) {
            if (professor.foto) {
              preview.src = professor.foto;
              preview.style.display = 'block';
            } else {
              preview.style.display = 'none';
            }
          }

          const form = DOM.get('novoProfessorForm');
          if (form) form.dataset.editId = professor.id;

          const modal = DOM.get('novoProfessorModal');
          const title = modal?.querySelector('h2');
          if (title) title.innerHTML = '<i class="fas fa-edit"></i> Editar Professor';

          ModalManager.open('novoProfessorModal');
        }

        // Excluir professor
        if (btn.dataset.action === 'del-prof') {
          e.preventDefault();
          await Actions.deleteProfessor(btn.dataset.id);
        }
      });

      // Formulário professor
      this.setupProfessorForm();

      // Cancelar
      DOM.get('cancelNovoProfessorBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        ModalManager.closeAll();
      });
    },

    setupProfessorForm() {
      const telefoneInput = DOM.get('professorTelefone');
      const fotoInput = DOM.get('professorFoto');
      const form = DOM.get('novoProfessorForm');

      // Formatação telefone
      telefoneInput?.addEventListener('input', (e) => {
        const telefone = e.target.value.replace(/[^\d()\s-]/g, '');
        const cursorPos = e.target.selectionStart;
        const telefoneFormatado = Formatters.telefone(telefone);
        
        e.target.value = telefoneFormatado;
        
        const diff = telefoneFormatado.length - telefone.length;
        e.target.setSelectionRange(cursorPos + diff, cursorPos + diff);
      });

      // Validação telefone
      telefoneInput?.addEventListener('keydown', (e) => {
        const allowedKeys = [46, 8, 9, 27, 13, 110, 190];
        const isCtrlCmd = e.ctrlKey || e.metaKey;
        const isSpecialKey = allowedKeys.includes(e.keyCode) ||
          (e.keyCode === 65 && isCtrlCmd) ||
          (e.keyCode === 67 && isCtrlCmd) ||
          (e.keyCode === 86 && isCtrlCmd) ||
          (e.keyCode === 88 && isCtrlCmd) ||
          (e.keyCode >= 35 && e.keyCode <= 39);

        if (isSpecialKey) return;

        if ((e.keyCode < 48 || e.keyCode > 57) && (e.keyCode < 96 || e.keyCode > 105)) {
          e.preventDefault();
        }
      });

      // Preview foto
      fotoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const preview = DOM.get('professorFotoPreview');
          if (preview) {
            preview.src = event.target.result;
            preview.style.display = 'block';
          }
        };
        reader.readAsDataURL(file);
      });

      // Submit form
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nome = DOM.get('professorNome')?.value.trim();
        const email = DOM.get('professorEmail')?.value.trim();
        const telefone = DOM.get('professorTelefone')?.value.trim();

        // Validações
        if (!nome) {
          AlertManager.show('O nome do professor é obrigatório', 'error');
          return;
        }

        if (!email) {
          AlertManager.show('O email do professor é obrigatório', 'error');
          return;
        }

        if (!Validations.email(email)) {
          AlertManager.show('Por favor, insira um email válido', 'error');
          return;
        }

        const fotoFile = DOM.get('professorFoto')?.files[0];
        if (fotoFile) {
          const validacao = Validations.arquivo(fotoFile);
          if (!validacao.valido) {
            AlertManager.show(validacao.erro, 'error');
            return;
          }
        }

        if (telefone) {
          const validacao = Validations.telefone(telefone);
          if (!validacao.valido) {
            AlertManager.show(validacao.erro, 'error');
            return;
          }
        }

        const formData = new FormData();
        formData.append('nome', nome);
        formData.append('email', email);

        if (telefone) {
          formData.append('telefone', telefone.replace(/\D/g, ''));
        }

        const preco = DOM.get('professorPreco')?.value;
        if (preco) formData.append('preco', preco);

        const observacoes = DOM.get('professorObservacoes')?.value.trim();
        if (observacoes) formData.append('observacoes', observacoes);

        if (fotoFile) formData.append('foto', fotoFile);

        try {
          const editId = form.dataset.editId;
          const endpoint = editId ? `/professores/${editId}` : '/professores';
          const method = editId ? 'PUT' : 'POST';

          await API.uploadFormData(endpoint, formData, method);

          AlertManager.show(
            editId ? 'Professor atualizado com sucesso!' : 'Professor criado com sucesso!',
            'success'
          );

          await DataLoaders.professores();
          ModalManager.closeAll();
          form.reset();
          delete form.dataset.editId;
          
          const preview = DOM.get('professorFotoPreview');
          if (preview) preview.style.display = 'none';

        } catch (err) {
          console.error(err);
          AlertManager.show(err.message, 'error');
        }
      });
    },

    setupConfigActions() {
      // Alterar senha
      DOM.get('changePasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const senhaAtual = DOM.get('currentPassword')?.value || '';
        const novaSenha = DOM.get('newPassword')?.value || '';
        const confirmarSenha = DOM.get('confirmPassword')?.value || '';

        if (!senhaAtual || !novaSenha || !confirmarSenha) {
          AlertManager.show('Preencha todos os campos', 'warning');
          return;
        }

        if (novaSenha !== confirmarSenha) {
          AlertManager.show('As senhas não coincidem', 'warning');
          return;
        }

        if (novaSenha.length < CONFIG.MIN_PASSWORD_LENGTH) {
          AlertManager.show(`A senha deve ter no mínimo ${CONFIG.MIN_PASSWORD_LENGTH} caracteres`, 'warning');
          return;
        }

        try {
          await Actions.changePassword({
            senha_atual: senhaAtual,
            nova_senha: novaSenha,
            confirmar_senha: confirmarSenha
          });
          e.target.reset();
        } catch (err) {
          AlertManager.show('Erro ao alterar senha', 'error');
        }
      });

      // Logout
      DOM.get('logoutBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Deseja realmente sair?')) return;

        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
          });
          window.location.href = '/admin';
        } catch (err) {
          console.error(err);
          window.location.href = '/admin';
        }
      });

      // Atualizar tudo
      DOM.get('atualizarBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        AlertManager.show('Atualizando...', 'info');

        try {
          await Promise.all([
            DataLoaders.stats(),
            DataLoaders.vagas(),
            DataLoaders.reservas(),
            DataLoaders.professores()
          ]);
          AlertManager.show('Dados atualizados com sucesso', 'success');
        } catch (err) {
          AlertManager.show('Erro ao atualizar dados', 'error');
        }
      });
    },

    setupDashboardActions() {
      DOM.get('dashboard')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        e.preventDefault();
        const { action } = btn.dataset;

        if (action === 'abrir-nova-vaga') {
          ModalManager.open('novaVagaModal');
        }

        if (action === 'resetar-vagas' && confirm('Tem certeza que deseja resetar todas as vagas?')) {
          try {
            await API.post('/vagas/reset-all');
            await DataLoaders.vagas();
            AlertManager.show('Todas as vagas foram resetadas!', 'success');
          } catch (err) {
            AlertManager.show('Erro ao resetar vagas', 'error');
          }
        }

        if (action === 'ver-reservas') {
          document.querySelector('[data-section="reservas"]')?.click();
        }

        if (action === 'abrir-config') {
          document.querySelector('[data-section="config"]')?.click();
        }
      });
    }
  };

  // ==================== INICIALIZAÇÃO ====================
  async function init() {
    console.log('🚀 Inicializando painel administrativo...');

    // Setup de eventos
    EventHandlers.setupNavigation();
    EventHandlers.setupModals();
    EventHandlers.setupVagasActions();
    EventHandlers.setupReservasActions();
    EventHandlers.setupProfessoresActions();
    EventHandlers.setupConfigActions();
    EventHandlers.setupDashboardActions();

    // Carregar dados iniciais
    try {
      await Promise.all([
        DataLoaders.stats(),
        DataLoaders.professores(),
        DataLoaders.vagas()
      ]);
      console.log('✅ Painel inicializado com sucesso!');
    } catch (err) {
      console.error('❌ Erro ao inicializar painel:', err);
      AlertManager.show('Erro ao carregar dados do painel', 'error');
    }
  }

  // Aguardar DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();