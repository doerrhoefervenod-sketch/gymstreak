-- ============================================================
-- GymStreak – Safe Supabase migration setup
-- Idempotent, non-destructive, safe for existing projects
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text := '';
  idx integer;
begin
  loop
    candidate := '';
    for idx in 1..6 loop
      candidate := candidate || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;

    if not exists (
      select 1
      from public.groups
      where invite_code = candidate
    ) then
      return candidate;
    end if;
  end loop;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  character text not null default 'male' check (character in ('male', 'female')),
  onboarding_completed boolean not null default false,
  current_streak integer not null default 0,
  cycle_count integer not null default 0,
  coins integer not null default 0,
  freezer_count integer not null default 1,
  workout_rhythm numeric(4,2) not null default 1,
  last_workout_ts bigint,
  next_due_ts bigint,
  streak_reset_at bigint,
  unlocked_milestones text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists character text;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists current_streak integer not null default 0;
alter table public.profiles add column if not exists cycle_count integer not null default 0;
alter table public.profiles add column if not exists coins integer not null default 0;
alter table public.profiles add column if not exists freezer_count integer not null default 1;
alter table public.profiles add column if not exists workout_rhythm numeric(4,2) not null default 1;
alter table public.profiles add column if not exists last_workout_ts bigint;
alter table public.profiles add column if not exists next_due_ts bigint;
alter table public.profiles add column if not exists streak_reset_at bigint;
alter table public.profiles add column if not exists unlocked_milestones text[] not null default '{}';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

update public.profiles
set onboarding_completed = false
where onboarding_completed is null;

alter table public.profiles
  alter column onboarding_completed set default false;

alter table public.profiles
  alter column character set default 'male';

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  category text not null,
  duration integer not null default 45 check (duration > 0),
  created_at timestamptz not null default now()
);

