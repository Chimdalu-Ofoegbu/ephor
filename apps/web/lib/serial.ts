/** Tagged (de)serialization so bigints survive the JSON boundary (mock uses bigint natively). */
export function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `$bigint:${v.toString()}` : v));
}

export function parse(text: string): unknown {
  return JSON.parse(text, (_k, v) =>
    typeof v === "string" && v.startsWith("$bigint:") ? BigInt(v.slice(8)) : v,
  );
}
