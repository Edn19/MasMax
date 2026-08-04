import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['audit', '--omit=dev', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (!result.stdout?.trim()) {
  console.error(result.stderr || 'npm audit no devolvio un informe JSON');
  process.exit(1);
}
const report = JSON.parse(result.stdout);
if (report.error || !report.metadata?.vulnerabilities) {
  console.error(report.error?.summary || report.error?.detail || 'npm audit devolvio un informe incompleto');
  process.exit(1);
}
const policy = JSON.parse(readFileSync('security/audit-allowlist.json', 'utf8'));
const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 };
const today = new Date().toISOString().slice(0, 10);
const blocking = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  const severity = vulnerability.severity;
  if ((severityRank[severity] ?? 0) < severityRank.high) continue;
  const exception = policy.exceptions.find((entry) => entry.package === name && entry.expires >= today && severityRank[severity] <= severityRank[entry.maximumSeverity]);
  if (!exception) blocking.push(`${name}: ${severity}`);
  else console.warn(`Excepcion temporal: ${name} (${severity}) hasta ${exception.expires}. ${exception.reason}`);
}
console.log(`npm audit runtime: ${report.metadata?.vulnerabilities?.total ?? 0} avisos; ${blocking.length} altos/criticos sin excepcion.`);
if (blocking.length) { console.error(blocking.join('\n')); process.exit(1); }
