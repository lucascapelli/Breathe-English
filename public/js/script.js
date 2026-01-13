// =========================
// CONSTANTES
// =========================
const API_BASE_URL = window.location.origin;
let vagas = [];
let vagaAtual = null;

// =========================
// SISTEMA DE ALERTA PERSONALIZADO
// =========================
function showAlert(message, type = 'info', title = null) {
    const modal = document.getElementById('alertModal');
    const messageEl = document.getElementById('alertMessage');
    const titleEl = document.getElementById('alertTitle');
    const iconEl = document.getElementById('alertIcon');
    const closeBtn = document.getElementById('alertCloseButton');
    
    // Configurar tipo de alerta
    modal.className = 'custom-alert-modal ' + type;
    
    // Definir título baseado no tipo
    if (!title) {
        switch(type) {
            case 'error': title = 'Erro'; break;
            case 'success': title = 'Sucesso!'; break;
            case 'warning': title = 'Atenção'; break;
            default: title = 'Informação';
        }
    }
    
    // Configurar ícone baseado no tipo
    let iconClass = 'fas fa-info-circle';
    switch(type) {
        case 'error': iconClass = 'fas fa-exclamation-circle'; break;
        case 'success': iconClass = 'fas fa-check-circle'; break;
        case 'warning': iconClass = 'fas fa-exclamation-triangle'; break;
    }
    
    iconEl.innerHTML = `<i class="${iconClass}"></i>`;
    
    // Configurar conteúdo
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Mostrar modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Configurar botão de fechar
    closeBtn.onclick = function() {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    };
    
    // Fechar ao clicar fora (opcional)
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    };
    
    // Fechar com ESC
    const closeOnEsc = function(e) {
        if (e.key === 'Escape') {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            document.removeEventListener('keydown', closeOnEsc);
        }
    };
    
    document.addEventListener('keydown', closeOnEsc);
}

// =========================
// UTILITÁRIOS
// =========================
const formatarRestante = n => 
    n === 0 ? 'ESGOTADO' :
    n === 1 ? 'RESTAM UMA VAGA' :
    n === 2 ? 'RESTAM DUAS VAGAS' :
    `RESTAM ${n} VAGAS`;

const getClassRestante = n =>
    n === 0 ? 'restante-esgotado' :
    n === 1 ? 'restante-uma' :
    n === 2 ? 'restante-duas' :
    'restante-disponivel';

const getStatusVaga = v =>
    v.vagas_disponiveis === 0 ? 'esgotado' :
    v.vagas_disponiveis === 1 ? 'ultima' :
    v.vagas_disponiveis <= 2 ? 'limitada' :
    'disponivel';

const buildImageUrl = raw => {
    if (!raw) return 'https://placehold.co/100?text=Prof&font=roboto';
    return /^https?:\/\//i.test(raw) ? raw : new URL(raw, window.location.origin).href;
};

