const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const BASE_URL = 'https://cloud.telegram.org';

function getToken() {
  const tok = process.env.TGCLOUD_TOKEN || process.env.TGCLOUD_APP_TOKEN || '';
  if (!tok) {
    throw new Error('Missing TGCLOUD_TOKEN / TGCLOUD_APP_TOKEN');
  }
  return tok.trim();
}

function getAppId(token) {
  return token.split(':')[0];
}

let cachedSources = null;
let cachedSourcesAt = 0;

async function getCloudSources(token, force = false) {
  const now = Date.now();
  if (cachedSources && !force && now - cachedSourcesAt < 180000) {
    return cachedSources;
  }
  const appId = getAppId(token);
  const res = await fetch(`${BASE_URL}/${appId}/manage/get`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (!data || !data.ok || !data.result || !data.result.canonical_modules) {
    throw new Error('Failed to fetch canonical_modules from tgcloud');
  }
  cachedSources = data.result.canonical_modules;
  cachedSourcesAt = now;
  return cachedSources;
}

async function callPollEndpoint(token, args) {
  const appId = getAppId(token);
  const sources = await getCloudSources(token);
  const res = await fetch(`${BASE_URL}/${appId}/manage/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      module: 'endpoints/poll',
      sources,
      args,
      ctx: { initData: { user: { id: 5597944494 } } },
    }),
  });
  const data = await res.json();
  if (!data || !data.ok) {
    cachedSources = null;
    throw new Error((data && data.description) || 'tgcloud /run failed');
  }
  return data.result && data.result.result;
}

function packSessionsToB64() {
  if (!fs.existsSync(SESSIONS_DIR)) return '';
  const filesMap = {};
  const dirs = fs.readdirSync(SESSIONS_DIR);
  for (const dir of dirs) {
    const dirPath = path.join(SESSIONS_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    const files = fs.readdirSync(dirPath);
    for (const f of files) {
      const fPath = path.join(dirPath, f);
      if (fs.statSync(fPath).isFile()) {
        filesMap[`${dir}/${f}`] = fs.readFileSync(fPath).toString('base64');
      }
    }
  }
  if (Object.keys(filesMap).length === 0) return '';
  return Buffer.from(JSON.stringify(filesMap), 'utf8').toString('base64');
}

function unpackB64ToSessions(b64Str) {
  if (!b64Str) return 0;
  const jsonStr = Buffer.from(b64Str, 'base64').toString('utf8');
  const filesMap = JSON.parse(jsonStr);
  let count = 0;
  for (const [relPath, fileB64] of Object.entries(filesMap)) {
    const fullPath = path.join(SESSIONS_DIR, ...relPath.split('/'));
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, Buffer.from(fileB64, 'base64'));
    count++;
  }
  return count;
}

async function main() {
  const cmd = process.argv[2] || 'daemon';
  const token = getToken();

  if (cmd === 'push') {
    const b64 = packSessionsToB64();
    if (!b64) {
      console.log('No sessions to push.');
      return;
    }
    await callPollEndpoint(token, { save_wa_sessions_b64: b64, skip_poll: true });
    console.log(`Pushed sessions backup (${b64.length} chars) to tgcloud.`);
    return;
  }

  if (cmd === 'pull') {
    const res = await callPollEndpoint(token, { get_wa_sessions_b64: true });
    const b64 = (res && res.wa_sessions_b64) || '';
    if (!b64) {
      console.log('No sessions backup found in tgcloud.');
      return;
    }
    const count = unpackB64ToSessions(b64);
    console.log(`Restored ${count} session files from tgcloud.`);
    return;
  }

  if (cmd === 'set_url') {
    const url = process.argv[3] || '';
    if (!url) throw new Error('Missing URL');
    await callPollEndpoint(token, { wa_service_url: url, skip_poll: true });
    console.log(`Updated wa_service_url to ${url}`);
    return;
  }

  if (cmd === 'daemon') {
    const urlFile = process.argv[3] || '';
    const maxMinutes = Number(process.env.MAX_RUN_MINUTES || 330); // default 5.5 hours
    const startTime = Date.now();
    let lastSyncedUrl = '';
    let lastBackupHash = '';
    let lastBackupAt = 0;

    console.log(`Starting Cloud Poller & WA Sync Daemon (max ${maxMinutes} mins)...`);
    while ((Date.now() - startTime) < maxMinutes * 60 * 1000) {
      try {
        let currentUrl = '';
        if (urlFile && fs.existsSync(urlFile)) {
          const logContent = fs.readFileSync(urlFile, 'utf8');
          const cfMatches = logContent.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
          const lhrMatches = logContent.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/g);
          if (cfMatches && cfMatches.length > 0) {
            currentUrl = cfMatches[cfMatches.length - 1];
          } else if (lhrMatches && lhrMatches.length > 0) {
            currentUrl = lhrMatches[lhrMatches.length - 1];
          }
        }

        const pollArgs = { ticks: 10, intervalMs: 2000 };
        if (currentUrl && currentUrl !== lastSyncedUrl) {
          pollArgs.wa_service_url = currentUrl;
          lastSyncedUrl = currentUrl;
          console.log(`[CloudSync] Syncing tunnel URL: ${currentUrl}`);
        }

        // Periodically backup wa_service/sessions every 45s if changed
        if (Date.now() - lastBackupAt > 45000) {
          lastBackupAt = Date.now();
          const b64 = packSessionsToB64();
          if (b64 && b64 !== lastBackupHash) {
            pollArgs.save_wa_sessions_b64 = b64;
            lastBackupHash = b64;
            console.log(`[CloudSync] Backed up WA sessions (${b64.length} chars)`);
          }
        }

        await callPollEndpoint(token, pollArgs);
      } catch (err) {
        console.error('[CloudSync] Poll cycle error:', err.message);
        await new Promise((r) => setTimeout(r, 2000));
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Final backup before exiting
    try {
      const b64 = packSessionsToB64();
      if (b64) {
        await callPollEndpoint(token, { save_wa_sessions_b64: b64, skip_poll: true });
      }
    } catch {}
    console.log('Daemon cycle finished cleanly.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
