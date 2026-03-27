-- ============================================================
-- GymStreak – Full Supabase reset for the current project
-- Run this first in: Supabase Dashboard -> SQL Editor
-- Warning: this deletes the current app schema objects and data.
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.get_group_ranking(uuid) cascade;

drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.workouts cascade;
drop table if exists public.profiles cascade;

drop extension if exists pgcrypto;
