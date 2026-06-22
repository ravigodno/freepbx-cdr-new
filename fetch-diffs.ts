import http from 'https';
import fs from 'fs';
import path from 'path';

function fetchUrl(url: string, isJson: boolean = false): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (AI Studio Agent; Diffs tool)'
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
            reject(new Error(`Failed parsing JSON: ${e}`));
          }
        } else {
          resolve(data);
        }
      });
    }).on('error', (err) => { reject(err); });
  });
}

async function main() {
  console.log("Analyzing remote files...");
  
  // Get tree
  const treeUrl = "https://api.github.com/repos/ravigodno/freepbx-cdr-new/git/trees/main?recursive=1";
  const treeResponse = await fetchUrl(treeUrl, true);
  if (!treeResponse || !Array.isArray(treeResponse.tree)) {
    throw new Error("Failed to load GitHub tree");
  }

  const blobs = treeResponse.tree.filter((item: any) => item.type === 'blob');
  console.log(`Remote repo has ${blobs.length} files.`);

  for (const blob of blobs) {
    const filePath = blob.path;
    if (filePath.startsWith('.') && filePath !== '.gitignore' && filePath !== '.env.example') continue;
    if (filePath.includes('.bak')) continue;
    if (filePath === 'package-lock.json') continue;
    if (filePath.startsWith('setup/')) continue;

    const localPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(localPath)) {
      console.log(`[EXTRA REMOTE FILE] ${filePath} does not exist locally.`);
      continue;
    }

    const localContent = fs.readFileSync(localPath, 'utf8');
    const remoteDownloadUrl = `https://raw.githubusercontent.com/ravigodno/freepbx-cdr-new/main/${filePath}`;
    const remoteContent = await fetchUrl(remoteDownloadUrl, false);

    if (localContent === remoteContent) {
      // Identical
    } else {
      console.log(`[DIFFERENT] ${filePath} - Local len: ${localContent.length}, Remote len: ${remoteContent.length}`);
    }
  }
}

main().catch(console.error);
