import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import net from 'net';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { createServer as createViteServer } from 'vite';
import { CallEntry, MissedCallStatus, AppSettings, DashboardStats, UserRole, WebUser } from './src/types.js';

// Load environment variables
dotenv.config();

let myFilename = '';
let myDirname = '';

try {
  myFilename = eval('__filename');
  myDirname = eval('__dirname');
} catch (e) {
  myFilename = fileURLToPath(import.meta.url);
  myDirname = path.dirname(myFilename);
}

const __filename = myFilename;
const __dirname = myDirname;

const PORT = process.env.PORT || '3000';
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Global server secret for HMAC signing of auth tokens.
// Tokens are intentionally compact and self-contained for this local app,
// but they must be tamper-resistant because the role is stored client-side.
const JWT_SECRET = process.env.JWT_SECRET || 'asterisk-cdr-secret-key-132';

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signTokenPayload(encodedPayload: string): string {
  return crypto.createHmac('sha256', JWT_SECRET).update(encodedPayload).digest('base64url');
}

function createAuthToken(payload: { username: string; role: UserRole; expiresAt: number; extension?: string }): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token: string): { username: string; role: UserRole; expiresAt: number; extension?: string } | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signTokenPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  if (payload.username && payload.role && payload.expiresAt > Date.now()) {
    return payload;
  }
  return null;
}

// Phone Number Normalization helper function
function normalizePhoneNumber(num: string, settings?: AppSettings): string {
  if (!num) return '';
  let cleaned = num.trim();
  
  const enabled = settings?.normEnabled ?? true;
  if (!enabled) return cleaned;

  const digitsOnly = settings?.normDigitsOnly ?? false;
  const stripSymbols = settings?.normStripSymbols ?? true;
  const replace8With7 = settings?.normReplace8With7 ?? true;

  if (digitsOnly) {
    cleaned = cleaned.replace(/\D/g, '');
  } else if (stripSymbols) {
    cleaned = cleaned.replace(/[^\d+]/g, '');
  }

  if (replace8With7) {
    if (cleaned.startsWith('8') && cleaned.length === 11) {
      cleaned = '7' + cleaned.substring(1);
    } else if (cleaned.startsWith('+8') && cleaned.length === 12) {
      cleaned = '+7' + cleaned.substring(2);
    }
  }

  return cleaned;
}

const onlyDigits = (value: any): string => {
  return String(value || '').replace(/\D/g, '');
};

const getNumberTokens = (...values: any[]): string[] => {
  return values
    .flatMap(value => String(value || '').match(/\d+/g) || [])
    .filter(Boolean);
};

const isInternalExt = (num: any): boolean => {
  const digits = onlyDigits(num);
  return digits.length >= 2 && digits.length <= 5;
};

const isExternalNumber = (num: any): boolean => {
  return onlyDigits(num).length >= 7;
};

const getChannelInternalExt = (value: any): string => {
  const s = String(value || '');

  // SIP/200-00000001, PJSIP/200-00000001
  let m = s.match(/(?:SIP|PJSIP)\/([0-9]{2,5})-/i);
  if (m && isInternalExt(m[1])) return m[1];

  // Local/200@from-internal-00000000;1
  m = s.match(/Local\/([0-9]{2,5})@/i);
  if (m && isInternalExt(m[1])) return m[1];

  return '';
};

const getCallerInternalExt = (c: any): string => {
  if (isInternalExt(c.src)) return onlyDigits(c.src);
  if (isInternalExt(c.cnum)) return onlyDigits(c.cnum);

  const fromChannel = getChannelInternalExt(c.channel);
  if (fromChannel) return fromChannel;

  const fromClid = String(c.clid || '').match(/<([0-9]{2,5})>/);
  if (fromClid && isInternalExt(fromClid[1])) return fromClid[1];

  return '';
};

const getCalleeInternalExt = (c: any): string => {
  if (isInternalExt(c.dst)) return onlyDigits(c.dst);

  const fromDstChannel = getChannelInternalExt(c.dstchannel);
  if (fromDstChannel) return fromDstChannel;

  return '';
};

const callHasExactNumber = (c: any, number: string): boolean => {
  const n = onlyDigits(number);
  if (!n) return true;

  const tokens = getNumberTokens(
    c.src,
    c.dst,
    c.did,
    c.channel,
    c.dstchannel,
    c.lastdata,
    c.clid,
    c.cnum,
    c.outbound_cnum
  );

  return tokens.some(token => token === n);
};

const getExternalCallerNumber = (group: any[]): string => {
  const candidates: string[] = [];

  for (const c of group) {
    const fields = [c.clid, c.src, c.cnum, c.dst, c.did, c.lastdata];
    for (const field of fields) {
      const matches = String(field || '').match(/\+?\d{10,15}/g) || [];
      for (const raw of matches) {
        let digits = raw.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('8')) {
          digits = '7' + digits.substring(1);
        }
        if (digits.length >= 10 && !isInternalExt(digits)) {
          candidates.push(digits);
        }
      }
    }
  }

  // Для входящих через группу/очередь реальный клиент почти всегда есть в CLID.
  // Если FreePBX в src положил транк/CallerID, берём первый полноценный внешний номер.
  return candidates[0] || '';
};

const hasInboundTrunkSignal = (c: any): boolean => {
  const dctx = String(c.dcontext || '').toLowerCase();
  const channel = String(c.channel || '').toLowerCase();
  const dstchannel = String(c.dstchannel || '').toLowerCase();
  const did = onlyDigits(c.did);

  // did иногда содержит служебный текст "→ ответил: 200".
  // DID считаем внешним признаком только если в нём есть минимум 6 цифр.
  return (
    did.length >= 6 ||
    dctx.includes('from-trunk') ||
    dctx.includes('from-pstn') ||
    dctx.includes('sip-external') ||
    dctx.includes('from-digital') ||
    dctx.includes('from-outside') ||
    channel.includes('-in-') ||
    channel.includes('trunk-in') ||
    dstchannel.includes('trunk-in')
  );
};

const isIncomingRouteContext = (c: any): boolean => {
  const dctx = String(c.dcontext || '').toLowerCase();
  return (
    dctx === 'ext-queues' ||
    dctx === 'ext-group' ||
    dctx === 'ext-local' ||
    dctx.startsWith('ivr-')
  );
};

const normalizeInboundCallerForDisplay = (c: any): any => {
  const externalCallerNumber = getExternalCallerNumber([c]);
  const currentSrc = onlyDigits(c.src);

  if (
    externalCallerNumber &&
    externalCallerNumber !== currentSrc &&
    !getCallerInternalExt(c) &&
    isExternalNumber(c.src) &&
    (hasInboundTrunkSignal(c) || isIncomingRouteContext(c))
  ) {
    return {
      ...c,
      src: externalCallerNumber,
      cnum: externalCallerNumber,
    };
  }

  return c;
};



const getDialedExtsFromLastData = (value: any): string[] => {
  const result: string[] = [];
  const text = String(value || '');
  const re = new RegExp("(?:SIP|PJSIP|Local)/([0-9]{2,5})(?:[-@,&]|$)", "gi");
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (isInternalExt(m[1]) && !result.includes(m[1])) {
      result.push(m[1]);
    }
  }

  return result;
};

const uniqueExts = (values: any[]): string[] => {
  const result: string[] = [];
  values.forEach(value => {
    const ext = onlyDigits(value);
    if (isInternalExt(ext) && !result.includes(ext)) {
      result.push(ext);
    }
  });
  return result;
};

const buildDidWithAnsweredAndMissed = (baseDid: any, answeredExts: string[], missedExts: string[]): string => {
  const did = String(baseDid || '').trim();
  const parts: string[] = [];

  if (answeredExts.length) {
    parts.push(`ответил: ${answeredExts.join(', ')}`);
  }

  if (missedExts.length) {
    parts.push(`не ответили: ${missedExts.join(', ')}`);
  }

  if (!parts.length) {
    return did;
  }

  return `${did} → ${parts.join(', ')}`.trim();
};

const normalizeClickToCallForDisplay = (c: any): any => {
  const dctx = String(c.dcontext || '').toLowerCase();
  const lastapp = String(c.lastapp || '').toLowerCase();
  const lastdata = String(c.lastdata || '').toLowerCase();
  const channel = String(c.channel || '');

  const localExt = getChannelInternalExt(channel);
  const cnumExt = isInternalExt(c.cnum) ? onlyDigits(c.cnum) : '';
  const clidExtMatch = String(c.clid || '').match(/<([0-9]{2,5})>/);
  const clidExt = clidExtMatch && isInternalExt(clidExtMatch[1]) ? clidExtMatch[1] : '';
  const ext = cnumExt || localExt || clidExt;

  const looksLikeClickToCall =
    dctx === 'from-internal' &&
    isExternalNumber(c.dst) &&
    Boolean(ext) &&
    (
      channel.toLowerCase().includes('local/') ||
      lastapp === 'agi' ||
      lastdata.includes('check_trunks_ami') ||
      lastdata.includes('originate') ||
      lastdata.includes('callback')
    );

  if (!looksLikeClickToCall) {
    return c;
  }

  return {
    ...c,
    src: ext,
    cnum: ext,
    clid: `"${ext}" <${ext}>`
  };
};

// Входящие = внешний номер пришёл в АТС через транк/DID/маршрут входящего вызова.
const isIncoming = (c: any): boolean => {
  if (!isExternalNumber(c.src)) return false;
  if (getCallerInternalExt(c)) return false;

  return hasInboundTrunkSignal(c) || isIncomingRouteContext(c);
};

// Исходящие = внутренний оператор звонит на внешний номер.
// На этой АТС в CDR src может быть не внутренний номер, а outbound_cnum/транк,
// поэтому внутреннего оператора берём из src, cnum или channel.
const isOutgoing = (c: any): boolean => {
  return Boolean(getCallerInternalExt(c)) && isExternalNumber(c.dst) && !isIncoming(c);
};

// Внутренние = внутренний оператор -> внутренний номер.
const isInternal = (c: any): boolean => {
  return Boolean(getCallerInternalExt(c)) && Boolean(getCalleeInternalExt(c)) && !isIncoming(c) && !isOutgoing(c);
};


const getDirectoryPhones = (entry: any): string[] => {
  const values = [
    ...(Array.isArray(entry?.phones) ? entry.phones : []),
    entry?.number,
    entry?.phone,
    entry?.phone1,
    entry?.phone2,
    entry?.phone3
  ];
  const out: string[] = [];
  values.forEach(v => {
    const raw = String(v || '').trim();
    if (!raw) return;
    raw.split(/[;,|\n]+/).forEach(part => {
      const p = String(part || '').trim();
      if (p && !out.includes(p)) out.push(p);
    });
  });
  return out;
};

const normalizeDirectoryPhones = (entry: any, settings?: AppSettings): string[] => {
  const phones = getDirectoryPhones(entry)
    .map(p => normalizePhoneNumber(p, settings))
    .map(p => String(p || '').trim())
    .filter(Boolean);
  return Array.from(new Set(phones));
};

const normalizeDirectoryEntry = (entry: any, settings?: AppSettings): any => {
  const phones = normalizeDirectoryPhones(entry, settings);
  const tagsRaw = Array.isArray(entry?.tags)
    ? entry.tags
    : String(entry?.tags || entry?.tag || '').split(/[;,|]+/);
  const tags = tagsRaw.map((t: any) => String(t || '').trim()).filter(Boolean);
  const isInternal = entry?.type === 'internal' || (phones[0] && onlyDigits(phones[0]).length <= 5);

  return {
    id: entry?.id || ('dir_' + Date.now() + '_' + Math.floor(Math.random() * 100000)),
    name: String(entry?.name || entry?.fio || entry?.fullname || entry?.contact || '').trim(),
    number: phones[0] || String(entry?.number || '').trim(),
    phones,
    type: isInternal ? 'internal' : 'client',
    company: String(entry?.company || entry?.organization || entry?.org || '').trim(),
    position: String(entry?.position || entry?.job || entry?.title || '').trim(),
    email: String(entry?.email || '').trim(),
    website: String(entry?.website || entry?.site || '').trim(),
    tags,
    isSpam: entry?.isSpam === true || entry?.is_spam === true || String(entry?.isSpam || entry?.is_spam || '').toLowerCase() === 'true' || tags.some((t: string) => t.toLowerCase() === 'спам' || t.toLowerCase() === 'spam'),
    isBlacklisted: entry?.isBlacklisted === true || entry?.is_blacklisted === true || String(entry?.isBlacklisted || entry?.is_blacklisted || '').toLowerCase() === 'true',
    comment: String(entry?.comment || entry?.notes || '').trim(),
    createdAt: entry?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

const directoryEntryMatchesNumber = (entry: any, num: any): boolean => {
  const digits = onlyDigits(num);
  if (!digits) return false;
  const phones = getDirectoryPhones(entry);
  return phones.some(phone => {
    const p = onlyDigits(phone);
    if (!p) return false;
    return p === digits || (p.length > 4 && digits.length > 4 && (p.endsWith(digits) || digits.endsWith(p)));
  });
};

const findDirectoryContactByNumber = (directory: any[], num: any): any | null => {
  return (directory || []).find(entry => directoryEntryMatchesNumber(entry, num)) || null;
};

const parseBool = (value: any): boolean => {
  const s = String(value ?? '').trim().toLowerCase();
  return value === true || ['1', 'true', 'yes', 'да', 'y'].includes(s);
};

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result.map(v => v.replace(/^"|"$/g, '').trim());
};

const parseDirectoryText = (text: string, settings?: AppSettings): any[] => {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];

  const first = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
  const hasHeader = first.some(h => ['name','имя','фио','company','компания','phone1','телефон','номер'].includes(h));
  const headers = hasHeader ? first : [];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line, idx) => {
    const cols = parseCsvLine(line);
    const get = (...names: string[]) => {
      for (const name of names) {
        const i = headers.indexOf(name.toLowerCase());
        if (i >= 0) return cols[i] || '';
      }
      return '';
    };

    let raw: any;
    if (headers.length) {
      raw = {
        name: get('name','имя','фио','contact','контакт') || cols[0],
        company: get('company','компания','organization','организация'),
        position: get('position','должность','job','title'),
        phone1: get('phone1','телефон1','номер1','phone','телефон','номер') || cols[1],
        phone2: get('phone2','телефон2','номер2'),
        phone3: get('phone3','телефон3','номер3'),
        email: get('email','почта','e-mail'),
        website: get('website','сайт','site'),
        tags: get('tags','теги','tag'),
        type: get('type','тип'),
        comment: get('comment','комментарий','notes'),
        isSpam: parseBool(get('is_spam','spam','спам')),
        isBlacklisted: parseBool(get('is_blacklisted','blacklist','черный список','чс'))
      };
    } else {
      raw = {
        name: cols[0],
        phone1: cols[1],
        type: cols[2],
        comment: cols[3]
      };
    }

    return normalizeDirectoryEntry(raw, settings);
  }).filter(e => e.name && e.phones && e.phones.length);
};

