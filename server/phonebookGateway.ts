import crypto from 'node:crypto';
import type { Express, Request, RequestHandler } from 'express';
import { queryPBXPulsDb } from './pbxpulsDb.js';
import { listDirectoryContactsSql } from './directoryPerformance.js';

export type PhonebookFormat = 'grandstream' | 'yealink';
export type PhonebookContact = {
  id: string;
  name: string;
  organization: string;
  position: string;
  department: string;
  phones: string[];
};

type Dependencies = {
  requireAuth: RequestHandler;
  hasPermission: (req: Request, permission: string) => Promise<boolean>;
  listOwners: (req: Request) => Promise<Array<{ id: string; label: string }>>;
};

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max);
const positiveInteger = (value: unknown, fallback = 2000) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 2000) : fallback;
};
const normalizeFilters = (value: unknown) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    organization: clean(source.organization, 191),
    department: clean(source.department, 191),
    type: clean(source.type, 64),
    includeInternalExtension: source.includeInternalExtension !== false
  };
};
const parseFilters = (value: unknown) => {
  try {
    return normalizeFilters(JSON.parse(String(value || '{}')));
  } catch {
    return normalizeFilters({});
  }
};
const xml = (value: unknown) => clean(value, 1000)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const secureEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const CYRILLIC_SLUG_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};
export const buildPhonebookSlug = (value: unknown) => clean(value, 191)
  .toLowerCase()
  .split('')
  .map(character => CYRILLIC_SLUG_MAP[character] ?? character)
  .join('')
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64)
  .replace(/-+$/g, '');

