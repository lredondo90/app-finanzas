// Movimiento bancario normalizado (llega de Enable Banking)
export interface Movement {
  bank: string;
  date: string; // YYYY-MM-DD
  description: string; // texto principal (comercio o concepto)
  detail: string | null; // texto secundario (observaciones, tipo…)
  type: string | null; // tipo de operación según el banco (tarjeta, adeudo, transferencia…)
  amount: number; // con signo: negativo = salida
  account?: string | null; // cuenta de la que viene (conexión directa)
  accountUid?: string | null; // id de esa cuenta en Enable Banking (para la pantalla Casa)
  counterIban?: string | null; // cuenta de la otra parte (a quién va la transferencia o de quién viene), si el banco la da
  mcc?: string | null; // código de comercio de la tarjeta (conexión directa)
  raw?: unknown; // datos originales del banco (solo para revisar)
}
