alter table rooms
  alter column version set default 0;

alter table rooms
  drop constraint if exists rooms_version_check;

alter table rooms
  add constraint rooms_version_check check (version >= 0);

create table if not exists game_action_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  request_id text not null,
  seat smallint not null,
  action_type text not null,
  state_version_before bigint not null,
  state_version_after bigint not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint game_action_requests_seat_check check (seat in (0, 1, 2, 3)),
  constraint game_action_requests_versions_check check (
    state_version_after >= state_version_before
  ),
  constraint game_action_requests_room_request_key unique (room_id, request_id)
);

create index if not exists game_action_requests_room_id_idx
  on game_action_requests(room_id);

create index if not exists game_action_requests_room_created_at_idx
  on game_action_requests(room_id, created_at desc);
