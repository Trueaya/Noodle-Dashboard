# Noodle Finance

Dashboard financeiro pessoal em pt-BR, construído com **Node.js puro** (sem dependências), HTML, CSS e JavaScript moderno. Tem login e cadastro, controle de salário, gastos, contas e assinaturas, alertas inteligentes e instalação como PWA.

> **Seu dinheiro, sem mistério.** O Noodle avisa antes de um gasto comprometer o mês — e mostra quando uma assinatura não cabe mais no salário.

## O que está incluído

- **Conta e sessão** — cadastro, login com e-mail/senha, login com Google (Gmail), logout, conta de demonstração e sessão de 30 dias via cookie HttpOnly.
- **Visão geral** — KPIs de receita, gastos, assinaturas e saldo, gráfico de fluxo, gastos por categoria, próximas cobranças e central de alertas.
- **Transações** — criar e excluir despesas e entradas, com busca, filtros por mês/tipo/categoria, variação percentual em relação ao mês anterior e tabela responsiva.
- **Assinaturas** — cadastro com dia de cobrança, pausa/retomada, exclusão e simulação de impacto **antes** de adicionar.
- **Relatórios** — histórico de 6 meses, meta de poupança, categorias e insights automáticos.
- **Configurações** — nome, salário, meta de poupança, tema claro/escuro/sistema, instalação do PWA e exportação JSON.
- **Alertas inteligentes**:
  - orçamento comprometido em 65%, 80% e 90%;
  - gastos acima do salário;
  - meta de poupança abaixo do ideal;
  - assinaturas pesadas e próximas cobranças;
  - aviso explícito **“Não será possível manter esta assinatura com o salário atual”** ao simular uma nova cobrança que deixaria o mês no vermelho.
- **PWA instalável** — manifest, service worker com app shell offline, ícones e atalho na tela inicial.
- **Acessibilidade e responsividade** — navegação por teclado, foco em modais, contraste, layout mobile com menu lateral e tabelas adaptáveis.

## Requisitos

- Node.js **20 ou superior** (testado com Node 24).
- Nenhuma dependência externa. Não é necessário `npm install`.

## Como rodar

```bash
npm start
```

Abra **http://127.0.0.1:4173**.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

### Conta de demonstração

- **E-mail:** `demo@noodle.finance`
- **Senha:** `demo1234`

A conta demo é recriada com 6 meses de dados fictícios sempre que o mês mais recente deixa de ser o mês atual. Também é possível criar uma conta nova e configurar o salário no onboarding.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `4173` | Porta HTTP |
| `HOST` | `127.0.0.1` | Interface de escuta (`0.0.0.0` para expor na rede local) |
| `NOODLE_SECURE_COOKIES` | desativado | Use `1` quando servir por HTTPS para marcar o cookie como `Secure` |
| `NOODLE_DATA_DIR` | `<raiz>/.data` | Diretório alternativo para o `db.json` e as sessões |
| `NOODLE_DEMO` | ativado | Use `0` para desativar a conta demo e o botão “Explorar demonstração” |
| `GOOGLE_CLIENT_ID` | vazio | Client ID do OAuth 2.0 do Google |
| `GOOGLE_CLIENT_SECRET` | vazio | Client Secret do OAuth 2.0 do Google |
| `GOOGLE_REDIRECT_URI` | `http://127.0.0.1:4173/api/auth/google/callback` | URI de redirecionamento cadastrado no Google |

O servidor carrega automaticamente um arquivo `.env` na raiz do projeto. Use `.env.example` como modelo:

```bash
cp .env.example .env
```

Exemplo:

```bash
PORT=8080 HOST=0.0.0.0 npm start
```

## Configurar login com Google (Gmail)

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie ou selecione um projeto.
2. Em **APIs e Serviços → Tela de consentimento OAuth**, configure o tipo de usuário e os dados do aplicativo.
3. Em **APIs e Serviços → Credenciais**, crie um **ID do cliente OAuth** do tipo *Aplicativo Web*.
4. Em **URIs de redirecionamento autorizados**, adicione exatamente:
   - `http://127.0.0.1:4173/api/auth/google/callback` para desenvolvimento local;
   - `https://seudominio.com/api/auth/google/callback` em produção.
