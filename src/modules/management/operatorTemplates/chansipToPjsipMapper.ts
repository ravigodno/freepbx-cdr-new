import { ChansipMigrationPreview } from './operatorTemplateTypes';

const secretKeys = new Set(['secret', 'password', 'token', 'clientsecret', 'client_secret']);

const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[_-]/g, '');
const maskValue = '********';

function parseCodecs(value: string): string[] {
  return value.split(/[,&]/).map(codec => codec.trim()).filter(Boolean);
}

export function mapChansipToPjsip(input: string): ChansipMigrationPreview {
  const parsedFields: Record<string, string> = {};
  const pjsipPreview: Record<string, string | number | string[]> = {};
  const warnings: string[] = [];
  const manualReviewFields = new Set<string>();
  let maskedSecretsDetected = false;
  let disallowAll = false;

  input.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return;

    const rawKey = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    const key = normalizeKey(rawKey);

    if (secretKeys.has(key)) {
      parsedFields[rawKey] = maskValue;
      maskedSecretsDetected = true;
      warnings.push('secret/password не сохраняется и не отображается.');
      return;
    }

    parsedFields[rawKey] = value;

    if (key === 'host') pjsipPreview.sipServer = value;
    if (key === 'port') pjsipPreview.sipServerPort = Number.isFinite(Number(value)) ? Number(value) : value;
    if (key === 'username') pjsipPreview.username = value;
    if (key === 'authuser') pjsipPreview.authUsername = value;
    if (key === 'fromuser') pjsipPreview.fromUser = value;
    if (key === 'fromdomain') pjsipPreview.fromDomain = value;
    if (key === 'context') pjsipPreview.context = value;
    if (key === 'qualify' && value.toLowerCase() === 'yes') pjsipPreview.qualifyFrequency = 60;
    if (key === 'canreinvite' && value.toLowerCase() === 'no') {
      pjsipPreview.directMedia = 'no';
      warnings.push('canreinvite=no соответствует direct_media=no.');
    }
    if (key === 'dtmfmode' && value.toLowerCase() === 'rfc2833') {
      pjsipPreview.dtmfMode = 'rfc4733';
      warnings.push('dtmfmode=rfc2833 в PJSIP обычно соответствует rfc4733.');
    }
    if (key === 'nat') {
      const natValue = value.toLowerCase();
      if (natValue === 'yes') {
        pjsipPreview.forceRport = 'yes';
        pjsipPreview.rtpSymmetric = 'yes';
        pjsipPreview.rewriteContact = 'yes';
        warnings.push('nat=yes устарел, нужно явно проверить force_rport, rtp_symmetric и rewrite_contact.');
      }
      if (natValue.includes('force_rport') || natValue.includes('comedia')) {
        pjsipPreview.forceRport = 'yes';
        pjsipPreview.rtpSymmetric = 'yes';
      }
      manualReviewFields.add('NAT');
    }
    if (key === 'disallow' && value.toLowerCase() === 'all') disallowAll = true;
    if (key === 'allow') pjsipPreview.codecs = parseCodecs(value);
    if (key === 'type' && value.toLowerCase() === 'peer') manualReviewFields.add('endpoint/auth/aor model');
    if (key === 'insecure') {
      warnings.push('insecure=port,invite не переносится напрямую в PJSIP.');
      manualReviewFields.add('insecure');
    }
  });

  if (disallowAll && Array.isArray(pjsipPreview.codecs)) {
    pjsipPreview.codecs = pjsipPreview.codecs;
  }

  manualReviewFields.add('match/identify');
  manualReviewFields.add('from_user/from_domain');
  warnings.push('match/identify для входящих INVITE нужно проверять отдельно.');
  warnings.push('from_user и from_domain зависят от требований оператора.');

  return {
    parsedFields,
    pjsipPreview,
    warnings: Array.from(new Set(warnings)),
    manualReviewFields: Array.from(manualReviewFields),
    maskedSecretsDetected
  };
}
