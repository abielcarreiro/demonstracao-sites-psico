-- =============================================================================
-- Atualização: criptografia de ponta a ponta dos prontuários
--
-- Como usar: no Supabase, abra "SQL Editor" > "New query", cole este arquivo
-- inteiro e clique em "Run". Pode rodar mais de uma vez. Não apaga dados.
--
-- O que muda:
--  - cria a tabela crypto_keys, onde fica a chave privada do consultório
--    GUARDADA CRIPTOGRAFADA (pela senha de criptografia e pela chave de
--    recuperação). Só a psicóloga (tabela admins) lê essa tabela, e mesmo assim
--    só consegue usar a chave digitando a senha no navegador;
--  - o "motivo" enviado pelo site já chega criptografado, e o texto cifrado é
--    maior: o limite de tamanho passa de 2000 para 12000 caracteres.
-- =============================================================================

create table if not exists public.crypto_keys (
  id               int primary key default 1 check (id = 1),
  public_jwk       jsonb not null,
  wrapped_password jsonb not null,
  wrapped_recovery jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.crypto_keys enable row level security;
revoke all on public.crypto_keys from anon;

drop policy if exists "admin total" on public.crypto_keys;
create policy "admin total" on public.crypto_keys
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

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
     or length(v_reason) > 12000
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

  -- Limite contra abuso: no máximo 3 solicitações pendentes por telefone
  if (select count(*) from public.appointments a
      join public.patients p on p.id = a.patient_id
      where regexp_replace(p.phone, '\D', '', 'g') = v_digits
        and a.status = 'pendente' and a.date >= v_now::date) >= 3 then
    raise exception 'limite_agendamentos';
  end if;

  if exists (
    select 1 from public.blocks b
    where b.date = p_date
      and (b.all_day or (public.hhmm_to_min(b.start_time) < v_end and v_start < public.hhmm_to_min(b.end_time)))
  ) or exists (
    select 1 from public.appointments a
    where a.date = p_date
      and a.status in ('pendente', 'confirmada', 'realizada')
      -- A pausa vale antes e depois de cada sessão
      and public.hhmm_to_min(a.time) < v_end + v_buffer
      and v_start < public.hhmm_to_min(a.time) + a.duration + v_buffer
  ) then
    raise exception 'horario_indisponivel';
  end if;

  -- Reaproveita o cadastro só quando o telefone E o nome batem. Assim, uma mãe que
  -- agenda para o filho com o próprio telefone não mistura os prontuários.
  select id into v_patient from public.patients
  where regexp_replace(phone, '\D', '', 'g') = v_digits
    and public.norm_name(name) = public.norm_name(v_name)
  order by created_at
  limit 1;

  if v_patient is null then
    v_patient := 'pat_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    insert into public.patients (id, name, phone, email, reason, status, source)
    values (v_patient, v_name, btrim(p_phone), v_email, v_reason, 'ativo', 'site');
  else
    update public.patients set status = 'ativo' where id = v_patient;
  end if;

  v_apt  := 'apt_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_code := 'AG-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

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

-- Mantém as permissões da função
revoke execute on function public.create_public_booking(text, date, text, text, text, text, text, text) from public;
grant execute on function public.create_public_booking(text, date, text, text, text, text, text, text) to anon, authenticated;
