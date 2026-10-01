-- =============================================================================
-- Banco de dados da agenda (Supabase / PostgreSQL)
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo inteiro
-- e clique em "Run". Pode ser executado de novo sem perder dados.
--
-- Segurança:
--  - Pacientes, sessões e bloqueios só podem ser lidos/alterados por quem está
--    na tabela "admins" (a psicóloga), via Row Level Security.
--  - Visitantes do site só conseguem: ler as configurações públicas, ver quais
--    horários estão ocupados (sem nenhum dado de paciente) e criar um agendamento
--    pela função create_public_booking, que valida tudo no servidor.
-- =============================================================================

-- ------------------------------- Tabelas -------------------------------------

create table if not exists public.settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id            text primary key,
  name          text not null,
  phone         text not null default '',
  email         text not null default '',
  birth_date    date,
  reason        text not null default '',
  status        text not null default 'ativo' check (status in ('ativo', 'inativo')),
  source        text not null default 'manual' check (source in ('manual', 'site')),
  general_notes text not null default '',
  created_at    date not null default current_date
);

create table if not exists public.appointments (
  id             text primary key,
  patient_id     text not null references public.patients (id) on delete cascade,
  service_id     text not null default '',
  service_name   text not null default '',
  date           date not null,
  time           text not null check (time ~ '^\d{2}:\d{2}$'),
  duration       int  not null check (duration > 0),
  modality       text not null default 'presencial' check (modality in ('presencial', 'online')),
  status         text not null default 'pendente'
                 check (status in ('pendente', 'confirmada', 'realizada', 'reagendada', 'cancelada')),
  price          numeric(10, 2) not null default 0,
  paid           boolean not null default false,
  payment_method text not null default '',
  note           text not null default '',
  reason         text not null default '',
  code           text not null default '',
  created_at     date not null default current_date
);

create index if not exists appointments_date_idx on public.appointments (date);
create index if not exists appointments_patient_idx on public.appointments (patient_id);

create table if not exists public.blocks (
  id         text primary key,
  date       date not null,
  all_day    boolean not null default false,
  start_time text not null default '00:00',
  end_time   text not null default '23:59',
  reason     text not null default ''
);

create index if not exists blocks_date_idx on public.blocks (date);

-- Quem pode acessar o painel (ids de usuários do Supabase Auth)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Configurações iniciais (só insere se ainda não existirem)
insert into public.settings (id, data)
values (1, '{"psychologist":{"name":"Dra. Luanna Santos","title":"Psicóloga Clínica","crp":"CRP 13/9256","phone":"(83) 98721-6921","email":"contato@vitoriafernandes.com.br","address":"Av. Epitácio Pessoa, 1200 — Sala 804, Tambaú, João Pessoa/PB","instagram":"@vitoriafernandes.psi"},"services":[{"id":"srv_primeira","name":"Primeira Consulta","description":"Um encontro para nos conhecermos, entender sua demanda e construir juntos o plano terapêutico.","duration":60,"price":200,"icon":"Sparkles"},{"id":"srv_individual","name":"Terapia Individual","description":"Sessões semanais ou quinzenais para adolescentes (a partir de 15 anos) e adultos.","duration":50,"price":180,"icon":"User"},{"id":"srv_casal","name":"Terapia de Casal","description":"Espaço seguro para melhorar a comunicação, resolver conflitos e fortalecer o vínculo.","duration":80,"price":280,"icon":"Users"}],"workingHours":[{"enabled":false,"start":"08:00","end":"12:00","breakStart":"","breakEnd":""},{"enabled":true,"start":"08:00","end":"18:00","breakStart":"12:00","breakEnd":"13:00"},{"enabled":true,"start":"08:00","end":"18:00","breakStart":"12:00","breakEnd":"13:00"},{"enabled":true,"start":"08:00","end":"18:00","breakStart":"12:00","breakEnd":"13:00"},{"enabled":true,"start":"08:00","end":"18:00","breakStart":"12:00","breakEnd":"13:00"},{"enabled":true,"start":"08:00","end":"16:00","breakStart":"12:00","breakEnd":"13:00"},{"enabled":false,"start":"08:00","end":"12:00","breakStart":"","breakEnd":""}],"slotStep":60,"bufferMinutes":10,"minNoticeHours":12,"bookingWindowDays":30}'::jsonb)
on conflict (id) do nothing;

-- ------------------------------- Funções -------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 'HH:MM' -> minutos desde 00:00
create or replace function public.hhmm_to_min(t text)
returns int
language sql immutable
as $$
  select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int;
$$;

-- Horários ocupados, para a página pública calcular a disponibilidade.
-- Não expõe nenhum dado de paciente nem o motivo dos bloqueios.
create or replace function public.public_availability()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object('date', a.date, 'time', a.time, 'duration', a.duration))
      from public.appointments a
      where a.date >= current_date - 1
        and a.status in ('pendente', 'confirmada', 'realizada')
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('date', b.date, 'allDay', b.all_day, 'start', b.start_time, 'end', b.end_time))
      from public.blocks b
      where b.date >= current_date - 1
    ), '[]'::jsonb)
  );
$$;