export function renderGrandstreamPhonebook(title: string, contacts: PhonebookContact[]): string {
  const items = contacts.map(contact => {
    const phones = contact.phones.map(number => `<Phone type="Work"><phonenumber>${xml(number)}</phonenumber><accountindex>0</accountindex></Phone>`).join('');
    return `<Contact><FirstName>${xml(contact.name)}</FirstName><LastName></LastName><Frequent>0</Frequent>${phones}<Department>${xml(contact.department)}</Department><Group>1</Group><Company>${xml(contact.organization)}</Company><Job>${xml(contact.position)}</Job></Contact>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><AddressBook><version>1</version><pbgroup><id>1</id><name>${xml(title)}</name></pbgroup>${items}</AddressBook>`;
}

export function renderYealinkPhonebook(title: string, contacts: PhonebookContact[]): string {
  const items = contacts.map(contact => {
    const label = [contact.name, contact.organization && `(${contact.organization})`].filter(Boolean).join(' ');
    return `<DirectoryEntry><Name>${xml(label)}</Name>${contact.phones.map(number => `<Telephone>${xml(number)}</Telephone>`).join('')}</DirectoryEntry>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><YealinkIPPhoneDirectory><Title>${xml(title)}</Title><Prompt>${xml(title)}</Prompt>${items}</YealinkIPPhoneDirectory>`;
}

export function renderPhonebook(format: PhonebookFormat, title: string, contacts: PhonebookContact[]): string {
  return format === 'grandstream'
    ? renderGrandstreamPhonebook(title, contacts)
    : renderYealinkPhonebook(title, contacts);
}

async function loadContacts(profile: any): Promise<PhonebookContact[]> {
  const filters = parseFilters(profile.filters_json);
  const limit = Math.max(1, Math.min(Number(profile.max_entries || 2000), 2000));
  const fetchScope = async (visibility: 'shared' | 'private', ownerUserId?: string) => {
    const items: any[] = [];
    for (let page = 1; items.length < limit; page++) {
      const result = await listDirectoryContactsSql({
        page,
        pageSize: Math.min(50, limit - items.length),
        visibility,
        ownerUserId,
        isSpam: false,
        organization: clean(filters.organization),
        department: clean(filters.department),
        type: clean(filters.type)
      }, { privileged: true, internal: true, userId: 'phonebook-gateway' });
      items.push(...result.items);
      if (!result.hasNext) break;
    }
    return items;
  };
  const shared = await fetchScope('shared');
  const personal = profile.scope === 'personal_combined' && profile.owner_user_id
    ? await fetchScope('private', clean(profile.owner_user_id, 64))
    : [];
  return [...shared, ...personal]
    .filter((item: any, index, items) => items.findIndex(candidate => candidate.id === item.id) === index)
    .slice(0, limit)
    .filter((item: any) => !item.isBlacklisted)
    .map((item: any) => ({
      id: clean(item.id, 64),
      name: clean(item.name || item.company || item.number),
      organization: clean(item.company),
      position: clean(item.position),
      department: clean(item.department),
      phones: Array.from(new Set([
        ...(Array.isArray(item.phones) ? item.phones : []),
        item.number,
        item.phone2,
        filters.includeInternalExtension !== false ? item.internalExtension : ''
      ].map(value => clean(value, 100)).filter(Boolean))).slice(0, 3)
    }))
    .filter(contact => contact.name && contact.phones.length);
}

function basicCredentials(req: Request) {
  const match = String(req.headers.authorization || '').match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return separator >= 0 ? { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) } : null;
  } catch {
    return null;
  }
}

export function registerPhonebookGatewayRoutes(app: Express, deps: Dependencies): void {
  app.get([
    '/phonebook/:format/:slug.xml',
    '/phonebook/:format/:slug.xml/phonebook.xml'
  ], async (req, res) => {
    try {
      const format = clean(req.params.format) as PhonebookFormat;
      if (!['grandstream', 'yealink'].includes(format)) return res.status(404).end();
      const rows = await queryPBXPulsDb('SELECT * FROM phonebook_profiles WHERE slug=? AND format=? AND active=1 LIMIT 1', [buildPhonebookSlug(req.params.slug), format]);
      const profile = rows[0];
      const credentials = basicCredentials(req);
      if (!profile || !credentials || credentials.username !== profile.username || !secureEqual(sha256(credentials.password), String(profile.password_hash))) {
        res.setHeader('WWW-Authenticate', 'Basic realm="PBXPuls Phonebook"');
        return res.status(401).end();
      }
      const body = renderPhonebook(format, profile.name, await loadContacts(profile));
      const etag = `"${sha256(body)}"`;
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('ETag', etag);
      await queryPBXPulsDb('UPDATE phonebook_profiles SET last_access_at=NOW() WHERE id=?', [profile.id]).catch(() => undefined);
      return res.send(body);
    } catch {
      return res.status(503).end();
    }
  });

  const allowed = async (req: Request) => (req as any).user?.role === 'su' || (req as any).user?.role === 'admin' || deps.hasPermission(req, 'manage_phonebook_gateway');
  const rejectUnlessAllowed = async (req: Request, res: any) => {
    if (await allowed(req)) return false;
    res.status(403).json({ error: 'Access denied' });
    return true;
  };
  const profileResponse = (row: any) => ({
    id: Number(row.id),
    name: clean(row.name, 191),
    slug: clean(row.slug, 64),
    format: row.format,
    scope: row.scope,
    ownerUserId: row.owner_user_id || null,
    username: clean(row.username, 100),
    filters: parseFilters(row.filters_json),
    maxEntries: positiveInteger(row.max_entries),
    active: Boolean(row.active),
    lastAccessAt: row.last_access_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  });
  const profileById = async (id: unknown) => {
    const profileId = Number(id);
    if (!Number.isInteger(profileId) || profileId <= 0) return null;
    const rows = await queryPBXPulsDb('SELECT * FROM phonebook_profiles WHERE id=? LIMIT 1', [profileId]);
    return rows[0] || null;
  };

  app.get('/api/phonebook/owners', deps.requireAuth, async (req, res) => {
    if (await rejectUnlessAllowed(req, res)) return;
    try {
      res.json({ items: await deps.listOwners(req) });
    } catch {
      res.status(503).json({ error: 'Не удалось загрузить список владельцев' });
    }
  });

  app.get('/api/phonebook/profiles', deps.requireAuth, async (req, res) => {
    if (await rejectUnlessAllowed(req, res)) return;
    try {
      const rows = await queryPBXPulsDb('SELECT * FROM phonebook_profiles ORDER BY name,id');
      res.json({ items: rows.map(profileResponse) });
    } catch {
      res.status(503).json({ error: 'Не удалось загрузить профили' });
    }
  });
  app.post('/api/phonebook/profiles', deps.requireAuth, async (req, res) => {
    if (await rejectUnlessAllowed(req, res)) return;
    const format = clean(req.body?.format) as PhonebookFormat;
    const scope = req.body?.scope === 'personal_combined' ? 'personal_combined' : 'shared';
    const ownerUserId = clean(req.body?.ownerUserId, 64) || null;
    const profileSlug = buildPhonebookSlug(req.body?.slug || req.body?.name);
    const name = clean(req.body?.name, 191);
    const username = clean(req.body?.username || 'phonebook', 100);
    if (!profileSlug || !['grandstream', 'yealink'].includes(format)) return res.status(400).json({ error: 'Invalid phonebook profile' });
    if (!name || !username) return res.status(400).json({ error: 'Название и логин обязательны' });
    if (scope === 'personal_combined' && !ownerUserId) return res.status(400).json({ error: 'ownerUserId is required for a personal phonebook' });
    const password = crypto.randomBytes(24).toString('base64url');
    try {
      await queryPBXPulsDb(
        `INSERT INTO phonebook_profiles(name,slug,format,scope,owner_user_id,username,password_hash,filters_json,max_entries,active,created_by,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [name, profileSlug, format, scope, ownerUserId, username, sha256(password), JSON.stringify(normalizeFilters(req.body?.filters)), positiveInteger(req.body?.maxEntries), 1, clean((req as any).user?.username || (req as any).user?.id, 100)]
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({ slug: profileSlug, format, username, password, passwordShownOnce: true, url: `/phonebook/${format}/${profileSlug}.xml` });
    } catch (error: any) {
      if (String(error?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Профиль с таким URL и форматом уже существует' });
      res.status(503).json({ error: 'Не удалось создать профиль' });
    }
  });
  app.put('/api/phonebook/profiles/:id', deps.requireAuth, async (req, res) => {
    if (await rejectUnlessAllowed(req, res)) return;
    const existing = await profileById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Профиль не найден' });
    const scope = req.body?.scope === 'personal_combined' ? 'personal_combined' : 'shared';
    const ownerUserId = scope === 'personal_combined' ? clean(req.body?.ownerUserId, 64) || null : null;
    const name = clean(req.body?.name, 191);
    const username = clean(req.body?.username, 100);
    if (!name || !username) return res.status(400).json({ error: 'Название и логин обязательны' });
    if (scope === 'personal_combined' && !ownerUserId) return res.status(400).json({ error: 'Выберите владельца личной книги' });
    await queryPBXPulsDb(
      `UPDATE phonebook_profiles
       SET name=?,scope=?,owner_user_id=?,username=?,filters_json=?,max_entries=?,updated_at=NOW()
       WHERE id=?`,
      [name, scope, ownerUserId, username, JSON.stringify(normalizeFilters(req.body?.filters)), positiveInteger(req.body?.maxEntries), existing.id]
    );
    const updated = await profileById(existing.id);
    res.json({ item: profileResponse(updated) });
  });
  app.patch('/api/phonebook/profiles/:id/active', deps.requireAuth, async (req, res) => {
    if (await rejectUnlessAllowed(req, res)) return;
    const existing = await profileById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Профиль не найден' });
    await queryPBXPulsDb('UPDATE phonebook_profiles SET active=?,updated_at=NOW() WHERE id=?', [req.body?.active === true ? 1 : 0, existing.id]);
    res.json({ success: true, active: req.body?.active === true });
  });
  app.post('/api/phonebook/profiles/:id/rotate-secret', deps.requireAuth, async (req, res) => {
    if (await rejectUnlessAllowed(req, res)) return;
    const existing = await profileById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Профиль не найден' });
    const password = crypto.randomBytes(24).toString('base64url');
    await queryPBXPulsDb('UPDATE phonebook_profiles SET password_hash=?,updated_at=NOW() WHERE id=?', [sha256(password), existing.id]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ username: existing.username, password, passwordShownOnce: true, url: `/phonebook/${existing.format}/${existing.slug}.xml` });
  });
  app.delete('/api/phonebook/profiles/:id', deps.requireAuth, async (req, res) => {
    if (await rejectUnlessAllowed(req, res)) return;
    const existing = await profileById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Профиль не найден' });
    if (clean(req.body?.confirmation, 64) !== clean(existing.slug, 64)) {
      return res.status(400).json({ error: 'Для удаления подтвердите slug профиля' });
    }
    await queryPBXPulsDb('DELETE FROM phonebook_profiles WHERE id=?', [existing.id]);
    res.json({ success: true });
  });
}
