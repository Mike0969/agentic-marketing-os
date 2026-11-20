-- One default brand for the whole app (Mihai 2026-11-20: "I need Gulf-EL as default; every time I move
-- to another tab it sends me to Grid"). The header switcher's choice (cookie) wins; this is the fallback
-- and is set in Settings → Default brand. At most one default. Safe to run repeatedly.

alter table brands add column if not exists is_default boolean not null default false;
create unique index if not exists brands_one_default on brands (is_default) where is_default;

update brands set is_default = true
where name ilike 'Gulf-EL%' and not exists (select 1 from brands where is_default);

notify pgrst, 'reload schema';
