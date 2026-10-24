# Agenda Psicologia · Abiel Carreiro

Aplicação web para uma psicóloga gerenciar agendamentos, prontuários e financeiro.
Os dados ficam no **Supabase** (PostgreSQL + login), protegidos por Row Level Security.

## Configuração do banco (Supabase)

1. Crie um projeto em https://supabase.com (região **South America (São Paulo)**).
2. Em **SQL Editor**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**.
4. Em **Authentication → Users → Add user**, crie o usuário da psicóloga (e-mail + senha, marcando *Auto Confirm User*).
5. No **SQL Editor**, libere o acesso ao painel para esse e-mail:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'email-da-psicologa@exemplo.com';
   ```
6. Em **Project Settings → API**, copie a *Project URL* e a chave *anon public* para:
   - `.env.local` (desenvolvimento). Veja o modelo em `.env.example`.
   - Cloudflare Pages → **Settings → Variables and Secrets**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Depois, faça um novo deploy.
7. No primeiro acesso ao painel, a psicóloga cria a **senha de criptografia** e guarda a **chave de recuperação** (veja "Criptografia dos prontuários").

**Banco já em uso, criado antes da criptografia?** Rode também [`supabase/criptografia.sql`](supabase/criptografia.sql) no SQL Editor. Os textos antigos são criptografados sozinhos no primeiro acesso depois disso.

A chave *anon* é pública por natureza. Nunca coloque a chave *service_role* no site.

## Modo demonstração (ligado por padrão)

Para o portfólio, o app roda com **dados fictícios no navegador de cada visitante**, sem Supabase:
- `src/context/DemoAppStore.jsx` oferece a mesma interface do `AppStore` (as telas não mudam), começando só com as configurações do consultório (sem pacientes nem sessões), para testar do zero.
- `src/components/demo/DemoBar.jsx` mostra a barra **Demo** (Site · Agendar · Painel · Simular agendamento · Começar do zero · Ajuda) e o **tutorial** da primeira visita.
- Login com um clique na tela do painel. A criptografia dos prontuários é simulada: bloquear e desbloquear funcionam com a senha da demo, mostrada na tela.

| Acesso | Valor |
|---|---|
| E-mail / senha do painel | `psicologa@consultorio.demo` · `psico123` |
| Senha de criptografia | `prontuario123` |
| Chave de recuperação | `DEMO-2026-PSIC-ABCD` |

Para usar o Supabase de verdade, defina `VITE_DEMO=false` (em `.env.local` e nas variáveis do Cloudflare Pages) e faça um novo build.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/index.html
```

- Página pública: `/`
- Painel: `/#/admin` ou o link "Área da psicóloga" no rodapé (login com o usuário criado no passo 4)

## Funcionalidades

**Página pública**
- Hero, biografia, abordagem, modalidades (presencial/online), serviços, dúvidas frequentes e rodapé
- Agendamento em 3 etapas: serviço + modalidade → data/horário (só mostra horários realmente livres) → dados do paciente (com máscara, validação e consentimento LGPD)
- Tela de sucesso com **mensagem pronta para o WhatsApp**, download de `.ics` e código do agendamento
- Botão flutuante de WhatsApp

**Painel da psicóloga**
- **Visão geral**: agenda do dia, solicitações do site (confirmar/recusar/WhatsApp), próximos atendimentos e pagamentos pendentes
- **Agenda**: visões Dia/Semana/Mês, filtro por status, clique num horário vazio para criar sessão, bloqueios hachurados, linha do horário atual, atalhos ← → T
- **Pacientes (CRM)**: busca por nome/e-mail/telefone, filtros e ordenação; o prontuário tem histórico em linha do tempo, anotações privadas com **modo discreto** (desfoque) e salvamento automático, e um financeiro por paciente
- **Financeiro**: faturamento, recebido, a receber, gráfico dos últimos 6 meses, divisão por serviço, registro de pagamento (Pix/cartão/dinheiro) e exportação CSV
- **Configurações**: perfil, expediente e intervalo por dia da semana, regras (passo entre horários, pausa entre sessões, antecedência mínima, janela), serviços e valores, bloqueios, backup JSON

## Estrutura

```
src/
├── App.jsx                  # rotas
├── context/AppStore.jsx     # estado global sincronizado com o Supabase + login
├── data/seed.js             # configurações padrão do consultório
├── lib/                     # supabase, date, format, availability, stats, whatsapp, ics, constants
├── components/
│   ├── ui/                  # Modal, StatusBadge, StatCard, Segmented, Toast…
│   ├── booking/BookingWizard.jsx
│   └── admin/               # AppointmentModal, BlockModal, PatientFormModal
└── pages/
    ├── BookingPage.jsx
    └── admin/               # AdminLayout, Login, Dashboard, CalendarView, PatientList, PatientProfile, Financials, Settings
```

supabase/schema.sql          # tabelas, regras de acesso (RLS) e funções de agendamento público

## Segurança

- Visitantes só leem as configurações públicas e os horários ocupados, sem nenhum dado de paciente. Eles criam agendamentos pela função `create_public_booking`, que revalida serviço, expediente, antecedência, bloqueios e conflitos no servidor e limita cada paciente a 3 solicitações pendentes.
- Pacientes, sessões, anotações e financeiro só são acessíveis para usuários cadastrados na tabela `admins`.
- Dados de saúde são **dados sensíveis** pela LGPD. Use uma senha forte, ative o login em duas etapas na sua conta do Supabase e ative backups no Supabase (plano pago) ou baixe o backup JSON em **Configurações** com frequência.

### Criptografia dos prontuários

Os textos clínicos (`patients.reason`, `patients.general_notes`, `appointments.reason`, `appointments.note`) são criptografados **de ponta a ponta** no navegador ([`src/lib/crypto.js`](src/lib/crypto.js), só Web Crypto). Nem o Supabase nem quem administra o banco conseguem lê-los.

- O consultório tem um par de chaves ECDH P-256. A chave pública fica nas configurações públicas, e o navegador do paciente criptografa o "motivo" antes de enviar o agendamento.
- A chave privada fica na tabela `crypto_keys`, guardada criptografada duas vezes: com a senha de criptografia (PBKDF2-SHA256, 600 mil iterações + AES-GCM) e com a chave de recuperação.
- Cada texto usa uma chave temporária (ECDH efêmero → HKDF → AES-256-GCM) e é gravado como `enc1:…`.
- No painel, a psicóloga digita a senha de criptografia depois do login. A chave aberta fica só na memória da aba, que se fecha ao sair, com o botão "Bloquear prontuários" ou após 30 minutos sem uso.
- **Se a senha e a chave de recuperação forem perdidas, os textos não podem ser recuperados.**
- Continuam sem criptografia (a agenda precisa deles): nome, telefone, e-mail, datas, horários, valores e o motivo dos bloqueios de agenda.
- O backup JSON de Configurações sai com os textos abertos. Guarde-o em local protegido.

Deploy: Cloudflare Pages com build `npm run build` e saída `dist`. As rotas usam `#`, então não precisa de configuração extra.
