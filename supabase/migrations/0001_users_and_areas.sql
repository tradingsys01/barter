-- Quadra Barter: initial users + areas tables.

create extension if not exists "pgcrypto";

create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  display_name  text,
  avatar_url    text,
  bio           text,
  area_id       uuid references public.areas(id) on delete set null,
  language      text not null default 'en',
  is_local      boolean not null default false,
  created_at    timestamptz not null default now(),
  banned_at     timestamptz
);

create index users_area_idx on public.users(area_id);
