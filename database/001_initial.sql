create extension if not exists pgcrypto;

create table rooms (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting',
  round_number integer not null default 0,
  current_state jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_status_check check (
    status in ('waiting', 'active', 'round_finished', 'archived')
  ),
  constraint rooms_round_number_check check (round_number >= 0),
  constraint rooms_version_check check (version > 0)
);

create table room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  seat smallint not null,
  nickname text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  constraint room_players_seat_check check (seat in (0, 1, 2, 3)),
  constraint room_players_room_id_seat_key unique (room_id, seat),
  constraint room_players_nickname_check check (char_length(trim(nickname)) > 0)
);

create table game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_number integer not null,
  record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint game_rounds_round_number_check check (round_number >= 0),
  constraint game_rounds_room_id_round_number_key unique (room_id, round_number)
);

create index room_players_room_id_idx on room_players(room_id);
create index game_rounds_room_id_idx on game_rounds(room_id);

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_set_updated_at
before update on rooms
for each row
execute function set_updated_at();
