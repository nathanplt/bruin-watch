create extension if not exists pgcrypto;

create table if not exists public.admin_users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.notifiers (
    id uuid primary key default gen_random_uuid(),
    course_number text not null,
    term text not null,
    phone_to text not null,
    interval_seconds integer not null default 60 check (interval_seconds >= 15),
    active boolean not null default true,
    last_known_enrollable boolean,
    last_checked_at timestamptz,
    last_alerted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.notifier_runs (
    id bigint generated always as identity primary key,
    notifier_id uuid not null references public.notifiers(id) on delete cascade,
    checked_at timestamptz not null default now(),
    is_enrollable boolean,
    sms_sent boolean not null default false,
    twilio_sid text,
    error_text text,
    duration_ms integer not null default 0
);

create index if not exists idx_notifiers_active on public.notifiers(active);
create index if not exists idx_notifiers_last_checked on public.notifiers(last_checked_at);
create index if not exists idx_notifier_runs_notifier_checked on public.notifier_runs(notifier_id, checked_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notifiers_set_updated_at on public.notifiers;
create trigger trg_notifiers_set_updated_at
before update on public.notifiers
for each row
execute function public.set_updated_at();
