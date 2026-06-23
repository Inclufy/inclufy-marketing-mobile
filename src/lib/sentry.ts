import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// GDPR: EU customer data must stay in EU region. Sentry's data-residency
// is determined by the DSN — EU DSNs route to `*.ingest.de.sentry.io`
// (Frankfurt). Anything else (default `*.ingest.sentry.io` or `.us.`)
// ships crash breadcrumbs containing user_id + URL paths to US servers,
// requiring SCCs in the DPA.
//
// To migrate: Sentry → Settings → Data Storage Location → "EU (Frankfurt)"
// → re-create the project. Update EXPO_PUBLIC_SENTRY_DSN in EAS Env Vars.
function isEuDsn(d: string | undefined): boolean {
  return !!d && /\.ingest\.de\.sentry\.io/i.test(d);
}

export function initSentry() {
  if (!dsn) return;
  if (!isEuDsn(dsn)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[sentry] DSN is NOT pinned to EU region. Crash data may transit US ' +
      'servers. See src/lib/sentry.ts for migration steps.',
    );
  }
  try {
    Sentry.init({ dsn, tracesSampleRate: 0.1, enableAutoSessionTracking: true });
  } catch (e) {
    // Never let Sentry's own native init crash app startup. If it throws
    // (e.g. native module timing under the New Architecture), degrade to
    // "no Sentry" instead of a white-screen crash on launch.
    // eslint-disable-next-line no-console
    console.warn('[sentry] init failed; continuing without Sentry:', e);
  }
}
