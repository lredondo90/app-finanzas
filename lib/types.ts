export type Section = "ingreso" | "fijo" | "provision";

export interface Settings {
  user_id: string;
  year: number;
  annual_fund_initial: number;
}

export interface BudgetLine {
  id: string;
  section: Section;
  name: string;
  sort_order: number;
  is_annual_fund: boolean;
}

export interface BudgetValue {
  line_id: string;
  year: number;
  month: number;
  planned: number;
  adjusted: number | null;
  note: string | null;
  done?: boolean;
  done_date?: string | null;
}

export interface MonthRow {
  year: number;
  month: number;
  closed: boolean;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  sort_order: number;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  category_id: string | null;
  description: string | null;
  amount: number;
  payment_method: string | null;
  notes: string | null;
}

export interface AnnualExpense {
  id: string;
  name: string;
  amount: number;
  pay_month: number | null;
  sort_order: number;
}

export interface SavingsPlan {
  id: string;
  name: string;
  monthly_amount: number | null;
  from_month: number | null;
  to_month: number | null;
  current_value: number | null;
  return_pct: number | null;
  notes: string | null;
  sort_order: number;
}

export interface SavingsExtra {
  plan_id: string;
  year: number;
  month: number;
  amount: number;
}

export interface Investment {
  id: string;
  date: string;
  type: "Compra" | "Venta";
  asset: string;
  asset_class: string | null;
  quantity: number;
  unit_price: number;
  fees: number;
  notes: string | null;
}

export interface AssetPrice {
  asset: string;
  price: number;
}

export interface BankAccount {
  id: string;
  name: string;
  balance: number;
  sort_order: number;
}

export interface NetWorthPoint {
  id: string;
  date: string;
  cash: number;
  investments: number;
}

export interface YearData {
  year: number;
  settings: Settings | null;
  lines: BudgetLine[];
  values: BudgetValue[];
  months: MonthRow[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  expenses: Expense[];
  annuals: AnnualExpense[];
  plans: SavingsPlan[];
  extras: SavingsExtra[];
  investments: Investment[];
  prices: AssetPrice[];
  banks: BankAccount[];
  history: NetWorthPoint[];
  oneOffIncomes: OneOffIncome[];
  /** Última carga de gastos por origen (banco o a mano) */
  loads: { source: string; loadedAt: string; lastMovement: string | null }[];
}

export interface OneOffIncome {
  id: string;
  date: string;
  concept: string;
  amount: number;
  notes: string | null;
}
