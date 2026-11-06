-- =========================================================
-- App Finanzas · esquema de base de datos (Supabase/Postgres)
-- Refleja las hojas del Excel Presupuesto_2026.xlsx
-- Cada fila pertenece a un usuario (user_id) y está protegida con RLS.
-- =========================================================

-- Ajustes generales (año activo y saldo inicial del fondo de anuales)
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  year int not null default extract(year from now())::int,
  annual_fund_initial numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Hojas «Fijos» + «Ajustes»: conceptos de ingresos, gastos fijos y provisión
create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  section text not null check (section in ('ingreso','fijo','provision')),
  name text not null,
  sort_order int not null default 0,
  is_annual_fund boolean not null default false, -- «SEGUROS / ANUALES»: se calcula desde la hoja Anuales
  created_at timestamptz not null default now()
);

-- Importe previsto (Fijos) y real/ajustado (Ajustes) por mes
create table if not exists public.budget_values (
  line_id uuid not null references public.budget_lines(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  planned numeric(12,2) not null default 0,
  adjusted numeric(12,2),           -- null = vale lo fijo; 0 también cuenta
  note text,
  primary key (line_id, year, month)
);

-- «¿Mes cerrado?» (Sí = usar gasto real, No = usar la provisión)
create table if not exists public.months (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  closed boolean not null default false,
  primary key (user_id, year, month)
);

-- Hoja «Listas»: categorías de gasto variable y métodos de pago
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (user_id, name)
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (user_id, name)
);

-- Hoja «Variables»: un gasto por fila
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  amount numeric(12,2) not null,
  payment_method text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists expenses_user_date_idx on public.expenses (user_id, date);
create index if not exists expenses_category_idx on public.expenses (category_id);

-- Hoja «Anuales»: recibos anuales repartidos en 12 meses
create table if not exists public.annual_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0,
  pay_month int check (pay_month between 1 and 12),
  sort_order int not null default 0
);

-- Hoja «Planes»: planes de ahorro periódico
create table if not exists public.savings_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  monthly_amount numeric(12,2),
  from_month int check (from_month between 1 and 12),
  to_month int check (to_month between 1 and 12),
  current_value numeric(12,2),
  return_pct numeric(10,6),          -- 0.1367 = 13,67 %
  notes text,
  sort_order int not null default 0
);

-- Importes variables o extra de cada plan por mes (redondeos, saveback…)
create table if not exists public.savings_extras (
  plan_id uuid not null references public.savings_plans(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  amount numeric(12,2) not null default 0,
  primary key (plan_id, year, month)
);

-- Hoja «Inversiones»: operaciones puntuales
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('Compra','Venta')),
  asset text not null,
  asset_class text,
  quantity numeric(18,6) not null,
  unit_price numeric(18,6) not null,
  fees numeric(12,2) not null default 0,
  notes text
);
create index if not exists investments_user_date_idx on public.investments (user_id, date);

-- Hoja «Cartera»: precio actual de cada activo
create table if not exists public.asset_prices (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  asset text not null,
  price numeric(18,6) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, asset)
);

-- Hoja «Patrimonio»: saldos por banco e histórico
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  balance numeric(12,2) not null default 0,
  sort_order int not null default 0
);

create table if not exists public.net_worth_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  cash numeric(12,2) not null default 0,
  investments numeric(12,2) not null default 0
);

-- ---------------------------------------------------------
-- Seguridad: cada usuario solo ve y modifica sus propias filas
-- ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'settings','budget_lines','budget_values','months','categories','payment_methods',
    'expenses','annual_expenses','savings_plans','savings_extras','investments',
    'asset_prices','bank_accounts','net_worth_history'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Índices en user_id para que las políticas RLS sean rápidas
create index if not exists budget_lines_user_idx on public.budget_lines (user_id);
create index if not exists budget_values_user_idx on public.budget_values (user_id, year);
create index if not exists categories_user_idx on public.categories (user_id);
create index if not exists payment_methods_user_idx on public.payment_methods (user_id);
create index if not exists annual_expenses_user_idx on public.annual_expenses (user_id);
create index if not exists savings_plans_user_idx on public.savings_plans (user_id);
create index if not exists savings_extras_user_idx on public.savings_extras (user_id, year);
create index if not exists bank_accounts_user_idx on public.bank_accounts (user_id);
create index if not exists net_worth_history_user_idx on public.net_worth_history (user_id, date);

-- ---------------------------------------------------------
-- v2 · Estado recibido/pagado por concepto y mes + ingresos puntuales
-- ---------------------------------------------------------
alter table public.budget_values add column if not exists done boolean not null default false;
alter table public.budget_values add column if not exists done_date date;

create table if not exists public.one_off_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  concept text not null,
  amount numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists one_off_incomes_user_date_idx on public.one_off_incomes (user_id, date);
alter table public.one_off_incomes enable row level security;
create policy "own rows" on public.one_off_incomes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
