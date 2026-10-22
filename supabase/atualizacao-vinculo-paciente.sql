-- =============================================================================
-- Atualização: vínculo correto de paciente e pausa entre sessões
--
-- Como usar: no Supabase, abra "SQL Editor" > "New query", cole este arquivo
-- inteiro e clique em "Run". Pode rodar mais de uma vez. Não apaga dados.
--
-- O que muda em create_public_booking:
--  - o cadastro existente só é reaproveitado se o telefone E o nome baterem
--    (antes bastava o telefone OU o e-mail, o que misturava prontuários);
--  - o limite de 3 solicitações pendentes passa a contar por telefone;
--  - a pausa entre sessões vale antes e depois de cada sessão;
--  - o código do agendamento passa a começar com "AG-".
-- =============================================================================

-- Nome normalizado para comparar cadastros: minúsculas, sem acentos e sem espaços extras
create or replace function public.norm_name(t text)
returns text
language sql immutable
as $$
  select regexp_replace(
    translate(lower(btrim(coalesce(t, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g');
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
