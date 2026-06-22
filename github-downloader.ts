import http from 'https';
import fs from 'fs';
import path from 'path';

function fetchUrl(url: string, isJson: boolean = false): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (AI Studio Agent; Downloader)'
      }
    };
    http.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (isJson) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed parsing JSON from ${url}: ${e}`));
          }
        } else {
          resolve(data);
        }
      });
    }).on('error', (err) => { reject(err); });
  });
}

async function main() {
  console.log("=== STARTING DOWNLOAD OF ALL GITHUB UPDATES ===");
  
  // Get tree
  const treeUrl = "https://api.github.com/repos/ravigodno/freepbx-cdr-new/git/trees/main?recursive=1";
  const treeResponse = await fetchUrl(treeUrl, true);
  if (!treeResponse || !Array.isArray(treeResponse.tree)) {
    throw new Error("Failed to load GitHub tree recursive listing.");
  }

  const blobs = treeResponse.tree.filter((item: any) => item.type === 'blob');
  console.log(`Discovered ${blobs.length} remote blob files.`);

  for (const blob of blobs) {
    const filePath = blob.path;
    if (filePath.startsWith('.') && filePath !== '.gitignore' && filePath !== '.env.example') continue;
    if (filePath.includes('.bak')) continue;
    if (filePath === 'package-lock.json') continue;
    if (filePath.startsWith('setup/')) continue;
    if (filePath === 'install.sh') continue; // Skip install.sh script

    console.log(`Downloading remote: ${filePath}...`);
    const downloadUrl = `https://raw.githubusercontent.com/ravigodno/freepbx-cdr-new/main/${filePath}`;
    const remoteContent = await fetchUrl(downloadUrl, false);

    let localTargetPath = path.join(process.cwd(), filePath);
    
    // For App.tsx and server.ts, save them as .remote first so we can do a precision merge!
    if (filePath === 'src/App.tsx') {
      localTargetPath = path.join(process.cwd(), 'src/App.tsx.remote');
      console.log(`[Special Handled Key File] Saved as ${localTargetPath}`);
    } else if (filePath === 'server.ts') {
      localTargetPath = path.join(process.cwd(), 'server.ts.remote');
      console.log(`[Special Handled Key File] Saved as ${localTargetPath}`);
    } else if (filePath === 'src/types.ts') {
      localTargetPath = path.join(process.cwd(), 'src/types.ts.remote');
      console.log(`[Special Handled Key File] Saved as ${localTargetPath}`);
    }

    const parentDir = path.dirname(localTargetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(localTargetPath, remoteContent, 'utf8');
  }

  console.log("=== DOWNLOAD COMPLETE ===");
}

main().catch(console.error);
