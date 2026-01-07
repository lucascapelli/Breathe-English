const express = require('express');
const bcrypt = require('bcryptjs');
const { query, get, execute } = require('./database');  // Mudado para './database'
const router = express.Router();

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    
    try {
        // Buscar usuário
        const user = await get(
            'SELECT id, username, password_hash, nome, is_super_admin FROM administradores WHERE username = ? AND ativo = 1',
            [username]
        );
        
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        
        // Verificar senha
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        
        // Criar sessão
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = true;
        req.session.isSuperAdmin = user.is_super_admin === 1;
        
        // Log de atividade
        await execute(
            'INSERT INTO atividades (tipo, descricao, usuario) VALUES (?, ?, ?)',
            ['login', 'Login realizado no sistema', user.username]
        );
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                nome: user.nome,
                isSuperAdmin: user.is_super_admin === 1
            }
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao fazer logout' });
        }
        res.clearCookie('session_cookie_name');
        res.json({ success: true, message: 'Logout realizado com sucesso' });
    });
});

// Verificar sessão
router.get('/session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            loggedIn: true,
            user: {
                id: req.session.userId,
                username: req.session.username,
                isSuperAdmin: req.session.isSuperAdmin
            }
        });
    } else {
        res.json({ loggedIn: false });
    }
});

module.exports = router;