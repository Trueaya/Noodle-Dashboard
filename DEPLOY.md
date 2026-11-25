# Publicar o Noodle Finance (hospedagem permanente)

Este guia coloca o app no ar com **HTTPS, domínio e disco persistente** — ou seja, os cadastros, transações e assinaturas continuam salvos depois de reinícios e novos deploys.

A recomendação é o **Render** com o plano pago `starter` + disco de 1 GB (cerca de **US$ 7,25/mês**). O plano gratuito do Render **não serve para produção**, porque não tem disco persistente: o `db.json` seria apagado a cada deploy.

---

## 1. O que você vai precisar

- Conta no [GitHub](https://github.com) (gratuita).
- Conta no [Render](https://render.com) com cartão cadastrado (o plano pago exige).
- Git instalado neste PC (já está: `git version 2.56`).
- Opcional: domínio próprio (ex.: `noodlefinance.com.br`).

Custos aproximados no Render:

| Item | Preço |
| --- | --- |
| Web Service `starter` (0,5 CPU / 512 MB) | US$ 7,00/mês |
| Disco persistente 1 GB | US$ 0,25/mês |
| **Total** | **≈ US$ 7,25/mês** |

O Render cobra por segundo de uso e a fatura mínima é mensal. HTTPS e SSL do domínio próprio estão incluídos.

---

## 2. Preparar o repositório Git

O projeto ainda não é um repositório. No PowerShell, dentro da pasta `noodle-finance`:

```powershell
cd "C:\Users\aluno_bim3D_04\Documents\Projeto Padrão\noodle-finance"

git init -b main
git config user.name "Seu Nome"
git config user.email "seu-email@exemplo.com"

git add .
git status
```

Confirme que **não** aparecem `.data/`, `.env` nem `node_modules/` na lista. O `.gitignore` já bloqueia esses itens.

```powershell
git commit -m "Noodle Finance: versão inicial para deploy"
```

### Enviar para o GitHub

1. Em [github.com/new](https://github.com/new), crie um repositório **privado** chamado `noodle-finance`.
   - Não marque “Add a README”, “.gitignore” nem “license” (o projeto já tem).
2. Copie a URL do repositório e rode:

```powershell
git remote add origin https://github.com/SEU-USUARIO/noodle-finance.git
git push -u origin main
```

Se o Git pedir login, use um **Personal Access Token** do GitHub como senha
(GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → `repo`).
O Windows também pode abrir uma janela do “Git Credential Manager” para autenticar pelo navegador.

> Repositório privado funciona no Render. Só é preciso autorizar o Render a acessar sua conta GitHub na primeira vez.

---

## 3. Deploy no Render (Blueprint)

O arquivo [`render.yaml`](./render.yaml) já descreve tudo: runtime Node, plano pago, comando de start, health check, variáveis e disco.

1. Entre em [dashboard.render.com](https://dashboard.render.com).
2. Clique em **New → Blueprint**.
3. Conecte sua conta do GitHub e selecione o repositório `noodle-finance`.
4. O Render lê o `render.yaml` e mostra o serviço `noodle-finance`.
5. Clique em **Apply / Create**.
6. Aguarde o build (1–3 minutos). O primeiro acesso fica em algo como
   `https://noodle-finance-xxxx.onrender.com`.

O que o blueprint configura:

| Configuração | Valor | Por quê |
| --- | --- | --- |
| Runtime | Node 22 | sem dependências externas |
| Start | `node server.js` | comando do projeto |
| Health check | `/api/health` | o Render sabe se o app está vivo |
| `HOST` | `0.0.0.0` | aceita conexões de fora do container |
| `NOODLE_SECURE_COOKIES` | `1` | cookie de sessão só via HTTPS |
| `NOODLE_DATA_DIR` | `/var/data` | grava o banco no disco persistente |
| `NOODLE_DEMO` | `0` | desativa a conta demo de senha pública |
| `TZ` | `America/Sao_Paulo` | datas e “hoje” no fuso do Brasil |
| Disco | `noodle-data` em `/var/data`, 1 GB | mantém `db.json` e sessões |

> **Importante:** se você criar o serviço manualmente (sem Blueprint), não esqueça de adicionar o disco em **Settings → Disks** apontando para `/var/data`. Sem isso, os dados somem no próximo deploy.

### Conferir se subiu

- Abra `https://SEU-APP.onrender.com/api/health` → deve retornar `{"ok":true,...}`.
- Abra o site, crie uma conta, adicione uma transação.
- Em **Settings → Manual Deploy → Deploy latest commit** e, depois, confirme que a transação continua lá. Se sumiu, o disco não está montado.

---

## 4. Login com Google (opcional)

Sem isso, o app funciona normalmente com e-mail e senha; o botão do Google mostra um aviso de configuração.

1. No [Google Cloud Console](https://console.cloud.google.com), crie/selecione um projeto.
2. **APIs e Serviços → Tela de consentimento OAuth**: configure nome do app, e-mail de suporte e usuários de teste (ou publique o app).
3. **APIs e Serviços → Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo Web**.
4. Em **URIs de redirecionamento autorizados**, adicione exatamente:

```text
https://SEU-APP.onrender.com/api/auth/google/callback
```

5. No Render, vá em **Environment** e preencha:

```text
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=....
GOOGLE_REDIRECT_URI=https://SEU-APP.onrender.com/api/auth/google/callback
```

6. Salve. O Render reinicia o serviço automaticamente.
7. Teste **Continuar com Google** em uma janela anônima.

Se depois você trocar para domínio próprio, **atualize as duas URLs** (Google e `GOOGLE_REDIRECT_URI`). Um endereço diferente gera o erro `redirect_uri_mismatch`.

---

## 5. Domínio próprio

1. No Render: **Settings → Custom Domains → Add Custom Domain**.
2. Informe `app.seudominio.com` (ou o domínio raiz).
3. No painel do seu registrador (Registro.br, Cloudflare, GoDaddy…), crie o registro que o Render indicar:
   - subdomínio: `CNAME app → seu-app.onrender.com`
   - domínio raiz: normalmente um `ALIAS/ANAME` ou os registros `A` informados pelo Render.
4. Aguarde a propagação (minutos a algumas horas). O certificado SSL é emitido automaticamente.
5. Atualize o Google OAuth e o `GOOGLE_REDIRECT_URI` para o novo endereço.

---

## 6. Atualizar o site depois

Cada `git push` na branch `main` dispara um deploy automático (`autoDeploy: true`).

```powershell
git add .
git commit -m "Ajuste na tela de transações"
git push
```

O disco **não** é apagado entre deploys. As sessões continuam válidas.

Se você alterar CSS ou JavaScript do frontend, suba a versão do cache em `public/sw.js`:

```js
const VERSION = "v10"; // v11, v12...
```

Sem isso, o PWA pode continuar servindo arquivos antigos do cache.

---

## 7. Backup e restauração

O disco do Render **não substitui backup**. Faça cópias periódicas:

**Opção A — pelo próprio app (por usuário)**
Configurações → **Exportar meus dados** → baixa um JSON com perfil, transações e assinaturas.

**Opção B — banco completo (administrador)**
No Render, abra o serviço → **Shell** e rode:

```bash
cp /var/data/db.json /var/data/db-backup-$(date +%F).json
cat /var/data/db.json
```

Copie o conteúdo exibido e guarde em local seguro (ele contém hashes de senha e sessões).

**Restaurar:**

1. Pare o serviço (ou faça o restore durante uma janela de manutenção).
2. No **Shell**, grave o conteúdo de volta:

```bash
cat > /var/data/db.json
# cole o JSON, pressione Ctrl+D
```

3. Reinicie o serviço.

**Começar do zero:** apague `/var/data/db.json` pelo Shell e reinicie. Todos os usuários e dados serão removidos.

> Faça backup antes de qualquer alteração manual. O arquivo é a única fonte de verdade.

---

## 8. Alternativas ao Render

### Railway (US$ 5/mês no plano Hobby)

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Variáveis: `HOST=0.0.0.0`, `NOODLE_SECURE_COOKIES=1`, `NOODLE_DATA_DIR=/var/data`, `NOODLE_DEMO=0`, `TZ=America/Sao_Paulo`.
   - O Railway injeta `PORT` sozinho.
3. **Settings → Volumes → Add Volume**, montado em `/var/data`.
4. Gere o domínio em **Settings → Networking → Generate Domain**.

O plano Hobby inclui US$ 5 de uso; um app pequeno como este costuma ficar dentro ou perto disso.

### Fly.io (≈ US$ 2–4/mês)

Exige CLI. Resumo:

```bash
fly launch --no-deploy          # usa o Dockerfile do projeto
fly volumes create noodle_data --size 1
fly secrets set NOODLE_SECURE_COOKIES=1 NOODLE_DATA_DIR=/var/data NOODLE_DEMO=0 TZ=America/Sao_Paulo
fly deploy
```

No `fly.toml`, monte o volume:

```toml
[mounts]
  source = "noodle_data"
  destination = "/var/data"
```

### VPS própria (Hetzner, DigitalOcean, Oracle…)

Use o `Dockerfile` incluído, ou rode direto com Node 20+ e um proxy HTTPS (Caddy/Nginx). Mantenha `NOODLE_DATA_DIR` em um diretório fora do código e faça backup dele.

### O que **não** usar

- **Render Free**: sem disco persistente, o banco é perdido a cada deploy e o serviço hiberna.
- **Vercel/Netlify**: são para sites estáticos/serverless; este app precisa de um processo Node com sistema de arquivos persistente.
- **GitHub Pages**: só arquivos estáticos, sem backend nem login.

---

## 9. Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `502 Bad Gateway` ou app reiniciando | erro no start ou porta errada | veja **Logs** no Render; o app precisa escutar em `0.0.0.0:$PORT` |
| Dados somem após deploy | disco não montado ou caminho errado | confira o disco em `/var/data` e `NOODLE_DATA_DIR=/var/data` |
| Login não “gruda” | cookie `Secure` em HTTP, ou bloqueio de cookies | use HTTPS; confira `NOODLE_SECURE_COOKIES=1` em produção |
| `redirect_uri_mismatch` no Google | URL diferente da cadastrada | cadastre exatamente `https://SEU-DOMINIO/api/auth/google/callback` |
| Botão do Google diz “não configurado” | variáveis ausentes | preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` e reinicie |
| Frontend desatualizado após deploy | cache do PWA | suba `VERSION` em `public/sw.js`, faça deploy e recarregue |
| “Muitas tentativas” no login | limite de 12 tentativas/10 min por IP | aguarde; o contador zera ao reiniciar o serviço |
| Conta demo some | `NOODLE_DEMO=0` | é o esperado em produção; mude para `1` se quiser a demo |

---

## 10. Checklist antes de divulgar

- [ ] `NOODLE_DEMO=0` (sem senha pública circulando).
- [ ] `NOODLE_SECURE_COOKIES=1` e acesso por HTTPS.
- [ ] Disco montado em `/var/data` e testado com um redeploy.
- [ ] `GOOGLE_REDIRECT_URI` igual ao domínio final.
- [ ] Backup do `db.json` feito e guardado fora do Render.
- [ ] Repositório privado (contém o código, não os dados).
- [ ] Termos/privacidade adequados à LGPD se outras pessoas forem usar.
- [ ] Uma única instância do serviço (o disco não é compartilhado entre instâncias).

---

## 11. O que ainda depende de você

O deploy em si precisa da sua conta GitHub e do seu cartão no Render — não há como eu criar essas contas por você. Com o repositório enviado ao GitHub, o restante é o passo 3 acima (cerca de 3 minutos).

Se quiser, posso:

- rodar os comandos Git com você e revisar o que será enviado;
- testar o app com a configuração de produção localmente;
- ajustar `render.yaml` para outro provedor ou região.
