import { EarnPoolScreen } from "@/src/screens/EarnPoolScreen/EarnPoolScreen";
import { COLL_SYMBOLS } from "../../_constants";

export function generateStaticParams() {
  return COLL_SYMBOLS.map(symbol => ({ pool: symbol.toLowerCase()}));
}

export default function Layout() {
  return <EarnPoolScreen />;
}
