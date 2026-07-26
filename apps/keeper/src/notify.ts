/**
 * Notification stub — HONESTLY LABELED. In the demo this logs; production would wire
 * email/webhook here. It never blocks the keeper's on-chain duties.
 */
export type NotifyKind = "notice" | "handover" | "sweep" | "cancelled" | "payroll";

export function notify(kind: NotifyKind, message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[notify:mock] (${kind}) ${message}`);
}
