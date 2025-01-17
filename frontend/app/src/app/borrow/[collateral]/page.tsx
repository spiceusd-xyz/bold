import { COLL_SYMBOLS } from "../../_constants";

export function generateStaticParams() {
  return COLL_SYMBOLS.map(symbol => ({ collateral: symbol.toLowerCase()}));
}

export default function BorrowCollateralPage() {
  // see layout in parent folder
  return null;
}