// =========================
// API
// =========================
async function carregarVagas() {
    try {
        const res = await fetch(`${API_BASE_URL}/api`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log('✅ Vagas carregadas:', data);
        if (!data.success || !Array.isArray(data.vagas)) return [];
        const vagasProcessadas = data.vagas.map(v => ({
            ...v,
            professor_foto: buildImageUrl(v.professor_foto),
            titulo: v.titulo || `${v.dias} - ${v.horario}`,
            professor: v.professor_nome || v.professor || 'Professor não definido',
            tipo: v.vagas_disponiveis === 0 ? 'ESGOTADO' :
                  v.vagas_disponiveis === 1 ? 'ÚLTIMA VAGA' :
                  v.vagas_disponiveis <= 3 ? 'VAGA LIMITADA' : 'DISPONÍVEL'
        }));
        console.log('✅ Vagas processadas:', vagasProcessadas);
        return vagasProcessadas;
    } catch (err) {
        console.error('[carregarVagas]', err);
        // fallback local
        return [
            { id: 1, titulo: "Segunda e Quarta - 19:00", dias: "Segunda e Quarta", horario: "19:00 - 20:00", nivel: "Iniciante", vagas_disponiveis: 2, vagas_totais: 2, professor: "Prof. João", professor_foto: buildImageUrl(), tipo: "VAGA LIMITADA" },
            { id: 2, titulo: "Terça e Quinta - 18:00", dias: "Terça e Quinta", horario: "18:00 - 19:00", nivel: "Intermediário", vagas_disponiveis: 1, vagas_totais: 1, professor: "Prof. Maria", professor_foto: buildImageUrl(), tipo: "ÚLTIMA VAGA" }
        ];
    }
}

async function criarReserva(dados) {
    const res = await fetch(`${API_BASE_URL}/api/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar reserva');
    return data;
}

// =========================
// RENDERIZAÇÃO
// =========================
async function renderizarVagas() {
    const grid = document.getElementById('vagasGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="loading">Carregando vagas...</div>';

    vagas = await carregarVagas();
    console.log('📊 Vagas globais definidas:', vagas);
    if (!vagas.length) {
        grid.innerHTML = '<div class="no-vagas">Nenhuma vaga disponível.</div>';
        atualizarTotalVagas();
        return;
    }

    grid.innerHTML = '';
    vagas.forEach(v => {
        console.log('🎫 Renderizando vaga:', v.titulo, 'Foto:', v.professor_foto);
        const status = getStatusVaga(v);
        const pct = (v.vagas_disponiveis / (v.vagas_totais || 1)) * 100;
        const corBadge = v.vagas_disponiveis === 0 ? 'preto' :
                         v.vagas_disponiveis === 1 ? 'vermelho' :
                         v.vagas_disponiveis <= 3 ? 'amarelo' : 'verde';

        // Formatar preço se existir
        const precoFormatado = v.preco ? 
            `R$ ${parseFloat(v.preco).toFixed(2).replace('.', ',')}` : 
            'Preço não informado';

        const card = document.createElement('div');
        card.className = `vaga-card ${status}`;
        card.innerHTML = `
            <img src="${v.professor_foto || '/img/default-prof.png'}" alt="${v.professor}" class="professor-foto">
            <h3 class="vaga-titulo">${v.titulo}</h3>
            <div class="vaga-info">
                <div class="info-item">
                    <div class="info-label">Dias</div>
                    <div class="info-value">${v.dias}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Horário</div>
                    <div class="info-value">${v.horario}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Professor</div>
                    <div class="info-value">${v.professor}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Nível</div>
                    <div class="info-value">${v.nivel}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Preço</div>
                    <div class="info-value preco-professor">${precoFormatado}</div>
                </div>
            </div>
            <div class="vaga-restante-badge ${corBadge}">${v.vagas_disponiveis} ${v.vagas_disponiveis === 1 ? 'vaga' : 'vagas'} restantes</div>
            <div class="contador-bar"><div class="contador-fill ${status}" style="width:${pct}%"></div></div>
            <button class="vaga-button" ${v.vagas_disponiveis === 0 ? 'disabled' : ''}>
                ${v.vagas_disponiveis === 0 ? 'ESGOTADO' : 'RESERVAR VAGA'}
            </button>
        `;
        const btn = card.querySelector('.vaga-button');
        if (v.vagas_disponiveis > 0) {
            btn.addEventListener('click', () => {
                console.log('🔘 Botão clicado para vaga:', v.id);
                abrirModal(v.id);
            });
        }

        grid.appendChild(card);
    });

    atualizarTotalVagas();
}

function atualizarTotalVagas() {
    const el = document.getElementById('totalVagas');
    if (el) el.textContent = vagas.reduce((s, v) => s + (v.vagas_disponiveis || 0), 0);
}

// =========================
// MODAL
// =========================
function abrirModal(id) {
    vagaAtual = vagas.find(v => v.id == id);
    if (!vagaAtual) return;

    const modal = document.getElementById('reservaModal');
    const info = document.getElementById('modalInfo');
    if (!modal || !info) return;

    console.log('DEBUG vagaAtual:', vagaAtual);
    console.log('DEBUG professor_foto:', vagaAtual.professor_foto);

    info.innerHTML = `
        <div style="width: 150px !important; height: 150px !important; margin: 0 auto 20px auto !important; border-radius: 50% !important; overflow: hidden !important; border: 5px solid #6366f1 !important; box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3) !important;">
            <img src="${vagaAtual.professor_foto || 'https://placehold.co/150?text=Prof&font=roboto'}" alt="Foto do Professor ${vagaAtual.professor}"
                 style="width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important;"
                 onerror="this.src='https://placehold.co/150?text=Prof&font=roboto';">
        </div>
        <strong>${vagaAtual.titulo}</strong><br>
        ${vagaAtual.dias} • ${vagaAtual.horario}<br>
        Professor: ${vagaAtual.professor}<br>
        Nível: ${vagaAtual.nivel}<br>
        <strong class="${getClassRestante(vagaAtual.vagas_disponiveis)}">${formatarRestante(vagaAtual.vagas_disponiveis)}</strong><br>
        ${vagaAtual.tipo ? `Tipo: ${vagaAtual.tipo}` : ''}
    `;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function fecharModal() {
    const modal = document.getElementById('reservaModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('reservaForm')?.reset();
}

// =========================
// FORMULÁRIO
// =========================
async function enviarFormulario(e) {
    e.preventDefault();
    if (!vagaAtual) return showAlert('Nenhuma vaga selecionada.', 'warning');

    const dados = ['nome','email','telefone','nivel','objetivo'].reduce((obj,id) => {
        obj[id === 'nivel' ? 'nivel_aluno' : id] = document.getElementById(id)?.value.trim() || '';
        return obj;
    }, { vaga_id: vagaAtual.id });

    if (!dados.nome || !dados.email || !dados.telefone) return showAlert('Preencha todos os campos obrigatórios.', 'warning');

    const btn = e.target.querySelector('button[type="submit"]'); 
    const original = btn.textContent; 
    btn.disabled = true; btn.textContent = 'Processando...';

    try {
        const res = await criarReserva(dados);
        showAlert(`Reserva criada com sucesso!`, 'success');
        fecharModal();
        e.target.reset();
        renderizarVagas();
    } catch (err) {
        showAlert(`Erro: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

function abrirWhatsApp() {
    // Número no formato correto: código país + DDD + número (sem zeros extras)
    const seuNumero = '5511949438693'; // Brasil (55) + DDD 11 + 949438693
    
    // Verifica se o número tem pelo menos 10 dígitos
    if (seuNumero.length < 10) {
        showAlert('Número de WhatsApp inválido. Entre em contato pelo email.', 'warning');
        return;
    }
    
    // Mensagem pré-definida
    const mensagem = 'Olá! Vi que vocês oferecem aulas de inglês e gostaria de mais informações.';
    
    // Formata para URL do WhatsApp
    const url = `https://api.whatsapp.com/send?phone=${seuNumero}&text=${encodeURIComponent(mensagem)}`;
    
    // Abre em nova aba
    window.open(url, '_blank');
    
    // Fecha o modal se estiver aberto
    const modal = document.getElementById('reservaModal');
    if (modal && modal.style.display === 'flex') {
        fecharModal();
    }
}

// =========================
// INIT
// =========================
document.addEventListener('DOMContentLoaded', () => {
    renderizarVagas();
    document.getElementById('reservaForm')?.addEventListener('submit', enviarFormulario);
    document.querySelector('.modal-button.cancelar')?.addEventListener('click', fecharModal);
    document.getElementById('reservaModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) fecharModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });
});

window.abrirModal = abrirModal;
window.fecharModal = fecharModal;
window.recarregarVagas = renderizarVagas;
window.showAlert = showAlert;