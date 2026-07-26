#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const dbFile = path.join(projectRoot, 'data', 'db.json');
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const intervals = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

function log(event, details = {}) {
  process.stdout.write(`${new Date().toISOString()} ${event} ${JSON.stringify(details)}\n`);
}

function readSettings() {
  const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  return data.settings || {};
}

function isDue(settings, now = Date.now()) {
  if (settings.directoryImportEnabled === false) return { due: false, reason: 'disabled' };
  if (!String(settings.directoryImportUrl || '').trim()) return { due: false, reason: 'url_missing' };
  const schedule = String(settings.directoryImportSchedule || 'manual');
  const interval = intervals[schedule];
  if (!interval) return { due: false, reason: 'manual', schedule };
  const lastAt = Date.parse(String(settings.directoryLastSyncAt || ''));
  if (!Number.isFinite(lastAt)) return { due: true, reason: 'never_run', schedule };
  return {
    due: now - lastAt >= interval,
    reason: now - lastAt >= interval ? 'interval_elapsed' : 'not_due',
    schedule,
    nextAt: new Date(lastAt + interval).toISOString()
  };
}

function runSync(settings) {
  return new Promise((resolve, reject) => {
    const token = String(settings.directorySyncToken || '');
    if (!token) {
      reject(new Error('sync_token_missing'));
      return;
    }
    const request = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/directory/sync-url',
      method: 'POST',
      headers: {
        'X-Sync-Token': token,
        'Content-Length': '0'
      },
      timeout: 24 * 60 * 60 * 1000
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        if (body.length < 16_384) body += chunk;
      });
      response.on('end', () => {
        if ((response.statusCode || 500) >= 200 && (response.statusCode || 500) < 300) {
          resolve({ statusCode: response.statusCode });
          return;
        }
        reject(new Error(`sync_http_${response.statusCode || 500}`));
      });
    });
    request.on('timeout', () => request.destroy(new Error('sync_timeout')));
    request.on('error', reject);
    request.end();
  });
}

async function main() {
  const settings = readSettings();
  const decision = isDue(settings);
  if ((!decision.due && !force) || dryRun) {
    log(dryRun ? 'directory_url_sync_dry_run' : 'directory_url_sync_skipped', decision);
    return;
  }
  log('directory_url_sync_started', { schedule: decision.schedule, reason: force ? 'manual_force' : decision.reason });
  const result = await runSync(settings);
  log('directory_url_sync_completed', result);
}

main().catch(error => {
  log('directory_url_sync_failed', { errorCode: String(error?.message || 'unknown_error').slice(0, 160) });
  process.exitCode = 1;
});