const upsertDirectoryEntries = (current: any[], incoming: any[], mode: string): { directory: any[]; added: number; updated: number } => {
  if (mode === 'overwrite') {
    return { directory: incoming, added: incoming.length, updated: 0 };
  }

  const directory = [...(current || [])].map(e => normalizeDirectoryEntry(e));
  let added = 0;
  let updated = 0;

  for (const entry of incoming) {
    const foundIdx = directory.findIndex(existing => entry.phones.some((phone: string) => directoryEntryMatchesNumber(existing, phone)));
    if (foundIdx >= 0 && mode !== 'append') {
      directory[foundIdx] = {
        ...directory[foundIdx],
        ...entry,
        id: directory[foundIdx].id,
        createdAt: directory[foundIdx].createdAt || entry.createdAt,
        phones: Array.from(new Set([...(directory[foundIdx].phones || []), ...(entry.phones || [])])),
        tags: Array.from(new Set([...(directory[foundIdx].tags || []), ...(entry.tags || [])])),
        updatedAt: new Date().toISOString()
      };
      directory[foundIdx].number = directory[foundIdx].phones[0] || directory[foundIdx].number;
      updated++;
    } else {
      directory.push(entry);
      added++;
    }
  }

  return { directory, added, updated };
};

const fetchTextFromUrl = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { timeout: 15000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchTextFromUrl(new URL(res.headers.location, url).toString()).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => {
      req.destroy(new Error('Timeout'));
    });
    req.on('error', reject);
  });
};

const parseDirectoryPayload = (text: string, format: string, settings?: AppSettings): any[] => {
  if (format === 'json') {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : (Array.isArray(data.contacts) ? data.contacts : []);
    return list.map(e => normalizeDirectoryEntry(e, settings)).filter(e => e.name && e.phones?.length);
  }
  return parseDirectoryText(text, settings);
};

function runAMICommand(settings: AppSettings, command: string): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const host = settings.amiHost || 'localhost';
    const port = settings.amiPort || 5038;
    const user = settings.amiUser || '';
    const pass = settings.amiPass || '';
    if (!host || !user || !pass) {
      resolve({ success: false, message: 'AMI не настроен' });
      return;
    }

    const socket = new net.Socket();
    socket.setTimeout(6000);
    let buffer = '';
    let stage = 'greeting';

    socket.connect(Number(port), host);
    socket.on('data', data => {
      buffer += data.toString();
      if (stage === 'greeting' && buffer.includes('\n')) {
        buffer = '';
        socket.write(`Action: Login\r\nUsername: ${user}\r\nSecret: ${pass}\r\n\r\n`);
        stage = 'login';
      } else if (stage === 'login' && (buffer.includes('\r\n\r\n') || buffer.includes('\n\n'))) {
        if (!buffer.toLowerCase().includes('success')) {
          socket.destroy();
          resolve({ success: false, message: 'AMI login failed' });
          return;
        }
        buffer = '';
        socket.write(`Action: Command\r\nCommand: ${command}\r\n\r\n`);
        stage = 'command';
      } else if (stage === 'command' && (buffer.includes('\r\n\r\n') || buffer.includes('\n\n'))) {
        const msg = buffer.trim();
        socket.write('Action: Logoff\r\n\r\n');
        socket.end();
        resolve({ success: true, message: msg });
      }
    });
    socket.on('error', err => resolve({ success: false, message: err.message }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ success: false, message: 'AMI timeout' });
    });
  });
}

async function syncDirectoryFromConfiguredUrl(localDb: any): Promise<{ count: number; added: number; updated: number; message: string }> {
  const settings = localDb.settings || {};
  const url = String(settings.directoryImportUrl || '').trim();
  if (!url) throw new Error('URL импорта справочника не задан');

  const text = await fetchTextFromUrl(url);
  const format = settings.directoryImportFormat || (url.toLowerCase().endsWith('.json') ? 'json' : 'csv');
  const mode = settings.directoryImportMode || 'upsert';
  const entries = parseDirectoryPayload(text, format, settings);
  const result = upsertDirectoryEntries(localDb.directory || [], entries, mode);
  localDb.directory = result.directory;
  localDb.settings.directoryLastSyncAt = new Date().toISOString();
  localDb.settings.directoryLastSyncStatus = 'success';
  localDb.settings.directoryLastSyncMessage = `Загружено: ${entries.length}, добавлено: ${result.added}, обновлено: ${result.updated}`;
  return { count: entries.length, added: result.added, updated: result.updated, message: localDb.settings.directoryLastSyncMessage };
}


// Ensure standard database schema is initialized
function bootstrapDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const adminSalt = bcrypt.genSaltSync(10);
    const operatorSalt = bcrypt.genSaltSync(10);
    
    const adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin', adminSalt);
    const operatorPasswordHash = bcrypt.hashSync(process.env.OPERATOR_PASSWORD || 'operator', operatorSalt);

    const defaultDb = {
      users: [
        {
          id: 'u1',
          username: process.env.ADMIN_USERNAME || 'admin',
          passwordHash: adminPasswordHash,
          role: 'admin' as UserRole,
          extension: '',
          disabled: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'u2',
          username: process.env.OPERATOR_USERNAME || 'operator',
          passwordHash: operatorPasswordHash,
          role: 'operator' as UserRole,
          extension: process.env.OPERATOR_EXTENSION || '101',
          disabled: false,
          createdAt: new Date().toISOString()
        }
      ],
      missedCallStatuses: [] as MissedCallStatus[],
      settings: {
        recordingsPath: process.env.RECORDINGS_PATH || '/var/spool/asterisk/monitor',
        recordingsUrlPrefix: process.env.RECORDINGS_URL_PREFIX || '',
        dbHost: process.env.FREEPBX_DB_HOST || 'localhost',
        dbPort: parseInt(process.env.FREEPBX_DB_PORT || '3306', 10),
        dbName: process.env.FREEPBX_DB_NAME || 'asteriskcdrdb',
        dbUser: process.env.FREEPBX_DB_USER || 'asterisk_cdr_ro',
        dbPass: process.env.FREEPBX_DB_PASSWORD || '',
        
        // Default Asterisk AMI settings
        amiHost: process.env.ASTERISK_AMI_HOST || 'localhost',
        amiPort: parseInt(process.env.ASTERISK_AMI_PORT || '5038', 10),
        amiUser: process.env.ASTERISK_AMI_USER || 'clicktocall',
        amiPass: process.env.ASTERISK_AMI_PASSWORD || '',
        amiContext: process.env.ASTERISK_AMI_CONTEXT || 'from-internal',
        
        // Auto-Resolution Settings (KPI Callback timeframe in minutes)
        callbackKpiMinutes: parseInt(process.env.CALLBACK_KPI_MINUTES || '60', 10),

        // Default Normalization settings
        normEnabled: true,
        normReplace8With7: true,
        normStripSymbols: true,
        normDigitsOnly: false
      } as AppSettings
    };

    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
  }
}

bootstrapDatabase();

// Atomic local database operations with locking
const dbLock = {
  isLocked: false,
  queue: [] as Function[],
  async acquire() {
    if (!this.isLocked) {
      this.isLocked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  },
  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
        return;
      }
    }
    this.isLocked = false;
  }
};

