-- Demli: ortak hesaplar kurulumu
-- Supabase panelinde SQL Editor'ü aç, bu dosyanın tamamını yapıştır ve Run'a bas.
-- Birden fazla kez çalıştırmak zarar vermez.

-- ---------- Tablolar ----------

-- Herkesin görünen adı
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Sonra izle listesi
create table if not exists public.saved (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id text not null,
  item jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- "Bitirdim" denen içerikler (Haftam bunlardan hesaplanır)
create table if not exists public.done (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id text not null,
  item jsonb not null,
  done_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Birbirine gönderilen öneriler
create table if not exists public.recs (
  id bigint generated always as identity primary key,
  from_id uuid not null default auth.uid() references auth.users on delete cascade,
  to_id uuid not null references auth.users on delete cascade,
  item jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

-- "Link ekle" ile eklenenler (herkes görür)
create table if not exists public.links (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item jsonb not null,
  created_at timestamptz not null default now()
);

-- Davet kodları (siteden okunamaz, sadece hesap açılırken kontrol edilir)
create table if not exists public.davet (
  kod text primary key
);

-- ---------- Erişim kuralları ----------

alter table public.profiles enable row level security;
alter table public.saved enable row level security;
alter table public.done enable row level security;
alter table public.recs enable row level security;
alter table public.links enable row level security;
alter table public.davet enable row level security;

drop policy if exists "profiller herkese açık" on public.profiles;
create policy "profiller herkese açık" on public.profiles for select to authenticated using (true);
drop policy if exists "kendi adını değiştir" on public.profiles;
create policy "kendi adını değiştir" on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists "kendi listen" on public.saved;
create policy "kendi listen" on public.saved for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "kendi bitirdiklerin" on public.done;
create policy "kendi bitirdiklerin" on public.done for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "sana ve senden öneriler" on public.recs;
create policy "sana ve senden öneriler" on public.recs for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());
drop policy if exists "öneri gönder" on public.recs;
create policy "öneri gönder" on public.recs for insert to authenticated with check (from_id = auth.uid());
drop policy if exists "öneriyi okundu yap" on public.recs;
create policy "öneriyi okundu yap" on public.recs for update to authenticated using (to_id = auth.uid());
drop policy if exists "kendi önerini sil" on public.recs;
create policy "kendi önerini sil" on public.recs for delete to authenticated using (from_id = auth.uid());

drop policy if exists "linkler herkese açık" on public.links;
create policy "linkler herkese açık" on public.links for select to authenticated using (true);
drop policy if exists "link ekle" on public.links;
create policy "link ekle" on public.links for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "kendi linkini sil" on public.links;
create policy "kendi linkini sil" on public.links for delete to authenticated using (user_id = auth.uid());

-- davet tablosuna hiç kural yok: siteden kimse okuyamaz, yazamaz.

-- ---------- Hesap açılırken ----------

-- Davet kodu doğru değilse hesap açılmaz; doğruysa profil oluşturulur.
create or replace function public.yeni_kullanici() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.davet where kod = coalesce(new.raw_user_meta_data ->> 'davet', '')) then
    raise exception 'DAVET_KODU_GECERSIZ';
  end if;
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)));
  return new;
end $$;

drop trigger if exists demli_yeni_kullanici on auth.users;
create trigger demli_yeni_kullanici after insert on auth.users
  for each row execute function public.yeni_kullanici();
