export const COLL_NUM = parseInt(process.env.NEXT_PUBLIC_COLL_NUM ?? "0");

export const COLL_SYMBOLS = Array.from({
  length: COLL_NUM,
}).map((_, i) => process.env[`NEXT_PUBLIC_COLL_${i}_TOKEN_ID`] ?? "");
