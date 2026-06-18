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

type AdminUser = {
  name: string;
  displayname?: string | null;
  admin: boolean | number;
  deactivated: boolean | number;
};

export function Admin({ requestClose }: { requestClose: () => void }) {
  const mx = useMatrixClient();
  const domain = mx.getDomain() ?? '';

  // --- registration tokens ---
  const [tokens, setTokens] = useState<RegistrationToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [uses, setUses] = useState('10');
  const [creatingToken, setCreatingToken] = useState(false);

  // --- users ---
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [newLocalpart, setNewLocalpart] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAdmin, setNewAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string>();

  const req = useCallback(
    <T,>(method: Method, path: string, body?: unknown): Promise<T> =>
      mx.http.authedRequest<T>(method, path, undefined, body, { prefix: ADMIN_PREFIX }),
    [mx]
  );

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const res = await req<{ registration_tokens: RegistrationToken[] }>(
        Method.Get,
        '/v1/registration_tokens'
      );
      setTokens(res.registration_tokens ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tokens');
    } finally {
      setTokensLoading(false);
    }
  }, [req]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await req<{ users: AdminUser[] }>(
        Method.Get,
        '/v2/users?limit=200&deactivated=true&guests=false'
      );
      setUsers(res.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [req]);

  useEffect(() => {
    loadTokens();
    loadUsers();
  }, [loadTokens, loadUsers]);

  const createToken = async () => {
    setCreatingToken(true);
    setError(undefined);
    try {
      const n = parseInt(uses, 10);
      const body: { uses_allowed?: number } = {};
      if (!Number.isNaN(n) && n > 0) body.uses_allowed = n;
      await req(Method.Post, '/v1/registration_tokens/new', body);
      await loadTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create token');
    } finally {
      setCreatingToken(false);
    }
  };

  const deleteToken = async (token: string) => {
    setError(undefined);
    try {
      await req(Method.Delete, `/v1/registration_tokens/${encodeURIComponent(token)}`);
      await loadTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete token');
    }
  };

  const createUser = async () => {
    if (!newLocalpart || !newPassword) {
      setError('Username and password are required.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const userId = `@${newLocalpart.toLowerCase()}:${domain}`;
      await req(Method.Put, `/v2/users/${encodeURIComponent(userId)}`, {
        password: newPassword,
        admin: newAdmin,
      });
      setNewLocalpart('');
      setNewPassword('');
      setNewAdmin(false);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (userId: string) => {
    // eslint-disable-next-line no-alert
    const pw = window.prompt(`New password for ${userId}:`);
    if (!pw) return;
    setError(undefined);
    try {
      await req(Method.Post, `/v1/reset_password/${encodeURIComponent(userId)}`, {
        new_password: pw,
        logout_devices: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset password');
    }
  };

  const setDeactivated = async (userId: string, deactivate: boolean) => {
    // eslint-disable-next-line no-alert
    if (deactivate && !window.confirm(`Deactivate ${userId}? They will be logged out.`)) return;
    setError(undefined);
    try {
      if (deactivate) {
        await req(Method.Post, `/v1/deactivate/${encodeURIComponent(userId)}`, { erase: false });
      } else {
        // reactivate = set a password via the v2 users API
        // eslint-disable-next-line no-alert
        const pw = window.prompt(`Set a password to reactivate ${userId}:`);
        if (!pw) return;
        await req(Method.Put, `/v2/users/${encodeURIComponent(userId)}`, {
          password: pw,
          deactivated: false,
        });
      }
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
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
          <Box direction="Column" gap="700" style={{ padding: config.space.S400 }}>
            {error && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                {error}
              </Text>
            )}

            {/* ---- Registration tokens ---- */}
            <Box direction="Column" gap="300">
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
                  disabled={creatingToken}
                  before={
                    creatingToken ? <Spinner size="200" variant="Primary" fill="Solid" /> : undefined
                  }
                >
                  <Text size="B400">Create token</Text>
                </Button>
                <Button variant="Secondary" fill="Soft" size="400" radii="300" onClick={loadTokens}>
                  <Text size="B400">Refresh</Text>
                </Button>
              </Box>
              {tokensLoading ? (
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
                      <Chip variant="Secondary" radii="Pill" onClick={() => copyToClipboard(t.token)}>
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

            {/* ---- Users ---- */}
            <Box direction="Column" gap="300">
              <Box direction="Column" gap="100">
                <Text size="H4">Users</Text>
                <Text size="T200" priority="300">
                  Create accounts, reset passwords (incl. your own), and deactivate.
                </Text>
              </Box>
              <Box gap="200" alignItems="End" wrap="Wrap">
                <Box direction="Column" gap="100" style={{ maxWidth: 160 }}>
                  <Text size="L400">Username</Text>
                  <Input
                    value={newLocalpart}
                    onChange={(evt) => setNewLocalpart(evt.currentTarget.value)}
                    size="400"
                    placeholder="alice"
                  />
                </Box>
                <Box direction="Column" gap="100" style={{ maxWidth: 180 }}>
                  <Text size="L400">Password</Text>
                  <Input
                    value={newPassword}
                    onChange={(evt) => setNewPassword(evt.currentTarget.value)}
                    type="password"
                    size="400"
                  />
                </Box>
                <Chip
                  variant={newAdmin ? 'Primary' : 'Secondary'}
                  radii="Pill"
                  onClick={() => setNewAdmin((v) => !v)}
                >
                  <Text size="B300">{newAdmin ? 'Admin ✓' : 'Make admin'}</Text>
                </Chip>
                <Button
                  variant="Primary"
                  size="400"
                  radii="300"
                  onClick={createUser}
                  disabled={busy}
                  before={busy ? <Spinner size="200" variant="Primary" fill="Solid" /> : undefined}
                >
                  <Text size="B400">Create user</Text>
                </Button>
                <Button variant="Secondary" fill="Soft" size="400" radii="300" onClick={loadUsers}>
                  <Text size="B400">Refresh</Text>
                </Button>
              </Box>
              {usersLoading ? (
                <Spinner size="400" />
              ) : (
                <Box direction="Column" gap="200">
                  {users.map((u) => (
                    <Box
                      key={u.name}
                      alignItems="Center"
                      gap="200"
                      style={{
                        padding: config.space.S200,
                        borderRadius: config.radii.R400,
                        backgroundColor: color.SurfaceVariant.Container,
                      }}
                    >
                      <Box grow="Yes" direction="Column">
                        <Text size="T300">
                          {u.name}
                          {u.admin ? '  · admin' : ''}
                          {u.deactivated ? '  · deactivated' : ''}
                        </Text>
                        {u.displayname && (
                          <Text size="T200" priority="300">
                            {u.displayname}
                          </Text>
                        )}
                      </Box>
                      <Chip variant="Secondary" radii="Pill" onClick={() => resetPassword(u.name)}>
                        <Text size="B300">Reset password</Text>
                      </Chip>
                      <Chip
                        variant={u.deactivated ? 'Success' : 'Critical'}
                        radii="Pill"
                        onClick={() => setDeactivated(u.name, !u.deactivated)}
                      >
                        <Text size="B300">{u.deactivated ? 'Reactivate' : 'Deactivate'}</Text>
                      </Chip>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </Scroll>
      </Box>
    </Box>
  );
}
