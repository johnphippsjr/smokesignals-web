// smokesignals §8.2 CI guard — asserts the §9.1 verification-enforcement controls are
// present on EVERY build. Each control is checked INDEPENDENTLY because an upstream rebase
// could preserve one while silently resetting another. Wired into `npm run build`, so the
// Docker image cannot be produced with any control missing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const initMatrix = read('src/client/initMatrix.ts');
const identityHook = read('src/app/hooks/useRoomIdentityViolations.ts');
const roomView = read('src/app/features/room/RoomView.tsx');
const callDriver = read('src/app/plugins/call/CallWidgetDriver.ts');

const checks = [
  // §9.1 (1)(2) — hard key-withholding, both directions, in initMatrix.ts
  {
    name: '§9.1 OUTBOUND  globalBlacklistUnverifiedDevices = true (never key un-cross-signed devices)',
    src: initMatrix,
    re: /globalBlacklistUnverifiedDevices\s*=\s*true/,
  },
  {
    name: '§9.1 INBOUND   setDeviceIsolationMode(new OnlySignedDevicesIsolationMode())',
    src: initMatrix,
    re: /setDeviceIsolationMode\(\s*new\s+OnlySignedDevicesIsolationMode\(\s*\)\s*\)/,
  },
  // §9.1.7 — identity-change HARD-BLOCK (not a soft pill)
  {
    name: '§9.1.7 detection  useRoomIdentityViolations reads UserVerificationStatus.needsUserApproval',
    src: identityHook,
    re: /getUserVerificationStatus\([^)]*\)[\s\S]*?needsUserApproval/,
  },
  {
    name: '§9.1.7 hard-block  RoomView gates the composer on identityViolations',
    src: roomView,
    re: /useRoomIdentityViolations\(/,
  },
  {
    name: '§9.1.7 hard-block  RoomView renders RoomIdentityBlock when violations exist',
    src: roomView,
    re: /identityViolations\.length\s*>\s*0[\s\S]*?<RoomIdentityBlock/,
  },
  // §9.4 — call media keys governed by §9.1 (filter to-device recipients to cross-signed devices)
  {
    name: '§9.4 voice     CallWidgetDriver imports verifiedDevice (recipient filter helper)',
    src: callDriver,
    re: /import\s*\{\s*verifiedDevice\s*\}\s*from/,
  },
  {
    name: '§9.4 voice     encrypted sendToDevice filters recipients to cross-signed devices',
    src: callDriver,
    re: /verifiedDevice\(crypto[\s\S]*?filteredMap/,
  },
];

let ok = true;
for (const c of checks) {
  if (c.re.test(c.src)) console.log('  OK    ', c.name);
  else {
    console.error('  FAIL  ', c.name);
    ok = false;
  }
}

if (!ok) {
  console.error(
    '\n§9.1 crypto-policy guard FAILED — a verification-enforcement control is missing or\n' +
      'altered. Refusing to build. Restore the controls (see smokesignals plan §9.1 / §9.1.7).'
  );
  process.exit(1);
}
console.log('\n§9.1 crypto-policy guard passed (hard key-withholding + identity-change hard-block in force).');
