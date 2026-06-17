import http from 'https';

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    }).on('error', (err) => { reject(err); });
  });
}

async function main() {
  const code = await fetchUrl('https://raw.githubusercontent.com/ravigodno/freepbx-cdr-new/main/server.ts');
  const lines = code.split('\n');
  console.log("Remote server.ts exact live-sessions fetching:");
  const idx = lines.findIndex(l => l.includes("app.get('/api/live-sessions'"));
  if (idx !== -1) {
    for (let i = idx + 8; i < idx + 30; i++) {
      if (lines[i] !== undefined) console.log(`${i+1}: ${lines[i]}`);
    }
  } else {
    console.log("Could not find endpoint");
  }
}

main().catch(console.error);
