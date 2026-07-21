alter table rooms
  add column if not exists room_code text;

alter table room_players
  add column if not exists join_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_room_code_check'
  ) then
    alter table rooms
      add constraint rooms_room_code_check
      check (room_code is null or room_code ~ '^[0-9]{4}$');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_players_join_code_check'
  ) then
    alter table room_players
      add constraint room_players_join_code_check
      check (join_code is null or join_code ~ '^[0-9]{5}$');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_room_code_key'
  ) then
    alter table rooms
      add constraint rooms_room_code_key unique (room_code);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_players_join_code_key'
  ) then
    alter table room_players
      add constraint room_players_join_code_key unique (join_code);
  end if;
end;
$$;
