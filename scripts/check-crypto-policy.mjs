// smokesignals §8.2 CI guard — asserts the §9.1 verification-enforcement controls are
// present in src/client/initMatrix.ts on EVERY build. Both are checked INDEPENDENTLY
// because they cover opposite directions (inbound vs outbound) and an upstream rebase
// could preserve one while silently resetting the other. Wired into `npm run build`,
// so the Docker image cannot be produced without both controls in force.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'client', 'initMatrix.ts');
const src = readFileSync(target, 'utf8');

const checks = [
  {
    name: 'OUTBOUND  globalBlacklistUnverifiedDevices = true (never key un-cross-signed devices)',
    re: /globalBlacklistUnverifiedDevices\s*=\s*true/,
  },
  {
    name: 'INBOUND   setDeviceIsolationMode(new OnlySignedDevicesIsolationMode())',
    re: /setDeviceIsolationMode\(\s*new\s+OnlySignedDevicesIsolationMode\(\s*\)\s*\)/,
  },
];

let ok = true;
for (const c of checks) {
  if (c.re.test(src)) console.log('  OK    ', c.name);
  else {
    console.error('  FAIL  ', c.name);
    ok = false;
  }
}

if (!ok) {
  console.error(
    '\n§9.1 crypto-policy guard FAILED — verification enforcement missing or altered in\n' +
      `  ${target}\nRefusing to build. Restore both controls (see smokesignals plan §9.1).`
  );
  process.exit(1);
}
console.log('\n§9.1 crypto-policy guard passed (hard key-withholding in force).');
