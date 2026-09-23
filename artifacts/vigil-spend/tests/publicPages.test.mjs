import assert from 'node:assert/strict';
import test from 'node:test';
import publicPages from '../server/publicPages.js';

const requiredPages = [
  '/support',
  '/legal/privacy',
  '/legal/terms',
  '/legal/eula',
  '/account-deletion',
];

test('public App Store pages are served for every required URL', () => {
  for (const pathname of requiredPages) {
    const html = publicPages.getPublicPage(pathname);
    assert.ok(html, `${pathname} should have a public page`);
    assert.match(html, /<title>[^<]+ — Vigil Spend<\/title>/);
    assert.match(html, /support@vigilspend\.com/);
  }
});

test('account deletion page gives an in-app and email path', () => {
  const html = publicPages.getPublicPage('/account-deletion');
  assert.match(html, /Settings/);
  assert.match(html, /Delete account/);
  assert.match(html, /mailto:support@vigilspend\.com\?subject=Vigil%20Spend%20account%20deletion/);
});