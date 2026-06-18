import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Icon,
  IconButton,
  Icons,
  Input,
  Scroll,
  Spinner,
  Switch,
  Text,
  color,
  config,
} from 'folds';
import { Method } from 'matrix-js-sdk';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { copyToClipboard } from '../../../utils/dom';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';

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

  const [tokens, setTokens] = useState<RegistrationToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [uses, setUses] = useState('10');
  const [creatingToken, setCreatingToken] = useState(false);

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
    if (deactivate) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Deactivate ${userId}? They will be logged out.`)) return;
      try {
        await req(Method.Post, `/v1/deactivate/${encodeURIComponent(userId)}`, { erase: false });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to deactivate');
        return;
      }
    } else {
      // eslint-disable-next-line no-alert
      const pw = window.prompt(`Set a password to reactivate ${userId}:`);
      if (!pw) return;
      try {
        await req(Method.Put, `/v2/users/${encodeURIComponent(userId)}`, {
          password: pw,
          deactivated: false,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to reactivate');
        return;
      }
    }
    await loadUsers();
  };

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Admin
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              {error && (
                <Text size="T200" style={{ color: color.Critical.Main }}>
                  {error}
                </Text>
              )}

              {/* ---- Registration tokens ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Registration tokens (invites)</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Create invite token"
                    description="Share a token to let someone register — it's the only way to sign up."
                    after={
                      <Box gap="200" alignItems="Center">
                        <Input
                          value={uses}
                          onChange={(evt) => setUses(evt.currentTarget.value)}
                          type="number"
                          size="300"
                          style={{ maxWidth: 72 }}
                        />
                        <Button
                          variant="Primary"
                          size="300"
                          radii="300"
                          onClick={createToken}
                          disabled={creatingToken}
                          before={
                            creatingToken ? (
                              <Spinner size="100" variant="Primary" fill="Solid" />
                            ) : undefined
                          }
                        >
                          <Text size="B300">Create</Text>
                        </Button>
                      </Box>
                    }
                  />
                </SequenceCard>

                {tokensLoading ? (
                  <Spinner size="400" />
                ) : (
                  tokens.map((t) => (
                    <SequenceCard
                      key={t.token}
                      className={SequenceCardStyle}
                      variant="SurfaceVariant"
                      direction="Column"
                    >
                      <SettingTile
                        title={
                          <Text size="T300" style={{ fontFamily: 'monospace' }}>
                            {t.token}
                          </Text>
                        }
                        description={`used ${t.completed}${
                          t.uses_allowed != null ? `/${t.uses_allowed}` : ' (unlimited)'
                        }${
                          t.expiry_time
                            ? ` · expires ${new Date(t.expiry_time).toLocaleDateString()}`
                            : ''
                        }`}
                        after={
                          <Box gap="200" alignItems="Center">
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
                              <Icon src={Icons.Delete} size="100" />
                            </IconButton>
                          </Box>
                        }
                      />
                    </SequenceCard>
                  ))
                )}
              </Box>

              {/* ---- Users ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Users</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Create user"
                    description="Add an account directly (or send an invite token instead)."
                  />
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
                    <Box alignItems="Center" gap="200" style={{ height: 38 }}>
                      <Text size="T200">Admin</Text>
                      <Switch variant="Primary" value={newAdmin} onChange={setNewAdmin} />
                    </Box>
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
                  </Box>
                </SequenceCard>

                {usersLoading ? (
                  <Spinner size="400" />
                ) : (
                  users.map((u) => (
                    <SequenceCard
                      key={u.name}
                      className={SequenceCardStyle}
                      variant="SurfaceVariant"
                      direction="Column"
                    >
                      <SettingTile
                        title={
                          <Box gap="200" alignItems="Center">
                            <Text size="T300">{u.name}</Text>
                            {!!u.admin && (
                              <Chip variant="Primary" radii="Pill" as="span">
                                <Text size="B300">admin</Text>
                              </Chip>
                            )}
                            {!!u.deactivated && (
                              <Chip variant="Critical" radii="Pill" as="span">
                                <Text size="B300">deactivated</Text>
                              </Chip>
                            )}
                          </Box>
                        }
                        description={u.displayname || undefined}
                        after={
                          <Box gap="200" alignItems="Center">
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
                        }
                      />
                    </SequenceCard>
                  ))
                )}
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
