// Sistema de Login com Backend
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');
    const loginMessage = document.getElementById('loginMessage');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            // Mostrar loading
            loginButton.innerHTML = '<span><i class="fas fa-spinner fa-spin"></i> Entrando...</span>';
            loginButton.disabled = true;
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Login bem-sucedido - redirecionar para dashboard
                    showMessage('success', 'Login realizado com sucesso! Redirecionando...');
                    setTimeout(() => {
                        window.location.href = '/admin/dashboard';
                    }, 1000);
                } else {
                    // Erro no login
                    showMessage('error', data.error || 'Usuário ou senha incorretos!');
                    loginButton.innerHTML = '<span>Entrar no Painel</span><span><i class="fas fa-arrow-right"></i></span>';
                    loginButton.disabled = false;
                }
            } catch (error) {
                console.error('Erro no login:', error);
                showMessage('error', 'Erro ao conectar com o servidor. Tente novamente.');
                loginButton.innerHTML = '<span>Entrar no Painel</span><span><i class="fas fa-arrow-right"></i></span>';
                loginButton.disabled = false;
            }
        });
    }
    
    function showMessage(type, text) {
        loginMessage.textContent = text;
        loginMessage.className = 'message ' + type;
        loginMessage.style.display = 'block';
        
        if (type === 'success') {
            loginMessage.style.background = '#10b981';
            loginMessage.style.color = 'white';
        } else {
            loginMessage.style.background = '#ef4444';
            loginMessage.style.color = 'white';
        }
    }
});