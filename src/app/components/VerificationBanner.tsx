import React, { useEffect, useState } from 'react';
import { Box, Button, Overlay, OverlayBackdrop, OverlayCenter, Text, color, config } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../hooks/useMatrixClient';
import {
  useDeviceVerificationStatus,
  VerificationStatus,
} from '../hooks/useDeviceVerificationStatus';
import { DeviceVerificationSetup } from './DeviceVerificationSetup';

/**
 * smokesignals §9.1 (Tier 2b) — persistent, non-dismissible prompt shown until THIS session
 * is cross-signing-verified. Encrypted messaging is already enforced at the crypto layer
 * (hard key-withholding / device isolation set in initMatrix.ts), so without this the user
 * just hits silent "unable to decrypt" failures; this guides them to fix it.
 *
 * SAFETY: it only offers the bootstrap flow (which RESETS cross-signing) when the account has
 * NO cross-signing yet (first device). If cross-signing already exists, it points to Settings
 * (verify with recovery key / another device) and never triggers a destructive reset.
 */
export function VerificationBanner() {
  const mx = useMatrixClient();
  const crypto = mx.getCrypto();
  const userId = mx.getSafeUserId();
  const deviceId = mx.getDeviceId() ?? undefined;
  const status = useDeviceVerificationStatus(crypto, userId, deviceId);

  const [hasCrossSigning, setHasCrossSigning] = useState<boolean | undefined>(undefined);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!crypto) return;
      try {
        const has = await crypto.userHasCrossSigningKeys(userId, true);
        if (alive) setHasCrossSigning(has);
      } catch {
        /* leave undefined -> show the safe Settings guidance, never destructive bootstrap */
      }
    })();
    return () => {
      alive = false;
    };
  }, [crypto, userId, status]);

  if (status !== VerificationStatus.Unverified) return null;

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
        🔒 This session isn’t verified — encrypted messages stay locked until you verify it.
      </Text>
      {hasCrossSigning === false ? (
        <Button
          size="300"
          variant="Warning"
          fill="Solid"
          radii="300"
          onClick={() => setSetupOpen(true)}
        >
          <Text as="span" size="B300">
            Set up verification
          </Text>
        </Button>
      ) : (
        <Text size="T200">
          Verify from Settings → Devices (recovery key or another device).
        </Text>
      )}
      {setupOpen && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                clickOutsideDeactivates: false,
                escapeDeactivates: false,
              }}
            >
              <DeviceVerificationSetup onCancel={() => setSetupOpen(false)} />
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
    </Box>
  );
}