-- Agendamento feito pelo paciente no site. Revalida tudo no servidor:
-- serviço, expediente, antecedência, janela, bloqueios e conflitos de horário.
create or replace function public.create_public_booking(
  p_service_id text,
  p_date       date,
  p_time       text,
  p_modality   text,
  p_name       text,
  p_phone      text,
  p_email      text,
  p_reason     text
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  s          jsonb;
  svc        jsonb;
  day        jsonb;
  v_now      timestamp := now() at time zone 'America/Fortaleza';
  v_digits   text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name     text := btrim(coalesce(p_name, ''));
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_duration int;
  v_price    numeric;
  v_start    int;
  v_end      int;
  v_buffer   int;
  v_patient  text;
  v_apt      text;
  v_code     text;
begin
  -- Dados do paciente
  if length(v_name) < 3 or length(v_name) > 120
     or length(v_digits) not between 10 and 13
     or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(v_email) > 160
     or length(v_reason) > 2000
     or coalesce(p_modality, '') not in ('presencial', 'online')
     or coalesce(p_time, '') !~ '^\d{2}:\d{2}$'
     or p_date is null then
    raise exception 'dados_invalidos';
  end if;

  select data into s from public.settings where id = 1;
  select x into svc from jsonb_array_elements(s -> 'services') x where x ->> 'id' = p_service_id;
  if svc is null then
    raise exception 'servico_invalido';
  end if;

  v_duration := (svc ->> 'duration')::int;
  v_price    := coalesce((svc ->> 'price')::numeric, 0);
  v_buffer   := coalesce((s ->> 'bufferMinutes')::int, 0);
  v_start    := public.hhmm_to_min(p_time);
  v_end      := v_start + v_duration;

  -- Expediente do dia da semana (0 = domingo)
  day := s -> 'workingHours' -> extract(dow from p_date)::int;
  if not coalesce((day ->> 'enabled')::boolean, false)
     or v_start < public.hhmm_to_min(day ->> 'start')
     or v_end > public.hhmm_to_min(day ->> 'end')
     or (coalesce(day ->> 'breakStart', '') <> '' and coalesce(day ->> 'breakEnd', '') <> ''
         and v_start < public.hhmm_to_min(day ->> 'breakEnd')
         and public.hhmm_to_min(day ->> 'breakStart') < v_end) then
    raise exception 'horario_indisponivel';
  end if;

  -- Antecedência mínima e janela de agendamento (horário de João Pessoa)
  if p_date + p_time::time < v_now + make_interval(hours => coalesce((s ->> 'minNoticeHours')::int, 0))
     or p_date > v_now::date + coalesce((s ->> 'bookingWindowDays')::int, 30) then
    raise exception 'horario_indisponivel';
  end if;

  -- Evita que dois pacientes reservem o mesmo dia ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext('booking:' || p_date::text));

  if exists (
    select 1 from public.blocks b
    where b.date = p_date
      and (b.all_day or (public.hhmm_to_min(b.start_time) < v_end and v_start < public.hhmm_to_min(b.end_time)))
  ) or exists (
    select 1 from public.appointments a
    where a.date = p_date
      and a.status in ('pendente', 'confirmada', 'realizada')
      and public.hhmm_to_min(a.time) < v_end
      and v_start < public.hhmm_to_min(a.time) + a.duration + v_buffer
  ) then
    raise exception 'horario_indisponivel';
  end if;

  -- Reaproveita o cadastro se o telefone ou e-mail já existir
  select id into v_patient from public.patients
  where regexp_replace(phone, '\D', '', 'g') = v_digits or lower(email) = v_email
  order by created_at
  limit 1;

  if v_patient is null then
    v_patient := 'pat_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    insert into public.patients (id, name, phone, email, reason, status, source)
    values (v_patient, v_name, btrim(p_phone), v_email, v_reason, 'ativo', 'site');
  else
    -- Limite contra abuso: no máximo 3 solicitações pendentes por paciente
    if (select count(*) from public.appointments
        where patient_id = v_patient and status = 'pendente' and date >= current_date) >= 3 then
      raise exception 'limite_agendamentos';
    end if;
    update public.patients set status = 'ativo' where id = v_patient;
  end if;

  v_apt  := 'apt_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_code := 'VF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

  insert into public.appointments
    (id, patient_id, service_id, service_name, date, time, duration, modality, status, price, reason, code)
  values
    (v_apt, v_patient, p_service_id, svc ->> 'name', p_date, p_time, v_duration, p_modality, 'pendente',
     v_price, v_reason, v_code);

  return jsonb_build_object(
    'id', v_apt,
    'code', v_code,
    'serviceName', svc ->> 'name',
    'duration', v_duration,
    'price', v_price
  );
end;
$$;

-- --------------------------- Permissões / RLS --------------------------------

alter table public.settings     enable row level security;
alter table public.patients     enable row level security;
alter table public.appointments enable row level security;
alter table public.blocks       enable row level security;
alter table public.admins       enable row level security;

-- Visitantes nunca acessam as tabelas clínicas diretamente
revoke all on public.patients, public.appointments, public.blocks, public.admins from anon;

drop policy if exists "leitura publica" on public.settings;
create policy "leitura publica" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "admin atualiza" on public.settings;
create policy "admin atualiza" on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin total" on public.patients;
create policy "admin total" on public.patients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin total" on public.appointments;
create policy "admin total" on public.appointments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin total" on public.blocks;
create policy "admin total" on public.blocks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- "admins" não tem política: ninguém lê ou altera pelo site, só pelo painel do Supabase.

revoke execute on function public.is_admin() from public;
revoke execute on function public.public_availability() from public;
revoke execute on function public.create_public_booking(text, date, text, text, text, text, text, text) from public;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.public_availability() to anon, authenticated;
grant execute on function public.create_public_booking(text, date, text, text, text, text, text, text) to anon, authenticated;

-- =============================================================================
-- ÚLTIMO PASSO (rodar à parte, depois de criar o usuário da psicóloga em
-- Authentication → Users → "Add user"), trocando o e-mail abaixo:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'email-da-psicologa@exemplo.com';
-- =============================================================================
