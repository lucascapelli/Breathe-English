# 🫁 Breathe English — 📚 Sistema de Gerenciamento de Aulas Particulares de Inglês

Sistema web funcional para gerenciamento de aulas particulares de inglês, com múltiplos professores, controle de vagas, reservas de alunos, dashboard administrativo e notificações por e-mail.

Projeto em uso real, com backend em Node.js + MySQL e frontend em HTML/CSS/JS puro.

---

## 🚀 Funcionalidades

### 👨‍🎓 Área Pública
- Listagem dinâmica de vagas disponíveis
- Modal para reserva de vaga
- Cadastro de aluno com:
  - Nome
  - E-mail
  - WhatsApp
  - Nível de inglês
  - Objetivo com as aulas
- Subtração automática das vagas no banco
- Atualização imediata da disponibilidade

---

### 🧑‍🏫 Área Administrativa
- Login administrativo
- Dashboard com estatísticas
- Listagem de:
  - Professores
  - Vagas
  - Reservas
- Visualização dos dados de cada candidato
- Possibilidade de remover reservas manualmente

---

### 📩 Notificações por E-mail
- Envio automático de e-mail para o administrador a cada nova reserva
- E-mail contém:
  - Dados do aluno
  - Informações da vaga
  - Horário e professor

---

## 🛠️ Tecnologias Utilizadas

### Backend
- Node.js
- Express
- MySQL
- Express Session
- Helmet
- Rate Limit

### Frontend
- HTML5
- CSS3
- JavaScript (Vanilla)

### Serviços
- Serviço de e-mail isolado (`service/emailService.js`)
- Variáveis de ambiente com `.env`

---
## 👨‍💻 Autor

## Lucas Capelli
- Desenvolvedor Full Stack
- Professor de Inglês
-  Portfólio: @lucas.fullstack

---

## 📁 Estrutura Real do Projeto

```text
.
├── admin/
│   ├── dashboard.html
│   └── login.html
│
├── public/
│   ├── index.html
│   ├── css/
│   │   ├── style.css
│   │   └── admin-style.css
│   └── js/
│       ├── script.js
│       ├── mobile.js
│       ├── admin-script.js
│       └── admin-login.js
│
├── server/
│   ├── index.js
│   ├── routes.js
│   ├── adminRoutes.js
│   ├── auth.js
│   └── database.js
│
├── service/
│   └── emailService.js
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
└── README.md

