import { useState, useEffect, useCallback } from 'react';
import { aiConsentService } from '../services/ai-consent.service';
import { useUserSettings, useSetAiConsent } from './useUserSettings';

/**
 * Hook to manage AI data processing consent.
 *
 * Returns:
 * - hasConsent: whether consent has been given
 * - loading: whether the consent status is being loaded
 * - showModal: whether the consent modal should be shown
 * - requestConsent: call this before an AI operation to trigger the modal if needed
 * - onAccept / onDecline: handlers for the modal
 */
export function useAIConsent() {
  const [hasConsent, setHasConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  // Callback to execute after consent is granted
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  // Cross-device sync: also read server-side ai_consent_granted so a
  // user who already accepted on web doesn't get prompted again on mobile.
  const { data: serverSettings } = useUserSettings();
  const setAiConsentServer = useSetAiConsent();

  useEffect(() => {
    // Honor whichever source said YES — server OR local AsyncStorage cache.
    // A user that granted on web shows up here as ai_consent_granted=true.
    aiConsentService.hasConsent().then((local) => {
      const server = !!serverSettings?.ai_consent_granted;
      setHasConsent(local || server);
      setLoading(false);
    });
  }, [serverSettings?.ai_consent_granted]);

  /**
   * Call before any AI operation.
   * If consent is already given, runs the callback immediately.
   * Otherwise shows the consent modal first.
   */
  const requestConsent = useCallback(
    (callback?: () => void) => {
      if (hasConsent) {
        callback?.();
        return;
      }
      // Store callback to run after accept
      if (callback) {
        setPendingCallback(() => callback);
      }
      setShowModal(true);
    },
    [hasConsent],
  );

  const onAccept = useCallback(() => {
    setHasConsent(true);
    setShowModal(false);
    pendingCallback?.();
    setPendingCallback(null);
    // Persist server-side so web sees it too.
    setAiConsentServer(true).catch((e: any) => {
      console.warn('[useAIConsent] server persist failed:', e?.message);
    });
  }, [pendingCallback]);

  const onDecline = useCallback(() => {
    setShowModal(false);
    setPendingCallback(null);
  }, []);

  const revokeConsent = useCallback(async () => {
    await aiConsentService.revokeConsent();
    setHasConsent(false);
    setAiConsentServer(false).catch((e: any) => {
      console.warn('[useAIConsent] server revoke failed:', e?.message);
    });
  }, []);

  return { hasConsent, loading, showModal, requestConsent, onAccept, onDecline, revokeConsent };
}
