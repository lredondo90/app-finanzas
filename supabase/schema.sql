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

-- ---------------------------------------------------------
-- v3 · Importación de extractos bancarios
-- ---------------------------------------------------------
-- Cada movimiento importado (sirve para no importarlo dos veces y para sumar el importe real de cada concepto)
create table if not exists public.bank_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank text not null,
  import_key text not null,
  date date not null,
  description text not null,
  detail text,
  amount numeric(12,2) not null,          -- con signo: negativo = salida
  action text not null check (action in ('variable','fijo','ingreso','puntual','inversion','ignorar')),
  category_id uuid references public.categories(id) on delete set null,
  line_id uuid references public.budget_lines(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  one_off_income_id uuid references public.one_off_incomes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, import_key)
);
create index if not exists bank_movements_user_date_idx on public.bank_movements (user_id, date);
create index if not exists bank_movements_line_idx on public.bank_movements (line_id);
create index if not exists bank_movements_category_idx on public.bank_movements (category_id);
create index if not exists bank_movements_expense_idx on public.bank_movements (expense_id);
create index if not exists bank_movements_income_idx on public.bank_movements (one_off_income_id);

-- Reglas aprendidas: «este comercio va a esta categoría / concepto»
create table if not exists public.import_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pattern text not null,
  action text not null check (action in ('variable','fijo','ingreso','puntual','inversion','ignorar')),
  category_id uuid references public.categories(id) on delete cascade,
  line_id uuid references public.budget_lines(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (user_id, pattern)
);
create index if not exists import_rules_category_idx on public.import_rules (category_id);
create index if not exists import_rules_line_idx on public.import_rules (line_id);

alter table public.bank_movements enable row level security;
alter table public.import_rules enable row level security;
create policy "own rows" on public.bank_movements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.import_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- ---------------------------------------------------------
-- v4 · Conexión directa con el banco (Enable Banking / PSD2)
-- ---------------------------------------------------------
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  aspsp_name text not null,
  aspsp_country text not null default 'ES',
  session_id text not null,
  accounts jsonb not null default '[]'::jsonb,
  valid_until timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, session_id)
);
create index if not exists bank_connections_user_idx on public.bank_connections (user_id);

-- Movimientos descargados del banco pendientes de revisar
create table if not exists public.bank_pending (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_key text not null,
  row jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, import_key)
);

alter table public.bank_connections enable row level security;
alter table public.bank_pending enable row level security;
create policy "own rows" on public.bank_connections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.bank_pending for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- ---------------------------------------------------------
-- v5 · Mes contable, inicio de la app, patrimonio sincronizado y fondos por ISIN
-- ---------------------------------------------------------
-- Día de corte: lo que entra/sale después de este día en conceptos marcados cuenta para el mes siguiente
alter table public.settings add column if not exists cutoff_day int not null default 25 check (cutoff_day between 1 and 28);
-- Primer mes con datos reales (YYYY-MM-01); lo anterior se ignora
alter table public.settings add column if not exists start_date date;
-- Concepto (nómina, recibos de fin de mes) que cuenta para el mes siguiente si llega tras el día de corte
alter table public.budget_lines add column if not exists next_month boolean not null default false;
-- Cuentas a mano: si cuentan en el patrimonio (las que ya llegan del banco se desactivan)
alter table public.bank_accounts add column if not exists counted boolean not null default true;

-- Fondos/ETF por ISIN: participaciones de partida + las compras que llegan del banco
create table if not exists public.fund_holdings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  isin text not null,
  name text not null,
  initial_units numeric(18,6) not null default 0,
  initial_date date,
  price numeric(18,6),
  price_date date,
  price_symbol text,
  price_manual boolean not null default false,
  -- Valor y coste de partida (lo que dice la app del broker ese día); con el primer precio se calculan las participaciones
  initial_value numeric(12,2),
  initial_cost numeric(12,2),
  -- Para fondos cuyos movimientos no traen ISIN (p. ej. BBVA «QUALITY MEJORES IDEA»): texto que identifica sus aportaciones
  match_text text,
  updated_at timestamptz not null default now(),
  primary key (user_id, isin)
);
alter table public.fund_holdings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fund_holdings') then
    create policy "own rows" on public.fund_holdings for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
-- ---------------------------------------------------------
-- v6 · Casa: cuentas conjuntas
-- ---------------------------------------------------------
-- Cuenta de la que viene cada movimiento (id de Enable Banking), para separar los de las cuentas conjuntas.
-- El tipo «conjunta», el concepto de tu aportación y el presupuesto de casa se guardan en bank_connections.accounts.
alter table public.bank_movements add column if not exists account_uid text;
create index if not exists bank_movements_account_idx on public.bank_movements (account_uid, date);
