const API_BASE_URL = window.location.origin;
let vagas = [];
let vagaAtual = null;

/* =========================
   UTILIDADES
========================= */

function formatarRestante(vagas_disponiveis) {
    if (vagas_disponiveis === 0) return 'ESGOTADO';
    if (vagas_disponiveis === 1) return 'RESTAM UMA VAGA';
    if (vagas_disponiveis === 2) return 'RESTAM DUAS VAGAS';
    return `RESTAM ${vagas_disponiveis} VAGAS`;
}

function getClassRestante(vagas_disponiveis) {
    if (vagas_disponiveis === 0) return 'restante-esgotado';
    if (vagas_disponiveis === 1) return 'restante-uma';
    if (vagas_disponiveis === 2) return 'restante-duas';
    return 'restante-disponivel';
}

function getStatusVaga(vaga) {
    if (vaga.vagas_disponiveis === 0) return 'esgotado';
    if (vaga.vagas_disponiveis <= 1) return 'ultima';
    if (vaga.vagas_disponiveis <= 2) return 'limitada';
    return 'disponivel';
}

/* =========================
   API - CORREÇÃO DAS URLs
========================= */

async function carregarVagas() {
    try {
        console.log('Carregando vagas da API...');
        // Correção: rota correta é '/api/' e não '/api/vagas'
        const response = await fetch(`${API_BASE_URL}/api/`);

        const contentType = response.headers.get('content-type');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!contentType || !contentType.includes('application/json')) {
            console.warn('Resposta não é JSON, pode ser HTML:', contentType);
            throw new Error('Resposta não é JSON');
        }

        const data = await response.json();
        console.log('Dados recebidos da API:', data);

        if (data.success && Array.isArray(data.vagas)) {
            return data.vagas.map(vaga => ({
                id: vaga.id,
                titulo: vaga.titulo || `${vaga.dias} - ${vaga.horario}`,
                dias: vaga.dias,
                horario: vaga.horario,
                nivel: vaga.nivel,
                vagas_disponiveis: vaga.vagas_disponiveis,
                vagas_totais: vaga.vagas_totais,
                professor: vaga.professor_nome || 'Professor não definido',
                tipo: vaga.vagas_disponiveis === 0 ? 'ESGOTADO' :
                      vaga.vagas_disponiveis === 1 ? 'ÚLTIMA VAGA' :
                      vaga.vagas_disponiveis <= 3 ? 'VAGA LIMITADA' : 'DISPONÍVEL'
            }));
        }

        // Retorna array vazio se a API não fornecer dados válidos
        return [];
    } catch (error) {
        console.warn('API falhou, usando fallback local:', error.message);
        return [
            { 
                id: 1, 
                titulo: "Segunda e Quarta - 19:00", 
                dias: "Segunda e Quarta", 
                horario: "19:00 - 20:00", 
                nivel: "Iniciante", 
                vagas_disponiveis: 2, 
                vagas_totais: 2, 
                professor: "Prof. João", 
                tipo: "VAGA LIMITADA" 
            },
            { 
                id: 2, 
                titulo: "Terça e Quinta - 18:00", 
                dias: "Terça e Quinta", 
                horario: "18:00 - 19:00", 
                nivel: "Intermediário", 
                vagas_disponiveis: 1, 
                vagas_totais: 1, 
                professor: "Prof. Maria", 
                tipo: "ÚLTIMA VAGA" 
            }
        ];
    }
}

async function criarReserva(dadosReserva) {
    try {
        console.log('Enviando reserva:', dadosReserva);
        // A rota '/api/reservas' permanece correta
        const response = await fetch(`${API_BASE_URL}/api/reservas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(dadosReserva)
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Resposta não é JSON:', text.substring(0, 200));
            throw new Error('Resposta do servidor não é JSON');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Erro ${response.status}: ${response.statusText}`);
        }

        return data;
    } catch (error) {
        console.error('Erro na requisição de reserva:', error);
        throw error;
    }
}


/* =========================
   RENDER
========================= */

async function renderizarVagas() {
    const grid = document.getElementById('vagasGrid');
    if (!grid) {
        console.error('Elemento #vagasGrid não encontrado');
        return;
    }

    grid.innerHTML = '<div class="loading">Carregando vagas...</div>';
    
    try {
        vagas = await carregarVagas();
        console.log('Vagas carregadas:', vagas);
        
        grid.innerHTML = '';

        if (!vagas.length) {
            grid.innerHTML = '<div class="no-vagas">Nenhuma vaga disponível no momento.</div>';
            atualizarTotalVagas();
            return;
        }

        vagas.forEach(vaga => {
            const status = getStatusVaga(vaga);
            const pct = (vaga.vagas_disponiveis / vaga.vagas_totais) * 100;

            // Determina cor do badge
            let corBadge = '';
            if(vaga.vagas_disponiveis === 0) corBadge = 'preto';
            else if(vaga.vagas_disponiveis === 1) corBadge = 'vermelho';
            else if(vaga.vagas_disponiveis <= 3) corBadge = 'amarelo';
            else corBadge = 'verde';

            const vagaCard = document.createElement('div');
            vagaCard.className = `vaga-card ${status}`;
            vagaCard.innerHTML = `
                <h3>${vaga.titulo}</h3>
                <p>${vaga.dias} • ${vaga.horario}</p>
                <p><strong>${vaga.professor}</strong> • ${vaga.nivel}</p>

                <div class="vaga-restante-badge ${corBadge}">
                    ${vaga.vagas_disponiveis} ${vaga.vagas_disponiveis === 1 ? 'vaga' : 'vagas'} restantes
                </div>

                <div class="contador-bar">
                    <div class="contador-fill ${status}" style="width:${pct}%"></div>
                </div>

                <button class="vaga-button" ${vaga.vagas_disponiveis === 0 ? 'disabled' : ''}>
                    ${vaga.vagas_disponiveis === 0 ? 'ESGOTADO' : 'RESERVAR'}
                </button>
            `;

            const button = vagaCard.querySelector('.vaga-button');
            if (vaga.vagas_disponiveis > 0) {
                button.addEventListener('click', () => abrirModal(vaga.id));
            }

            grid.appendChild(vagaCard);
        });

        atualizarTotalVagas();
    } catch (error) {
        console.error('Erro ao renderizar vagas:', error);
        grid.innerHTML = '<div class="error">Erro ao carregar vagas. Tente novamente mais tarde.</div>';
    }
}

