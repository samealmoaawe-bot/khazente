-- ============================================================================
-- خزينتي (Khizanti) — FULL DATABASE (الحالة النهائية الموحّدة)
-- PostgreSQL 15+ / Supabase
-- ============================================================================
-- هذا الملف هو الحالة النهائية الكاملة لقاعدة البيانات بعد دمج كل المراحل
-- (Schema الأساسي + مراجعة الأمان + إضافة المصادقة + تصحيح منطق الأرصدة +
-- تخزين النسخ الاحتياطية + Realtime) في ملف واحد متكامل وقابل للتنفيذ من
-- الصفر على مشروع Supabase جديد وفارغ.
--
-- ارفع هذا الملف بالذات في أي محادثة قادمة عند طلب أي تعديل على قاعدة
-- البيانات — فهو المرجع الوحيد الموثوق للحالة الحالية.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1) العملات
-- ============================================================================
create table public.currencies (
  code            varchar(3) primary key,
  name_ar         text not null,
  symbol          text not null,
  decimal_places  smallint not null default 2
);

insert into public.currencies (code, name_ar, symbol, decimal_places)
values ('LYD', 'دينار ليبي', 'د.ل', 2);

-- ============================================================================
-- 2) ملفات المستخدمين (تمتد من auth.users الخاص بـ Supabase)
-- ============================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- ملاحظة: تسجيل الدخول باسم مستخدم فقط. الواجهة تبني بريدًا اصطناعيًا داخليًا
-- (username@khizanti.local) عند signUp — المستخدم لا يرى هذا البريد إطلاقًا.
-- Supabase Auth يتكفل بـ hashing + salt + إدارة الجلسات تلقائيًا.

-- فحص توفر اسم المستخدم قبل التسجيل (تجربة مستخدم فقط — الفرض الفعلي أدناه)
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(p_username)
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- ============================================================================
-- 3) الخزائن
-- ============================================================================
create table public.treasuries (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null references public.profiles(id) on delete restrict,
  name                            text not null,
  currency_code                   varchar(3) not null default 'LYD' references public.currencies(code),
  opening_balance                 numeric(18,2) not null default 0,
  opening_balance_date            date not null default current_date,
  last_matched_reconciliation_id  uuid,               -- FK تُضاف لاحقًا بعد إنشاء reconciliations
  last_matched_date               date,
  status                          text not null default 'active' check (status in ('active','inactive')),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index idx_treasuries_user on public.treasuries(user_id);

-- ============================================================================
-- 4) أنواع الحسابات — معزولة لكل خزينة (لا اشتراك بين المستخدمين)
-- ============================================================================
create table public.account_types (
  id           uuid primary key default gen_random_uuid(),
  treasury_id  uuid not null references public.treasuries(id) on delete restrict,
  code         text not null,
  name_ar      text not null,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (treasury_id, code)
);
-- تُزرع 4 أنواع أساسية تلقائيًا عند إنشاء أي خزينة جديدة (انظر Trigger لاحقًا)

-- ============================================================================
-- 5) الحسابات
-- ============================================================================
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  treasury_id           uuid not null references public.treasuries(id) on delete restrict,
  account_type_id       uuid not null references public.account_types(id) on delete restrict,
  name                  text not null,
  opening_balance       numeric(18,2) not null default 0,
  opening_balance_date  date not null default current_date,
  status                text not null default 'active' check (status in ('active','inactive')),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_accounts_treasury on public.accounts(treasury_id);
create index idx_accounts_name_search on public.accounts using gin (to_tsvector('simple', name));

-- ============================================================================
-- 6) عدادات الترقيم — محمية بالكامل، الوصول فقط عبر next_counter_value()
-- ============================================================================
create table public.counters (
  treasury_id    uuid not null references public.treasuries(id) on delete restrict,
  counter_type   text not null check (counter_type in ('transaction','transfer','closing')),
  current_value  bigint not null default 0,
  primary key (treasury_id, counter_type)
);

create or replace function public.next_counter_value(p_treasury_id uuid, p_type text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  insert into public.counters(treasury_id, counter_type, current_value)
  values (p_treasury_id, p_type, 1)
  on conflict (treasury_id, counter_type)
  do update set current_value = public.counters.current_value + 1
  returning current_value into v;

  return p_prefix || '-' || lpad(v::text, 6, '0');
end;
$$;

-- ============================================================================
-- 7) الحركات المالية
-- ============================================================================
create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  transaction_number  text not null,
  treasury_id         uuid not null references public.treasuries(id) on delete restrict,
  account_id          uuid not null references public.accounts(id) on delete restrict,
  user_id             uuid not null references public.profiles(id) on delete restrict,
  type                text not null check (type in (
                          'cash_in','cash_out','transfer_out','transfer_in',
                          'opening_balance','reversal'
                        )),
  amount              numeric(18,2) not null check (amount > 0),
  occurred_at         timestamptz not null default now(),
  description         text,
  notes               text,
  status              text not null default 'active' check (status in ('active','reversed','reversal')),
  reversal_of_id      uuid references public.transactions(id),
  transfer_id         uuid,
  idempotency_key     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (treasury_id, transaction_number)
);

