// Compare known server secrets in memory; never print their values.
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const names = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'HUBSTAFF_TOKEN_ENCRYPTION_KEY',
  'HUBSTAFF_ACCESS_TOKEN', 'HUBSTAFF_PAT_REFRESH_TOKEN', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
  'CHATKIT_BACKEND_SECRET', 'CHATKIT_VERCEL_PROTECTION_BYPASS'];
const secrets = names.map(name => process.env[name]?.trim()).filter(value => value && value.length >= 16);
const source = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(path => /\.(?:js|mjs|jsx|json|md|sql|py|css)$/.test(path));
async function files(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await files(path));
    else if (/\.(?:js|map|html)$/.test(entry.name)) found.push(path);
  }
  return found;
}
try {
  if (!secrets.length) throw new Error();
  const bundles = await files('.next/static');
  for (const path of [...source, ...bundles]) {
    const content = await readFile(path, 'utf8');
    if (secrets.some(secret => content.includes(secret))) throw new Error();
  }
  console.log('Secret scan passed: no configured server-secret values found in tracked/new source or built browser assets. Values were not printed.');
} catch {
  console.error('Secret scan failed or build/configuration is missing. No secret values were printed.');
  process.exitCode = 1;
}
