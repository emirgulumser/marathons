/** App root URL — works on GitHub Pages (/marathons/) and local dev. */
window.APP_ROOT = new URL('./', document.baseURI).href;

/** Bump when deploying to bust browser cache. */
window.APP_VERSION = '20250603';
