import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { supportCopy, supportText } from '../lib/supportCopy.ts';
import { tutorialCopy } from '../lib/tutorialCopy.ts';

const languages = ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar'];
const requiredKeys = [
  'helpSupport',
  'supportTitle',
  'faqTitle',
  'contactTitle',
  'category',
  'subject',
  'message',
  'attachment',
  'sendRequest',
  'requestSent',
  'requestSentCopy',
  'supportEmail',
];

test('Help & Support copy exists for every supported language', () => {
  for (const language of languages) {
    const copy = supportCopy(language);
    for (const key of requiredKeys) {
      assert.ok(String(copy[key]).trim(), `${language}:${key} must have copy`);
    }
    assert.equal(Object.keys(copy.categories).length, 6, `${language} must have six categories`);
    assert.equal(copy.faqs.length, 4, `${language} must have four FAQs`);
    assert.match(copy.requestSentCopy, /account|compte|cuenta|аккаунт|حساب|účtu|Konto/i);
  }
});

test('support experience keeps sensitive app data out of automatic context', () => {
  const source = fs.readFileSync(new URL('../app/support.tsx', import.meta.url), 'utf8');
  assert.match(source, /appVersion/);
  assert.match(source, /osVersion/);
  assert.match(source, /language/);
  assert.match(source, /plan: isPro \? 'pro' : 'free'/);
  const submissionStart = source.indexOf('body: JSON.stringify');
  const submissionEnd = source.indexOf('}),', submissionStart);
  const submission = source.slice(submissionStart, submissionEnd);
  assert.doesNotMatch(submission, /transactions|income|amounts|password/i);
});

test('support storage and admin status routes are present without mail delivery code', () => {
  const route = fs.readFileSync(new URL('../../api-server/src/routes/vigil-support.ts', import.meta.url), 'utf8');
  const admin = fs.readFileSync(new URL('../../api-server/src/routes/vigil-admin.ts', import.meta.url), 'utf8');
  const schema = fs.readFileSync(new URL('../../../lib/db/src/schema/vigilSupport.ts', import.meta.url), 'utf8');
  assert.match(route, /INSERT INTO vigil_support_requests/);
  assert.match(route, /authenticateVigilRequest/);
  assert.match(admin, /GET.*vigil\/admin\/support-requests|\/vigil\/admin\/support-requests/);
  assert.match(admin, /PATCH.*vigil\/admin\/support-requests|\/vigil\/admin\/support-requests/);
  assert.match(schema, /status/);
  assert.doesNotMatch(route, /resend|sendgrid|nodemailer/i);
});

test('the production admin surface is limited to the two approved accounts', () => {
  const server = fs.readFileSync(new URL('../../api-server/src/routes/vigil-admin.ts', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../lib/admin.ts', import.meta.url), 'utf8');
  for (const email of ['amrabdelwahabofficial8@gmail.com', 'saraelhassanova@gmail.com']) {
    assert.match(server, new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(client, new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(server, /publicMetadata\?\.role !== ["']admin/);
  assert.match(server, /if \(!email \|\| !ADMIN_EMAILS\.has\(email\)\)/);
});

test('admin directory exposes paginated Clerk users with creation dates', () => {
  const admin = fs.readFileSync(new URL('../../api-server/src/routes/vigil-admin.ts', import.meta.url), 'utf8');
  const screen = fs.readFileSync(new URL('../app/admin.tsx', import.meta.url), 'utf8');
  assert.match(admin, /req\.query\.offset/);
  assert.match(admin, /createdAt: user\.createdAt/);
  assert.match(admin, /nextOffset/);
  assert.match(screen, /Load more users/);
  assert.match(screen, /createdAt/);
});

test('tutorial copy changes with the selected language', () => {
  const english = tutorialCopy('en');
  for (const language of languages) {
    const localized = tutorialCopy(language);
    assert.equal(localized.length, 3);
    assert.ok(localized.every((step) => step.title && step.copy));
    if (language !== 'en') assert.notDeepEqual(localized, english, `${language} tutorial should not remain English`);
  }
});