5. Copie o Client ID e o Client Secret para o `.env`:

```env
GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-client-secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:4173/api/auth/google/callback
```

6. Reinicie o servidor. O botão **Continuar com Google** passa a abrir o consentimento do Google.

Sem essas variáveis, o botão continua visível, mas exibe um aviso de que o login com Google não está configurado. O e-mail retornado pelo Google precisa estar verificado; contas novas são criadas automaticamente e contas existentes com o mesmo e-mail são vinculadas.

## Dados e privacidade

- Os dados ficam em **`.data/db.json`** no próprio servidor, não em serviços de terceiros.
- Senhas são derivadas com **scrypt** e salt aleatório; nunca são armazenadas em texto puro.
- As sessões usam tokens aleatórios, guardados no servidor apenas como hash, com expiração de 30 dias.
- A API usa cabeçalhos de segurança e CSP restritiva; o frontend não carrega scripts externos.
- **Exportação:** em Configurações → “Exportar meus dados” é possível baixar um JSON com perfil, transações e assinaturas.
- **Reset local:** pare o servidor e apague `.data/db.json` para começar do zero. A conta demo será recriada no próximo acesso.

## Estrutura do projeto

```
noodle-finance/
├── server.js                 # servidor HTTP, rotas da API e arquivos estáticos
├── src/
│   ├── auth.js               # usuários, sessões e cookies
│   ├── constants.js          # categorias e configurações
│   ├── dates.js              # utilitários de datas/meses
│   ├── db.js                 # persistência JSON e dados demo
│   ├── finance.js            # cálculos, alertas e saúde financeira
│   └── security.js           # scrypt, tokens e hashes
├── public/
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── css/                  # design system e layout
│   ├── js/                   # controlador, views, componentes e gráficos SVG
│   ├── fonts/                # Manrope local
│   └── icons/                # logo 3D e ícones do PWA
└── package.json
```

## PWA

O service worker é registrado automaticamente em `localhost`, `127.0.0.1` ou HTTPS. O app shell (HTML, CSS, JS, fontes e ícones) fica disponível offline. Os dados financeiros continuam vindo do servidor local e precisam dele ativo.

Para instalar:

- **Chrome/Edge (desktop):** ícone de instalação na barra de endereço ou menu → “Instalar Noodle Finance”.
- **Android:** menu do navegador → “Adicionar à tela inicial” / “Instalar aplicativo”.
- **iPhone/iPad:** Compartilhar → “Adicionar à Tela de Início”.

Os ícones do PWA usam o logo 3D do Noodle e já estão prontos em `public/icons/`: `logo.png` (logo transparente), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` e `icon-32.png`.

## API resumida

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/health` | Verificação do servidor |
| `GET` | `/api/meta` | Categorias e mês atual |
| `GET` | `/api/auth/me` | Sessão atual |
| `POST` | `/api/auth/register` | Criar conta |
| `POST` | `/api/auth/login` | Entrar |
| `POST` | `/api/auth/demo` | Abrir conta de demonstração |
| `POST` | `/api/auth/logout` | Encerrar sessão |
| `PUT` | `/api/profile` | Nome, salário e meta |
| `GET` | `/api/dashboard?month=AAAA-MM` | Painel do mês |
| `POST` | `/api/transactions` | Criar transação |
| `DELETE` | `/api/transactions/:id` | Excluir transação |
| `POST` | `/api/subscriptions` | Criar assinatura |
| `PATCH` | `/api/subscriptions/:id` | Pausar/retomar |
| `DELETE` | `/api/subscriptions/:id` | Excluir assinatura |
| `GET` | `/api/export` | Exportar dados em JSON |

## Licença

MIT. Use, adapte e melhore à vontade.
