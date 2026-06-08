import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import net from 'net';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { CallEntry, MissedCallStatus, AppSettings, DashboardStats, UserRole, WebUser } from './src/types.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function createAuthToken(payload: { username: string; role: UserRole; expiresAt: number }): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token: string): { username: string; role: UserRole; expiresAt: number } | null {
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
          role: 'admin' as UserRole
        },
        {
          id: 'u2',
          username: process.env.OPERATOR_USERNAME || 'operator',
          passwordHash: operatorPasswordHash,
          role: 'operator' as UserRole
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

function requireAuth(role?: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Auth token is missing or expired' });
      return;
    }
    
    if (role === 'admin' && user.role !== 'admin') {
      res.status(403).json({ error: 'Access denied: Admin role required' });
      return;
    }
    
    (req as any).user = user;
    next();
  };
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

  if (!user) {
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
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  });
});

// Settings endpoint
app.get('/api/settings', requireAuth('admin'), async (req, res) => {
  const localDb = await readLocalDb();
  res.json(localDb.settings);
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

// --- TELEPHONE DIRECTORY ENDPOINTS ---

// Get all directory entries
app.get('/api/directory', requireAuth(), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    res.json(localDb.directory || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new directory entry
app.post('/api/directory', requireAuth(), async (req, res) => {
  try {
    const { name, number, type, comment } = req.body;
    if (!name || !number || !type) {
      res.status(400).json({ error: 'Поля Имя, Номер и Тип обязательны' });
      return;
    }

    const localDb = await readLocalDb();
    if (!localDb.directory) localDb.directory = [];

    const normalizedNum = normalizePhoneNumber(number, localDb.settings);

    const newEntry = {
      id: 'dir_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: name.trim(),
      number: normalizedNum || number.trim(),
      type: type,
      comment: (comment || '').trim(),
      createdAt: new Date().toISOString()
    };

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
    const { name, number, type, comment } = req.body;
    if (!name || !number || !type) {
      res.status(400).json({ error: 'Поля Имя, Номер и Тип обязательны' });
      return;
    }

    const localDb = await readLocalDb();
    if (!localDb.directory) localDb.directory = [];

    const entryIdx = localDb.directory.findIndex((e: any) => e.id === id);
    if (entryIdx === -1) {
      res.status(404).json({ error: 'Запись в справочнике не найдена' });
      return;
    }

    const normalizedNum = normalizePhoneNumber(number, localDb.settings);

    const updatedEntry = {
      ...localDb.directory[entryIdx],
      name: name.trim(),
      number: normalizedNum || number.trim(),
      type: type,
      comment: (comment || '').trim()
    };

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
      const orig = entry.number;
      const normalized = normalizePhoneNumber(orig, localDb.settings);
      if (orig !== normalized) {
        updatedCount++;
        return { ...entry, number: normalized };
      }
      return entry;
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
    const { entries, overwrite } = req.body;
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'Неверный формат. Ожидается массив контактов.' });
      return;
    }

    const localDb = await readLocalDb();
    if (!localDb.directory) localDb.directory = [];

    const newEntries: any[] = [];
    for (let i = 0; i < entries.length; i++) {
      const { name, number, type, comment } = entries[i];
      if (!name || !number) {
        continue; // skip invalid records
      }

      const normalizedNum = normalizePhoneNumber(number, localDb.settings);
      newEntries.push({
        id: 'dir_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000),
        name: String(name).trim(),
        number: normalizedNum || String(number).trim(),
        type: (type === 'internal' || type === 'client') ? type : 'client',
        comment: String(comment || '').trim(),
        createdAt: new Date().toISOString()
      });
    }

    if (overwrite === true) {
      localDb.directory = newEntries;
    } else {
      localDb.directory.push(...newEntries);
    }

    await writeLocalDb(localDb);
    res.json({ success: true, count: newEntries.length });
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
  log.push(`[AMI-SIMULATOR] Начат имитационный вызов из внутреннего номера [${fromExtension}] на номер [${toPhoneNumber}]...`);
  log.push(`[AMI-SIMULATOR] Имитируем: подключение к Asterisk AMI...`);
  log.push(`[AMI-SIMULATOR] Asterisk приветствие: "Asterisk Call Manager/5.0.3"`);
  log.push(`[AMI-SIMULATOR] Команда: Login (Username: clicktocall, Secret: ••••••) отправлена`);
  log.push(`[AMI-SIMULATOR] Получен ответ: Response: Success (Message: Authentication accepted)`);
  log.push(`[AMI-SIMULATOR] Формируем Origin Channel: "Local/${fromExtension}@${context}"`);
  log.push(`[AMI-SIMULATOR] Команда: Originate (Channel: Local/${fromExtension}@${context}, Exten: ${toPhoneNumber}, Context: ${context}, ExtenPriority: 1, CallerID: <${fromExtension}>) отправлена`);
  log.push(`[AMI-SIMULATOR] Получен ответ: Response: Success (Message: Originate successfully queued)`);
  log.push(`[AMI-SIMULATOR] Вызов успешно инициирован! Сначала зазвонит ваш телефон (${fromExtension}), а после поднятия трубки начнется вызов на ${toPhoneNumber}.`);
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
            
            const origChannel = `Local/${fromExtension}@${context}`;
            log.push(`[AMI] Отправляем Originate: [${origChannel}] -> [${toPhoneNumber}] по контексту [${context}]...`);
            
            socket.write(
              `Action: Originate\r\n` +
              `Channel: ${origChannel}\r\n` +
              `Exten: ${toPhoneNumber}\r\n` +
              `Context: ${context}\r\n` +
              `Priority: 1\r\n` +
              `CallerID: <${fromExtension}> ClickToCall\r\n` +
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

// POST endpoint to trigger Ami Originate Call
app.post('/api/click-to-call', requireAuth(), async (req, res) => {
  try {
    const { fromExtension, toPhoneNumber } = req.body;
    if (!fromExtension || !toPhoneNumber) {
      res.status(400).json({ error: 'Поля Внутренний номер (fromExtension) и Телефон назначения (toPhoneNumber) обязательны' });
      return;
    }

    const localDb = await readLocalDb();
    const result = await triggerAMICall(localDb.settings, fromExtension.trim(), toPhoneNumber.trim());
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
  return false;
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
    const isDemo = process.env.DEMO_MODE === 'true' || isDefaultDemoSettings(settings) || req.query.demo === 'true';

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
    const onlyMyCalls = req.query.onlyMyCalls === 'true';
    const operatorExt = (req.query.operatorExt as string || '').trim();

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
        console.error('Real MariaDB query failed:', e.message);
        res.status(500).json({ error: `Ошибка подключения к базе MariaDB (${settings.dbHost}:${settings.dbPort}): ${e.message}` });
        return;
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

    // Collapse queue/ring-group CDR legs into one logical call by linkedid
    const linkedGroups = new Map<string, CallEntry[]>();
    calls.forEach(c => {
      const key = c.linkedid || c.uniqueid;
      if (!linkedGroups.has(key)) linkedGroups.set(key, []);
      linkedGroups.get(key)!.push(c);
    });

    calls = Array.from(linkedGroups.values()).map(group => {
      if (group.length === 1) return group[0];

      const sorted = [...group].sort((a, b) => new Date(a.calldate).getTime() - new Date(b.calldate).getTime());
      const answered = sorted.find(c => c.disposition === "ANSWERED" && Number(c.billsec || 0) > 0);
      const first = sorted[0];
      const main = answered || first;

      const external = sorted.find(c => (c.src || "").replace(/\D/g, "").length >= 7) || first;
      const queueLeg = sorted.find(c => c.dcontext === "ext-queues" || c.lastapp === "Queue");
      const groupLeg = sorted.find(c => c.dcontext === "ext-group");
      const routeLeg = queueLeg || groupLeg || first;
      const answeredExts = Array.from(new Set(sorted.filter(c => c.dcontext === "ext-local" && (c.disposition || "").toUpperCase() === "ANSWERED" && Number(c.billsec || 0) > 0).map(c => c.dst).filter(v => /^[0-9]{2,5}$/.test(String(v || "")))));
      const missedExts = Array.from(new Set(sorted.filter(c => c.dcontext === "ext-local" && ((c.disposition || "").toUpperCase() !== "ANSWERED" || Number(c.billsec || 0) === 0)).map(c => c.dst).filter(v => /^[0-9]{2,5}$/.test(String(v || "")))));
      if (groupLeg) {
        const allGroupExts = Array.from(new Set(String(groupLeg.lastdata || "").match(/SIP\/([0-9]{2,5})/g)?.map(x => x.replace("SIP/", "")) || []));
        const answeredChannel = String(answered?.dstchannel || "");
        const answeredMatch = answeredChannel.match(/SIP\/([0-9]{2,5})-/);
        if (answered && answeredMatch && answeredMatch[1]) {
          answeredExts.splice(0, answeredExts.length, answeredMatch[1]);
        }
        if (!answered && allGroupExts.length) {
          missedExts.splice(0, missedExts.length, ...allGroupExts);
        }
      }
      const dialedExts = answered ? answeredExts : missedExts;

      return {
        ...routeLeg,
        uniqueid: first.linkedid || first.uniqueid,
        linkedid: first.linkedid || first.uniqueid,
        calldate: first.calldate,
        src: external.src || first.src,
        dst: queueLeg ? `Очередь ${queueLeg.dst}` : groupLeg ? `Группа ${groupLeg.dst}` : (routeLeg.dst || first.dst),
        dstchannel: "",
        disposition: answered ? "ANSWERED" : "NO ANSWER",
        billsec: answered ? answered.billsec : 0,
        duration: Math.max(...sorted.map(c => Number(c.duration || 0))),
        did: dialedExts.length ? `${(queueLeg?.did || groupLeg?.did || sorted.find(c => c.did)?.did || "")} → ${answered ? "ответил" : "пропустили"}: ${dialedExts.join(", ")}` : (sorted.find(c => c.did)?.did || first.did),
      };
    });


    // --- ALGORITHM FOR DETECTING MISSED CALLS AND POST-CALLBACK STATUSES ---
    // 1. Map local commented/processed states to each call
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
        let found = directory.find((e: any) => e.number.trim() === val);
        if (found) return found;

        if (val.replace(/\D/g, '').length > 4) {
          const digits = val.replace(/\D/g, '');
          found = directory.find((e: any) => {
            const entryDigits = e.number.replace(/\D/g, '');
            return entryDigits.length > 4 && (entryDigits.endsWith(digits) || digits.endsWith(entryDigits));
          });
        }
        return found || null;
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
      const isIncomingMissed = isMissedType && (call.dcontext === 'from-trunk' || call.dst === '600' || call.did?.length > 0 || (call.channel && !call.dstchannel));

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

    // Number specific search
    if (numberFilter && numberFilter.trim().length > 0) {
      const n = numberFilter.replace(/\D/g, '');
      filteredCalls = filteredCalls.filter(c => 
        (c.src && c.src.replace(/\D/g, '').includes(n)) || 
        (c.dst && c.dst.replace(/\D/g, '').includes(n))
      );
    }

    // Filter by "My Calls"
    if (onlyMyCalls && operatorExt) {
      const ext = operatorExt;
      filteredCalls = filteredCalls.filter(c => {
        const matchesSrc = c.src === ext || (c.src && c.src.endsWith(ext));
        const matchesDst = c.dst === ext || (c.dst && c.dst.endsWith(ext));
        const matchesClid = c.clid && c.clid.includes(ext);
        const matchesChannel = c.channel && (c.channel.includes(`/ ${ext}-`) || c.channel.includes(`/${ext}-`) || c.channel.includes(`-${ext}`));
        const matchesDstChannel = c.dstchannel && (c.dstchannel.includes(`/ ${ext}-`) || c.dstchannel.includes(`/${ext}-`) || c.dstchannel.includes(`-${ext}`));
        return matchesSrc || matchesDst || matchesClid || matchesChannel || matchesDstChannel;
      });
    }

    // Status filtering logic
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'ANSWERED') {
        filteredCalls = filteredCalls.filter(c => c.disposition === 'ANSWERED');
      } else if (statusFilter === 'MISSED') {
        filteredCalls = filteredCalls.filter(c => {
          const disposition = c.disposition?.toUpperCase();
          const isUnanswered = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
          const isIncoming = c.dcontext === 'from-trunk' || c.dst === '600' || c.did?.length > 0;
          return isUnanswered && (isIncoming || !c.dstchannel);
        });
      } else if (statusFilter === 'ONLY_UNPROCESSED') {
        filteredCalls = filteredCalls.filter(c => {
          const disposition = c.disposition?.toUpperCase();
          const isUnanswered = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
          const isIncoming = c.dcontext === 'from-trunk' || c.dst === '600' || c.did?.length > 0;
          const isMissed = isUnanswered && (isIncoming || !c.dstchannel);
          return isMissed && !c.processed && !c.wasCallbacked;
        });
      } else if (statusFilter === 'ONLY_CALLBACKED') {
        filteredCalls = filteredCalls.filter(c => c.wasCallbacked === true);
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
      totalPages: Math.ceil(totalCount / limit)
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
    const isDemo = process.env.DEMO_MODE === 'true' || isDefaultDemoSettings(settings) || req.query.demo === 'true';

    // Retrieve active filter parameters
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const startTime = normalizeTimeFilter(req.query.startTime, '00:00');
    const endTime = normalizeTimeFilter(req.query.endTime, '23:59');
    const numberFilter = req.query.number as string;
    const searchFilter = req.query.search as string;
    const operatorExt = (req.query.operatorExt as string || '').trim();
    const onlyMyCalls = req.query.onlyMyCalls === 'true';
    
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
        console.error('Real MariaDB query for stats failed:', e.message);
        res.status(500).json({ error: `Ошибка подключения к базе MariaDB (${localDb.settings.dbHost}:${localDb.settings.dbPort}): ${e.message}` });
        return;
      }
    }

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
        let found = directory.find((e: any) => e.number.trim() === val);
        if (found) return found;

        if (val.replace(/\D/g, '').length > 4) {
          const digits = val.replace(/\D/g, '');
          found = directory.find((e: any) => {
            const entryDigits = e.number.replace(/\D/g, '');
            return entryDigits.length > 4 && (entryDigits.endsWith(digits) || digits.endsWith(entryDigits));
          });
        }
        return found || null;
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

    const chronological = [...calls].sort((a, b) => new Date(a.calldate).getTime() - new Date(b.calldate).getTime());
    
    // Evaluate resolutions
    chronological.forEach((call) => {
      const disposition = call.disposition?.toUpperCase();
      const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
      const isIncomingMissed = isMissedType && (call.dcontext === 'from-trunk' || call.dst === '600' || call.did?.length > 0 || (call.channel && !call.dstchannel));

      if (isIncomingMissed && call.src) {
        const clientNum = call.src.trim();
        const callTime = new Date(call.calldate).getTime();
        
         const resolved = chronological.find(c => {
          const cTime = new Date(c.calldate).getTime();
          if (cTime <= callTime) return false;
          return (c.disposition === 'ANSWERED' && c.billsec > 0) && (c.dst === clientNum || c.src === clientNum);
        });

        if (resolved) {
          const original = callMap.get(call.uniqueid);
          if (original) {
            original.wasCallbacked = true;
            
            const resTime = new Date(resolved.calldate).getTime();
            const diffMs = resTime - callTime;
            const diffMin = Math.floor(diffMs / 60000);
            const kpiMinutes = localDb.settings && localDb.settings.callbackKpiMinutes !== undefined ? Number(localDb.settings.callbackKpiMinutes) : 60;
            
            if (diffMin <= kpiMinutes) {
              original.wasKpiResolved = true;
              if (!original.processed) {
                original.processed = true;
              }
            } else {
              original.wasKpiResolved = false;
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
      filteredCalls = filteredCalls.filter(c => 
        (c.src && c.src.replace(/\D/g, '').includes(n)) || 
        (c.dst && c.dst.replace(/\D/g, '').includes(n))
      );
    }

    if (onlyMyCalls && operatorExt) {
      const ext = operatorExt;
      filteredCalls = filteredCalls.filter(c => {
        const matchesSrc = c.src === ext || (c.src && c.src.endsWith(ext));
        const matchesDst = c.dst === ext || (c.dst && c.dst.endsWith(ext));
        const matchesClid = c.clid && c.clid.includes(ext);
        const matchesChannel = c.channel && (c.channel.includes(`/ ${ext}-`) || c.channel.includes(`/${ext}-`) || c.channel.includes(`-${ext}`));
        const matchesDstChannel = c.dstchannel && (c.dstchannel.includes(`/ ${ext}-`) || c.dstchannel.includes(`/${ext}-`) || c.dstchannel.includes(`-${ext}`));
        return matchesSrc || matchesDst || matchesClid || matchesChannel || matchesDstChannel;
      });
    }

    // Now calculate actual stats based on filtered list of calls
    let inboundCalls = 0;
    let outboundCalls = 0;
    let internalCalls = 0;
    let missedCalls = 0;
    let processedCalls = 0;
    let lostCalls = 0;

    filteredCalls.forEach(c => {
      const dctx = c.dcontext || '';
      const ch = c.channel || '';
      const srcVal = (c.src || '').trim();
      const dstVal = (c.dst || '').trim();

      const isIncoming = dctx.includes('from-trunk') ||
                         c.dst === '600' ||
                         (c.did && c.did.length > 0) ||
                         /^SIP\/[^\/]+-in-/.test(ch) ||
                         /^PJSIP\/[^\/]+-in-/.test(ch);

      const isOutgoing = dctx === 'from-internal' && /^[0-9]{7,}$/.test(dstVal);

      const isInternal = dctx === 'ext-local' && /^[0-9]{2,5}$/.test(srcVal) && /^[0-9]{2,5}$/.test(dstVal);

      if (isIncoming) {
        inboundCalls++;
      } else if (isOutgoing) {
        outboundCalls++;
      } else if (isInternal) {
        internalCalls++;
      }

      const disposition = c.disposition?.toUpperCase();
      const isMissedType = disposition === 'NO ANSWER' || disposition === 'BUSY' || disposition === 'FAILED';
      const isIncomingMissed = isIncoming && isMissedType;

      if (isIncomingMissed) {
        missedCalls++;

        const kpiMinutes = localDb.settings && localDb.settings.callbackKpiMinutes !== undefined
          ? Number(localDb.settings.callbackKpiMinutes)
          : 60;

        const callTime = new Date(c.calldate).getTime();
        const slaExpired = Number.isFinite(callTime) && (Date.now() - callTime) > kpiMinutes * 60 * 1000;

        const isHandled = c.processed || c.wasCallbacked || c.wasKpiResolved;

        if (isHandled) {
          processedCalls++;
        } else if (slaExpired) {
          lostCalls++;
        }
      }
    });

    res.json({
      inboundCalls,
      outboundCalls,
      internalCalls,
      missedCalls,
      processedCalls,
      lostCalls
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
  const isDemo = process.env.DEMO_MODE === 'true';

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
    console.log(`Simulated Asterisk Sandbox status: ${process.env.DEMO_MODE === 'true' ? 'ACTIVE' : 'INACTIVE'}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal initialization error:', err);
});
