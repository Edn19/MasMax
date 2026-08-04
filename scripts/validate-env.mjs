import { readFileSync } from 'node:fs';

const example = readFileSync('.env.example', 'utf8');
const compose = readFileSync('docker-compose.yml', 'utf8');
const names = example.split(/\r?\n/).map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean);
const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_REFRESH_COOKIE_MAX_AGE_MS', 'MEDIA_SIGNING_SECRET', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'BACKUP_DIR'];
const removedUntilImplemented = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'EMAIL_VERIFICATION_REQUIRED', 'EMAIL_VERIFICATION_EXPIRES_HOURS', 'AUTOPLAY_NEXT_EPISODE_SECONDS'];
const errors = [];

if (duplicates.length) errors.push(`Variables duplicadas: ${[...new Set(duplicates)].join(', ')}`);
for (const name of required) if (!names.includes(name)) errors.push(`Falta ${name} en .env.example`);
for (const name of removedUntilImplemented) if (names.includes(name)) errors.push(`${name} esta documentada pero no tiene consumidor`);
if (!compose.includes('JWT_REFRESH_COOKIE_MAX_AGE_MS: ${JWT_REFRESH_COOKIE_MAX_AGE_MS')) errors.push('Compose no propaga JWT_REFRESH_COOKIE_MAX_AGE_MS');
for (const name of names.filter((name) => name.startsWith('VITE_'))) {
  if (/(SECRET|PASSWORD|TOKEN|ACCESS_KEY)/.test(name)) errors.push(`${name} no puede ser un secreto porque Vite la hace publica`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Inventario de entorno valido: ${names.length} variables documentadas.`);
