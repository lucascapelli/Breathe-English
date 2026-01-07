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
   API
========================= */

async function carregarVagas() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/vagas`);
        if (!response.ok) throw new Error('Erro ao carregar vagas');
        const data = await response.json();
        return data;
    } catch (e) {
        console.warn('API falhou, usando fallback local:', e);
        return [
            { id: 1, titulo:"Segunda e Quarta - 19:00", dias:"Segunda e Quarta", horario:"19:00 - 20:00", nivel:"Iniciante", vagas_disponiveis:2, vagas_totais:2, professor:"Prof. João", tipo:"VAGA LIMITADA" },
            { id: 2, titulo:"Terça e Quinta - 18:00", dias:"Terça e Quinta", horario:"18:00 - 19:00", nivel:"Intermediário", vagas_disponiveis:1, vagas_totais:1, professor:"Prof. Maria", tipo:"ÚLTIMA VAGA" }
        ];
    }
}

async function criarReserva(dadosReserva) {
    const response = await fetch(`${API_BASE_URL}/api/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosReserva)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao criar reserva');
    return data;
}

/* =========================
   RENDER
========================= */
async function renderizarVagas() {
    const grid = document.getElementById('vagasGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading">Carregando vagas...</div>';
    vagas = await carregarVagas();
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
}


function atualizarTotalVagas() {
    const total = vagas.reduce((s, v) => s + v.vagas_disponiveis, 0);
    const el = document.getElementById('totalVagas');
    if (el) el.textContent = total;
}

/* =========================
   MODAL
========================= */

async function abrirModal(id) {
    vagaAtual = vagas.find(v => v.id == id);
    if (!vagaAtual) return;

    const info = document.getElementById('modalInfo');
    const modal = document.getElementById('reservaModal');
    if (!info || !modal) return;

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
}

/* =========================
   FORMULÁRIO
========================= */

async function enviarFormulario(event) {
    event.preventDefault();
    if (!vagaAtual) return;

    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const telefone = document.getElementById('telefone').value.trim();
    const nivel = document.getElementById('nivel').value;
    const objetivo = document.getElementById('objetivo').value.trim();

    if (!nome || !email || !telefone) {
        alert('Preencha todos os campos obrigatórios');
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processando...';

    try {
        const dadosReserva = { vaga_id: vagaAtual.id, nome, email, telefone, nivel_aluno:nivel, objetivo };
        const resultado = await criarReserva(dadosReserva);

        // mensagem bonita
        const msg = document.getElementById('successMessage');
        if (msg) {
            msg.textContent = `✅ Reserva criada com sucesso!\nID: ${resultado.reserva_id}`;
            msg.style.display = 'block';
            setTimeout(() => msg.style.display = 'none', 4000);
        }

        fecharModal();
        event.target.reset();
        renderizarVagas();

    } catch (error) {
        alert(`Erro: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/* =========================
   INIT
========================= */

document.addEventListener('DOMContentLoaded', () => {
    renderizarVagas();

    document.getElementById('reservaForm')?.addEventListener('submit', enviarFormulario);
    document.querySelector('.modal-button.cancelar')?.addEventListener('click', fecharModal);
    document.addEventListener('keydown', e => { if(e.key==='Escape') fecharModal(); });
});

window.abrirModal = abrirModal;
window.fecharModal = fecharModal;
