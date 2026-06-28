import { OperatorTemplate } from './operatorTemplateTypes';

// Source of truth for shipped operator templates is templates/operators/.
// This adapter mirrors template metadata for frontend display until backend/template loader is implemented.

const baseDiagnostics = {
  hints: ['Проверить регистрацию, Caller ID, NAT/RTP и кодеки.', 'Настройки нужно подтверждать на конкретной АТС.'],
  commonErrors: ['403', '488', '503', 'one-way audio']
};

const security = {
  containsSecrets: false,
  secretPolicy: 'Secrets are entered locally and never stored in Git.'
} as const;

const chansipFields = (server: string) => ({
  host: server,
  port: 5060,
  username: '${LOCAL_LOGIN}',
  authUser: '${LOCAL_LOGIN}',
  secretPlaceholder: 'Введите SIP-пароль локально',
  type: 'peer',
  context: 'from-trunk',
  fromUser: '${LOCAL_LOGIN}',
  fromDomain: server,
  insecure: 'port,invite',
  qualify: 'yes',
  nat: 'force_rport,comedia',
  canreinvite: 'no',
  dtmfmode: 'rfc2833',
  disallow: 'all',
  allow: ['alaw', 'ulaw'],
  transport: 'udp',
  trustrpid: 'yes',
  sendrpid: 'pai',
  encryption: 'no',
  qualifyfreq: 60
});

const pjsipFields = (server: string) => ({
  transport: 'udp',
  sipServer: server,
  sipServerPort: 5060,
  username: '${LOCAL_LOGIN}',
  authUsername: '${LOCAL_LOGIN}',
  passwordPlaceholder: 'Введите SIP-пароль локально',
  authentication: 'outbound',
  registration: 'send',
  fromUser: '${LOCAL_LOGIN}',
  fromDomain: server,
  contactUser: '${LOCAL_LOGIN}',
  clientUri: `sip:\${LOCAL_LOGIN}@${server}`,
  serverUri: `sip:${server}:5060`,
  context: 'from-trunk',
  match: server,
  dtmfMode: 'rfc4733',
  directMedia: 'no',
  rewriteContact: 'yes',
  rtpSymmetric: 'yes',
  forceRport: 'yes',
  qualifyFrequency: 60,
  codecs: ['alaw', 'ulaw'],
  mediaEncryption: 'no',
  timers: 'yes',
  sendRpid: 'pai',
  trustRpid: 'yes'
});

const operators = [
  { slug: 'volna', operator: 'Волна', region: 'Крым', server: 'sip.volna.example' },
  { slug: 'mts', operator: 'МТС', region: 'Россия', server: 'sip.mts.example' },
  { slug: 'beeline', operator: 'Билайн', region: 'Россия', server: 'sip.beeline.example' },
  { slug: 'megafon', operator: 'МегаФон', region: 'Россия', server: 'sip.megafon.example' },
  { slug: 'mtt', operator: 'MTT', region: 'Россия', server: 'sip.mtt.example' },
  { slug: 'uis', operator: 'UIS', region: 'Россия', server: 'sip.uis.example' }
];

const makeChansip = (item: typeof operators[number]): OperatorTemplate => ({
  id: `${item.slug}-chansip-legacy`,
  name: `${item.operator} chan_sip legacy`,
  operator: item.operator,
  region: item.region,
  country: 'RU',
  technology: { type: 'chan_sip', driver: 'chan_sip', deprecated: true },
  status: 'draft',
  testedWith: { freepbx: [], asterisk: [], notes: 'Baseline template; verify on the target PBX.' },
  fields: chansipFields(item.server),
  requiredUserFields: ['username', 'secretPlaceholder', 'fromUser'],
  numberFormats: { outbound: ['E.164', 'national'], inbound: ['DID from operator'] },
  diagnostics: baseDiagnostics,
  notes: ['chan_sip является устаревшим драйвером.', 'Не гарантирует рабочую конфигурацию без проверки.'],
  security,
  migration: { canMigrateToPjsip: true, migrationTargetTemplate: `${item.slug}-pjsip-standard`, mappingProfile: 'default-chansip-to-pjsip' },
  notesPath: `templates/operators/${item.slug}/notes.md`,
  jsonPath: `templates/operators/${item.slug}/chansip-legacy.json`
});

const makePjsip = (item: typeof operators[number]): OperatorTemplate => ({
  id: `${item.slug}-pjsip-standard`,
  name: `${item.operator} PJSIP standard`,
  operator: item.operator,
  region: item.region,
  country: 'RU',
  technology: { type: 'pjsip', driver: 'asterisk-pjsip', deprecated: false },
  status: 'draft',
  testedWith: { freepbx: [], asterisk: [], notes: 'Baseline PJSIP profile; verify on the target PBX.' },
  fields: pjsipFields(item.server),
  requiredUserFields: ['username', 'passwordPlaceholder', 'authUsername'],
  numberFormats: { outbound: ['E.164', 'national'], inbound: ['DID from operator'] },
  diagnostics: baseDiagnostics,
  notes: ['PJSIP предпочтителен для новых Trunks.', 'Проверить match/identify для входящих INVITE.'],
  security,
  migration: { canMigrateToPjsip: false, isMigrationTarget: true, mappingProfile: 'default-chansip-to-pjsip' },
  notesPath: `templates/operators/${item.slug}/notes.md`,
  jsonPath: `templates/operators/${item.slug}/pjsip-standard.json`
});

export const operatorTemplates: OperatorTemplate[] = [
  ...operators.flatMap(item => [makeChansip(item), makePjsip(item)]),
  {
    ...makePjsip(operators[0]),
    id: 'volna-pjsip-nat',
    name: 'Волна PJSIP NAT',
    fields: { ...pjsipFields(operators[0].server), directMedia: 'no', rewriteContact: 'yes', rtpSymmetric: 'yes', forceRport: 'yes' },
    diagnostics: { hints: ['Проверить внешний адрес FreePBX, RTP range и SIP ALG.', 'Direct Media должен быть выключен для NAT.'], commonErrors: ['one-way audio', 'no audio', 'registration timeout'] },
    notes: ['Используйте как отправную точку для АТС за NAT.'],
    jsonPath: 'templates/operators/volna/pjsip-nat.json'
  }
];