create index idx_transactions_account       on public.transactions(account_id, occurred_at);
create index idx_transactions_treasury_time on public.transactions(treasury_id, occurred_at);
create index idx_transactions_type          on public.transactions(treasury_id, type);
create unique index uq_transactions_reversal_of
  on public.transactions(reversal_of_id) where reversal_of_id is not null;
create unique index uq_transactions_treasury_idem
  on public.transactions(treasury_id, idempotency_key) where idempotency_key is not null;

-- ============================================================================
-- 8) التحويلات
-- ============================================================================
create table public.transfers (
  id                          uuid primary key default gen_random_uuid(),
  transfer_number             text not null,
  treasury_id                 uuid not null references public.treasuries(id) on delete restrict,
  source_account_id           uuid not null references public.accounts(id) on delete restrict,
  destination_account_id      uuid not null references public.accounts(id) on delete restrict,
  amount                      numeric(18,2) not null check (amount > 0),
  occurred_at                 timestamptz not null default now(),
  description                 text,
  notes                       text,
  status                      text not null default 'active' check (status in ('active','reversed','reversal')),
  reversal_of_id              uuid references public.transfers(id),
  source_transaction_id       uuid references public.transactions(id),
  destination_transaction_id  uuid references public.transactions(id),
  idempotency_key             text,
  created_by                  uuid not null references public.profiles(id) on delete restrict,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (treasury_id, transfer_number),
  check (source_account_id <> destination_account_id)
);

create index idx_transfers_treasury_time on public.transfers(treasury_id, occurred_at);
create unique index uq_transfers_reversal_of
  on public.transfers(reversal_of_id) where reversal_of_id is not null;
create unique index uq_transfers_treasury_idem
  on public.transfers(treasury_id, idempotency_key) where idempotency_key is not null;

alter table public.transactions
  add constraint fk_transactions_transfer foreign key (transfer_id) references public.transfers(id);

-- ============================================================================
-- 9) المطابقات
-- ============================================================================
create table public.reconciliations (
  id                 uuid primary key default gen_random_uuid(),
  treasury_id        uuid not null references public.treasuries(id) on delete restrict,
  occurred_at        timestamptz not null default now(),
  expected_balance   numeric(18,2) not null,
  actual_balance     numeric(18,2) not null,
  difference         numeric(18,2) generated always as (actual_balance - expected_balance) stored,
  result             text generated always as (
                        case
                          when actual_balance = expected_balance then 'matched'
                          when actual_balance <  expected_balance then 'shortage'
                          else 'surplus'
                        end
                      ) stored,
  notes              text,
  idempotency_key    text,
  created_by         uuid not null references public.profiles(id) on delete restrict,
  created_at         timestamptz not null default now(),
  unique (treasury_id, idempotency_key)
);

create index idx_reconciliations_treasury on public.reconciliations(treasury_id, occurred_at);

alter table public.treasuries
  add constraint fk_treasury_last_matched
  foreign key (last_matched_reconciliation_id) references public.reconciliations(id);

-- ============================================================================
-- 10) الإقفال اليومي (اختياري)
-- ============================================================================
create table public.daily_closings (
  id                  uuid primary key default gen_random_uuid(),
  closing_number      text,
  treasury_id         uuid not null references public.treasuries(id) on delete restrict,
  closing_date        date not null,
  expected_balance    numeric(18,2) not null,
  actual_balance      numeric(18,2),
  total_cash_in       numeric(18,2) not null default 0,
  total_cash_out      numeric(18,2) not null default 0,
  transactions_count  int not null default 0,
  status              text not null default 'draft' check (status in ('draft','closed')),
  notes               text,
  created_by          uuid not null references public.profiles(id) on delete restrict,
  created_at          timestamptz not null default now(),
  closed_at           timestamptz,
  unique (treasury_id, closing_date)
);

-- ============================================================================
-- 11) النسخ الاحتياطي — Metadata فقط، الملف الفعلي في Supabase Storage
-- ============================================================================
create table public.backups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  storage_path  text not null,
  size_bytes    bigint,
  checksum      text,
  status        text not null default 'completed' check (status in ('pending','completed','failed')),
  created_at    timestamptz not null default now(),
  restored_at   timestamptz
);

-- ============================================================================
-- 12) سجل التدقيق
-- ============================================================================
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id),
  treasury_id  uuid references public.treasuries(id),
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  details      jsonb,
  created_at   timestamptz not null default now()
);

create index idx_audit_logs_treasury on public.audit_logs(treasury_id, created_at);

-- ============================================================================
-- 13) Views — أرصدة محسوبة (لا تُخزَّن كأرقام قابلة للتعديل)
-- الجمع حسب type فقط (بلا اعتماد على status) صحيح رياضيًا للرصيد الحالي
-- وللرصيد كما كان في أي تاريخ سابق على حدٍّ سواء (انظر get_account_statement)
-- ============================================================================
create view public.account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.treasury_id,
  a.name,
  a.opening_balance
    + coalesce(sum(case
        when t.type in ('cash_in','transfer_in')   then  t.amount
        when t.type in ('cash_out','transfer_out') then -t.amount
        else 0 end), 0) as current_balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id, a.treasury_id, a.name, a.opening_balance;