alter table public.workouts add column if not exists user_id uuid;
alter table public.workouts add column if not exists type text;
alter table public.workouts add column if not exists category text;
alter table public.workouts add column if not exists duration integer not null default 45;
alter table public.workouts add column if not exists created_at timestamptz not null default now();

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  invite_code text not null unique default public.generate_invite_code(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.groups add column if not exists name text;
alter table public.groups add column if not exists description text;
alter table public.groups add column if not exists invite_code text;
alter table public.groups add column if not exists admin_id uuid;
alter table public.groups add column if not exists created_at timestamptz not null default now();
alter table public.groups alter column invite_code set default public.generate_invite_code();

update public.groups
set invite_code = public.generate_invite_code()
where invite_code is null or btrim(invite_code) = '';

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members add column if not exists group_id uuid;
alter table public.group_members add column if not exists user_id uuid;
alter table public.group_members add column if not exists joined_at timestamptz not null default now();

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id text not null,
  coins integer not null,
  amount_cents integer not null,
  currency text not null default 'eur',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  stripe_event_id text,
  status text not null default 'pending',
  credited_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchases add column if not exists user_id uuid;
alter table public.purchases add column if not exists package_id text;
alter table public.purchases add column if not exists coins integer;
alter table public.purchases add column if not exists amount_cents integer;
alter table public.purchases add column if not exists currency text not null default 'eur';
alter table public.purchases add column if not exists stripe_checkout_session_id text;
alter table public.purchases add column if not exists stripe_payment_intent_id text;
alter table public.purchases add column if not exists stripe_customer_id text;
alter table public.purchases add column if not exists stripe_event_id text;
alter table public.purchases add column if not exists status text not null default 'pending';
alter table public.purchases add column if not exists credited_at timestamptz;
alter table public.purchases add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.purchases add column if not exists created_at timestamptz not null default now();
alter table public.purchases add column if not exists updated_at timestamptz not null default now();

create table if not exists public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purchase_id uuid unique references public.purchases(id) on delete set null,
  delta integer not null,
  entry_type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.coin_ledger add column if not exists user_id uuid;
alter table public.coin_ledger add column if not exists purchase_id uuid;
alter table public.coin_ledger add column if not exists delta integer;
alter table public.coin_ledger add column if not exists entry_type text;
alter table public.coin_ledger add column if not exists description text;
alter table public.coin_ledger add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.coin_ledger add column if not exists created_at timestamptz not null default now();

create index if not exists idx_workouts_user_created on public.workouts(user_id, created_at desc);
create index if not exists idx_group_members_group on public.group_members(group_id);
create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_groups_invite_code on public.groups(invite_code);
create unique index if not exists idx_purchases_checkout_session on public.purchases(stripe_checkout_session_id);
create index if not exists idx_purchases_user_created on public.purchases(user_id, created_at desc);
create index if not exists idx_purchases_status on public.purchases(status);
create unique index if not exists idx_coin_ledger_purchase on public.coin_ledger(purchase_id);
create index if not exists idx_coin_ledger_user_created on public.coin_ledger(user_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_character_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_character_check
      check (character in ('male', 'female'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_status_check'
      and conrelid = 'public.purchases'::regclass
  ) then
    alter table public.purchases
      add constraint purchases_status_check
      check (status in ('pending', 'completed', 'failed', 'expired'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_coins_check'
      and conrelid = 'public.purchases'::regclass
  ) then
    alter table public.purchases
      add constraint purchases_coins_check
      check (coins > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_amount_cents_check'
      and conrelid = 'public.purchases'::regclass
  ) then
    alter table public.purchases
      add constraint purchases_amount_cents_check
      check (amount_cents > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coin_ledger_entry_type_check'
      and conrelid = 'public.coin_ledger'::regclass
  ) then
    alter table public.coin_ledger
      add constraint coin_ledger_entry_type_check
      check (entry_type in ('stripe_purchase', 'manual_adjustment', 'reward', 'spend'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workouts_duration_check'
      and conrelid = 'public.workouts'::regclass
  ) then
    alter table public.workouts
      add constraint workouts_duration_check
      check (duration > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'purchases_set_updated_at'
      and tgrelid = 'public.purchases'::regclass
  ) then
    create trigger purchases_set_updated_at
    before update on public.purchases
    for each row execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'groups_invite_code_key'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_invite_code_key unique (invite_code);
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'profiles_set_updated_at'
      and tgrelid = 'public.profiles'::regclass
  ) then
    create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();
  end if;
end
$$;

create or replace function public.get_group_ranking(p_group_id uuid)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  character text,
  current_streak integer,
  last_workout_ts bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.username,
    p.avatar_url,
    p.character,
    p.current_streak,
    p.last_workout_ts
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
  order by p.current_streak desc, p.username asc;
$$;

create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.admin_id = p_user_id
  );
$$;

create or replace function public.share_group_with_user(p_target_user_id uuid, p_viewer_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm_me
    join public.group_members gm_other on gm_other.group_id = gm_me.group_id
    where gm_me.user_id = p_viewer_user_id
      and gm_other.user_id = p_target_user_id
  );
$$;

create or replace function public.join_group_by_code(p_invite_code text)
returns table (
  id uuid,
  name text,
  description text,
  invite_code text,
  admin_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  target_group public.groups%rowtype;
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  normalized_code := upper(regexp_replace(coalesce(p_invite_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if length(normalized_code) <> 6 then
    raise exception 'Bitte gib einen gültigen 6-stelligen Einladungscode ein.';
  end if;

  select *
  into target_group
  from public.groups g
  where upper(g.invite_code) = normalized_code
  limit 1;

  if not found then
    raise exception 'Gruppe nicht gefunden. Prüfe den Einladungscode.';
  end if;

  if exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group.id
      and gm.user_id = current_user_id
  ) then
    raise exception 'Du bist bereits in dieser Gruppe.';
  end if;

  insert into public.group_members (group_id, user_id)
  values (target_group.id, current_user_id);

  return query
  select
    target_group.id,
    target_group.name,
    target_group.description,
    target_group.invite_code,
    target_group.admin_id,
    target_group.created_at;
end;
$$;

create or replace function public.apply_purchase_credit(
  p_purchase_id uuid,
  p_stripe_event_id text default null,
  p_stripe_payment_intent_id text default null,
  p_stripe_customer_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_inserted integer := 0;
begin
  select *
  into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if not found then
    return false;
  end if;

  insert into public.coin_ledger (
    user_id,
    purchase_id,
    delta,
    entry_type,
    description,
    metadata
  )
  values (
    v_purchase.user_id,
    v_purchase.id,
    v_purchase.coins,
    'stripe_purchase',
    'Stripe Checkout ' || coalesce(v_purchase.package_id, 'purchase'),
    jsonb_build_object(
      'stripe_checkout_session_id', v_purchase.stripe_checkout_session_id,
      'stripe_payment_intent_id', coalesce(p_stripe_payment_intent_id, v_purchase.stripe_payment_intent_id),
      'stripe_customer_id', coalesce(p_stripe_customer_id, v_purchase.stripe_customer_id)
    )
  )
  on conflict (purchase_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.profiles
    set coins = coins + v_purchase.coins
    where id = v_purchase.user_id;
  end if;

  update public.purchases
  set
    status = 'completed',
    stripe_event_id = coalesce(p_stripe_event_id, stripe_event_id),
    stripe_payment_intent_id = coalesce(p_stripe_payment_intent_id, stripe_payment_intent_id),
    stripe_customer_id = coalesce(p_stripe_customer_id, stripe_customer_id),
    credited_at = coalesce(credited_at, now())
  where id = v_purchase.id;

  return v_inserted > 0;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  fallback_username text;
begin
  base_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'user'
  );

  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_]+', '', 'g'));

  if base_username = '' then
    base_username := 'user';
  end if;

  fallback_username := left(base_username, 18) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);

  insert into public.profiles (
    id,
    username,
    avatar_url,
    onboarding_completed
  )
  values (
    new.id,
    fallback_username,
    new.raw_user_meta_data->>'avatar_url',
    false
  )
  on conflict (id) do update
  set
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end
$$;

alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.purchases enable row level security;
alter table public.coin_ledger enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy "profiles_select_own"
    on public.profiles
    for select
    using (auth.uid() = id);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_group_members'
  ) then
    alter policy "profiles_select_group_members"
    on public.profiles
    using (public.share_group_with_user(public.profiles.id, auth.uid()));
  else
    create policy "profiles_select_group_members"
    on public.profiles
    for select
    using (public.share_group_with_user(public.profiles.id, auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'purchases'
      and policyname = 'purchases_select_own'
  ) then
    create policy "purchases_select_own"
    on public.purchases
    for select
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coin_ledger'
      and policyname = 'coin_ledger_select_own'
  ) then
    create policy "coin_ledger_select_own"
    on public.coin_ledger
    for select
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy "profiles_insert_own"
    on public.profiles
    for insert
    with check (auth.uid() = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy "profiles_update_own"
    on public.profiles
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workouts'
      and policyname = 'workouts_insert_own'
  ) then
    create policy "workouts_insert_own"
    on public.workouts
    for insert
    with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workouts'
      and policyname = 'workouts_select_own'
  ) then
    create policy "workouts_select_own"
    on public.workouts
    for select
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'groups'
      and policyname = 'groups_select_member_groups'
  ) then
    alter policy "groups_select_member_groups"
    on public.groups
    using (public.is_group_member(public.groups.id, auth.uid()));
  else
    create policy "groups_select_member_groups"
    on public.groups
    for select
    using (public.is_group_member(public.groups.id, auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'groups'
      and policyname = 'groups_select_by_invite'
  ) then
    create policy "groups_select_by_invite"
    on public.groups
    for select
    using (auth.role() = 'authenticated');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'groups'
      and policyname = 'groups_insert_own'
  ) then
    create policy "groups_insert_own"
    on public.groups
    for insert
    with check (auth.uid() = admin_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'groups'
      and policyname = 'groups_update_admin'
  ) then
    create policy "groups_update_admin"
    on public.groups
    for update
    using (auth.uid() = admin_id)
    with check (auth.uid() = admin_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'groups'
      and policyname = 'groups_delete_admin'
  ) then
    create policy "groups_delete_admin"
    on public.groups
    for delete
    using (auth.uid() = admin_id);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_members'
      and policyname = 'group_members_select_same_group'
  ) then
    alter policy "group_members_select_same_group"
    on public.group_members
    using (public.is_group_member(public.group_members.group_id, auth.uid()));
  else
    create policy "group_members_select_same_group"
    on public.group_members
    for select
    using (public.is_group_member(public.group_members.group_id, auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_members'
      and policyname = 'group_members_insert_self'
  ) then
    create policy "group_members_insert_self"
    on public.group_members
    for insert
    with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_members'
      and policyname = 'group_members_delete_self'
  ) then
    create policy "group_members_delete_self"
    on public.group_members
    for delete
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_members'
      and policyname = 'group_members_delete_admin'
  ) then
    alter policy "group_members_delete_admin"
    on public.group_members
    using (public.is_group_admin(public.group_members.group_id, auth.uid()));
  else
    create policy "group_members_delete_admin"
    on public.group_members
    for delete
    using (public.is_group_admin(public.group_members.group_id, auth.uid()));
  end if;
end
$$;
