# Configurar contas, login e painel (Supabase)

Faça uma vez, na conta Supabase do LêMais. Leva uns 20 minutos.

## 1. Criar o projeto

1. Entre em https://supabase.com com a conta do LêMais.
2. **New project**: nome `lemais`, região **South America (São Paulo)**. Guarde a senha do banco.

## 2. Criar as tabelas

1. No projeto, abra **SQL Editor → New query**.
2. Cole todo o conteúdo do arquivo `supabase/setup-completo.sql` e clique em **Run**.
3. Deve aparecer "Success. No rows returned".

## 3. Pegar as chaves

Em **Project Settings → API Keys**, copie:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Secret key** → `SUPABASE_SECRET_KEY` (secreta: não envie por chat ou e-mail)

## 4. Login por e-mail com código

Em **Authentication → Emails → Templates**:
1. Abra **Magic Link**. Assunto: `Seu código do LêMais`. No corpo, cole o conteúdo de `supabase/templates/codigo.html`. Salve.
2. Repita em **Confirm signup**.

Em **Authentication → Sign In / Providers → Email**, deixe **Email OTP Length = 6**.

Importante: o envio de e-mail padrão do Supabase tem limite baixo por hora, bom só para testes. Antes de divulgar o app, configure um serviço de e-mail em **Authentication → Emails → SMTP Settings** (por exemplo, Resend, gratuito para começar; precisa de um domínio).

## 5. Endereços permitidos

Em **Authentication → URL Configuration**:
- **Site URL**: o endereço do app (ex.: `https://lemais.vercel.app`; para testar no computador, `http://localhost:3000`).
- **Redirect URLs**: adicione `http://localhost:3000/**` e o endereço do app com `/**` no final.

## 6. Login com Google

1. Acesse https://console.cloud.google.com, crie um projeto "LêMais".
2. **APIs e serviços → Tela de consentimento OAuth**: tipo Externo, nome LêMais, seu e-mail de suporte. Publique.
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
   - Origens JavaScript autorizadas: o endereço do app e `http://localhost:3000`.
   - URIs de redirecionamento autorizados: `https://SEU-PROJETO.supabase.co/auth/v1/callback`
     (o endereço exato aparece no Supabase em **Authentication → Sign In / Providers → Google**).
4. Copie o **ID do cliente** e a **Chave secreta** para o Supabase, em **Authentication → Sign In / Providers → Google**, e ative.

## 7. Variáveis do app

Para testar no computador, crie o arquivo `.env.local` na pasta do LêMais a partir de `.env.example` e preencha. Na Vercel, cadastre as mesmas variáveis em **Settings → Environment Variables**.

Em `ADMIN_EMAILS`, coloque o e-mail com que você vai entrar no app. Só esse e-mail vê o **Painel do desenvolvedor** (em Minha conta). Para quem não é administrador, o endereço `/admin` responde como página inexistente.
