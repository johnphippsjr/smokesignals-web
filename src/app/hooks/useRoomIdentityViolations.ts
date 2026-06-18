import { useCallback, useEffect, useState } from 'react';
import { Room } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useUserTrustStatusChange } from './useUserTrustStatusChange';
import { useAlive } from './useAlive';

export type IdentityViolation = { userId: string; displayName: string };

/**
 * smokesignals §9.1.7 — surfaces contacts in this room whose MASTER cross-signing key has
 * changed since it was pinned/verified (`UserVerificationStatus.needsUserApproval`). That is
 * the realistic "the server reset/swapped my friend's identity to read this channel" attack.
 *
 * Callers HARD-BLOCK sending while this list is non-empty (see RoomIdentityBlock) — the default
 * Matrix render is a soft "identity changed" pill that a click-through-prone group will dismiss,
 * which §9.1.7 explicitly forbids. Only meaningful for encrypted rooms (all our channels are);
 * returns empty otherwise. Recomputes on every UserTrustStatusChanged crypto event.
 */
export const useRoomIdentityViolations = (room: Room): IdentityViolation[] => {
  const mx = useMatrixClient();
  const alive = useAlive();
  const [violations, setViolations] = useState<IdentityViolation[]>([]);

  const recompute = useCallback(async () => {
    const crypto = mx.getCrypto();
    if (!crypto || !room.hasEncryptionStateEvent()) {
      if (alive()) setViolations([]);
      return;
    }
    const me = mx.getSafeUserId();
    const members = room.getJoinedMembers().filter((m) => m.userId !== me);
    const results = await Promise.allSettled(
      members.map(async (m): Promise<IdentityViolation | null> => {
        const status = await crypto.getUserVerificationStatus(m.userId);
        return status.needsUserApproval
          ? { userId: m.userId, displayName: m.name || m.userId }
          : null;
      })
    );
    if (!alive()) return;
    setViolations(
      results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
    );
  }, [mx, room, alive]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  useUserTrustStatusChange(
    useCallback(() => {
      recompute();
    }, [recompute])
  );

  return violations;
};
