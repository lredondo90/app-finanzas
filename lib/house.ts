// Casa: cuentas conjuntas con tu mujer. Sus movimientos nunca cuentan en tus gastos;
// lo que sí cuenta en tu presupuesto es lo que tú les transfieres (tu aportación).
import { norm } from "./bankSuggest";
import type { StoredAccount } from "./enableBanking";

export interface JointAccount {
  uid: string;
  bank: string;
  label: string;
  iban: string | null;
  contributionLineId: string | null;
  budget: number | null;
}

/** Cuentas marcadas como «Conjunta (casa)» en todas las conexiones */
export function jointAccounts(conns: { aspsp_name: string; accounts: StoredAccount[] }[]): JointAccount[] {
  return conns.flatMap((c) =>
    (c.accounts ?? []).filter((a) => a.sync === true && a.kind === "conjunta").map((a) => ({
      uid: a.uid,
      bank: c.aspsp_name,
      label: a.label || a.product || (a.iban ? `${c.aspsp_name} ···${a.iban.slice(-4)}` : c.aspsp_name),
      iban: a.iban ? a.iban.replace(/\s/g, "").toUpperCase() : null,
      contributionLineId: a.contribution_line_id ?? null,
      budget: a.house_budget != null && Number(a.house_budget) > 0 ? Number(a.house_budget) : null,
    })));
}

const DAY = 86400000;
const near = (a: string, b: string, days: number) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= days * DAY;
const sameIban = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false;
  const x = a.replace(/\s/g, "").toUpperCase(), y = b.replace(/\s/g, "").toUpperCase();
  return x === y || (x.length >= 4 && y.length >= 4 && (x.endsWith(y) || y.endsWith(x)) && Math.min(x.length, y.length) >= 8);
};

export const TRANSFER_TEXT = /traspaso|transfer|bizum|envio|enviado|top.?up|recarga|ordenes pago/;

/**
 * ¿Es esta salida de una cuenta tuya una transferencia a una cuenta conjunta?
 * Primero por la cuenta de destino (si el banco la da); si no, porque en una cuenta conjunta entra
 * el mismo importe en ±3 días. `incoming` se va consumiendo para que cada entrada solo empareje una salida.
 */
export function matchContribution(
  m: { date: string; amount: number; description: string; detail: string | null; type: string | null; counterIban?: string | null },
  joint: JointAccount[],
  incoming: { accountUid: string; date: string; amount: number }[],
): JointAccount | null {
  if (m.amount >= 0) return null;
  const byIban = joint.find((j) => sameIban(j.iban, m.counterIban));
  if (byIban) return byIban;
  if (!TRANSFER_TEXT.test(norm(`${m.description} ${m.detail ?? ""} ${m.type ?? ""}`))) return null;
  const i = incoming.findIndex((x) => Math.abs(x.amount + m.amount) < 0.005 && near(x.date, m.date, 3));
  if (i < 0) return null;
  const j = joint.find((a) => a.uid === incoming[i].accountUid) ?? null;
  incoming.splice(i, 1);
  return j;
}

export interface HouseMovement {
  id: string;
  account_uid: string;
  date: string;
  description: string;
  detail: string | null;
  amount: number;
  category_id: string | null;
}

/** Traspasos entre dos cuentas de casa (p. ej. BBVA conjunta → Pibank): ni son gasto ni aportación */
export function internalTransfers(movs: HouseMovement[]) {
  const ids = new Set<string>();
  const ins = movs.filter((m) => m.amount > 0);
  for (const out of movs.filter((m) => m.amount < 0)) {
    const hit = ins.find((i) => !ids.has(i.id) && i.account_uid !== out.account_uid && Math.abs(i.amount + out.amount) < 0.005 && near(i.date, out.date, 3));
    if (hit) { ids.add(hit.id); ids.add(out.id); }
  }
  return ids;
}

/** Grupo de un gasto de casa: la categoría si la tiene; si no, hipoteca, recibos o «Otros» */
export function houseGroup(m: Pick<HouseMovement, "description" | "detail" | "category_id">, categoryName: (id: string | null) => string | null) {
  const t = norm(`${m.description} ${m.detail ?? ""}`);
  if (/hipoteca|prestamo|amortizacion/.test(t)) return "Hipoteca";
  const c = categoryName(m.category_id);
  if (c && norm(c) !== "otros") return c;
  if (/iberdrola|endesa|naturgy|sunflower|holaluz|octopus|agua|canal de isabel|gas natural/.test(t)) return "Luz, agua y gas";
  if (/comunidad|propietarios/.test(t)) return "Comunidad";
  if (/seguro|mutua|mapfre|allianz|axa|linea directa/.test(t)) return "Seguros";
  if (/adeudo|recibo/.test(t)) return "Recibos";
  return c ?? "Otros";
}
