import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Spinner, Text, color, config } from 'folds';
import { useMatrixClient } from '../hooks/useMatrixClient';
import {
  useDeviceVerificationStatus,
  VerificationStatus,
} from '../hooks/useDeviceVerificationStatus';
import { useKeyBackupStatusChange } from '../hooks/useKeyBackup';

/**
 * smokesignals §9.6 — prominent health surfacing for server-side key backup (4S).
 *
 * The strict §9.1 key-withholding makes a MISSING backup catastrophic for a non-expert: open a
 * new browser with no backup and your message history is GONE (the server holds only ciphertext).
 * Cinny only shows backup state buried in Settings → Devices; this surfaces it up front.
 *
 * Fires only once THIS session is cross-signing-verified (the unverified case is handled by
 * VerificationBanner — whose bootstrap also CREATES the backup, so the two never stack) AND no
 * active key backup is running on this session. We distinguish:
 *   - server has NO backup        → offer a one-click "Turn on backup" (resetKeyBackup is safe).
 *   - server HAS a backup, not here → tell the user to restore it in Settings → Devices (we do
 *     NOT auto-resetKeyBackup, which would orphan the existing backup and lose un-migrated keys).
 */
export function KeyBackupBanner() {
  const mx = useMatrixClient();
  const crypto = mx.getCrypto();
  const userId = mx.getSafeUserId();
  const deviceId = mx.getDeviceId() ?? undefined;
  const verification = useDeviceVerificationStatus(crypto, userId, deviceId);

  // undefined = still loading (suppress to avoid a flash); then true/false.
  const [active, setActive] = useState<boolean | undefined>(undefined);
  const [serverHasBackup, setServerHasBackup] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!crypto) return;
    const [version, info] = await Promise.all([
      crypto.getActiveSessionBackupVersion().catch(() => null),
      crypto.getKeyBackupInfo().catch(() => null),
    ]);
    setActive(typeof version === 'string');
    setServerHasBackup(!!info);
  }, [crypto]);

  useEffect(() => {
    refresh();
  }, [refresh, verification]);

  useKeyBackupStatusChange(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (!crypto) return null;
  // Only relevant once the session itself is trusted; the unverified case is the other banner.
  if (verification !== VerificationStatus.Verified) return null;
  if (active !== false) return null; // still loading, or healthy

  const turnOn = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await crypto.resetKeyBackup();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set up key backup');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      shrink="No"
      alignItems="Center"
      justifyContent="Center"
      gap="300"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        padding: config.space.S200,
        backgroundColor: color.Warning.Container,
        color: color.Warning.OnContainer,
      }}
    >
      <Text size="T300" align="Center">
        🗝️ Your message history isn’t being backed up — open a new browser and it’s gone for good.
      </Text>
      {serverHasBackup ? (
        <Text size="T200">Restore it in Settings → Devices (you’ll need your Recovery Key).</Text>
      ) : (
        <Button
          size="300"
          variant="Warning"
          fill="Solid"
          radii="300"
          disabled={busy}
          before={busy ? <Spinner size="100" variant="Warning" fill="Solid" /> : undefined}
          onClick={turnOn}
        >
          <Text as="span" size="B300">
            Turn on backup
          </Text>
        </Button>
      )}
      {error && <Text size="T200">{error}</Text>}
    </Box>
  );
}
