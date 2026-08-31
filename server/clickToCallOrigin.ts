export type ClickToCallChannelTechnology = 'PJSIP' | 'SIP';

function digits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function resolveClickToCallOriginChannel(
  technology: ClickToCallChannelTechnology,
  extension: unknown,
  speakerphone = false,
  intercomPrefix: unknown = process.env.CLICK2CALL_INTERCOM_PREFIX || '*80'
): string {
  const safeExtension = digits(extension);
  if (!safeExtension) return '';
  if (!speakerphone) return `${technology}/${safeExtension}`;
  const safePrefix = String(intercomPrefix || '').trim();
  const prefix = /^\*[0-9]{1,4}$/.test(safePrefix) ? safePrefix : '*80';
  return `Local/${prefix}${safeExtension}@from-internal/n`;
}