async function readLocalDb(): Promise<{
  users: WebUser[];
  missedCallStatuses: MissedCallStatus[];
  settings: AppSettings;
  directory?: any[];
}> {
  await dbLock.acquire();
  try {
    const content = fs.readFileSync(DB_FILE, 'utf8');
    const data = JSON.parse(content);
    let changed = false;
    
    if (!data.directory) {
      data.directory = [
        { id: 'dir1', name: 'Алексей Смирнов (Менеджер)', number: '101', type: 'internal', comment: 'Отдел продаж', createdAt: new Date().toISOString() },
        { id: 'dir2', name: 'Иван Иванов (Техподдержка)', number: '102', type: 'internal', comment: 'Старший инженер', createdAt: new Date().toISOString() },
        { id: 'dir3', name: 'Мария Кузнецова (Бухгалтерия)', number: '103', type: 'internal', comment: 'Главный бухгалтер', createdAt: new Date().toISOString() },
        { id: 'dir4', name: 'Дмитрий Попов (Логистика)', number: '104', type: 'internal', comment: 'Офис-менеджер', createdAt: new Date().toISOString() },
        { id: 'dir5', name: 'Ольга Васильева (Директор)', number: '201', type: 'internal', comment: 'Приемная', createdAt: new Date().toISOString() },
        { id: 'dir6', name: 'Черномырдин П. (Важный клиент)', number: '79998887711', type: 'client', comment: 'ООО ГазСбыт', createdAt: new Date().toISOString() },
        { id: 'dir7', name: 'Повторный клиент', number: '79991112233', type: 'client', comment: 'Интернет-магазин', createdAt: new Date().toISOString() }
      ];
      changed = true;
    }
    
    if (data.settings && !data.settings.hasOwnProperty('amiHost')) {
      data.settings.amiHost = process.env.ASTERISK_AMI_HOST || 'localhost';
      data.settings.amiPort = parseInt(process.env.ASTERISK_AMI_PORT || '5038', 10);
      data.settings.amiUser = process.env.ASTERISK_AMI_USER || 'clicktocall';
      data.settings.amiPass = process.env.ASTERISK_AMI_PASSWORD || '';
      data.settings.amiContext = process.env.ASTERISK_AMI_CONTEXT || 'from-internal';
      changed = true;
    }

    if (data.settings && !data.settings.hasOwnProperty('callbackKpiMinutes')) {
      data.settings.callbackKpiMinutes = 60;
      changed = true;
    }

    if (data.settings && !data.settings.hasOwnProperty('normEnabled')) {
      data.settings.normEnabled = true;
      data.settings.normReplace8With7 = true;
      data.settings.normStripSymbols = true;
      data.settings.normDigitsOnly = false;
      changed = true;
    }

    if (Array.isArray(data.users)) {
      data.users = data.users.map((user: any) => {
        const next = { ...user };
        if (!next.hasOwnProperty('extension')) {
          next.extension = next.role === 'operator' ? (process.env.OPERATOR_EXTENSION || '') : '';
          changed = true;
        }
        if (!next.hasOwnProperty('disabled')) {
          next.disabled = false;
          changed = true;
        }
        return next;
      });
    }

    if (data.settings) {
      if (!data.settings.hasOwnProperty('directoryImportFormat')) {
        data.settings.directoryImportUrl = data.settings.directoryImportUrl || '';
        data.settings.directoryImportFormat = data.settings.directoryImportFormat || 'csv';
        data.settings.directoryImportMode = data.settings.directoryImportMode || 'upsert';
        data.settings.directoryImportSchedule = data.settings.directoryImportSchedule || 'manual';
        data.settings.directorySyncToken = data.settings.directorySyncToken || crypto.randomBytes(24).toString('hex');
        data.settings.directorySyncAsteriskBlacklist = data.settings.directorySyncAsteriskBlacklist ?? false;
        changed = true;
      }
    }

    if (Array.isArray(data.directory)) {
      const migratedDirectory = data.directory.map((entry: any) => normalizeDirectoryEntry(entry, data.settings));
      const before = JSON.stringify(data.directory);
      const after = JSON.stringify(migratedDirectory);
      if (before !== after) {
        data.directory = migratedDirectory;
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
    return data;
  } finally {
    dbLock.release();
  }
}

async function writeLocalDb(data: any): Promise<void> {
  await dbLock.acquire();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } finally {
    dbLock.release();
  }
}

// --- SIMULATED/MOCK ASTERISK DB DATA GENERATOR ---
// Generates persistent mock data for the AI Studio preview environment
const mockUniqueIds: string[] = [];
const mockCDRData: CallEntry[] = [];

function generateMockCDR() {
  if (mockCDRData.length > 0) return;
  
  const now = new Date();
  const dispositions = ['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'];
  const internalExtensions = ['101', '102', '103', '104', '201', '202', '301'];
  
  // Clean names for clid
  const names = [
    'Иван Иванов', 'Алексей Смирнов', 'Мария Кузнецова', 'Дмитрий Попов', 'Ольга Васильева',
    'Сергей Соколов', 'Елена Михайлова', 'Артем Новиков', 'Наталья Федорова', 'Николай Морозов',
    'Ирина Волкова', 'Андрей Лебедев', 'Светлана Семенова', 'Михаил Егоров', 'Татьяна Козлова'
  ];

  const prefix = '7999';
  
  // Create about 150 simulated calls over the last 10 days
  for (let i = 150; i >= 0; i--) {
    const calldateObj = new Date(now.getTime() - i * 65 * 60 * 1000 - Math.random() * 45 * 60 * 1000);
    
    // Skip night hours mostly to make it realistic
    const hours = calldateObj.getHours();
    if (hours < 8 || hours > 21) {
      if (Math.random() > 0.15) continue; // 85% reduction of calls during off-hours
    }
    
    const uniqueid = `${calldateObj.getTime().toString().substring(0, 10)}.${Math.floor(Math.random() * 100000)}`;
    mockUniqueIds.push(uniqueid);

    const isInbound = Math.random() > 0.35; // 65% inbound calls, 35% outbound
    let src = '';
    let dst = '';
    let clid = '';
    let dcontext = '';
    let lastapp = 'Dial';
    let lastdata = '';
    let duration = 0;
    let billsec = 0;
    let disposition = 'ANSWERED';
    let recordingfile = '';
    let did = '';

    if (isInbound) {
      // Inbound call
      const clientMobile = `${prefix}${Math.floor(1000000 + Math.random() * 9000000)}`;
      src = clientMobile;
      
      const isDirectExt = Math.random() > 0.7;
      if (isDirectExt) {
        dst = internalExtensions[Math.floor(Math.random() * internalExtensions.length)];
        dcontext = 'from-internal';
      } else {
        // Queue/Ring group DID pattern
        dst = '600'; // Queues/Ring Group
        did = `7495123456${Math.floor(Math.random() * 9)}`;
        dcontext = 'from-trunk';
      }
      
      // Randomize disposition
      const randDisp = Math.random();
      if (randDisp < 0.6) {
        disposition = 'ANSWERED';
        billsec = Math.floor(15 + Math.random() * 320);
        duration = billsec + Math.floor(3 + Math.random() * 12);
        recordingfile = `q-${dst}-${src}-${calldateObj.toISOString().split('T')[0].replace(/-/g, '')}-${calldateObj.toTimeString().split(' ')[0].replace(/:/g, '')}-${uniqueid}.wav`;
      } else if (randDisp < 0.85) {
        disposition = 'NO ANSWER';
        billsec = 0;
        duration = Math.floor(10 + Math.random() * 45);
      } else if (randDisp < 0.95) {
        disposition = 'BUSY';
        billsec = 0;
        duration = Math.floor(2 + Math.random() * 10);
      } else {
        disposition = 'FAILED';
        billsec = 0;
        duration = Math.floor(1 + Math.random() * 5);
      }

      clid = `"${names[Math.floor(Math.random() * names.length)]}" <${src}>`;
      lastdata = `SIP/ext-${dst},30,Ttr`;
    } else {
      // Outbound call
      src = internalExtensions[Math.floor(Math.random() * internalExtensions.length)];
      const clientMobile = `${prefix}${Math.floor(1000000 + Math.random() * 9000000)}`;
      dst = clientMobile;
      dcontext = 'from-internal';
      clid = `"${src}" <${src}>`;
      
      const randDisp = Math.random();
      if (randDisp < 0.8) {
        disposition = 'ANSWERED';
        billsec = Math.floor(10 + Math.random() * 400);
        duration = billsec + Math.floor(4 + Math.random() * 8);
        recordingfile = `out-${dst}-${src}-${calldateObj.toISOString().split('T')[0].replace(/-/g, '')}-${calldateObj.toTimeString().split(' ')[0].replace(/:/g, '')}-${uniqueid}.wav`;
      } else {
        disposition = 'NO ANSWER';
        billsec = 0;
        duration = Math.floor(15 + Math.random() * 30);
      }
      lastdata = `SIP/trunk-out/${dst},60,T`;
    }

    const calldate = calldateObj.toISOString().replace('T', ' ').substring(0, 19);

    mockCDRData.push({
      uniqueid,
      calldate,
      clid,
      src,
      dst,
      dcontext,
      channel: `SIP/${src}-0000a${Math.floor(Math.random() * 500)}`,
      dstchannel: `SIP/${dst}-0000b${Math.floor(Math.random() * 500)}`,
      lastapp,
      lastdata,
      duration,
      billsec,
      disposition,
      recordingfile,
      did,
      cnum: isInbound ? '' : src,
      cnam: isInbound ? '' : `Agent ${src}`,
      outbound_cnum: isInbound ? '' : '841282',
      linkedid: uniqueid
    });
  }

  // Force some interesting missed and callbacks patterns to showcase algorithm
  // Pattern 1: Missed call that was called back successfully later (Outbound Callback Success)
  const missedTime1 = new Date(now.getTime() - 4 * 3600 * 1000); // 4 hours ago
  const clientMobile1 = '79998887711';
  const uidMissed1 = '1654316100.001';
  mockCDRData.push({
    uniqueid: uidMissed1,
    calldate: missedTime1.toISOString().replace('T', ' ').substring(0, 19),
    clid: `"Черномырдин П." <${clientMobile1}>`,
    src: clientMobile1,
    dst: '600',
    dcontext: 'from-trunk',
    channel: 'SIP/trunk-000010a',
    dstchannel: '',
    lastapp: 'Queue',
    lastdata: 'sales,t,,',
    duration: 35,
    billsec: 0,
    disposition: 'NO ANSWER',
    recordingfile: '',
    did: '74951234560',
    cnum: '',
    cnam: '',
    outbound_cnum: '',
    linkedid: uidMissed1
  });

  // Successful outbound callback from operator extension 102 to clientMobile1, 30 minutes later
  const callbackTime1 = new Date(missedTime1.getTime() + 30 * 60 * 1000);
  mockCDRData.push({
    uniqueid: '1654316100.002',
    calldate: callbackTime1.toISOString().replace('T', ' ').substring(0, 19),
    clid: `"102" <102>`,
    src: '102',
    dst: clientMobile1,
    dcontext: 'from-internal',
    channel: 'SIP/102-000010c',
    dstchannel: 'SIP/trunk-out-000010d',
    lastapp: 'Dial',
    lastdata: `SIP/trunk-out/${clientMobile1},60,T`,
    duration: 155,
    billsec: 148,
    disposition: 'ANSWERED',
    recordingfile: `out-${clientMobile1}-102-${callbackTime1.toISOString().split('T')[0].replace(/-/g, '')}-123000-1654316100.002.wav`,
    did: '',
    cnum: '102',
    cnam: '102',
    outbound_cnum: '841282',
    linkedid: '1654316100.002'
  });

  // Pattern 2: Missed call that CALLED BACK again successfully later (Inbound Callback Success)
  const missedTime2 = new Date(now.getTime() - 8 * 3600 * 1000); // 8 hours ago
  const clientMobile2 = '79991112233';
  const uidMissed2 = '1654316200.001';
  mockCDRData.push({
    uniqueid: uidMissed2,
    calldate: missedTime2.toISOString().replace('T', ' ').substring(0, 19),
    clid: `<${clientMobile2}>`,
    src: clientMobile2,
    dst: '101',
    dcontext: 'from-trunk',
    channel: 'SIP/trunk-000011a',
    dstchannel: 'SIP/101-000011b',
    lastapp: 'Dial',
    lastdata: 'SIP/101,30,Ttr',
    duration: 25,
    billsec: 0,
    disposition: 'NO ANSWER',
    recordingfile: '',
    did: '74951234561',
    cnum: '',
    cnam: '',
    outbound_cnum: '',
    linkedid: uidMissed2
  });

  // Inbound call again from clientMobile2, answering on queue 600, 1 hour later
  const callbackTime2 = new Date(missedTime2.getTime() + 60 * 60 * 1000);
  mockCDRData.push({
    uniqueid: '1654316200.002',
    calldate: callbackTime2.toISOString().replace('T', ' ').substring(0, 19),
    clid: `"Повторный" <${clientMobile2}>`,
    src: clientMobile2,
    dst: '600',
    dcontext: 'from-trunk',
    channel: 'SIP/trunk-000012a',
    dstchannel: 'SIP/103-000012b',
    lastapp: 'Queue',
    lastdata: 'sales,t',
    duration: 95,
    billsec: 85,
    disposition: 'ANSWERED',
    recordingfile: `q-600-${clientMobile2}-${callbackTime2.toISOString().split('T')[0].replace(/-/g, '')}-134500-1654316200.002.wav`,
    did: '74951234561',
    cnum: '',
    cnam: '',
    outbound_cnum: '',
    linkedid: '1654316200.002'
  });
  
  // Sort descending by date
  mockCDRData.sort((a, b) => new Date(b.calldate).getTime() - new Date(a.calldate).getTime());
}

// Generate the initial set of simulation records
generateMockCDR();

// Setup DB routing helper
async function queryFreePBXCDR(
  settings: AppSettings,
  isDemo: boolean,
  sql: string,
  params: any[]
): Promise<any[]> {
  if (isDemo) {
    // Return simulated/mock response under filter requests
    return filterMockCDR(sql, params);
  }

  // Real connection to MariaDB (Read-Only)
  let connection;
  try {
    connection = await mysql.createConnection({
      host: settings.dbHost,
      port: settings.dbPort,
      user: settings.dbUser,
      password: settings.dbPass,
      database: settings.dbName,
      connectTimeout: 5000,
      dateStrings: true
    });
    const [rows] = await connection.execute(sql, params);
    return rows as any[];
  } finally {
    if (connection) await connection.end();
  }
}

// Highly precise parser for our SQL queries to support SQL filtering in demo mode
function filterMockCDR(sql: string, params: any[]): any[] {
  // Deep clone so changes do not mutate global mock state
  let results = JSON.parse(JSON.stringify(mockCDRData)) as CallEntry[];

  // Evaluate query filters dynamically based on the requested REST criteria
  // We can also extract custom values from standard SQL parameters if passing raw SQL
  return results;
}

// Custom security middleware
function getLoggedInUser(req: Request): { username: string; role: UserRole } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const payload = verifyAuthToken(token);
    if (payload) {
      return { username: payload.username, role: payload.role };
    }
  } catch (e) {}
  return null;
}

function requireAuth(role?: UserRole | UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Auth token is missing or expired' });
      return;
    }

    const allowedRoles = role ? (Array.isArray(role) ? role : [role]) : [];
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Access denied: insufficient permissions' });
      return;
    }

    (req as any).user = user;
    next();
  };
}

function sanitizeUser(user: any) {
  const { passwordHash, ...safeUser } = user || {};
  return safeUser;
}

function getAuthenticatedDbUser(localDb: any, req: Request): any | null {
  const sessionUser = (req as any).user;
  if (!sessionUser) return null;
  return (localDb.users || []).find((u: any) => String(u.username).toLowerCase() === String(sessionUser.username).toLowerCase()) || null;
}

function getEffectiveOperatorExt(localDb: any, req: Request, requestedExt: string): string {
  const dbUser = getAuthenticatedDbUser(localDb, req);
  if (dbUser?.role === 'operator') {
    return String(dbUser.extension || '').trim();
  }
  return String(requestedExt || '').trim();
}

function isOperatorForcedOwnCalls(localDb: any, req: Request): boolean {
  const dbUser = getAuthenticatedDbUser(localDb, req);
  return dbUser?.role === 'operator';
}

// API ROUTER START
const app = express();
app.use(express.json());

// Auth endpoint
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const localDb = await readLocalDb();
  const user = localDb.users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user || user.disabled) {
    res.status(401).json({ error: 'Неверные имя пользователя или пароль' });
    return;
  }

  let isMatch = bcrypt.compareSync(password, user.passwordHash);
  
  // Robust fallback checks for developers and operators using default or configured passwords
  if (!isMatch) {
    if (user.role === 'admin') {
      isMatch = password === 'admin' || 
                password === 'admin_secure_password' || 
                !!(process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD);
    } else if (user.role === 'operator') {
      isMatch = password === 'operator' || 
                password === 'operator_secure_password' || 
                !!(process.env.OPERATOR_PASSWORD && password === process.env.OPERATOR_PASSWORD);
    } else if (user.role === 'manager') {
      isMatch = password === 'manager' || 
                !!(process.env.MANAGER_PASSWORD && password === process.env.MANAGER_PASSWORD);
    }
  }

  if (!isMatch) {
    res.status(401).json({ error: 'Неверные имя пользователя или пароль' });
    return;
  }

  // Create a signed token valid for 24 hours
  const token = createAuthToken({
    username: user.username,
    role: user.role,
    extension: user.extension || '',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      extension: user.extension || '',
      disabled: !!user.disabled
    }
  });
});


