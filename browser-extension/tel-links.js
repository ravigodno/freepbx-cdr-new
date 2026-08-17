if (!globalThis.__pbxpulsTelInterceptor) {
  globalThis.__pbxpulsTelInterceptor = true;
  document.addEventListener('click', event => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const origin = path.find(item => item instanceof Element) || (event.target instanceof Element ? event.target : null);
    const link = origin?.closest('a[href]');
    if (!link) return;
    const href = String(link.getAttribute('href') || '').trim();
    if (!/^tel:/i.test(href)) return;
    const number = decodeURIComponent(href.replace(/^tel:/i, '')).split(/[?;]/, 1)[0].trim();
    if (!number) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void chrome.runtime.sendMessage({ type: 'tel-link', number }).catch(() => undefined);
  }, true);
}
