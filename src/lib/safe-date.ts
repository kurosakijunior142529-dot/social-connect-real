import { formatDistanceToNowStrict as raw } from "date-fns";

/** Igual ao date-fns, mas nunca quebra a tela com datas vazias/invalidas. */
export function formatDistanceToNowStrict(date: Date | number, opts?: Parameters<typeof raw>[1]): string {
  try {
    const d = typeof date === "number" ? new Date(date) : date;
    if (!d || Number.isNaN(d.getTime())) return "";
    return raw(d, opts);
  } catch {
    return "";
  }
}
