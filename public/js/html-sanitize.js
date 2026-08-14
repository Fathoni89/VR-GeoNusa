'use strict';

(function attachHtmlSanitizer(root) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function htmlJsString(value) {
    return escapeHtml(JSON.stringify(String(value ?? '')));
  }

  function safeTeamPhotoUrl(value) {
    const url = String(value ?? '');
    return /^\/assets\/images\/team\/[a-z0-9-]+\.(?:jpg|png|webp)(?:\?t=\d+)?$/.test(url)
      ? url
      : '';
  }

  const api = { escapeHtml, htmlJsString, safeTeamPhotoUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) Object.assign(root, api);
})(typeof window === 'undefined' ? globalThis : window);