create view public.treasury_expected_balance
with (security_invoker = true) as
select
  tr.id as treasury_id,
  tr.opening_balance
    + coalesce(sum(case
        when t.type = 'cash_in'  then  t.amount
        when t.type = 'cash_out' then -t.amount
        else 0 end), 0) as expected_balance
from public.treasuries tr
left join public.transactions t on t.treasury_id = tr.id
group by tr.id, tr.opening_balance;

-- إجماليات لوحة التحكم — تُحسب من status='active' فقط عمدًا (نشاط فعلي غير
-- ملغى، بخلاف الأرصدة أعلاه التي يجب أن تشمل كل الحركات لتصح تاريخيًا)
create view public.treasury_totals
with (security_invoker = true) as
select
  tr.id as treasury_id,
  coalesce(sum(case when t.status='active' and t.type='cash_in'  then t.amount else 0 end), 0) as total_cash_in,
  coalesce(sum(case when t.status='active' and t.type='cash_out' then t.amount else 0 end), 0) as total_cash_out,
  count(*) filter (where t.status = 'active' and t.type in ('cash_in','cash_out')) as transactions_count
from public.treasuries tr
left join public.transactions t on t.treasury_id = tr.id
group by tr.id;

-- ============================================================================
-- 14) Trigger Functions — سلامة البيانات على مستوى القاعدة
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.seed_default_account_types()
returns trigger language plpgsql as $$
begin
  insert into public.account_types (treasury_id, code, name_ar, is_system) values
    (new.id, 'branch',   'فرع',   true),
    (new.id, 'creditor', 'ممول',  true),
    (new.id, 'personal', 'شخصي',  true),
    (new.id, 'other',    'أخرى',  true);
  return new;
end;
$$;

create or replace function public.protect_system_account_types()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' and old.is_system then
    raise exception 'لا يمكن حذف نوع حساب أساسي';
  end if;
  if TG_OP = 'UPDATE' and old.is_system and (new.code <> old.code or new.is_system <> old.is_system) then
    raise exception 'لا يمكن تعديل رمز أو حالة نوع حساب أساسي';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.check_account_type_treasury()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.account_types
    where id = new.account_type_id and treasury_id = new.treasury_id
  ) then
    raise exception 'نوع الحساب غير تابع لهذه الخزينة';
  end if;
  return new;
end;
$$;

create or replace function public.check_transaction_account_treasury()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.accounts where id = new.account_id and treasury_id = new.treasury_id
  ) then
    raise exception 'الحساب غير تابع لهذه الخزينة';
  end if;
  return new;
end;
$$;

create or replace function public.check_transfer_accounts_treasury()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.accounts where id = new.source_account_id and treasury_id = new.treasury_id) then
    raise exception 'حساب المصدر غير تابع لهذه الخزينة';
  end if;
  if not exists (select 1 from public.accounts where id = new.destination_account_id and treasury_id = new.treasury_id) then
    raise exception 'حساب الوجهة غير تابع لهذه الخزينة';
  end if;
  return new;
end;
$$;

create or replace function public.check_treasury_active()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.treasuries where id = new.treasury_id and status = 'active') then
    raise exception 'لا يمكن تسجيل حركة على خزينة غير نشطة';
  end if;
  return new;
end;
$$;

create or replace function public.check_account_active()
returns trigger language plpgsql as $$
begin
  if new.status <> 'reversal' then
    if not exists (select 1 from public.accounts where id = new.account_id and status = 'active') then
      raise exception 'لا يمكن تسجيل حركة على حساب غير نشط';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.check_no_double_reversal()
returns trigger language plpgsql as $$
declare
  v_orig_status text;
begin
  if new.reversal_of_id is not null then
    select status into v_orig_status from public.transactions where id = new.reversal_of_id for update;
    if v_orig_status is null then
      raise exception 'الحركة الأصلية غير موجودة';
    end if;
    if v_orig_status <> 'active' then
      raise exception 'لا يمكن عكس حركة سبق عكسها أو غير نشطة';
    end if;
  end if;
  return new;
end;
$$;

-- ربط اسم المستخدم بحساب auth.users تلقائيًا وبشكل Atomic عند التسجيل
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(trim(new.raw_user_meta_data->>'username'));

  if v_username is null or length(v_username) < 3 then
    raise exception 'اسم المستخدم غير صالح';
  end if;

  insert into public.profiles (id, username) values (new.id, v_username);
  return new;
end;
$$;

-- ---- ربط الـ Triggers بالجداول ----
create trigger trg_treasuries_updated   before update on public.treasuries   for each row execute function public.set_updated_at();
create trigger trg_accounts_updated     before update on public.accounts     for each row execute function public.set_updated_at();
create trigger trg_transactions_updated before update on public.transactions for each row execute function public.set_updated_at();
create trigger trg_transfers_updated    before update on public.transfers    for each row execute function public.set_updated_at();

