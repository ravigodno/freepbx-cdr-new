(function () {
  'use strict';

  var PREFIX = '[PBXPuls Calltracking]';
  var memorySessionId = '';
  var ymClientId = null;
  var impressionKeys = {};
  var resolvedPhone = null;

  function getCurrentScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1] || null;
  }

  var script = getCurrentScript();
  var siteKey = script ? (script.getAttribute('data-site-key') || '').trim() : '';
  var debug = script ? script.getAttribute('data-debug') === 'true' : false;
  var counterId = script ? (script.getAttribute('data-ym-counter-id') || '').trim() : '';
  var endpoint = script ? (script.getAttribute('data-endpoint') || '').trim() : '';
  var resolveEndpoint = script ? (script.getAttribute('data-resolve-endpoint') || '').trim() : '';
  var replaceTelLinks = !script || script.getAttribute('data-replace-tel-links') !== 'false';

  function log() {
    if (!debug || !window.console || !console.log) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(PREFIX);
    console.log.apply(console, args);
  }

  function warn() {
    if (!debug || !window.console || !console.warn) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(PREFIX);
    console.warn.apply(console, args);
  }

  function scriptOrigin() {
    try {
      var src = script && script.src ? script.src : '';
      if (!src) return window.location.origin || '';
      var link = document.createElement('a');
      link.href = src;
      return link.protocol + '//' + link.host;
    } catch (e) {
      return window.location.origin || '';
    }
  }

  if (!endpoint) endpoint = scriptOrigin() + '/api/calltracking/event';
  if (!resolveEndpoint) resolveEndpoint = scriptOrigin() + '/api/calltracking/resolve-number';

  function safeStorage(type) {
    try {
      var storage = type === 'session' ? window.sessionStorage : window.localStorage;
      var key = '__pbxpuls_test__';
      storage.setItem(key, '1');
      storage.removeItem(key);
      return storage;
    } catch (e) {
      return null;
    }
  }

  var localStore = safeStorage('local');
  var sessionStore = safeStorage('session');

  function randomId() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var arr = new Uint32Array(4);
        window.crypto.getRandomValues(arr);
        return 'pbx_' + Array.prototype.map.call(arr, function (n) { return n.toString(16); }).join('');
      }
    } catch (e) {}
    return 'pbx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function getSessionId() {
    if (localStore) {
      var stored = localStore.getItem('pbxpuls_session_id');
      if (stored) return stored;
      stored = randomId();
      localStore.setItem('pbxpuls_session_id', stored);
      return stored;
    }
    if (!memorySessionId) memorySessionId = randomId();
    return memorySessionId;
  }

  function parseQuery(search) {
    var result = {};
    var query = String(search || '').replace(/^\?/, '');
    if (!query) return result;
    query.split('&').forEach(function (part) {
      var idx = part.indexOf('=');
      var rawKey = idx >= 0 ? part.slice(0, idx) : part;
      var rawValue = idx >= 0 ? part.slice(idx + 1) : '';
      if (!rawKey) return;
      try {
        result[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/+/g, ' '));
      } catch (e) {
        result[rawKey] = rawValue;
      }
    });
    return result;
  }

  function readUtmFromUrl() {
    var q = parseQuery(window.location.search);
    return {
      source: q.utm_source || '',
      medium: q.utm_medium || '',
      campaign: q.utm_campaign || '',
      content: q.utm_content || '',
      term: q.utm_term || ''
    };
  }

  function hasUtm(utm) {
    return !!(utm.source || utm.medium || utm.campaign || utm.content || utm.term);
  }

  function getStoredJson(key) {
    if (!localStore) return null;
    try {
      var raw = localStore.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setStoredJson(key, value) {
    if (!localStore) return;
    try { localStore.setItem(key, JSON.stringify(value || {})); } catch (e) {}
  }

  function getUtm() {
    var current = readUtmFromUrl();
    if (hasUtm(current)) {
      setStoredJson('pbxpuls_utm', current);
      return current;
    }
    return getStoredJson('pbxpuls_utm') || { source: '', medium: '', campaign: '', content: '', term: '' };
  }

  function getReferrer() {
    var key = 'pbxpuls_first_referrer';
    var ref = document.referrer || '';
    try {
      if (sessionStore) {
        var stored = sessionStore.getItem(key);
        if (stored) return stored;
        if (ref) sessionStore.setItem(key, ref);
      }
    } catch (e) {}
    return ref;
  }

  function getYmClientId(callback) {
    if (!counterId || typeof window.ym !== 'function') {
      callback(null);
      return;
    }
    var done = false;
    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        callback(null);
      }
    }, 500);
    try {
      window.ym(counterId, 'getClientID', function (clientId) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        callback(clientId || null);
      });
    } catch (e) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        callback(null);
      }
    }
  }

  function reachGoal(goal) {
    if (!counterId || typeof window.ym !== 'function') return;
    try { window.ym(counterId, 'reachGoal', goal); } catch (e) {}
  }

  function cleanText(value) {
    return String(value || '').replace(/s+/g, ' ').trim();
  }

  function eventPayload(eventType, extra) {
    extra = extra || {};
    var payload = {
      siteKey: siteKey,
      eventType: eventType,
      pageUrl: window.location.href,
      referrer: getReferrer(),
      phoneText: extra.phoneText || '',
      phoneHref: extra.phoneHref || '',
      ymClientId: ymClientId || null,
      utm: getUtm(),
      sessionId: getSessionId(),
      timestamp: new Date().toISOString()
    };
    ['displayedPhone', 'displayedNumber', 'dynamicNumber', 'did', 'phoneNumberId', 'replacementRuleId', 'replacementRuleName'].forEach(function (key) {
      if (extra[key]) payload[key] = extra[key];
    });
    return payload;
  }

  function sendEvent(eventType, extra) {
    if (!siteKey) {
      warn('data-site-key is missing; event skipped:', eventType);
      return;
    }
    var payload = eventPayload(eventType, extra);
    var body = JSON.stringify(payload);
    log('send', eventType, payload);

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
    } catch (e) {}

    try {
      if (window.fetch) {
        window.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
          mode: 'cors',
          credentials: 'omit'
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function resolvedExtra() {
    if (!resolvedPhone) return {};
    return {
      displayedPhone: resolvedPhone.phoneDisplay || '',
      displayedNumber: resolvedPhone.phoneDisplay || '',
      dynamicNumber: resolvedPhone.phoneDisplay || '',
      did: resolvedPhone.did || '',
      phoneNumberId: resolvedPhone.id || '',
      replacementRuleId: resolvedPhone.ruleId || '',
      replacementRuleName: resolvedPhone.ruleName || ''
    };
  }

  function phoneDataFromElement(el) {
    if (!el) return { phoneText: '', phoneHref: '' };
    var href = el.getAttribute && (el.getAttribute('href') || el.getAttribute('data-pbxpuls-phone-link') || '');
    var text = el.getAttribute && (el.getAttribute('data-pbxpuls-phone') || '');
    if (!text) text = cleanText(el.textContent || '');
    var data = { phoneText: text, phoneHref: href || '' };
    var extra = resolvedExtra();
    for (var key in extra) data[key] = extra[key];
    return data;
  }

  function impressionKey(data) {
    return (data.phoneHref || '') + '|' + (data.phoneText || '');
  }

  function collectPhoneNodes() {
    try {
      return Array.prototype.slice.call(document.querySelectorAll('a[href^="tel:"], [data-pbxpuls-phone], [data-pbxpuls-phone-link]'));
    } catch (e) {
      return [];
    }
  }

  function collectPhoneImpressions() {
    collectPhoneNodes().forEach(function (node) {
      var data = phoneDataFromElement(node);
      var key = impressionKey(data);
      if (!key || impressionKeys[key]) return;
      impressionKeys[key] = true;
      sendEvent('phone_impression', data);
    });
  }

  function applyResolvedPhone(phone, rule) {
    if (!phone || !phone.phoneDisplay) return false;
    resolvedPhone = {
      id: phone.id || '',
      phoneDisplay: phone.phoneDisplay || '',
      phoneHref: phone.phoneHref || '',
      did: phone.did || '',
      ruleId: rule && rule.id ? rule.id : '',
      ruleName: rule && rule.ruleName ? rule.ruleName : ''
    };
    collectPhoneNodes().forEach(function (node) {
      try {
        var tag = node.tagName ? String(node.tagName).toLowerCase() : '';
        var isPhoneText = node.hasAttribute && node.hasAttribute('data-pbxpuls-phone');
        var isPhoneLink = node.hasAttribute && node.hasAttribute('data-pbxpuls-phone-link');
        var isTelLink = tag === 'a' && String(node.getAttribute('href') || '').toLowerCase().indexOf('tel:') === 0;
        if (isPhoneText || isPhoneLink || (replaceTelLinks && isTelLink)) {
          node.textContent = resolvedPhone.phoneDisplay;
        }
        if (tag === 'a' && (isPhoneLink || (replaceTelLinks && isTelLink)) && resolvedPhone.phoneHref) {
          node.setAttribute('href', resolvedPhone.phoneHref);
        }
        if (isPhoneText) node.setAttribute('data-pbxpuls-phone', resolvedPhone.phoneDisplay);
      } catch (e) {}
    });
    return true;
  }

  function buildResolveUrl() {
    var utm = getUtm();
    var params = {
      siteKey: siteKey,
      utmSource: utm.source || '',
      utmMedium: utm.medium || '',
      utmCampaign: utm.campaign || '',
      referrer: getReferrer(),
      landingPage: window.location.href,
      pageUrl: window.location.href
    };
    var query = [];
    for (var key in params) {
      if (params[key]) query.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    }
    return resolveEndpoint + (resolveEndpoint.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
  }

  function resolveNumber(callback) {
    if (!siteKey || !window.fetch) {
      callback(false);
      return;
    }
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      callback(false);
    }, 1500);
    function finish(value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      callback(value);
    }
    try {
      window.fetch(buildResolveUrl(), { method: 'GET', mode: 'cors', credentials: 'omit' })
        .then(function (response) { return response && response.ok ? response.json() : null; })
        .then(function (json) {
          if (json && json.ok && json.resolved && json.phone) {
            finish(applyResolvedPhone(json.phone, json.rule));
            return;
          }
          finish(false);
        })
        .catch(function () { finish(false); });
    } catch (e) {
      finish(false);
    }
  }

  function classifyClick(anchor) {
    if (!anchor) return null;
    var href = String(anchor.getAttribute('href') || '').trim();
    var lower = href.toLowerCase();
    if (lower.indexOf('tel:') === 0) return { type: 'phone_click', goal: 'phone_click', data: phoneDataFromElement(anchor) };
    if (lower.indexOf('mailto:') === 0) return { type: 'email_click', goal: 'email_click', data: {} };
    if (/^(https?:)?\/\/(www\.)?(wa\.me|whatsapp\.com|api\.whatsapp\.com)\//i.test(href)) return { type: 'whatsapp_click', goal: 'whatsapp_click', data: {} };
    if (/^(https?:)?\/\/(www\.)?(t\.me|telegram\.me)\//i.test(href)) return { type: 'telegram_click', goal: 'telegram_click', data: {} };
    return null;
  }

  function closestAnchor(target) {
    var node = target;
    while (node && node !== document) {
      if (node.tagName && String(node.tagName).toLowerCase() === 'a') return node;
      node = node.parentNode;
    }
    return null;
  }

  function bindClicks() {
    document.addEventListener('click', function (event) {
      var info = classifyClick(closestAnchor(event.target));
      if (!info) return;
      sendEvent(info.type, info.data);
      reachGoal(info.goal);
    }, true);
  }

  function init() {
    if (!siteKey) warn('data-site-key is missing; script is idle');
    getYmClientId(function (clientId) {
      ymClientId = clientId;
      sendEvent('page_view');
    });
    resolveNumber(function () {
      collectPhoneImpressions();
    });
    bindClicks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
