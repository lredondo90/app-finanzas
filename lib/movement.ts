// Movimiento bancario normalizado (llega de Enable Banking)
export interface Movement {
  bank: string;
  date: string; // YYYY-MM-DD
  description: string; // texto principal (comercio o concepto)
  detail: string | null; // texto secundario (observaciones, tipo…)
  type: string | null; // tipo de operación según el banco (tarjeta, adeudo, transferencia…)
  amount: number; // con signo: negativo = salida
  account?: string | null; // cuenta de la que viene (conexión directa)
  mcc?: string | null; // código de comercio de la tarjeta (conexión directa)
  raw?: unknown; // datos originales del banco (solo para revisar)
}
