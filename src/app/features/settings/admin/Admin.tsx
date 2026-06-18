import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Scroll,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { Method } from 'matrix-js-sdk';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { copyToClipboard } from '../../../utils/dom';

// smokesignals admin panel — embedded in Settings, gated to server admins. Calls the
// Synapse admin API with the user's EXISTING access token (true SSO, no second login).
const ADMIN_PREFIX = '/_synapse/admin';

type RegistrationToken = {
  token: string;
  uses_allowed: number | null;
  pending: number;
  completed: number;
  expiry_time: number | null;
};

export function Admin({ requestClose }: { requestClose: () => void }) {
  const mx = useMatrixClient();
  const [tokens, setTokens] = useState<RegistrationToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [uses, setUses] = useState('10');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await mx.http.authedRequest<{ registration_tokens: RegistrationToken[] }>(
        Method.Get,
        '/v1/registration_tokens',
        undefined,
        undefined,
        { prefix: ADMIN_PREFIX }
      );
      setTokens(res.registration_tokens ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, [mx]);

  useEffect(() => {
    load();
  }, [load]);

  const createToken = async () => {
    setCreating(true);
    setError(undefined);
    try {
      const usesNum = parseInt(uses, 10);
      const body: { uses_allowed?: number } = {};
      if (!Number.isNaN(usesNum) && usesNum > 0) body.uses_allowed = usesNum;
      await mx.http.authedRequest(Method.Post, '/v1/registration_tokens/new', undefined, body, {
        prefix: ADMIN_PREFIX,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  const deleteToken = async (token: string) => {
    setError(undefined);
    try {
      await mx.http.authedRequest(
        Method.Delete,
        `/v1/registration_tokens/${encodeURIComponent(token)}`,
        undefined,
        undefined,
        { prefix: ADMIN_PREFIX }
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete token');
    }
  };

  return (
    <Box grow="Yes" direction="Column">
      <Header size="600" style={{ paddingLeft: config.space.S400, paddingRight: config.space.S200 }}>
        <Box grow="Yes">
          <Text size="H3">Admin</Text>
        </Box>
        <IconButton onClick={requestClose} variant="Background">
          <Icon src={Icons.Cross} />
        </IconButton>
      </Header>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
            <Box direction="Column" gap="100">
              <Text size="H4">Registration tokens (invites)</Text>
              <Text size="T200" priority="300">
                Share a token to let someone sign up. Tokens are the only way to register.
              </Text>
            </Box>

            <Box gap="200" alignItems="End">
              <Box direction="Column" gap="100" style={{ maxWidth: 140 }}>
                <Text size="L400">Uses allowed</Text>
                <Input
                  value={uses}
                  onChange={(evt) => setUses(evt.currentTarget.value)}
                  type="number"
                  size="400"
                />
              </Box>
              <Button
                variant="Primary"
                size="400"
                radii="300"
                onClick={createToken}
                disabled={creating}
                before={creating ? <Spinner size="200" variant="Primary" fill="Solid" /> : undefined}
              >
                <Text size="B400">Create token</Text>
              </Button>
              <Button variant="Secondary" fill="Soft" size="400" radii="300" onClick={load}>
                <Text size="B400">Refresh</Text>
              </Button>
            </Box>

            {error && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                {error}
              </Text>
            )}

            {loading ? (
              <Spinner size="400" />
            ) : (
              <Box direction="Column" gap="200">
                {tokens.length === 0 && (
                  <Text size="T200" priority="300">
                    No tokens yet.
                  </Text>
                )}
                {tokens.map((t) => (
                  <Box
                    key={t.token}
                    alignItems="Center"
                    gap="200"
                    style={{
                      padding: config.space.S200,
                      borderRadius: config.radii.R400,
                      backgroundColor: color.SurfaceVariant.Container,
                    }}
                  >
                    <Box grow="Yes" direction="Column">
                      <Text size="T300" style={{ fontFamily: 'monospace' }}>
                        {t.token}
                      </Text>
                      <Text size="T200" priority="300">
                        used {t.completed}
                        {t.uses_allowed != null ? `/${t.uses_allowed}` : ' (unlimited)'}
                        {t.expiry_time
                          ? ` · expires ${new Date(t.expiry_time).toLocaleDateString()}`
                          : ''}
                      </Text>
                    </Box>
                    <Chip
                      variant="Secondary"
                      radii="Pill"
                      onClick={() => copyToClipboard(t.token)}
                    >
                      <Text size="B300">Copy</Text>
                    </Chip>
                    <IconButton
                      size="300"
                      radii="300"
                      variant="Critical"
                      fill="None"
                      onClick={() => deleteToken(t.token)}
                    >
                      <Icon src={Icons.Delete} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Scroll>
      </Box>
    </Box>
  );
}
