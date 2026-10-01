# Agenda Psicologia · Luanna Santos

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

A chave *anon* é pública por natureza. Nunca coloque a chave *service_role* no site.

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
- Dados de saúde são **dados sensíveis** pela LGPD. Use uma senha forte, ative backups no Supabase (plano pago) ou baixe o backup JSON em **Configurações** com frequência.

Deploy: Cloudflare Pages com build `npm run build` e saída `dist`. As rotas usam `#`, então não precisa de configuração extra.