function atualizarTotalVagas() {
    const total = vagas.reduce((s, v) => s + v.vagas_disponiveis, 0);
    const el = document.getElementById('totalVagas');
    if (el) {
        el.textContent = total;
        console.log('Total de vagas disponíveis:', total);
    }
}

/* =========================
   MODAL
========================= */

async function abrirModal(id) {
    vagaAtual = vagas.find(v => v.id == id);
    if (!vagaAtual) {
        console.error('Vaga não encontrada:', id);
        return;
    }

    const info = document.getElementById('modalInfo');
    const modal = document.getElementById('reservaModal');
    if (!info || !modal) {
        console.error('Elementos do modal não encontrados');
        return;
    }

    info.innerHTML = `
        <strong>${vagaAtual.titulo}</strong><br>
        ${vagaAtual.dias} • ${vagaAtual.horario}<br>
        Professor: ${vagaAtual.professor}<br>
        Nível: ${vagaAtual.nivel}<br>
        <strong class="${getClassRestante(vagaAtual.vagas_disponiveis)}">
            ${formatarRestante(vagaAtual.vagas_disponiveis)}
        </strong><br>
        ${vagaAtual.tipo ? `Tipo: ${vagaAtual.tipo}` : ''}
    `;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function fecharModal() {
    const modal = document.getElementById('reservaModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    // Limpa os campos do formulário
    document.getElementById('reservaForm')?.reset();
}

/* =========================
   FORMULÁRIO
========================= */

async function enviarFormulario(event) {
    event.preventDefault();
    
    if (!vagaAtual) {
        alert('Erro: Nenhuma vaga selecionada.');
        return;
    }

    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const telefone = document.getElementById('telefone').value.trim();
    const nivel = document.getElementById('nivel').value;
    const objetivo = document.getElementById('objetivo').value.trim();

    // Validação básica
    if (!nome || !email || !telefone) {
        alert('Por favor, preencha todos os campos obrigatórios (Nome, Email e WhatsApp).');
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processando...';

    try {
        const dadosReserva = { 
            vaga_id: vagaAtual.id, 
            nome, 
            email, 
            telefone, 
            nivel_aluno: nivel, 
            objetivo 
        };
        
        console.log('Enviando dados da reserva:', dadosReserva);
        const resultado = await criarReserva(dadosReserva);
        console.log('Resposta da reserva:', resultado);

        // Mostra mensagem de sucesso
        const msg = document.getElementById('successMessage');
        if (msg) {
            msg.textContent = `✅ Reserva criada com sucesso!\nID: ${resultado.reserva_id || resultado.message}`;
            msg.style.display = 'block';
            setTimeout(() => msg.style.display = 'none', 5000);
        } else {
            alert(`Reserva criada com sucesso! ${resultado.reserva_id ? `ID: ${resultado.reserva_id}` : ''}`);
        }

        // Fecha modal, limpa formulário e atualiza lista
        fecharModal();
        event.target.reset();
        
        // Recarrega as vagas para atualizar contadores
        setTimeout(() => renderizarVagas(), 1000);

    } catch (error) {
        console.error('Erro no formulário:', error);
        alert(`Erro ao criar reserva: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/* =========================
   DEBUG E TESTES
========================= */

// Adiciona função de teste para verificar a API
async function testarAPI() {
    try {
        console.log('Testando conexão com API...');
        const response = await fetch(`${API_BASE_URL}/api/vagas`);
        console.log('Status:', response.status, response.statusText);
        console.log('Content-Type:', response.headers.get('content-type'));
        
        if (response.ok) {
            const data = await response.json();
            console.log('Resposta da API:', data);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Erro no teste da API:', error);
        return false;
    }
}

/* =========================
   INIT
========================= */

document.addEventListener('DOMContentLoaded', () => {
    console.log('Inicializando sistema de reservas...');
    
    // Testa a API primeiro
    testarAPI().then(apiFunciona => {
        if (!apiFunciona) {
            console.warn('API não está respondendo corretamente, usando dados locais.');
        }
        
        // Carrega e renderiza as vagas
        renderizarVagas();
        
        // Configura formulário
        const form = document.getElementById('reservaForm');
        if (form) {
            form.addEventListener('submit', enviarFormulario);
        } else {
            console.error('Formulário de reserva não encontrado!');
        }
        
        // Configura botão de cancelar
        const btnCancelar = document.querySelector('.modal-button.cancelar');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', fecharModal);
        }
        
        // Fecha modal com ESC
        document.addEventListener('keydown', e => { 
            if (e.key === 'Escape') fecharModal(); 
        });
        
        // Fecha modal clicando fora
        const modal = document.getElementById('reservaModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    fecharModal();
                }
            });
        }
    });
});

// Adiciona funções ao escopo global para debugging
window.abrirModal = abrirModal;
window.fecharModal = fecharModal;
window.testarAPI = testarAPI;
window.recarregarVagas = renderizarVagas;