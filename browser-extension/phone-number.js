(function attachPBXPulsPhoneNumber(root) {
  function normalizePhoneNumber(value) {
    const raw = String(value || '')
      .trim()
      .replace(/^tel:/i, '')
      .split(/[?;]/, 1)[0]
      .trim();
    if (!raw || !/^[+*#\d\s().\-/\u00a0]+$/.test(raw)) return '';

    const normalized = raw.replace(/[^\d+*#]/g, '');
    if (!/^(?:\+?\d|[*#])[*#\d]*$/.test(normalized)) return '';
    const digitCount = (normalized.match(/\d/g) || []).length;
    return digitCount >= 2 && digitCount <= 20 ? normalized : '';
  }

  root.PBXPulsPhoneNumber = { normalizePhoneNumber };
})(typeof globalThis !== 'undefined' ? globalThis : self);