create trigger trg_seed_account_types after insert on public.treasuries
  for each row execute function public.seed_default_account_types();

create trigger trg_protect_system_account_types
  before update or delete on public.account_types
  for each row execute function public.protect_system_account_types();

create trigger trg_check_account_type_treasury
  before insert or update on public.accounts
  for each row execute function public.check_account_type_treasury();

create trigger trg_check_transaction_account_treasury
  before insert or update on public.transactions
  for each row execute function public.check_transaction_account_treasury();

create trigger trg_check_transfer_accounts_treasury
  before insert or update on public.transfers
  for each row execute function public.check_transfer_accounts_treasury();

create trigger trg_check_treasury_active_tx  before insert on public.transactions for each row execute function public.check_treasury_active();
create trigger trg_check_treasury_active_trf before insert on public.transfers    for each row execute function public.check_treasury_active();

create trigger trg_check_account_active before insert on public.transactions for each row execute function public.check_account_active();

create trigger trg_check_no_double_reversal before insert on public.transactions
  for each row execute function public.check_no_double_reversal();

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 15) Row Level Security — عزل كامل على مستوى القاعدة
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.treasuries      enable row level security;
alter table public.account_types   enable row level security;
alter table public.accounts        enable row level security;
alter table public.transactions    enable row level security;
alter table public.transfers       enable row level security;
alter table public.reconciliations enable row level security;
alter table public.daily_closings  enable row level security;
alter table public.backups         enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.counters        enable row level security;  -- بلا أي Policy = ممنوع الوصول كليًا

create policy "own profile" on public.profiles for all using (id = auth.uid());

create policy "own treasuries" on public.treasuries for all using (user_id = auth.uid());

create policy "own account_types" on public.account_types for all
  using (treasury_id in (select id from public.treasuries where user_id = auth.uid()));

create policy "own accounts" on public.accounts for all
  using (treasury_id in (select id from public.treasuries where user_id = auth.uid()));

-- الحركات: قراءة فقط عبر RLS، الكتابة إلزاميًا عبر RPC (انظر Grants أدناه)
create policy "read own transactions" on public.transactions for select
  using (treasury_id in (select id from public.treasuries where user_id = auth.uid()));

create policy "read own transfers" on public.transfers for select
  using (treasury_id in (select id from public.treasuries where user_id = auth.uid()));

create policy "read own reconciliations" on public.reconciliations for select
  using (treasury_id in (select id from public.treasuries where user_id = auth.uid()));

create policy "read own daily_closings" on public.daily_closings for select
  using (treasury_id in (select id from public.treasuries where user_id = auth.uid()));

create policy "own backups" on public.backups for all using (user_id = auth.uid());

create policy "own audit_logs" on public.audit_logs for select using (user_id = auth.uid());

-- ============================================================================
-- 16) Grants — قفل الكتابة المباشرة على الجداول المالية الحساسة
-- ============================================================================
-- ملاحظة: Supabase يمنح افتراضيًا صلاحيات كاملة (SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE/REFERENCES/TRIGGER) لكلا الدورين anon و authenticated على كل جدول
-- جديد. نُزيل كل شيء صراحة أولًا، ثم نعيد فقط ما هو مقصود لكل جدول تحديدًا —
-- لا نعتمد على RLS وحدها كخط دفاع وحيد (Defense in Depth).
-- ============================================================================
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on
  public.transactions, public.transfers, public.reconciliations, public.daily_closings,
  public.account_balances, public.treasury_expected_balance, public.treasury_totals
to authenticated;

grant select, insert, update on public.treasuries, public.accounts, public.account_types to authenticated;
grant select, insert, update, delete on public.backups to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.currencies to authenticated;
grant select, update on public.profiles to authenticated;
-- counters تبقى بلا أي GRANT إطلاقًا — الوصول فقط عبر next_counter_value()

-- ============================================================================
-- 17) RPC Functions — البوابة الوحيدة للعمليات المالية الحساسة
-- ============================================================================

