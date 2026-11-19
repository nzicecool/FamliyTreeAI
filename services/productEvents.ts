const CONSENT_KEY = 'consentry_consent_e587acb77d9421e4af689c5bf1c1d6b427780f14433f7abb';

export function analyticsConsentGranted(): boolean {
  try {
    const consent = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null');
    return consent?.prefs?.analytics === true;
  } catch {
    return false;
  }
}

export function productAnalyticsHeaders(): Record<string, string> {
  return analyticsConsentGranted() ? { 'X-Product-Analytics-Consent': 'granted' } : {};
}

// Consentry updates localStorage without a same-tab notification. Recheck without
// changing the visitor's choices, so consent granted after login is respected.
export function observeAppSession(getToken: () => Promise<string | null>, sessionId: string) {
  let stopped = false;
  let busy = false;
  let completed = false;
  let retryAfter = 0;
  const storageKey = `familytree:analytics-session:v2:${sessionId}`;
  const attempt = async () => {
    if (stopped || busy || completed || Date.now() < retryAfter || !analyticsConsentGranted()) return;
    try {
      if (sessionStorage.getItem(storageKey)) { completed = true; return; }
    } catch { /* Server-side session deduplication still applies. */ }
    busy = true;
    try {
      const token = await getToken();
      if (stopped || !token || !analyticsConsentGranted()) return;
      const response = await fetch('/api/product-events/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, ...productAnalyticsHeaders() },
      });
      if (response.ok) {
        if (response.status === 202) console.warn('Some authentication events were not confirmed by GrowthFlowAI. Automatic replay is disabled to prevent duplicates.');
        completed = true;
        try { sessionStorage.setItem(storageKey, '1'); } catch { /* Storage can be disabled. */ }
      } else {
        retryAfter = Date.now() + 60_000;
        console.warn('Product session tracking is temporarily unavailable.');
      }
    } catch {
      retryAfter = Date.now() + 60_000;
      console.warn('Product session tracking could not reach the server.');
    } finally {
      busy = false;
    }
  };
  void attempt();
  const interval = window.setInterval(() => void attempt(), 3000);
  return () => { stopped = true; window.clearInterval(interval); };
}
