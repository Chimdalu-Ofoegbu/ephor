/** Tagged (de)serialization so bigints survive the JSON boundary (mock uses bigint natively). */
export function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `$bigint:${v.toString()}` : v));
}

// Only coerce a str*exactly*-formed tag, so a real string that happens to start with the prefix
// is left intact and a malformed suffix never throws inside JSON.parse.
const BIGINT_TAG = /^\$bigint:(-?\d+)$/;

export function parse(text: string): unknown {
  return JSON.parse(text, (_k, v) => {
    if (typeof v !== "string") return v;
    const m = BIGINT_TAG.exec(v);
    return m ? BigInt(m[1]) : v;
  });
}
