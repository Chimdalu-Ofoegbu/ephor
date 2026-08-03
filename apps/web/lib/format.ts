/** 6-dec base units -> "1,234.56". Accepts bigint (mock) or string (live JSON). */
export function usd(a: bigint | number | string): string {
  let v: bigint;
  try {
    v = typeof a === "bigint" ? a : BigInt(typeof a === "number" ? Math.trunc(a) : a);
  } catch {
    v = 0n;
  }
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 1_000_000n;
  const cents = (abs % 1_000_000n) / 10_000n;
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${w}.${cents.toString().padStart(2, "0")}`;
}

/** Coerce a bigint|string|number to a JS number (safe for small demo values). */
export const num = (x: bigint | number | string): number => Number(x);

/** Approx wall-clock from a block count. */
export function secs(blocks: bigint | number | string, secondsPerBlock: number): string {
  const s = Math.round(num(blocks) * secondsPerBlock);
  if (s < 90) return `~${s}s`;
  if (s < 5400) return `~${Math.round(s / 60)}m`;
  return `~${(s / 3600).toFixed(1)}h`;
}
