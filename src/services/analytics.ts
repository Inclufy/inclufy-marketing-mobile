// Lichtgewicht analytics-service — event-tracking.
// Stub (no-op) zodat de typecheck slaagt + de app niet crasht op de ontbrekende module.
// TODO: koppel hier een echte provider aan (PostHog / Segment / Supabase events).
export type AnalyticsProps = Record<string, unknown>;

export function track(event: string, props?: AnalyticsProps): void {
  void event;
  void props;
}