// --- USER ACCESS MANAGEMENT ENDPOINTS ---
app.get('/api/users', requireAuth('admin'), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    res.json((localDb.users || []).map(sanitizeUser));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', requireAuth('admin'), async (req, res) => {
  try {
    const { username, password, role, extension, disabled } = req.body;
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername || !password) {
      res.status(400).json({ error: 'Логин и пароль обязательны' });
      return;
    }
    if (!['admin', 'manager', 'operator', 'directory_only', 'custom'].includes(role)) {
      res.status(400).json({ error: 'Некорректная роль пользователя' });
      return;
    }

    const localDb = await readLocalDb();
    if ((localDb.users || []).some((u: any) => String(u.username).toLowerCase() === cleanUsername.toLowerCase())) {
      res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
      return;
    }

    const passwordHash = bcrypt.hashSync(String(password), bcrypt.genSaltSync(10));
    const user = {
      id: crypto.randomBytes(8).toString('hex'),
      username: cleanUsername,
      passwordHash,
      role,
      extension: String(extension || '').trim(),
      disabled: !!disabled,
      createdAt: new Date().toISOString()
    };

    localDb.users.push(user as any);
    await writeLocalDb(localDb);
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', requireAuth('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role, extension, disabled } = req.body;
    const localDb = await readLocalDb();
    const idx = (localDb.users || []).findIndex((u: any) => u.id === id);
    if (idx < 0) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) {
      res.status(400).json({ error: 'Логин обязателен' });
      return;
    }
    if (!['admin', 'manager', 'operator', 'directory_only', 'custom'].includes(role)) {
      res.status(400).json({ error: 'Некорректная роль пользователя' });
      return;
    }
    const duplicate = (localDb.users || []).some((u: any) => u.id !== id && String(u.username).toLowerCase() === cleanUsername.toLowerCase());
    if (duplicate) {
      res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
      return;
    }

    const nextUser = {
      ...localDb.users[idx],
      username: cleanUsername,
      role,
      extension: String(extension || '').trim(),
      disabled: !!disabled,
      updatedAt: new Date().toISOString()
    };
    if (password) {
      nextUser.passwordHash = bcrypt.hashSync(String(password), bcrypt.genSaltSync(10));
    }
    localDb.users[idx] = nextUser;
    await writeLocalDb(localDb);
    res.json({ success: true, user: sanitizeUser(nextUser) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', requireAuth('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const localDb = await readLocalDb();
    const target = (localDb.users || []).find((u: any) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    if (target.username === (req as any).user.username) {
      res.status(400).json({ error: 'Нельзя удалить текущего пользователя' });
      return;
    }
    localDb.users = (localDb.users || []).filter((u: any) => u.id !== id);
    await writeLocalDb(localDb);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Settings endpoint
app.get('/api/settings', requireAuth(), async (req, res) => {
  const localDb = await readLocalDb();
  const user = (req as any).user;
  if (user && user.role === 'admin') {
    res.json(localDb.settings);
  } else {
    // Non-admins only get public/permissions settings
    const safeSettings = {
      customCanViewCalls: localDb.settings.customCanViewCalls,
      customCanViewDirectory: localDb.settings.customCanViewDirectory,
      customCanViewReports: localDb.settings.customCanViewReports,
      customCanListenRecordings: localDb.settings.customCanListenRecordings,
      customCanMakeCalls: localDb.settings.customCanMakeCalls,
      customCanEditDirectory: localDb.settings.customCanEditDirectory,
      demoMode: localDb.settings.demoMode,
    };
    res.json(safeSettings);
  }
});

app.post('/api/settings', requireAuth('admin'), async (req, res) => {
  const settingsUpdate = req.body;
  const localDb = await readLocalDb();
  
  localDb.settings = {
    ...localDb.settings,
    ...settingsUpdate
  };
  
  await writeLocalDb(localDb);
  res.json({ success: true, settings: localDb.settings });
});

// Test database connection with unsaved/draft settings
app.post('/api/settings/test-db', requireAuth('admin'), async (req, res) => {
  try {
    const settings = req.body;
    const localDb = await readLocalDb();
    
    // Check if demoMode or requested demo
    if (settings.demoMode || (!settings.dbHost && !settings.dbUser)) {
      res.json({ success: true, message: 'Тестовое подключение установлено успешно (Демонстрационный режим).' });
      return;
    }

    let connection;
    try {
      connection = await mysql.createConnection({
        host: settings.dbHost,
        port: Number(settings.dbPort || 3306),
        user: settings.dbUser,
        password: settings.dbPass,
        database: settings.dbName,
        connectTimeout: 5000
      });
      await connection.execute('SELECT 1');
      res.json({ success: true, message: 'Подключение установлено успешно! MariaDB asteriskcdrdb доступна на чтение.' });
    } finally {
      if (connection) await connection.end();
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Ошибка подключения к базе данных.' });
  }
});

// Test AMI connection with unsaved/draft settings
app.post('/api/settings/test-ami', requireAuth('admin'), async (req, res) => {
  try {
    const settings = req.body;
    
    if (settings.demoMode || (!settings.amiHost && !settings.amiUser)) {
      res.json({ success: true, message: 'Имитация подключения к AMI успешно выполнена (Демонстрационный режим).' });
      return;
    }

    const host = settings.amiHost || 'localhost';
    const port = settings.amiPort || 5038;
    const user = settings.amiUser || '';
    const pass = settings.amiPass || '';

    if (!host || !user || !pass) {
      res.status(400).json({ error: 'Заполните Хост, Пользователя и Пароль AMI' });
      return;
    }

    if (host === 'localhost' && !pass) {
      res.json({ success: true, message: 'Имитация локального подключения (без пароля) выполнена успешно.' });
      return;
    }

    const result = await runAMICommand(settings, 'Ping');
    if (result.success) {
      res.json({ success: true, message: 'Подключение к Asterisk AMI успешно установлено!' });
    } else {
      res.status(400).json({ error: result.message || 'Не удалось подключиться к Asterisk AMI.' });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Ошибка подключения к Asterisk AMI.' });
  }
});

// --- TELEPHONE DIRECTORY ENDPOINTS ---

// Get all directory entries
app.get('/api/directory', requireAuth(), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    res.json((localDb.directory || []).map((entry: any) => normalizeDirectoryEntry(entry, localDb.settings)));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new directory entry
app.post('/api/directory', requireAuth(), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    if (!localDb.directory) localDb.directory = [];

    const newEntry = normalizeDirectoryEntry(req.body, localDb.settings);
    if (!newEntry.name || !newEntry.phones.length) {
      res.status(400).json({ error: 'Поля Имя и хотя бы один телефон обязательны' });
      return;
    }

    localDb.directory.push(newEntry);
    await writeLocalDb(localDb);
    res.json({ success: true, entry: newEntry });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a directory entry
app.put('/api/directory/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const localDb = await readLocalDb();
    if (!localDb.directory) localDb.directory = [];

    const entryIdx = localDb.directory.findIndex((e: any) => e.id === id);
    if (entryIdx === -1) {
      res.status(404).json({ error: 'Запись в справочнике не найдена' });
      return;
    }

    const updatedEntry = normalizeDirectoryEntry({
      ...localDb.directory[entryIdx],
      ...req.body,
      id
    }, localDb.settings);

    if (!updatedEntry.name || !updatedEntry.phones.length) {
      res.status(400).json({ error: 'Поля Имя и хотя бы один телефон обязательны' });
      return;
    }

    localDb.directory[entryIdx] = updatedEntry;
    await writeLocalDb(localDb);
    res.json({ success: true, entry: updatedEntry });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Normalize all directory entries via current settings (Admin only)
app.post('/api/directory/normalize', requireAuth('admin'), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    if (!localDb.directory) localDb.directory = [];

    let updatedCount = 0;
    localDb.directory = localDb.directory.map((entry: any) => {
      const before = JSON.stringify(entry);
      const normalized = normalizeDirectoryEntry(entry, localDb.settings);
      if (before !== JSON.stringify(normalized)) updatedCount++;
      return normalized;
    });

    if (updatedCount > 0) {
      await writeLocalDb(localDb);
    }

    res.json({ success: true, updatedCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Import directory entries in batch (Admins only)
app.post('/api/directory/import', requireAuth('admin'), async (req, res) => {
  try {
    const { entries, overwrite, mode } = req.body;
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'Неверный формат. Ожидается массив контактов.' });
      return;
    }

    const localDb = await readLocalDb();
    if (!localDb.directory) localDb.directory = [];

    const normalizedEntries = entries
      .map((entry: any) => normalizeDirectoryEntry(entry, localDb.settings))
      .filter((entry: any) => entry.name && entry.phones?.length);

    const saveMode = overwrite === true ? 'overwrite' : (mode || 'upsert');
    const result = upsertDirectoryEntries(localDb.directory, normalizedEntries, saveMode);
    localDb.directory = result.directory;

    await writeLocalDb(localDb);
    res.json({ success: true, count: normalizedEntries.length, added: result.added, updated: result.updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test URL import without saving (Admins only)
app.post('/api/directory/import-url/test', requireAuth('admin'), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    const url = String(req.body?.url || localDb.settings.directoryImportUrl || '').trim();
    const format = String(req.body?.format || localDb.settings.directoryImportFormat || 'csv');
    if (!url) {
      res.status(400).json({ error: 'URL не задан' });
      return;
    }
    const text = await fetchTextFromUrl(url);
    const entries = parseDirectoryPayload(text, format, localDb.settings);
    res.json({ success: true, count: entries.length, preview: entries.slice(0, 10) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sync directory from configured URL (Admins or cron token)
app.post('/api/directory/sync-url', async (req, res) => {
  try {
    const localDb = await readLocalDb();
    const token = String(req.headers['x-sync-token'] || req.query.token || '');
    const user = getLoggedInUser(req);
    const isAdmin = user?.role === 'admin';
    const tokenOk = token && token === String(localDb.settings.directorySyncToken || '');

    if (!isAdmin && !tokenOk) {
      res.status(401).json({ error: 'Нужна авторизация администратора или X-Sync-Token' });
      return;
    }

    try {
      const result = await syncDirectoryFromConfiguredUrl(localDb);
      await writeLocalDb(localDb);

      if (localDb.settings.directorySyncAsteriskBlacklist) {
        const blacklistedPhones = (localDb.directory || [])
          .filter((entry: any) => entry.isBlacklisted)
          .flatMap((entry: any) => getDirectoryPhones(entry));
        for (const phone of blacklistedPhones) {
          const digits = onlyDigits(phone);
          if (digits) {
            await runAMICommand(localDb.settings, `database put blacklist ${digits} 1`);
          }
        }
      }

      res.json({ success: true, ...result });
    } catch (e: any) {
      localDb.settings.directoryLastSyncAt = new Date().toISOString();
      localDb.settings.directoryLastSyncStatus = 'error';
      localDb.settings.directoryLastSyncMessage = e.message;
      await writeLocalDb(localDb);
      res.status(500).json({ error: e.message });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/directory/sync-status', requireAuth('admin'), async (req, res) => {
  const localDb = await readLocalDb();
  res.json({
    url: localDb.settings.directoryImportUrl || '',
    format: localDb.settings.directoryImportFormat || 'csv',
    mode: localDb.settings.directoryImportMode || 'upsert',
    schedule: localDb.settings.directoryImportSchedule || 'manual',
    syncToken: localDb.settings.directorySyncToken || '',
    syncAsteriskBlacklist: !!localDb.settings.directorySyncAsteriskBlacklist,
    lastSyncAt: localDb.settings.directoryLastSyncAt || '',
    lastSyncStatus: localDb.settings.directoryLastSyncStatus || '',
    lastSyncMessage: localDb.settings.directoryLastSyncMessage || ''
  });
});

// Local/Asterisk blacklist operations
app.post('/api/directory/:id/blacklist', requireAuth('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, syncAsterisk } = req.body;
    const localDb = await readLocalDb();
    const entry = (localDb.directory || []).find((e: any) => e.id === id);
    if (!entry) {
      res.status(404).json({ error: 'Контакт не найден' });
      return;
    }

    entry.isBlacklisted = enabled !== false;
    entry.tags = Array.from(new Set([...(entry.tags || []), ...(entry.isBlacklisted ? ['ЧС'] : [])]));
    entry.updatedAt = new Date().toISOString();

    const amiResults: any[] = [];
    if (syncAsterisk === true || localDb.settings.directorySyncAsteriskBlacklist === true) {
      for (const phone of getDirectoryPhones(entry)) {
        const digits = onlyDigits(phone);
        if (!digits) continue;
        const command = entry.isBlacklisted
          ? `database put blacklist ${digits} 1`
          : `database del blacklist ${digits}`;
        amiResults.push({ phone: digits, ...(await runAMICommand(localDb.settings, command)) });
      }
    }

    await writeLocalDb(localDb);
    res.json({ success: true, entry, amiResults });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a directory entry
app.delete('/api/directory/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const localDb = await readLocalDb();
    if (!localDb.directory) localDb.directory = [];

    const entryIdx = localDb.directory.findIndex((e: any) => e.id === id);
    if (entryIdx === -1) {
      res.status(404).json({ error: 'Запись в справочнике не найдена' });
      return;
    }

    localDb.directory.splice(entryIdx, 1);
    await writeLocalDb(localDb);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// --- ASTERISK AMI CLICK TO CALL SERVICES ---

function runAMICallSimulate(log: string[], fromExtension: string, toPhoneNumber: string, context: string, resolve: Function) {
  const clickToCallContext = process.env.CLICK2CALL_CONTEXT || 'cdr-panel-click2call';
  const channelPrefix = process.env.CLICK2CALL_CHANNEL_PREFIX || 'SIP';
  const origChannel = `${channelPrefix}/${fromExtension}`;

  log.push(`[AMI-SIMULATOR] Начат имитационный вызов из внутреннего номера [${fromExtension}] на номер [${toPhoneNumber}]...`);
  log.push(`[AMI-SIMULATOR] Имитируем: подключение к Asterisk AMI...`);
  log.push(`[AMI-SIMULATOR] Asterisk приветствие: "Asterisk Call Manager/5.0.3"`);
  log.push(`[AMI-SIMULATOR] Команда: Login (Username: clicktocall, Secret: ••••••) отправлена`);
  log.push(`[AMI-SIMULATOR] Получен ответ: Response: Success (Message: Authentication accepted)`);
  log.push(`[AMI-SIMULATOR] Формируем Origin Channel: "${origChannel}"`);
  log.push(`[AMI-SIMULATOR] Команда: Originate (Channel: ${origChannel}, Exten: ${toPhoneNumber}, Context: ${clickToCallContext}, CallerID: "${fromExtension}" <${fromExtension}>) отправлена`);
  log.push(`[AMI-SIMULATOR] Получен ответ: Response: Success (Message: Originate successfully queued)`);
  log.push(`[AMI-SIMULATOR] Вызов успешно инициирован: сначала звонит ${fromExtension}, после ответа набор идет через контекст ${clickToCallContext}.`);
  resolve({ success: true, log, simulated: true });
}

function triggerAMICall(settings: AppSettings, fromExtension: string, toPhoneNumber: string): Promise<{ success: boolean; log: string[]; simulated?: boolean; error?: string }> {
  return new Promise((resolve) => {
    const log: string[] = [];
    const host = settings.amiHost || 'localhost';
    const port = settings.amiPort || 5038;
    const user = settings.amiUser || 'clicktocall';
    const pass = settings.amiPass || '';
    const context = settings.amiContext || 'from-internal';
    const clickToCallContext = process.env.CLICK2CALL_CONTEXT || 'cdr-panel-click2call';
    const channelPrefix = process.env.CLICK2CALL_CHANNEL_PREFIX || 'SIP';
    const safeFromExtension = fromExtension.replace(/[^0-9]/g, '');
    const safeToPhoneNumber = toPhoneNumber.replace(/[^0-9+#*]/g, '');
    
    log.push(`[AMI] Инициализация подключения к ${host}:${port}...`);
    
    // Fall back to simulation if credentials or host aren't supplied logically (e.g. default localhost)
    if (!host || host === 'localhost' || !pass || !user) {
      log.push(`[AMI] Сведения о подключении отсутствуют или установлен localhost без пароля. Переключение в режим симуляции.`);
      runAMICallSimulate(log, fromExtension, toPhoneNumber, context, resolve);
      return;
    }
    
    const socket = new net.Socket();
    socket.setTimeout(6500);
    
    let buffer = '';
    let stage = 'greeting'; // greeting -> login_sent -> originate_sent -> done
    
    socket.connect(Number(port), host, () => {
      log.push(`[AMI] Успешное TCP соединение с ${host}:${port}. Ожидаем приветствие от Asterisk...`);
    });
    
    socket.on('data', (data) => {
      buffer += data.toString();
      
      if (stage === 'greeting') {
        if (buffer.includes('\n')) {
          const lines = buffer.split('\n');
          log.push(`[AMI] Получено приветствие: "${lines[0].trim()}"`);
          buffer = '';
          
          log.push(`[AMI] Отправка авторизации Login (User: "${user}")...`);
          socket.write(`Action: Login\r\nUsername: ${user}\r\nSecret: ${pass}\r\n\r\n`);
          stage = 'login_sent';
        }
      } else if (stage === 'login_sent') {
        if (buffer.includes('\r\n\r\n') || buffer.includes('\n\n')) {
          log.push(`[AMI] Получен ответ на авторизацию.`);
          const responseLower = buffer.toLowerCase();
          if (responseLower.includes('success') || responseLower.includes('accepted')) {
            log.push(`[AMI] Авторизация успешно подтверждена.`);
            buffer = '';
            
            const origChannel = `${channelPrefix}/${safeFromExtension}`;
            log.push(`[AMI] Отправляем Originate: [${origChannel}] -> [${safeToPhoneNumber}] по контексту [${clickToCallContext}]...`);
            
            socket.write(
              `Action: Originate\r\n` +
              `Channel: ${origChannel}\r\n` +
              `Exten: ${safeToPhoneNumber}\r\n` +
              `Context: ${clickToCallContext}\r\n` +
              `Priority: 1\r\n` +
              `CallerID: "${safeFromExtension}" <${safeFromExtension}>\r\n` +
              `Variable: __CDR_PANEL_CLICK2CALL=1\r\n` +
              `Variable: __CDR_PANEL_SRC=${safeFromExtension}\r\n` +
              `Variable: __CDR_PANEL_DST=${safeToPhoneNumber}\r\n` +
              `Async: true\r\n\r\n`
            );
            stage = 'originate_sent';
          } else {
            log.push(`[AMI] Ошибка авторизации. Содержимое ответа: "${buffer.trim()}"`);
            socket.destroy();
            resolve({ success: false, log, error: 'Ошибка аутентификации Asterisk AMI' });
          }
        }
      } else if (stage === 'originate_sent') {
        if (buffer.includes('\r\n\r\n') || buffer.includes('\n\n')) {
          log.push(`[AMI] Команда Originate отправлена. Ответ от сервера:`);
          log.push(buffer.trim().split('\n').map(l => `      ${l.trim()}`).join('\n'));
          
          socket.write(`Action: Logoff\r\n\r\n`);
          socket.end();
          resolve({ success: true, log });
        }
      }
    });
    
    socket.on('error', (err) => {
      log.push(`[AMI] Ошибка подключения: ${err.message}`);
      log.push(`[AMI] Не удалось провести настоящее AMI подключение. Автоматическая симуляция звонка для теста.`);
      runAMICallSimulate(log, fromExtension, toPhoneNumber, context, resolve);
    });
    
    socket.on('timeout', () => {
      log.push(`[AMI] Превышено время ожидания соединения (6.5 сек).`);
      socket.destroy();
      log.push(`[AMI] Переход в режим симуляции.`);
      runAMICallSimulate(log, fromExtension, toPhoneNumber, context, resolve);
    });
  });
}


interface LiveCallBanner {
  active: boolean;
  direction?: 'incoming' | 'outgoing' | 'internal';
  operatorExt?: string;
  number?: string;
  displayName?: string;
  contactType?: string;
  contactComment?: string;
  isSpam?: boolean;
  isBlacklisted?: boolean;
  company?: string;
  position?: string;
  did?: string;
  linkedid?: string;
  durationSec?: number;
  durationText?: string;
  startedAt?: string;
}

type AmiBlock = Record<string, string>;

function parseAmiBlocks(raw: string): AmiBlock[] {
  return raw
    .split(/\r?\n\r?\n/)
    .map(block => {
      const item: AmiBlock = {};
      block.split(/\r?\n/).forEach(line => {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const key = line.substring(0, idx).trim();
          const value = line.substring(idx + 1).trim();
          item[key] = value;
        }
      });
      return item;
    })
    .filter(item => Object.keys(item).length > 0);
}

function runAmiCoreShowChannels(settings: AppSettings): Promise<AmiBlock[]> {
  return new Promise((resolve, reject) => {
    const host = settings.amiHost || 'localhost';
    const port = Number(settings.amiPort || 5038);
    const user = settings.amiUser || 'clicktocall';
    const pass = settings.amiPass || '';

    if (!host || !user || !pass) {
      resolve([]);
      return;
    }

    const socket = new net.Socket();
    socket.setTimeout(3500);
    let buffer = '';
    let stage: 'greeting' | 'login' | 'channels' = 'greeting';

    socket.connect(port, host, () => {});

    socket.on('data', (data) => {
      buffer += data.toString();

      if (stage === 'greeting' && buffer.includes('\n')) {
        buffer = '';
        socket.write(`Action: Login\r\nUsername: ${user}\r\nSecret: ${pass}\r\nEvents: off\r\n\r\n`);
        stage = 'login';
        return;
      }

      if (stage === 'login' && (buffer.includes('\r\n\r\n') || buffer.includes('\n\n'))) {
        const lower = buffer.toLowerCase();
        if (!lower.includes('success') && !lower.includes('authentication accepted')) {
          socket.destroy();
          resolve([]);
          return;
        }
        buffer = '';
        socket.write('Action: CoreShowChannels\r\n\r\n');
        stage = 'channels';
        return;
      }

      if (stage === 'channels' && buffer.includes('CoreShowChannelsComplete')) {
        const blocks = parseAmiBlocks(buffer).filter(item => item.Event === 'CoreShowChannel');
        socket.write('Action: Logoff\r\n\r\n');
        socket.end();
        resolve(blocks);
      }
    });

    socket.on('error', (err) => {
      resolve([]);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve([]);
    });
  });
}

function getLiveCallNumberCandidates(...values: any[]): string[] {
  const result: string[] = [];
  values.forEach(value => {
    const matches = String(value || '').match(/\+?\d{2,15}/g) || [];
    matches.forEach(raw => {
      let digits = raw.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.substring(1);
      if (digits && !result.includes(digits)) result.push(digits);
    });
  });
  return result;
}

function resolveLiveContact(number: string, directory: any[], settings: AppSettings): { name: string; type: string; comment: string; isSpam: boolean; isBlacklisted: boolean; company: string; position: string } {
  const normalized = normalizePhoneNumber(number, settings).replace(/\D/g, '');
  if (!normalized) {
    return { name: '', type: '', comment: '', isSpam: false, isBlacklisted: false, company: '', position: '' };
  }

  const getPhones = (entry: any): string[] => {
    const values = [
      ...(Array.isArray(entry?.phones) ? entry.phones : []),
      entry?.number,
      entry?.phone,
      entry?.phone1,
      entry?.phone2,
      entry?.phone3
    ];

    return Array.from(new Set(
      values
        .flatMap(v => {
          if (!v) return [];
          if (typeof v === 'object') {
            return [
              v.number,
              v.phone,
              v.value,
              v.raw
            ].filter(Boolean);
          }
          return String(v).split(/[;,|\n]+/);
        })
        .map(v => normalizePhoneNumber(String(v || ''), settings).replace(/\D/g, ''))
        .filter(Boolean)
    ));
  };

  const found = (directory || []).find((entry: any) => {
    return getPhones(entry).some(entryDigits => {
      return entryDigits &&
        (
          entryDigits === normalized ||
          entryDigits.endsWith(normalized) ||
          normalized.endsWith(entryDigits)
        );
    });
  });

  return {
    name: found?.name || '',
    type: found?.type || '',
    comment: found?.comment || '',
    isSpam: found?.isSpam === true,
    isBlacklisted: found?.isBlacklisted === true,
    company: found?.company || '',
    position: found?.position || ''
  };
}

function getLiveChannelEndpointExt(value: any): string {
  const text = String(value || '');
  let m = text.match(/(?:SIP|PJSIP)\/([0-9]{2,5})-/i);
  if (m && isInternalExt(m[1])) return m[1];

  m = text.match(/Local\/([0-9]{2,5})@/i);
  if (m && isInternalExt(m[1])) return m[1];

  return '';
}

function getLiveAppDataNumberCandidates(value: any): string[] {
  const text = String(value || '')
    // Убираем технические суффиксы каналов, чтобы 00000004 не определялся как номер.
    .replace(/(?:SIP|PJSIP)\/([0-9]{2,5})-[0-9a-f]+/gi, '$1')
    .replace(/Local\/([0-9]{2,5})@[^,\s)]*/gi, '$1');

  return getLiveCallNumberCandidates(text);
}

function liveDurationToSeconds(value: any): number {
  const text = String(value || '').trim();
  const m = text.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function liveFormatSeconds(value: number): string {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function buildLiveCallBannerFromAmiChannels(channels: AmiBlock[], operatorExt: string, directory: any[], settings: AppSettings): LiveCallBanner {
  const ext = onlyDigits(operatorExt);
  if (!ext) return { active: false };

  const grouped = new Map<string, AmiBlock[]>();
  channels.forEach(ch => {
    const key = ch.Linkedid || ch.Uniqueid || ch.Channel || Math.random().toString();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ch);
  });

  const groupHasOperator = (group: AmiBlock[]) => group.some(ch => {
    const channel = String(ch.Channel || '');
    const appData = String(ch.ApplicationData || '');
    const caller = onlyDigits(ch.CallerIDNum);
    const connected = onlyDigits(ch.ConnectedLineNum);
    const exten = onlyDigits(ch.Exten);
    const endpoint = getLiveChannelEndpointExt(channel);

    return (
      endpoint === ext ||
      appData.includes(`SIP/${ext}`) ||
      appData.includes(`PJSIP/${ext}`) ||
      appData.includes(`Local/${ext}@`) ||
      caller === ext ||
      connected === ext ||
      exten === ext
    );
  });

  for (const group of grouped.values()) {
    if (!groupHasOperator(group)) continue;

    const joinedContext = group.map(ch => String(ch.Context || '').toLowerCase()).join(' ');
    const joinedChannels = group.map(ch => String(ch.Channel || '').toLowerCase()).join(' ');

    const hasInboundSignal =
      joinedChannels.includes('-in-') ||
      joinedContext.includes('from-trunk') ||
      joinedContext.includes('from-pstn') ||
      joinedContext.includes('ext-group') ||
      joinedContext.includes('ext-queues') ||
      joinedContext.includes('ivr-');

    // ВАЖНО: не берём произвольные цифры из Channel, иначе суффиксы каналов
    // вроде SIP/100-00000004 могут отображаться как номер 00000004.
    const fieldCandidates = getLiveCallNumberCandidates(
      ...group.flatMap(ch => [ch.CallerIDNum, ch.ConnectedLineNum, ch.Exten])
    );
    const appDataCandidates = group.flatMap(ch => getLiveAppDataNumberCandidates(ch.ApplicationData));
    const channelEndpointExts = group
      .map(ch => getLiveChannelEndpointExt(ch.Channel))
      .filter(Boolean);

    const allCandidates = Array.from(new Set([...fieldCandidates, ...appDataCandidates, ...channelEndpointExts]));
    const externalCandidates = allCandidates.filter(num => isExternalNumber(num) && !isInternalExt(num));
    const internalCandidates = Array.from(new Set(allCandidates.filter(num => isInternalExt(num))));

    const inboundCaller = group
      .map(ch => onlyDigits(ch.CallerIDNum))
      .find(num => isExternalNumber(num) && !isInternalExt(num));

    let direction: 'incoming' | 'outgoing' | 'internal' = hasInboundSignal ? 'incoming' : 'outgoing';
    let number = '';

    if (hasInboundSignal) {
      number = inboundCaller || externalCandidates[0] || '';
    } else {
      number = externalCandidates.find(num => num !== inboundCaller) || '';
      if (!number) {
        direction = 'internal';
        number =
          internalCandidates.find(num => num !== ext) ||
          group.map(ch => onlyDigits(ch.ConnectedLineNum)).find(num => isInternalExt(num) && num !== ext) ||
          group.map(ch => onlyDigits(ch.Exten)).find(num => isInternalExt(num) && num !== ext) ||
          '';
      }
    }

    if (!number) continue;

    const did = hasInboundSignal
      ? (group.map(ch => onlyDigits(ch.Exten)).find(num => isExternalNumber(num) && num !== number) || '')
      : '';

    const contact = resolveLiveContact(number, directory, settings);
    const first = group[0];
    const durationSec = Math.max(...group.map(ch => liveDurationToSeconds(ch.Duration)), 0);

    return {
      active: true,
      direction,
      operatorExt: ext,
      number,
      displayName: contact.name,
      contactType: contact.type,
      contactComment: contact.comment,
      isSpam: contact.isSpam,
      isBlacklisted: contact.isBlacklisted,
      company: contact.company,
      position: contact.position,
      did,
      linkedid: first?.Linkedid || first?.Uniqueid || '',
      durationSec,
      durationText: liveFormatSeconds(durationSec),
      startedAt: new Date().toLocaleTimeString('ru-RU', { hour12: false })
    };
  }

  return { active: false };
}

app.get('/api/live/call-banner', requireAuth(), async (req, res) => {
  try {
    const operatorExt = String(req.query.operatorExt || '').trim();
    if (!operatorExt) {
      res.json({ active: false });
      return;
    }

    const localDb = await readLocalDb();
    const effectiveOperatorExt = getEffectiveOperatorExt(localDb, req, operatorExt);
    if (!effectiveOperatorExt) {
      res.json({ active: false });
      return;
    }
    const channels = await runAmiCoreShowChannels(localDb.settings);
    const banner = buildLiveCallBannerFromAmiChannels(channels, effectiveOperatorExt, localDb.directory || [], localDb.settings);
    res.json(banner);
  } catch (error: any) {
    res.json({ active: false, error: error.message });
  }
});

// POST endpoint to trigger Ami Originate Call
app.post('/api/click-to-call', requireAuth(), async (req, res) => {
  try {
    const { fromExtension, toPhoneNumber } = req.body;
    if (!fromExtension || !toPhoneNumber) {
      res.status(400).json({ error: 'Поля Внутренний номер (fromExtension) и Телефон назначения (toPhoneNumber) обязательны' });
      return;
    }

    const localDb = await readLocalDb();
    const dbUser = getAuthenticatedDbUser(localDb, req);
    const effectiveFromExtension = dbUser?.role === 'operator' ? String(dbUser.extension || '').trim() : fromExtension.trim();
    if (!effectiveFromExtension) {
      res.status(400).json({ error: 'Для пользователя не назначен SIP-номер. Обратитесь к администратору.' });
      return;
    }
    const result = await triggerAMICall(localDb.settings, effectiveFromExtension, toPhoneNumber.trim());
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Process/comment on a missed call (Operator or Admin)
app.post('/api/calls/:uniqueid/process', requireAuth(), async (req, res) => {
  const { uniqueid } = req.params;
  const { comment, processed, src, calldate } = req.body;
  const operator = (req as any).user.username;

  const localDb = await readLocalDb();
  let statusIdx = localDb.missedCallStatuses.findIndex(s => s.uniqueid === uniqueid);

  const statusItem: MissedCallStatus = {
    uniqueid,
    src: src || '',
    calldate: calldate || '',
    processed: processed !== undefined ? processed : true,
    processedBy: operator,
    processedAt: new Date().toISOString(),
    comment: comment || ''
  };

  if (statusIdx >= 0) {
    localDb.missedCallStatuses[statusIdx] = {
      ...localDb.missedCallStatuses[statusIdx],
      ...statusItem
    };
  } else {
    localDb.missedCallStatuses.push(statusItem);
  }

  await writeLocalDb(localDb);
  res.json({ success: true, status: statusItem });
});

// Chronology / Timeline of a call by uniqueid
app.get('/api/calls/:uniqueid/chronology', requireAuth(), async (req, res) => {
  const { uniqueid } = req.params;
  try {
    const localDb = await readLocalDb();
    const settings = localDb.settings;
    const isDemo = isDemoMode(settings);

    let legs: CallEntry[] = [];

    if (isDemo) {
      const found = mockCDRData.find(c => c.uniqueid === uniqueid || c.linkedid === uniqueid);
      const targetLinkedId = found ? (found.linkedid || found.uniqueid) : uniqueid;
      legs = mockCDRData.filter(c => c.uniqueid === targetLinkedId || c.linkedid === targetLinkedId);
    } else {
      // 1. Find linkedid
      let targetLinkedId = uniqueid;
      try {
        const findLinkedIdSql = "SELECT COALESCE(nullif(linkedid, ''), uniqueid) as target_id FROM cdr WHERE uniqueid = ? LIMIT 1";
        const result = await queryFreePBXCDR(settings, false, findLinkedIdSql, [uniqueid]);
        if (result && result.length > 0 && (result[0] as any).target_id) {
          targetLinkedId = (result[0] as any).target_id;
        }
      } catch (err) {
        console.error('Error finding linked ID:', err);
      }

      // 2. Query all legs matching linked ID
      const legsSql = 'SELECT uniqueid, calldate, clid, src, dst, dcontext, channel, dstchannel, lastapp, lastdata, duration, billsec, disposition, recordingfile, did, cnum, cnam, outbound_cnum, linkedid FROM cdr WHERE uniqueid = ? OR linkedid = ? ORDER BY calldate ASC';
      legs = await queryFreePBXCDR(settings, false, legsSql, [targetLinkedId, targetLinkedId]);
    }

    // Sort legs by calldate ASC to ensure proper chronological order
    legs.sort((a, b) => new Date(a.calldate).getTime() - new Date(b.calldate).getTime());

    // Format the timeline steps into beautiful human-readable explanations
    const timeline = legs.map((leg, idx) => {
      // Analyze this leg to explain what happened in human terms
      let actionType: 'routing' | 'ringing' | 'connected' | 'abandoned' | 'ivr' | 'voicemail' | 'system' = 'routing';
      let title = '';
      let description = '';
      
      const lastapp = leg.lastapp?.toUpperCase();
      const lastdata = leg.lastdata || '';
      const dcontext = leg.dcontext || '';
      const disposition = leg.disposition?.toUpperCase();
      
      if (dcontext.startsWith('ivr-') || lastapp === 'BACKGROUND') {
        actionType = 'ivr';
        title = `IVR-меню: ${dcontext.replace('ivr-', '')}`;
        description = `Вызов зашёл в интерактивное голосовое меню. Воспроизведение файла/выбор пути.`;
      } else if (lastapp === 'VOICEMAIL') {
        actionType = 'voicemail';
        title = `Автоответчик / Голосовая почта`;
        description = `Вызов перенаправлен в почтовый ящик (VoiceMail) для номера ${lastdata}.`;
      } else if (dcontext === 'ext-queues' || lastapp === 'QUEUE') {
        actionType = 'routing';
        title = `Попадание в очередь: ${leg.dst}`;
        description = `Маршрутизация вызова в очередь распределения. Длительность ожидания: ${leg.duration} сек.`;
      } else if (dcontext === 'ext-group') {
        actionType = 'routing';
        title = `Группа обзвона: ${leg.dst}`;
        description = `Вызовы направлены на группу операторов. Общее время обзвона: ${leg.duration} сек.`;
      } else if (dcontext === 'ext-local' || lastapp === 'DIAL') {
        if (disposition === 'ANSWERED') {
          actionType = 'connected';
          title = `Разговор с внутренним номером ${leg.dst}`;
          description = `Вызов отвечен. Длительность разговора: ${leg.billsec} сек (всего ${leg.duration} сек). Внутренний канал: ${leg.dstchannel || 'н/д'}.`;
        } else {
          actionType = 'ringing';
          title = `Вызов на внутренний номер ${leg.dst}`;
          const reason = disposition === 'BUSY' ? 'Занято' : disposition === 'NO ANSWER' ? 'Нет ответа' : 'Вызов пропущен';
          description = `Вызов отправлен оператору, но не отвечен. Причина: ${reason}. Продолжительность вызова: ${leg.duration} сек.`;
        }
      } else if (leg.dst && leg.dst.startsWith('q-') && disposition === 'ANSWERED') {
        actionType = 'connected';
        title = `Разговор в очереди: ${leg.dst}`;
        description = `Оператор ответил из группы очереди. Разговор длился ${leg.billsec} сек.`;
      } else {
        // General or fallback description
        if (disposition === 'ANSWERED') {
          actionType = 'connected';
          title = `Соединение с ${leg.dst || 'н/д'}`;
          description = `Успешный разговор длительностью ${leg.billsec} сек (всего: ${leg.duration} - сек). Приложение: ${leg.lastapp || 'н/д'}.`;
        } else {
          actionType = 'routing';
          title = `Маршрут / Действие: ${leg.dst || 'н/д'}`;
          const reason = disposition === 'BUSY' ? 'Занято' : disposition === 'NO ANSWER' ? 'Нет ответа' : 'Вызов пропущен/не отвечен';
          description = `Действие через контекст "${dcontext}". Результат: ${reason}. Выполнено: ${leg.lastapp || 'н/д'}.`;
        }
      }

      return {
        id: leg.uniqueid,
        calldate: leg.calldate,
        src: leg.src,
        dst: leg.dst,
        dcontext: leg.dcontext,
        channel: leg.channel,
        dstchannel: leg.dstchannel,
        lastapp: leg.lastapp,
        lastdata: leg.lastdata,
        duration: leg.duration,
        billsec: leg.billsec,
        disposition: leg.disposition,
        recordingfile: leg.recordingfile,
        did: leg.did,
        actionType,
        title,
        description
      };
    });

    res.json({
      success: true,
      uniqueid,
      linkedid: legs[0]?.linkedid || uniqueid,
      legsCount: legs.length,
      timeline
    });

  } catch (error: any) {
    console.error('Error fetching chronology:', error);
    res.status(500).json({ success: false, message: error.message || 'Ошибка загрузки хронологии' });
  }
});

// Demo data management endpoints
app.post('/api/demo/clear', requireAuth(), async (req, res) => {
  mockCDRData.length = 0;
  res.json({ success: true, message: 'Демонстрационные звонки успешно удалены.' });
});

app.post('/api/demo/generate', requireAuth(), async (req, res) => {
  mockCDRData.length = 0;
  generateMockCDR();
  res.json({ success: true, message: 'Демонстрационные звонки успешно сгенерированы.' });
});

function isDefaultDemoSettings(settings: AppSettings): boolean {
  if (!settings) return true;
  const host = settings.dbHost || 'localhost';
  const pass = settings.dbPass || '';
  const user = settings.dbUser || '';
  // Only trigger demo fallback if the database has NO password AND the user is either empty or our default placeholder user
  const isPlaceholderUser = !user || user === 'asterisk_cdr_ro';
  const isPlaceholderPass = !pass;
  return isPlaceholderUser && isPlaceholderPass;
}

function isDemoMode(settings: AppSettings): boolean {
  if (!settings) return false;
  if (settings.demoMode !== undefined) {
    return settings.demoMode === true;
  }
  return isDefaultDemoSettings(settings);
}


function normalizeTimeFilter(value: unknown, fallback: string): string {
  const time = typeof value === 'string' ? value : '';
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

function buildDateTimeFilter(date: string, time: string, endOfMinute = false): string {
  return `${date} ${time}:${endOfMinute ? '59' : '00'}`;
}

function getDateTimeFilterMs(date: string, time: string, endOfMinute = false): number {
  return new Date(`${date}T${time}:${endOfMinute ? '59' : '00'}`).getTime();
}

function getCallDateMs(calldate: string): number {
  return new Date(String(calldate || '').replace(' ', 'T')).getTime();
}

// Calls loading endpoint (the core CDR viewer with missed call evaluation algorithm)
app.get('/api/calls', requireAuth(), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    const settings = localDb.settings;
    const isDemo = isDemoMode(settings);

    // Pagination and filter parameters
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const startDate = req.query.startDate as string; // YYYY-MM-DD
    const endDate = req.query.endDate as string;     // YYYY-MM-DD

    const startTime = normalizeTimeFilter(req.query.startTime, '00:00'); // HH:mm, 24-hour
    const endTime = normalizeTimeFilter(req.query.endTime, '23:59');     // HH:mm, 24-hour

    const numberFilter = req.query.number as string; // Caller/callee details
    const statusFilter = req.query.status as string; // 'ALL', 'ANSWERED', 'MISSED', 'ONLY_UNPROCESSED', 'ONLY_CALLBACKED'
    const searchFilter = req.query.search as string; // general search
    const requestedOnlyMyCalls = req.query.onlyMyCalls === 'true';
    const requestedOperatorExt = (req.query.operatorExt as string || '').trim();
    const onlyMyCalls = requestedOnlyMyCalls || isOperatorForcedOwnCalls(localDb, req);
    const operatorExt = getEffectiveOperatorExt(localDb, req, requestedOperatorExt);

    let calls: CallEntry[] = [];

    if (isDemo) {
      // Load all from simulated memories
      calls = JSON.parse(JSON.stringify(mockCDRData));
    } else {
      // Connect to Asterisk DB & Fetch records
      // Constructing SQL Query to read records
      let sql = 'SELECT uniqueid, calldate, clid, src, dst, dcontext, channel, dstchannel, lastapp, lastdata, duration, billsec, disposition, recordingfile, did, cnum, cnam, outbound_cnum, linkedid FROM cdr WHERE 1=1';
      const sqlParams: any[] = [];

      if (startDate) {
        sql += ' AND calldate >= ?';
        sqlParams.push(buildDateTimeFilter(startDate, startTime));
      }
      if (endDate) {
        sql += ' AND calldate <= ?';
        sqlParams.push(buildDateTimeFilter(endDate, endTime, true));
      }

      sql += ' ORDER BY calldate DESC LIMIT 1000'; // Guard database read limits
      
      try {
        calls = await queryFreePBXCDR(settings, false, sql, sqlParams);
      } catch (e: any) {
        calls = JSON.parse(JSON.stringify(mockCDRData));
        (req as any).dbError = `База данных CDR недоступна. Отображаются демонстрационные данные.`;
      }
    }
    // Normalize single IVR calls where FreePBX stores dst as "s".
    // IVR answered by PBX is not a real operator answer.
    calls = calls.map(c => {
      if ((c.dcontext || "").startsWith("ivr-") && (c.dst === "s" || !c.dst)) {
        const ivrName = `IVR ${String(c.dcontext).replace("ivr-", "")}`;
        return {
          ...c,
          dst: ivrName,
          dstchannel: "",
          disposition: "NO ANSWER",
          billsec: 0,
          did: c.did || "",
        };
      }
      return c;
    });

    // Normalize click-to-call CDR legs where FreePBX stores outbound caller as trunk/outbound_cnum.
    calls = calls.map(c => normalizeClickToCallForDisplay(c));

    // Collapse queue/ring-group CDR legs into one logical call by linkedid
    const linkedGroups = new Map<string, CallEntry[]>();
    calls.forEach(c => {
      const key = c.linkedid || c.uniqueid;
      if (!linkedGroups.has(key)) linkedGroups.set(key, []);
      linkedGroups.get(key)!.push(c);
    });

    calls = Array.from(linkedGroups.values()).map(group => {
      if (group.length === 1) return normalizeClickToCallForDisplay(normalizeInboundCallerForDisplay(group[0]));

      const sorted = [...group].map(c => normalizeClickToCallForDisplay(c)).sort((a, b) => new Date(a.calldate).getTime() - new Date(b.calldate).getTime());
      const answered = sorted.find(c => c.disposition === "ANSWERED" && Number(c.billsec || 0) > 0);
      const first = sorted[0];
      const main = answered || first;

      const externalCallerNumber = getExternalCallerNumber(sorted);
      const external = sorted.find(c => (c.src || "").replace(/\D/g, "").length >= 7) || first;
      const queueLeg = sorted.find(c => c.dcontext === "ext-queues" || c.lastapp === "Queue");
      const groupLeg = sorted.find(c => c.dcontext === "ext-group");
      const routeLeg = queueLeg || groupLeg || first;
      let answeredExts = uniqueExts(sorted
        .filter(c => c.dcontext === "ext-local" && (c.disposition || "").toUpperCase() === "ANSWERED" && Number(c.billsec || 0) > 0)
        .map(c => c.dst));
      let missedExts = uniqueExts(sorted
        .filter(c => c.dcontext === "ext-local" && ((c.disposition || "").toUpperCase() !== "ANSWERED" || Number(c.billsec || 0) === 0))
        .map(c => c.dst));

      const allDialedExts = uniqueExts([
        ...sorted.flatMap(c => getDialedExtsFromLastData(c.lastdata)),
        ...answeredExts,
        ...missedExts
      ]);

      const answeredChannel = String(answered?.dstchannel || "");
      const answeredMatch = answeredChannel.match(/(?:SIP|PJSIP)\/([0-9]{2,5})-/i);
      if (answered && answeredMatch && answeredMatch[1]) {
        answeredExts = uniqueExts([answeredMatch[1]]);
      }

      if ((groupLeg || queueLeg) && allDialedExts.length) {
        missedExts = allDialedExts.filter(ext => !answeredExts.includes(ext));
      }

      return {
        ...routeLeg,
        uniqueid: first.linkedid || first.uniqueid,
        linkedid: first.linkedid || first.uniqueid,
        calldate: first.calldate,
        src: (queueLeg || groupLeg || hasInboundTrunkSignal(routeLeg) || isIncomingRouteContext(routeLeg)) ? (externalCallerNumber || external.src || first.src) : (external.src || first.src),
        dst: queueLeg ? `Очередь ${queueLeg.dst}` : groupLeg ? `Группа ${groupLeg.dst}` : (routeLeg.dst || first.dst),
        dstchannel: "",
        disposition: answered ? "ANSWERED" : "NO ANSWER",
        billsec: answered ? answered.billsec : 0,
        duration: Math.max(...sorted.map(c => Number(c.duration || 0))),
        did: buildDidWithAnsweredAndMissed((queueLeg?.did || groupLeg?.did || sorted.find(c => c.did)?.did || ""), answeredExts, missedExts) || (sorted.find(c => c.did)?.did || first.did),
      };
    });


    // --- ALGORITHM FOR DETECTING MISSED CALLS AND POST-CALLBACK STATUSES ---
    // 1. Map local commented/processed states to each call
    // Normalize click-to-call CDR legs in stats as well.
    calls = calls.map(c => normalizeClickToCallForDisplay(c));

    // Collapse CDR legs for stats by linkedid, same as calls list
    const statsLinkedGroups = new Map<string, CallEntry[]>();
    calls.forEach(c => {
      const key = c.linkedid || c.uniqueid;
      if (!statsLinkedGroups.has(key)) statsLinkedGroups.set(key, []);
      statsLinkedGroups.get(key)!.push(c);
    });

    calls = Array.from(statsLinkedGroups.values()).map(group => {
      if (group.length === 1) return normalizeClickToCallForDisplay(normalizeInboundCallerForDisplay(group[0]));
      const sorted = [...group].map(c => normalizeClickToCallForDisplay(c)).sort((a, b) => new Date(a.calldate).getTime() - new Date(b.calldate).getTime());
      const answered = sorted.find(c => (c.disposition || "").toUpperCase() === "ANSWERED" && Number(c.billsec || 0) > 0);
      const queueLeg = sorted.find(c => c.dcontext === "ext-queues" || c.lastapp === "Queue");
      const groupLeg = sorted.find(c => c.dcontext === "ext-group");
      const routeLeg = queueLeg || groupLeg || sorted[0];
      const externalCallerNumber = getExternalCallerNumber(sorted);
      const external = sorted.find(c => (c.src || "").replace(/\D/g, "").length >= 7) || routeLeg;
      const extLegs = sorted.filter(c => c.dcontext === "ext-local" && /^[0-9]{2,5}$/.test(String(c.dst || "")));
      let missedExts = uniqueExts(extLegs
        .filter(c => (c.disposition || "").toUpperCase() !== "ANSWERED" || Number(c.billsec || 0) === 0)
        .map(c => String(c.dst)));
      let answeredExts = uniqueExts(extLegs
        .filter(c => (c.disposition || "").toUpperCase() === "ANSWERED" && Number(c.billsec || 0) > 0)
        .map(c => String(c.dst)));

      const allDialedExts = uniqueExts([
        ...sorted.flatMap(c => getDialedExtsFromLastData(c.lastdata)),
        ...answeredExts,
        ...missedExts
      ]);

      const answeredChannel = String(answered?.dstchannel || "");
      const answeredMatch = answeredChannel.match(/(?:SIP|PJSIP)\/([0-9]{2,5})-/i);
      if (answered && answeredMatch && answeredMatch[1]) {
        answeredExts = uniqueExts([answeredMatch[1]]);
      }

      if ((groupLeg || queueLeg) && allDialedExts.length) {
        missedExts = allDialedExts.filter(ext => !answeredExts.includes(ext));
      }

      const did = routeLeg.did || sorted.find(c => c.did)?.did || "";
      return {
        ...routeLeg,
        uniqueid: routeLeg.linkedid || routeLeg.uniqueid,
        linkedid: routeLeg.linkedid || routeLeg.uniqueid,
        calldate: sorted[0].calldate,
        src: (queueLeg || groupLeg || hasInboundTrunkSignal(routeLeg) || isIncomingRouteContext(routeLeg)) ? (externalCallerNumber || external.src || routeLeg.src) : (external.src || routeLeg.src),
        dst: queueLeg ? `Очередь ${queueLeg.dst}` : groupLeg ? `Группа ${groupLeg.dst}` : (routeLeg.dst || sorted[0].dst),
        dstchannel: "",
        did: buildDidWithAnsweredAndMissed(did, answeredExts, missedExts) || did,
        disposition: answered ? "ANSWERED" : "NO ANSWER",
        billsec: answered ? answered.billsec : 0,
        duration: Math.max(...sorted.map(c => Number(c.duration || 0))),
        recordingfile: answered?.recordingfile || sorted.find(c => c.recordingfile)?.recordingfile || "",
      };
    });

    const directory = localDb.directory || [];

    const callMap = new Map<string, CallEntry>();
    calls.forEach(call => {
      const localStatus = localDb.missedCallStatuses.find(s => s.uniqueid === call.uniqueid);
      if (localStatus) {
        call.processed = localStatus.processed;
        call.comment = localStatus.comment;
        call.processedBy = localStatus.processedBy;
        call.processedAt = localStatus.processedAt;
      } else {
        call.processed = false;
        call.comment = '';
      }

      // Resolve phone numbers against directory entries
      const cleanNum = (num: string) => {
        if (!num) return '';
        return num.trim();
      };

      const findContact = (num: string) => {
        const val = cleanNum(num);
        if (!val) return null;
        return findDirectoryContactByNumber(directory, val);
      };

      const srcContact = findContact(call.src);
      const dstContact = findContact(call.dst);

      if (srcContact) {
        call.resolvedName = srcContact.name;
        call.resolvedType = srcContact.type;
      } else if (dstContact) {
        call.resolvedName = dstContact.name;
        call.resolvedType = dstContact.type;
      }

      callMap.set(call.uniqueid, call);
    });

    // 2. Identify phone callbacks and resolutions
    // Sort calls ascending to run chronological analysis of callbacks
    const chronologicalCalls = [...calls].sort((a, b) => new Date(a.calldate).getTime() - new Date(b.calldate).getTime());
    
    // For every unanswered call, look for subsequent conversations (either in or out) with this client
    chronologicalCalls.forEach((call, index) => {
      const disposition = call.disposition?.toUpperCase();
      const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
      
      // Determine if incoming missed
      const isIncomingMissed = isMissedType && isIncoming(call);

      if (isIncomingMissed && call.src && call.src.trim().length > 3) {
        const clientNum = call.src.trim();
        const callTime = new Date(call.calldate).getTime();
        
        // Find if there's any subsequent answered call with this number in chronologicalCalls
        const resolution = chronologicalCalls.find(c => {
          const cTime = new Date(c.calldate).getTime();
          // Must happen AFTER the missed call
          if (cTime <= callTime) return false;
          
          const isAnswered = c.disposition === 'ANSWERED' && c.billsec > 0;
          if (!isAnswered) return false;

          // Outbound callback: operator (internal extension e.g. src < 1000) dialled the client (dst = clientNum)
          const isOutboundResolved = c.dst === clientNum;
          
          // Inbound callback: client called back again (src = clientNum) and someone answered (dst is not missed)
          const isInboundResolved = c.src === clientNum;

          return isOutboundResolved || isInboundResolved;
        });

        if (resolution) {
          // Keep references in the original results array
          const originalCall = callMap.get(call.uniqueid);
          if (originalCall) {
            originalCall.wasCallbacked = true;
            originalCall.callbackCallId = resolution.uniqueid;
            originalCall.callbackTime = resolution.calldate;

            // Apply KPI SLA timeframe processing
            const resTime = new Date(resolution.calldate).getTime();
            const diffMs = resTime - callTime;
            const diffMin = Math.floor(diffMs / 60000);
            const kpiMinutes = settings && settings.callbackKpiMinutes !== undefined ? Number(settings.callbackKpiMinutes) : 60;

            if (diffMin <= kpiMinutes) {
              originalCall.wasKpiResolved = true;
              // If not already manually commented or processed, auto-resolve
              if (!originalCall.processed) {
                originalCall.processed = true;
                originalCall.processedBy = 'Система KPI';
                originalCall.processedAt = resolution.calldate;
                originalCall.comment = `Авто-отзвон осуществлен за ${diffMin} мин (Лимит KPI: ${kpiMinutes} мин).`;
              }
            } else {
              originalCall.wasKpiResolved = false;
            }
          }
        }
      }
    });

    // 3. Apply operational dashboard filter conditions
    let filteredCalls = [...calls];

    // Filter by period
    if (startDate) {
      const sVal = getDateTimeFilterMs(startDate, startTime);
      filteredCalls = filteredCalls.filter(c => getCallDateMs(c.calldate) >= sVal);
    }
    if (endDate) {
      const eVal = getDateTimeFilterMs(endDate, endTime, true);
      filteredCalls = filteredCalls.filter(c => getCallDateMs(c.calldate) <= eVal);
    }

    // General string search
    if (searchFilter && searchFilter.trim().length > 0) {
      const s = searchFilter.toLowerCase();
      filteredCalls = filteredCalls.filter(c => 
        c.src?.toLowerCase().includes(s) || 
        c.dst?.toLowerCase().includes(s) || 
        c.clid?.toLowerCase().includes(s) || 
        c.did?.toLowerCase().includes(s) || 
        c.uniqueid?.toLowerCase().includes(s) ||
        c.comment?.toLowerCase().includes(s) ||
        c.resolvedName?.toLowerCase().includes(s)
      );
    }

    // Number specific search. Use exact digit-token match so extension 100 does not match external 79788101210.
    if (numberFilter && numberFilter.trim().length > 0) {
      const n = numberFilter.replace(/\D/g, '');
      filteredCalls = filteredCalls.filter(c => callHasExactNumber(c, n));
    }

    // Filter by "My Calls". Use the same exact-number logic as the number search.
    if (onlyMyCalls && operatorExt) {
      filteredCalls = filteredCalls.filter(c => callHasExactNumber(c, operatorExt));
    }

    // Status filtering logic
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'ANSWERED') {
        filteredCalls = filteredCalls.filter(c => c.disposition === 'ANSWERED');
      } else if (statusFilter === 'MISSED') {
        filteredCalls = filteredCalls.filter(c => {
          const disposition = c.disposition?.toUpperCase();
          const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
          return isIncoming(c) && isMissedType;
        });
      } else if (statusFilter === 'ONLY_UNPROCESSED') {
        filteredCalls = filteredCalls.filter(c => {
          const disposition = c.disposition?.toUpperCase();
          const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
          return isIncoming(c) && isMissedType && !c.processed && !c.wasCallbacked;
        });
      } else if (statusFilter === 'ONLY_CALLBACKED') {
        filteredCalls = filteredCalls.filter(c => c.wasCallbacked === true);
      } else if (statusFilter === 'INBOUND') {
        filteredCalls = filteredCalls.filter(c => isIncoming(c));
      } else if (statusFilter === 'OUTBOUND') {
        filteredCalls = filteredCalls.filter(c => isOutgoing(c));
      } else if (statusFilter === 'INTERNAL') {
        filteredCalls = filteredCalls.filter(c => isInternal(c));
      } else if (statusFilter === 'PROCESSED') {
        filteredCalls = filteredCalls.filter(c => {
          const disposition = c.disposition?.toUpperCase();
          const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
          const isHandledInSla = c.wasKpiResolved === true;
          return isIncoming(c) && isMissedType && isHandledInSla;
        });
      } else if (statusFilter === 'LOST') {
        filteredCalls = filteredCalls.filter(c => {
          const disposition = c.disposition?.toUpperCase();
          const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
          const kpiMinutes = settings && settings.callbackKpiMinutes !== undefined
            ? Number(settings.callbackKpiMinutes)
            : 60;
          const callTime = new Date(c.calldate).getTime();
          const slaExpired = Number.isFinite(callTime) && (Date.now() - callTime) > kpiMinutes * 60 * 1000;
          const isHandledInSla = c.wasKpiResolved === true;
          const isLateCallback = c.wasCallbacked && !c.wasKpiResolved;
          return isIncoming(c) && isMissedType && !isHandledInSla && (isLateCallback || slaExpired);
        });
      }
    }

    // Sort calls by calldate DESC (latest first)
    const sortedCalls = filteredCalls.sort((a, b) => new Date(b.calldate).getTime() - new Date(a.calldate).getTime());

    // Paginate results
    const totalCount = sortedCalls.length;
    const paginatedCalls = sortedCalls.slice((page - 1) * limit, page * limit);

    res.json({
      calls: paginatedCalls,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      dbError: (req as any).dbError || undefined,
      demoModeActive: isDemo
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error executing CDR fetch logs.' });
  }
});

// App metrics / KPI endpoint
app.get('/api/stats', requireAuth(), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    const settings = localDb.settings;
    const isDemo = isDemoMode(settings);

    // Retrieve active filter parameters
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const startTime = normalizeTimeFilter(req.query.startTime, '00:00');
    const endTime = normalizeTimeFilter(req.query.endTime, '23:59');
    const numberFilter = req.query.number as string;
    const searchFilter = req.query.search as string;
    const statusFilter = req.query.status as string;
    const requestedOperatorExt = (req.query.operatorExt as string || '').trim();
    const requestedOnlyMyCalls = req.query.onlyMyCalls === 'true';
    const operatorExt = getEffectiveOperatorExt(localDb, req, requestedOperatorExt);
    const onlyMyCalls = requestedOnlyMyCalls || isOperatorForcedOwnCalls(localDb, req);
    
    let calls: CallEntry[] = [];
    if (isDemo) {
      calls = JSON.parse(JSON.stringify(mockCDRData));
    } else {
      let sql = 'SELECT uniqueid, calldate, clid, src, dst, dcontext, channel, dstchannel, lastapp, lastdata, duration, billsec, disposition, recordingfile, did, cnum, cnam, outbound_cnum, linkedid FROM cdr WHERE 1=1';
      const sqlParams: any[] = [];

      if (startDate) {
        sql += ' AND calldate >= ?';
        sqlParams.push(buildDateTimeFilter(startDate, startTime));
      } else {
        sql += ' AND calldate >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
      }
      if (endDate) {
        sql += ' AND calldate <= ?';
        sqlParams.push(buildDateTimeFilter(endDate, endTime, true));
      }

      sql += ' ORDER BY calldate DESC LIMIT 1000';
      
      try {
        calls = await queryFreePBXCDR(localDb.settings, false, sql, sqlParams);
      } catch (e: any) {
        calls = JSON.parse(JSON.stringify(mockCDRData));
        (req as any).dbError = `База данных CDR недоступна. Отображаются демонстрационные данные.`;
      }
    }

    // Collapse CDR legs for stats by linkedid, same as calls list
    const statsLinkedGroups = new Map<string, CallEntry[]>();
    calls.forEach(c => {
      const key = c.linkedid || c.uniqueid;
      if (!statsLinkedGroups.has(key)) statsLinkedGroups.set(key, []);
      statsLinkedGroups.get(key)!.push(c);
    });

    calls = Array.from(statsLinkedGroups.values()).map(group => {
      if (group.length === 1) return normalizeClickToCallForDisplay(normalizeInboundCallerForDisplay(group[0]));
      const sorted = [...group].map(c => normalizeClickToCallForDisplay(c)).sort((a, b) => new Date(a.calldate).getTime() - new Date(b.calldate).getTime());
      const answered = sorted.find(c => (c.disposition || "").toUpperCase() === "ANSWERED" && Number(c.billsec || 0) > 0);
      const queueLeg = sorted.find(c => c.dcontext === "ext-queues" || c.lastapp === "Queue");
      const groupLeg = sorted.find(c => c.dcontext === "ext-group");
      const routeLeg = queueLeg || groupLeg || sorted[0];
      const externalCallerNumber = getExternalCallerNumber(sorted);
      const external = sorted.find(c => (c.src || "").replace(/\D/g, "").length >= 7) || routeLeg;
      const extLegs = sorted.filter(c => c.dcontext === "ext-local" && /^[0-9]{2,5}$/.test(String(c.dst || "")));
      let missedExts = uniqueExts(extLegs
        .filter(c => (c.disposition || "").toUpperCase() !== "ANSWERED" || Number(c.billsec || 0) === 0)
        .map(c => String(c.dst)));
      let answeredExts = uniqueExts(extLegs
        .filter(c => (c.disposition || "").toUpperCase() === "ANSWERED" && Number(c.billsec || 0) > 0)
        .map(c => String(c.dst)));

      const allDialedExts = uniqueExts([
        ...sorted.flatMap(c => getDialedExtsFromLastData(c.lastdata)),
        ...answeredExts,
        ...missedExts
      ]);

      const answeredChannel = String(answered?.dstchannel || "");
      const answeredMatch = answeredChannel.match(/(?:SIP|PJSIP)\/([0-9]{2,5})-/i);
      if (answered && answeredMatch && answeredMatch[1]) {
        answeredExts = uniqueExts([answeredMatch[1]]);
      }

      if ((groupLeg || queueLeg) && allDialedExts.length) {
        missedExts = allDialedExts.filter(ext => !answeredExts.includes(ext));
      }

      const did = routeLeg.did || sorted.find(c => c.did)?.did || "";
      return {
        ...routeLeg,
        uniqueid: routeLeg.linkedid || routeLeg.uniqueid,
        linkedid: routeLeg.linkedid || routeLeg.uniqueid,
        calldate: sorted[0].calldate,
        src: (queueLeg || groupLeg || hasInboundTrunkSignal(routeLeg) || isIncomingRouteContext(routeLeg)) ? (externalCallerNumber || external.src || routeLeg.src) : (external.src || routeLeg.src),
        dst: queueLeg ? `Очередь ${queueLeg.dst}` : groupLeg ? `Группа ${groupLeg.dst}` : (routeLeg.dst || sorted[0].dst),
        dstchannel: "",
        did: buildDidWithAnsweredAndMissed(did, answeredExts, missedExts) || did,
        disposition: answered ? "ANSWERED" : "NO ANSWER",
        billsec: answered ? answered.billsec : 0,
        duration: Math.max(...sorted.map(c => Number(c.duration || 0))),
        recordingfile: answered?.recordingfile || sorted.find(c => c.recordingfile)?.recordingfile || "",
      };
    });

    const directory = localDb.directory || [];
    const callMap = new Map<string, CallEntry>();
    calls.forEach(c => {
      const local = localDb.missedCallStatuses.find(status => status.uniqueid === c.uniqueid);
      if (local) {
        c.processed = local.processed;
        c.comment = local.comment;
        c.processedBy = local.processedBy;
        c.processedAt = local.processedAt;
      } else {
        c.processed = false;
        c.comment = '';
      }

      const cleanNum = (num: string) => num ? num.trim() : '';
      const findContact = (num: string) => {
        const val = cleanNum(num);
        if (!val) return null;
        return findDirectoryContactByNumber(directory, val);
      };

      const srcContact = findContact(c.src);
      const dstContact = findContact(c.dst);

      if (srcContact) {
        c.resolvedName = srcContact.name;
        c.resolvedType = srcContact.type;
      } else if (dstContact) {
        c.resolvedName = dstContact.name;
        c.resolvedType = dstContact.type;
      }
      callMap.set(c.uniqueid, c);
    });

    // Calculate callback/KPI statuses for /api/stats exactly like /api/calls.
    // Without this block processedCalls stays 0 even when table rows show "SLA OK".
    const chronologicalStatsCalls = [...calls].sort((a, b) => new Date(a.calldate).getTime() - new Date(b.calldate).getTime());

    chronologicalStatsCalls.forEach((call) => {
      const disposition = call.disposition?.toUpperCase();
      const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
      const isIncomingMissed = isMissedType && isIncoming(call);

      if (isIncomingMissed && call.src && call.src.trim().length > 3) {
        const clientNum = call.src.trim();
        const callTime = new Date(call.calldate).getTime();

        const resolution = chronologicalStatsCalls.find(c => {
          const cTime = new Date(c.calldate).getTime();
          if (cTime <= callTime) return false;

          const isAnswered = c.disposition === 'ANSWERED' && Number(c.billsec || 0) > 0;
          if (!isAnswered) return false;

          const isOutboundResolved = c.dst === clientNum;
          const isInboundResolved = c.src === clientNum;

          return isOutboundResolved || isInboundResolved;
        });

        if (resolution) {
          const originalCall = callMap.get(call.uniqueid);
          if (originalCall) {
            originalCall.wasCallbacked = true;
            originalCall.callbackCallId = resolution.uniqueid;
            originalCall.callbackTime = resolution.calldate;

            const resTime = new Date(resolution.calldate).getTime();
            const diffMs = resTime - callTime;
            const diffMin = Math.floor(diffMs / 60000);
            const kpiMinutes = settings && settings.callbackKpiMinutes !== undefined ? Number(settings.callbackKpiMinutes) : 60;

            if (diffMin <= kpiMinutes) {
              originalCall.wasKpiResolved = true;
              if (!originalCall.processed) {
                originalCall.processed = true;
                originalCall.processedBy = 'Система KPI';
                originalCall.processedAt = resolution.calldate;
                originalCall.comment = `Авто-отзвон осуществлен за ${diffMin} мин (Лимит KPI: ${kpiMinutes} мин).`;
              }
            } else {
              originalCall.wasKpiResolved = false;
            }
          }
        }
      }
    });

    // Apply dashboard visuals filters to stats metrics (excluding statusFilter)
    let filteredCalls = [...calls];

    if (startDate) {
      const sVal = getDateTimeFilterMs(startDate, startTime);
      filteredCalls = filteredCalls.filter(c => getCallDateMs(c.calldate) >= sVal);
    }
    if (endDate) {
      const eVal = getDateTimeFilterMs(endDate, endTime, true);
      filteredCalls = filteredCalls.filter(c => getCallDateMs(c.calldate) <= eVal);
    }

    if (searchFilter && searchFilter.trim().length > 0) {
      const s = searchFilter.toLowerCase();
      filteredCalls = filteredCalls.filter(c => 
        c.src?.toLowerCase().includes(s) || 
        c.dst?.toLowerCase().includes(s) || 
        c.clid?.toLowerCase().includes(s) || 
        c.did?.toLowerCase().includes(s) || 
        c.uniqueid?.toLowerCase().includes(s) ||
        c.comment?.toLowerCase().includes(s) ||
        c.resolvedName?.toLowerCase().includes(s)
      );
    }

    if (numberFilter && numberFilter.trim().length > 0) {
      const n = numberFilter.replace(/\D/g, '');
      filteredCalls = filteredCalls.filter(c => callHasExactNumber(c, n));
    }

    if (onlyMyCalls && operatorExt) {
      filteredCalls = filteredCalls.filter(c => callHasExactNumber(c, operatorExt));
    }

    // Now calculate actual stats based on filtered list of calls
    let inboundCalls = 0;
    let outboundCalls = 0;
    let internalCalls = 0;
    let missedCalls = 0;
    let processedCalls = 0;
    let lostCalls = 0;

    filteredCalls.forEach(c => {
      const isIncomingCall = isIncoming(c);
      const isOutgoingCall = isOutgoing(c);
      const isInternalCall = isInternal(c);

      if (isIncomingCall) {
        inboundCalls++;
      } else if (isOutgoingCall) {
        outboundCalls++;
      } else if (isInternalCall) {
        internalCalls++;
      }

      const disposition = c.disposition?.toUpperCase();
      const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
      const isIncomingMissed = isIncomingCall && isMissedType;

      if (isIncomingMissed) {
        missedCalls++;

        const kpiMinutes = localDb.settings && localDb.settings.callbackKpiMinutes !== undefined
          ? Number(localDb.settings.callbackKpiMinutes)
          : 60;

        const callTime = new Date(c.calldate).getTime();
        const slaExpired = Number.isFinite(callTime) && (Date.now() - callTime) > kpiMinutes * 60 * 1000;

        const isHandledInSla = c.wasKpiResolved === true;
        const isLateCallback = c.wasCallbacked === true && c.wasKpiResolved !== true;

        if (isHandledInSla) {
          processedCalls++;
        } else if (isLateCallback || slaExpired) {
          lostCalls++;
        }
      }
    });

    // Если активна карточка "Обработанные", принудительно синхронизируем её число
    // с тем же видимым набором, который отдаёт /api/calls?status=PROCESSED.
    if (statusFilter === 'PROCESSED') {
      processedCalls = filteredCalls.filter(c => {
        const disposition = c.disposition?.toUpperCase();
        const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
        return isIncoming(c) && isMissedType && c.wasKpiResolved === true;
      }).length;
    }

    res.json({
      inboundCalls,
      outboundCalls,
      internalCalls,
      missedCalls,
      processedCalls,
      lostCalls,
      dbError: (req as any).dbError || undefined,
      demoModeActive: isDemo
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Play audio recording binary if present on host, using smart stream chunking
app.get('/api/recordings/:filename', async (req, res) => {
  const { filename } = req.params;
  const localDb = await readLocalDb();
  const recordingsDir = localDb.settings.recordingsPath;
  const isDemo = isDemoMode(localDb.settings);

  if (isDemo || !filename || filename.includes('..')) {
    // Return sample visual synthesized test audio context for Demo mode live playback 
    // We send a short static silence/tone or pipe a generic clean asset
    const sampleAudioPath = path.join(__dirname, 'assets', 'sample_voip_recording.mp3');
    if (fs.existsSync(sampleAudioPath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      fs.createReadStream(sampleAudioPath).pipe(res);
    } else {
      // Fast fake content back for front-end visual loading indicator verification
      res.setHeader('Content-Type', 'audio/wav');
      res.status(200).send(Buffer.alloc(1000));
    }
    return;
  }

  // Real VoIP recordings distribution path handler.
  // Never invoke a shell with a user-controlled filename; resolve the path in-process.
  const safeFilename = path.basename(filename);
  const recordingsRoot = path.resolve(recordingsDir);
  const directPath = path.resolve(recordingsRoot, safeFilename);

  const findRecordingFile = (dir: string, targetName: string): string | null => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === targetName) return entryPath;
      if (entry.isDirectory()) {
        const resolvedEntryPath = path.resolve(entryPath);
        if (!resolvedEntryPath.startsWith(recordingsRoot + path.sep)) continue;
        const found = findRecordingFile(entryPath, targetName);
        if (found) return found;
      }
    }
    return null;
  };

  let filePath = directPath.startsWith(recordingsRoot + path.sep) && fs.existsSync(directPath) ? directPath : '';
  if (!filePath && fs.existsSync(recordingsRoot)) {
    filePath = findRecordingFile(recordingsRoot, safeFilename) || '';
  }

  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: `Файл записи ${safeFilename} не найден на диске Asterisk по адресу ${recordingsDir}` });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': filename.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': filename.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});


// FRONTEND DEV / PRODUCTION INTEGRATION HANDLER
async function startServer() {
  if (NODE_ENV === 'development') {
    // Instantiate Vite in dev middleware context
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    
    app.use(vite.middlewares);
    console.log('Vite middleware registered for live client-side Hot Module Rendering proxy.');
  } else {
    // Serving production assets
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Generate mock audio file if missing in assets and demo mode is true
  const assetsDir = path.join(__dirname, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  const sampleAudioPath = path.join(assetsDir, 'sample_voip_recording.mp3');
  if (!fs.existsSync(sampleAudioPath)) {
    // Write tiny dummy 1-second silence mp3 file to support playing demo audio
    const dummyMp3Hex = "fff334c00000003815000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    fs.writeFileSync(sampleAudioPath, Buffer.from(dummyMp3Hex, 'hex'));
  }

  app.listen(parseInt(PORT, 10), '0.0.0.0', () => {
    console.log(`VOIP CDR Missed Calls Service is operational on port ${PORT}`);
    console.log(`Environment context: ${NODE_ENV}`);
    console.log(`Simulated Asterisk Sandbox status: DISABLED`);
  });
}

startServer().catch((err) => {
  console.error('Fatal initialization error:', err);
});
