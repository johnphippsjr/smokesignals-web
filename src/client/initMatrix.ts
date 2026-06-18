import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';
import { OnlySignedDevicesIsolationMode } from 'matrix-js-sdk/lib/crypto-api';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { pushSessionToSW } from '../sw-session';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: 'web-sync-store',
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });

  await indexedDBStore.startup();
  await mx.initRustCrypto();

  // smokesignals §9.1 — verification enforcement (hard key-withholding). TWO INDEPENDENT
  // controls so a malicious/compromised homeserver cannot read content by injecting an
  // un-cross-signed device. Asserted by scripts/check-crypto-policy.mjs (CI guard).
  // DO NOT weaken to warn-only — this is the load-bearing confidentiality control.
  const crypto = mx.getCrypto();
  if (crypto) {
    // OUTBOUND: never share room (Megolm) keys with devices that are not cross-signed.
    crypto.globalBlacklistUnverifiedDevices = true;
    // INBOUND: only decrypt events from cross-signed devices; events from unsigned devices
    // fail to decrypt and are surfaced as untrusted (never silently rendered as trusted).
    crypto.setDeviceIsolationMode(new OnlySignedDevicesIsolationMode());
  }

  mx.setMaxListeners(50);

  return mx;
};

export const startClient = async (mx: MatrixClient) => {
  await mx.startClient({
    lazyLoadMembers: true,
  });
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  mx.stopClient();
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  await mx.clearStores();
  window.localStorage.clear();
  window.location.reload();
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};
