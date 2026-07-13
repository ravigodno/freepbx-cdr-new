import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--apply') && args.has('--dry-run')) {
    throw new Error('Use either --dry-run or --apply, not both');
  }

  const dryRun = !args.has('--apply');
  const { runMonitoringRetention } = await import('../server/monitoringRetention.js');
  const result = await runMonitoringRetention({ dryRun });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  const message = String(error?.message || error)
    .replace(/(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=********');
  console.error(message);
  process.exitCode = 1;
});
