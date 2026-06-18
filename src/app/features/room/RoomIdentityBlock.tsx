import React, { useState } from 'react';
import { Box, Button, Chip, Icon, Icons, Spinner, Text, color, config } from 'folds';
import { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { IdentityViolation } from '../../hooks/useRoomIdentityViolations';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';

/**
 * smokesignals §9.1.7 / §9.1.6 — the HARD-BLOCK that replaces the composer when a contact's
 * master cross-signing identity has changed. Sending is impossible until the operator either
 * (a) re-verifies the contact via SAS (emoji), or (b) confirms the new master-key fingerprint
 * OUT-OF-BAND (Signal / in person) and pins it. Deliberately NOT a dismissible pill: a soft
 * "identity changed" notice gets clicked through, which is exactly the attack the spec defends.
 */
export function RoomIdentityBlock({
  room,
  violations,
}: {
  room: Room;
  violations: IdentityViolation[];
}) {
  const mx = useMatrixClient();
  const crypto = mx.getCrypto();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const trustAfterOOB = async (userId: string) => {
    if (!crypto) return;
    setBusy(userId);
    setError(undefined);
    try {
      // §9.1.6 — the operator has compared the NEW master fingerprint over an independent
      // channel and confirms it is legitimate; pin it as the new anchored identity.
      await crypto.pinCurrentUserIdentity(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to trust new identity');
    } finally {
      setBusy(undefined);
    }
  };

  const verify = async (userId: string) => {
    if (!crypto) return;
    setBusy(userId);
    setError(undefined);
    try {
      await crypto.requestVerificationDM(userId, room.roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start verification');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <RoomInputPlaceholder
      direction="Column"
      gap="200"
      style={{
        padding: config.space.S300,
        backgroundColor: color.Critical.Container,
        color: color.Critical.OnContainer,
      }}
    >
      <Box gap="200" alignItems="Center">
        <Icon size="100" src={Icons.ShieldUser} />
        <Text size="L400">Sending blocked — an encryption identity changed</Text>
      </Box>
      <Text size="T200">
        The encryption identity of {violations.map((v) => v.displayName).join(', ')} changed. This
        can be a normal account reset — but it is also exactly what a compromised server would do
        to read this channel. Confirm the new identity with them over a separate channel (Signal,
        in person) before you trust it.
      </Text>
      {error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          {error}
        </Text>
      )}
      {violations.map((v) => (
        <Box key={v.userId} gap="200" alignItems="Center" justifyContent="SpaceBetween">
          <Text size="T300" truncate>
            {v.displayName} · {v.userId}
          </Text>
          <Box gap="200" shrink="No" alignItems="Center">
            {busy === v.userId && <Spinner size="100" variant="Secondary" />}
            <Chip variant="Secondary" radii="Pill" onClick={() => verify(v.userId)}>
              <Text size="B300">Verify (emoji)</Text>
            </Chip>
            <Button
              variant="Critical"
              fill="Solid"
              size="300"
              radii="300"
              disabled={!!busy}
              onClick={() => trustAfterOOB(v.userId)}
            >
              <Text size="B300">I checked — trust new identity</Text>
            </Button>
          </Box>
        </Box>
      ))}
    </RoomInputPlaceholder>
  );
}
