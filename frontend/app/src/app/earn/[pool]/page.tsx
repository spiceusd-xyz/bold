import { COLL_SYMBOLS } from "../../_constants";

export function generateStaticParams() {
  return COLL_SYMBOLS.map(symbol => ({ pool: symbol.toLowerCase()}));
}

export default function EarnPoolPage() {
  return null;
}