create or replace function public.create_cash_in(
  p_treasury_id uuid, p_account_id uuid, p_amount numeric,
  p_occurred_at timestamptz default now(), p_description text default null,
  p_notes text default null, p_idempotency_key text default null
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_treasury public.treasuries;
  v_account public.accounts;
  v_number text;
  v_row public.transactions;
begin
  select * into v_treasury from public.treasuries where id = p_treasury_id and user_id = auth.uid();
  if not found then raise exception 'الخزينة غير موجودة أو لا تملك صلاحية الوصول إليها'; end if;
  if v_treasury.status <> 'active' then raise exception 'لا يمكن تسجيل حركة على خزينة غير نشطة'; end if;

  select * into v_account from public.accounts where id = p_account_id and treasury_id = p_treasury_id;
  if not found then raise exception 'الحساب غير موجود ضمن هذه الخزينة'; end if;
  if v_account.status <> 'active' then raise exception 'لا يمكن تسجيل حركة على حساب غير نشط'; end if;

  if p_amount is null or p_amount <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;

  v_number := public.next_counter_value(p_treasury_id, 'transaction', 'KHA');

  begin
    insert into public.transactions (
      transaction_number, treasury_id, account_id, user_id, type, amount,
      occurred_at, description, notes, idempotency_key
    ) values (
      v_number, p_treasury_id, p_account_id, auth.uid(), 'cash_in', p_amount,
      coalesce(p_occurred_at, now()), p_description, p_notes, p_idempotency_key
    ) returning * into v_row;
  exception when unique_violation then
    select * into v_row from public.transactions
      where treasury_id = p_treasury_id and idempotency_key = p_idempotency_key;
    return v_row;
  end;

  insert into public.audit_logs(user_id, treasury_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_treasury_id, 'create_cash_in', 'transaction', v_row.id,
    jsonb_build_object('amount', p_amount, 'account_id', p_account_id));

  return v_row;
end;
$$;

create or replace function public.create_cash_out(
  p_treasury_id uuid, p_account_id uuid, p_amount numeric,
  p_occurred_at timestamptz default now(), p_description text default null,
  p_notes text default null, p_idempotency_key text default null
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_treasury public.treasuries;
  v_account public.accounts;
  v_number text;
  v_row public.transactions;
begin
  select * into v_treasury from public.treasuries where id = p_treasury_id and user_id = auth.uid();
  if not found then raise exception 'الخزينة غير موجودة أو لا تملك صلاحية الوصول إليها'; end if;
  if v_treasury.status <> 'active' then raise exception 'لا يمكن تسجيل حركة على خزينة غير نشطة'; end if;

  select * into v_account from public.accounts where id = p_account_id and treasury_id = p_treasury_id;
  if not found then raise exception 'الحساب غير موجود ضمن هذه الخزينة'; end if;
  if v_account.status <> 'active' then raise exception 'لا يمكن تسجيل حركة على حساب غير نشط'; end if;

  if p_amount is null or p_amount <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;

  v_number := public.next_counter_value(p_treasury_id, 'transaction', 'KHA');

  begin
    insert into public.transactions (
      transaction_number, treasury_id, account_id, user_id, type, amount,
      occurred_at, description, notes, idempotency_key
    ) values (
      v_number, p_treasury_id, p_account_id, auth.uid(), 'cash_out', p_amount,
      coalesce(p_occurred_at, now()), p_description, p_notes, p_idempotency_key
    ) returning * into v_row;
  exception when unique_violation then
    select * into v_row from public.transactions
      where treasury_id = p_treasury_id and idempotency_key = p_idempotency_key;
    return v_row;
  end;

  insert into public.audit_logs(user_id, treasury_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_treasury_id, 'create_cash_out', 'transaction', v_row.id,
    jsonb_build_object('amount', p_amount, 'account_id', p_account_id));

  return v_row;
end;
$$;

create or replace function public.create_transfer(
  p_treasury_id uuid, p_source_account_id uuid, p_destination_account_id uuid, p_amount numeric,
  p_occurred_at timestamptz default now(), p_description text default null,
  p_notes text default null, p_idempotency_key text default null
)
returns public.transfers
language plpgsql security definer set search_path = public
as $$
declare
  v_treasury public.treasuries;
  v_source public.accounts;
  v_dest public.accounts;
  v_transfer_number text;
  v_out_number text;
  v_in_number text;
  v_out_tx public.transactions;
  v_in_tx public.transactions;
  v_transfer public.transfers;
begin
  select * into v_treasury from public.treasuries where id = p_treasury_id and user_id = auth.uid();
  if not found then raise exception 'الخزينة غير موجودة أو لا تملك صلاحية الوصول إليها'; end if;
  if v_treasury.status <> 'active' then raise exception 'لا يمكن تنفيذ تحويل على خزينة غير نشطة'; end if;

  if p_source_account_id = p_destination_account_id then
    raise exception 'لا يمكن التحويل إلى نفس الحساب';
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;

  select * into v_source from public.accounts where id = p_source_account_id and treasury_id = p_treasury_id;
  if not found then raise exception 'حساب المصدر غير موجود ضمن هذه الخزينة'; end if;
  if v_source.status <> 'active' then raise exception 'حساب المصدر غير نشط'; end if;

  select * into v_dest from public.accounts where id = p_destination_account_id and treasury_id = p_treasury_id;
  if not found then raise exception 'حساب الوجهة غير موجود ضمن هذه الخزينة'; end if;
  if v_dest.status <> 'active' then raise exception 'حساب الوجهة غير نشط'; end if;

  begin
    v_transfer_number := public.next_counter_value(p_treasury_id, 'transfer', 'TRF');
    v_out_number := public.next_counter_value(p_treasury_id, 'transaction', 'KHA');
    v_in_number  := public.next_counter_value(p_treasury_id, 'transaction', 'KHA');

    insert into public.transactions (transaction_number, treasury_id, account_id, user_id, type, amount, occurred_at, description, notes)
    values (v_out_number, p_treasury_id, p_source_account_id, auth.uid(), 'transfer_out', p_amount, coalesce(p_occurred_at, now()), p_description, p_notes)
    returning * into v_out_tx;

    insert into public.transactions (transaction_number, treasury_id, account_id, user_id, type, amount, occurred_at, description, notes)
    values (v_in_number, p_treasury_id, p_destination_account_id, auth.uid(), 'transfer_in', p_amount, coalesce(p_occurred_at, now()), p_description, p_notes)
    returning * into v_in_tx;

    insert into public.transfers (
      transfer_number, treasury_id, source_account_id, destination_account_id, amount,
      occurred_at, description, notes, source_transaction_id, destination_transaction_id,
      created_by, idempotency_key
    ) values (
      v_transfer_number, p_treasury_id, p_source_account_id, p_destination_account_id, p_amount,
      coalesce(p_occurred_at, now()), p_description, p_notes, v_out_tx.id, v_in_tx.id,
      auth.uid(), p_idempotency_key
    ) returning * into v_transfer;
  exception when unique_violation then
    select * into v_transfer from public.transfers
      where treasury_id = p_treasury_id and idempotency_key = p_idempotency_key;
    return v_transfer;
  end;

  update public.transactions set transfer_id = v_transfer.id where id in (v_out_tx.id, v_in_tx.id);

  insert into public.audit_logs(user_id, treasury_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_treasury_id, 'create_transfer', 'transfer', v_transfer.id,
    jsonb_build_object('amount', p_amount, 'source', p_source_account_id, 'destination', p_destination_account_id));

  return v_transfer;
end;
$$;

create or replace function public.reverse_transaction(
  p_transaction_id uuid, p_notes text default null
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_original public.transactions;
  v_reverse_type text;
  v_number text;
  v_row public.transactions;
begin
  select * into v_original from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'الحركة غير موجودة'; end if;

  if not exists (select 1 from public.treasuries where id = v_original.treasury_id and user_id = auth.uid()) then
    raise exception 'غير مصرح لك بهذه العملية';
  end if;

  if v_original.status <> 'active' then
    raise exception 'لا يمكن عكس حركة سبق عكسها أو أنها ليست نشطة';
  end if;

  if v_original.type not in ('cash_in','cash_out') then
    raise exception 'استخدم reverse_transfer لعكس حركات التحويل';
  end if;

  v_reverse_type := case when v_original.type = 'cash_in' then 'cash_out' else 'cash_in' end;
  v_number := public.next_counter_value(v_original.treasury_id, 'transaction', 'KHA');

  insert into public.transactions (
    transaction_number, treasury_id, account_id, user_id, type, amount,
    occurred_at, description, notes, status, reversal_of_id
  ) values (
    v_number, v_original.treasury_id, v_original.account_id, auth.uid(), v_reverse_type, v_original.amount,
    now(), 'عكس حركة ' || v_original.transaction_number, p_notes, 'reversal', v_original.id
  ) returning * into v_row;

  update public.transactions set status = 'reversed' where id = v_original.id;

  insert into public.audit_logs(user_id, treasury_id, action, entity_type, entity_id, details)
  values (auth.uid(), v_original.treasury_id, 'reverse_transaction', 'transaction', v_row.id,
    jsonb_build_object('original_id', v_original.id, 'original_number', v_original.transaction_number));

  return v_row;
end;
$$;

create or replace function public.reverse_transfer(
  p_transfer_id uuid, p_notes text default null
)
returns public.transfers
language plpgsql security definer set search_path = public
as $$
declare
  v_original public.transfers;
  v_new_number text;
  v_out_number text;
  v_in_number text;
  v_out_tx public.transactions;
  v_in_tx public.transactions;
  v_new_transfer public.transfers;
begin
  select * into v_original from public.transfers where id = p_transfer_id for update;
  if not found then raise exception 'التحويل غير موجود'; end if;

  if not exists (select 1 from public.treasuries where id = v_original.treasury_id and user_id = auth.uid()) then
    raise exception 'غير مصرح لك بهذه العملية';
  end if;

  if v_original.status <> 'active' then
    raise exception 'لا يمكن عكس تحويل سبق عكسه';
  end if;

  v_new_number := public.next_counter_value(v_original.treasury_id, 'transfer', 'TRF');
  v_out_number := public.next_counter_value(v_original.treasury_id, 'transaction', 'KHA');
  v_in_number  := public.next_counter_value(v_original.treasury_id, 'transaction', 'KHA');

  insert into public.transactions (transaction_number, treasury_id, account_id, user_id, type, amount, occurred_at, description, notes, status, reversal_of_id)
  values (v_out_number, v_original.treasury_id, v_original.destination_account_id, auth.uid(), 'transfer_out', v_original.amount, now(), 'عكس تحويل ' || v_original.transfer_number, p_notes, 'reversal', v_original.destination_transaction_id)
  returning * into v_out_tx;

  insert into public.transactions (transaction_number, treasury_id, account_id, user_id, type, amount, occurred_at, description, notes, status, reversal_of_id)
  values (v_in_number, v_original.treasury_id, v_original.source_account_id, auth.uid(), 'transfer_in', v_original.amount, now(), 'عكس تحويل ' || v_original.transfer_number, p_notes, 'reversal', v_original.source_transaction_id)
  returning * into v_in_tx;

  update public.transactions set status = 'reversed'
    where id in (v_original.source_transaction_id, v_original.destination_transaction_id);

  insert into public.transfers (
    transfer_number, treasury_id, source_account_id, destination_account_id, amount,
    occurred_at, description, notes, status, reversal_of_id,
    source_transaction_id, destination_transaction_id, created_by
  ) values (
    v_new_number, v_original.treasury_id, v_original.destination_account_id, v_original.source_account_id, v_original.amount,
    now(), 'عكس تحويل ' || v_original.transfer_number, p_notes, 'reversal', v_original.id,
    v_out_tx.id, v_in_tx.id, auth.uid()
  ) returning * into v_new_transfer;

  update public.transactions set transfer_id = v_new_transfer.id where id in (v_out_tx.id, v_in_tx.id);
  update public.transfers set status = 'reversed' where id = v_original.id;

  insert into public.audit_logs(user_id, treasury_id, action, entity_type, entity_id, details)
  values (auth.uid(), v_original.treasury_id, 'reverse_transfer', 'transfer', v_new_transfer.id,
    jsonb_build_object('original_transfer_id', v_original.id));

  return v_new_transfer;
end;
$$;

create or replace function public.create_reconciliation(
  p_treasury_id uuid, p_actual_balance numeric, p_notes text default null, p_idempotency_key text default null
)
returns public.reconciliations
language plpgsql security definer set search_path = public
as $$
declare
  v_treasury public.treasuries;
  v_expected numeric(18,2);
  v_row public.reconciliations;
begin
  select * into v_treasury from public.treasuries where id = p_treasury_id and user_id = auth.uid();
  if not found then raise exception 'الخزينة غير موجودة أو لا تملك صلاحية الوصول إليها'; end if;

  select expected_balance into v_expected from public.treasury_expected_balance where treasury_id = p_treasury_id;
  v_expected := coalesce(v_expected, v_treasury.opening_balance);

  begin
    insert into public.reconciliations (treasury_id, occurred_at, expected_balance, actual_balance, notes, created_by, idempotency_key)
    values (p_treasury_id, now(), v_expected, p_actual_balance, p_notes, auth.uid(), p_idempotency_key)
    returning * into v_row;
  exception when unique_violation then
    select * into v_row from public.reconciliations
      where treasury_id = p_treasury_id and idempotency_key = p_idempotency_key;
    return v_row;
  end;

  if v_row.result = 'matched' then
    update public.treasuries
      set last_matched_reconciliation_id = v_row.id,
          last_matched_date = v_row.occurred_at::date
      where id = p_treasury_id;
  end if;

  insert into public.audit_logs(user_id, treasury_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_treasury_id, 'create_reconciliation', 'reconciliation', v_row.id,
    jsonb_build_object('expected', v_expected, 'actual', p_actual_balance, 'result', v_row.result));

  return v_row;
end;
$$;

create or replace function public.create_daily_closing(
  p_treasury_id uuid, p_closing_date date, p_actual_balance numeric default null, p_notes text default null
)
returns public.daily_closings
language plpgsql security definer set search_path = public
as $$
declare
  v_treasury public.treasuries;
  v_expected numeric(18,2);
  v_number text;
  v_row public.daily_closings;
begin
  select * into v_treasury from public.treasuries where id = p_treasury_id and user_id = auth.uid();
  if not found then raise exception 'الخزينة غير موجودة أو لا تملك صلاحية الوصول إليها'; end if;

  if exists (select 1 from public.daily_closings where treasury_id = p_treasury_id and closing_date = p_closing_date) then
    raise exception 'تم إقفال هذا اليوم مسبقًا';
  end if;

  select expected_balance into v_expected
  from public.treasury_expected_balance where treasury_id = p_treasury_id;

  v_number := public.next_counter_value(p_treasury_id, 'closing', 'CLS');

  insert into public.daily_closings (
    closing_number, treasury_id, closing_date, expected_balance, actual_balance,
    total_cash_in, total_cash_out, transactions_count, status, notes, created_by
  )
  select
    v_number, p_treasury_id, p_closing_date, coalesce(v_expected, v_treasury.opening_balance), p_actual_balance,
    coalesce(sum(case when t.status = 'active' and t.type = 'cash_in'  then t.amount else 0 end), 0),
    coalesce(sum(case when t.status = 'active' and t.type = 'cash_out' then t.amount else 0 end), 0),
    count(*) filter (where t.status = 'active'),
    case when p_actual_balance is not null then 'closed' else 'draft' end,
    p_notes, auth.uid()
  from public.transactions t
  where t.treasury_id = p_treasury_id and t.occurred_at::date = p_closing_date
  returning * into v_row;

  insert into public.audit_logs(user_id, treasury_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_treasury_id, 'create_daily_closing', 'daily_closing', v_row.id,
    jsonb_build_object('closing_date', p_closing_date, 'status', v_row.status));

  return v_row;
end;
$$;

-- كشف حساب لفترة — الرصيد قبل الفترة محسوب من الحركات الفعلية (صحيح تاريخيًا)
create or replace function public.get_account_statement(
  p_account_id uuid, p_from_date date, p_to_date date
)
returns table (
  transaction_number text, occurred_at timestamptz, type text, amount numeric,
  description text, notes text, status text, running_balance numeric
)
language plpgsql security definer set search_path = public
as $$
declare
  v_treasury_id uuid;
  v_account_opening numeric(18,2);
  v_opening numeric(18,2);
begin
  select treasury_id, opening_balance into v_treasury_id, v_account_opening
  from public.accounts where id = p_account_id;

  if not found then raise exception 'الحساب غير موجود'; end if;

  if not exists (select 1 from public.treasuries where id = v_treasury_id and user_id = auth.uid()) then
    raise exception 'غير مصرح لك بالوصول إلى هذا الحساب';
  end if;

  select v_account_opening + coalesce(sum(
    case
      when t.type in ('cash_in','transfer_in')   then  t.amount
      when t.type in ('cash_out','transfer_out') then -t.amount
      else 0
    end), 0)
  into v_opening
  from public.transactions t
  where t.account_id = p_account_id and t.occurred_at::date < p_from_date;

  return query
  with period_movements as (
    select
      t.transaction_number, t.occurred_at, t.type, t.amount, t.description, t.notes, t.status,
      case
        when t.type in ('cash_in','transfer_in')   then  t.amount
        when t.type in ('cash_out','transfer_out') then -t.amount
        else 0
      end as signed_amount
    from public.transactions t
    where t.account_id = p_account_id
      and t.occurred_at::date between p_from_date and p_to_date
  )
  select
    pm.transaction_number, pm.occurred_at, pm.type, pm.amount, pm.description, pm.notes, pm.status,
    v_opening + sum(pm.signed_amount) over (
      order by pm.occurred_at, pm.transaction_number
      rows between unbounded preceding and current row
    ) as running_balance
  from period_movements pm
  order by pm.occurred_at, pm.transaction_number;
end;
$$;

-- ---- صلاحيات التنفيذ ----
grant execute on function
  public.next_counter_value(uuid, text, text),
  public.create_cash_in(uuid, uuid, numeric, timestamptz, text, text, text),
  public.create_cash_out(uuid, uuid, numeric, timestamptz, text, text, text),
  public.create_transfer(uuid, uuid, uuid, numeric, timestamptz, text, text, text),
  public.reverse_transaction(uuid, text),
  public.reverse_transfer(uuid, text),
  public.create_reconciliation(uuid, numeric, text, text),
  public.create_daily_closing(uuid, date, numeric, text),
  public.get_account_statement(uuid, date, date)
to authenticated;

revoke execute on function
  public.next_counter_value(uuid, text, text),
  public.create_cash_in(uuid, uuid, numeric, timestamptz, text, text, text),
  public.create_cash_out(uuid, uuid, numeric, timestamptz, text, text, text),
  public.create_transfer(uuid, uuid, uuid, numeric, timestamptz, text, text, text),
  public.reverse_transaction(uuid, text),
  public.reverse_transfer(uuid, text),
  public.create_reconciliation(uuid, numeric, text, text),
  public.create_daily_closing(uuid, date, numeric, text),
  public.get_account_statement(uuid, date, date)
from public, anon;

-- ============================================================================
-- 18) Supabase Storage — النسخ الاحتياطية
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

create policy "own backup files select" on storage.objects
  for select using (
    bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own backup files insert" on storage.objects
  for insert with check (
    bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own backup files delete" on storage.objects
  for delete using (
    bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text
  );
-- لا سياسة UPDATE عمدًا — ملف النسخة يُنشأ ويُحذف، لا يُعدَّل (يحافظ على
-- تطابق checksum المخزَّن في جدول backups مع الملف دائمًا).

-- ============================================================================
-- 19) Realtime — لمزامنة الهاتف/الكمبيوتر لحظيًا
-- ============================================================================
alter publication supabase_realtime add table
  public.transactions,
  public.transfers,
  public.treasuries;
-- RLS يبقى مفروضًا على قنوات Realtime أيضًا — كل جهاز يستقبل فقط تغييرات خزائنه.

-- ============================================================================
-- 20) قفل استدعاء دوال الـ Triggers الداخلية مباشرة
-- ============================================================================
-- هذه الدوال (RETURNS TRIGGER) لا يجب أن تُستدعى كـ RPC عامة من العميل.
-- Postgres يمنع فعليًا استدعاءها خارج سياق Trigger حقيقي، لكن نزيل EXECUTE
-- من PUBLIC صراحة كطبقة حماية إضافية توضّح النية في الصلاحيات نفسها.
-- ============================================================================
revoke execute on function
  public.set_updated_at(),
  public.seed_default_account_types(),
  public.protect_system_account_types(),
  public.check_account_type_treasury(),
  public.check_transaction_account_treasury(),
  public.check_transfer_accounts_treasury(),
  public.check_treasury_active(),
  public.check_account_active(),
  public.check_no_double_reversal(),
  public.handle_new_user()
from public, anon, authenticated;
