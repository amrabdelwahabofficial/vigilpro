const LAST_UPDATED = 'September 12, 2026';

function page(title, body, extra = '') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} — Vigil Spend</title>
    <meta name="description" content="${title} for Vigil Spend.">
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #202125;
        background: #f7f4f1;
      }
      * { box-sizing: border-box; }
      body {
        max-width: 780px;
        margin: 0 auto;
        padding: 34px 22px 64px;
        line-height: 1.65;
      }
      a { color: #d82a37; }
      .brand {
        display: inline-block;
        color: #ef3340;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: .16em;
        text-decoration: none;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        margin-top: 18px;
        padding-bottom: 24px;
        border-bottom: 1px solid #e3ded9;
        font-size: 13px;
      }
      h1 { line-height: 1.15; margin: 34px 0 8px; }
      h2 { margin-top: 30px; line-height: 1.25; }
      .muted { color: #76757a; }
      .card {
        margin-top: 26px;
        padding: 22px;
        border: 1px solid #e3ded9;
        border-radius: 18px;
        background: #fffdfb;
      }
      footer {
        margin-top: 46px;
        padding-top: 18px;
        border-top: 1px solid #e3ded9;
        color: #76757a;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <a class="brand" href="/">Vigil Spend</a>
    <nav aria-label="Vigil Spend links">
      <a href="/">Home</a>
      <a href="/support">Support</a>
      <a href="/legal/privacy">Privacy Policy</a>
      <a href="/legal/terms">Terms of Use</a>
      <a href="/legal/eula">Apple EULA</a>
      <a href="/account-deletion">Account deletion</a>
    </nav>
    ${body}
    ${extra}
    <footer>Vigil Spend · Know Where It All Goes. · <a href="mailto:support@vigilspend.com">support@vigilspend.com</a></footer>
  </body>
</html>`;
}

const PUBLIC_PAGES = {
  '/support': page(
    'Support',
    `<h1>Vigil Spend Support</h1>
     <p class="muted">Help with your Vigil Spend account, subscription, or app experience.</p>
     <div class="card">
       <p>Email us at <a href="mailto:support@vigilspend.com">support@vigilspend.com</a>.</p>
       <p>For account or subscription questions, include the email address on the account and the device type. Do not send passwords or payment details.</p>
     </div>`,
  ),
  '/legal/privacy': page(
    'Privacy Policy',
    `<h1>Privacy Policy</h1>
     <p class="muted">Last updated ${LAST_UPDATED}</p>
     <h2>Local financial data</h2>
      <p>Your financial data, including transactions, income, and bucket allocations, is stored locally on your device. Vigil Spend does not connect to your bank accounts.</p>
     <h2>Accounts</h2>
      <p>Vigil Spend securely handles account authentication and profile information. You may sign in with email and password, Google, or Apple. Apple sign-in uses Apple’s verified account identifier; Vigil Spend does not receive or store your Apple password.</p>
     <h2>Media capture and AI</h2>
      <p>When you use receipt scanning or voice notes, the selected image or audio is securely transmitted to Vigil Spend’s servers only for AI extraction or transcription. These files are processed and are not stored permanently.</p>
     <h2>Subscriptions</h2>
     <p>Apple and RevenueCat securely manage subscription status and purchase history.</p>
     <h2>Retention and deletion</h2>
      <p>Your local financial data remains on your device until you delete it. You can erase local data or permanently delete your Vigil Spend account from Vigil Spend Settings. Account deletion removes the account information and server-side records associated with the account, subject to limited records that must be retained by law.</p>
     <h2>Contact</h2>
     <p>Privacy questions can be sent to <a href="mailto:support@vigilspend.com">support@vigilspend.com</a>.</p>`,
  ),
  '/legal/terms': page(
    'Terms of Use',
    `<h1>Terms of Use</h1>
     <p class="muted">Last updated ${LAST_UPDATED}</p>
     <h2>Not financial advice</h2>
      <p>Vigil Spend is a budgeting and decision-support tool. It does not provide financial, tax, investment, or legal advice.</p>
     <h2>Your responsibility</h2>
     <p>You are responsible for reviewing your entries, tax estimates, exchange rates, and subscription choices.</p>
     <h2>Acceptable use</h2>
      <p>Use Vigil Spend lawfully. Do not attempt to disrupt, misuse, or reverse-engineer the application or its servers.</p>
     <h2>Subscriptions</h2>
     <p>Subscriptions are billed through your Apple ID account and renew automatically unless cancelled in Apple subscription settings at least 24 hours before the current period ends.</p>
     <h2>Contact</h2>
     <p>Questions can be sent to <a href="mailto:support@vigilspend.com">support@vigilspend.com</a>.</p>`,
  ),
  '/legal/eula': page(
    'End User License Agreement',
    `<h1>End User License Agreement</h1>
      <p>Vigil Spend uses Apple’s standard Licensed Application End User License Agreement.</p>`,
    `<p><a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Read Apple’s Standard EULA</a></p>`,
  ),
  '/account-deletion': page(
    'Account Deletion',
    `<h1>Delete your Vigil Spend account</h1>
     <p class="muted">Last updated ${LAST_UPDATED}</p>
     <div class="card">
       <h2>From the app</h2>
        <p>Open Vigil Spend, go to Settings, choose <strong>Delete account</strong>, and confirm the deletion. This permanently deletes your Vigil Spend account and its server-side account records. You can also use Settings to erase the financial data stored locally on your device.</p>
       <h2>If you cannot access the app</h2>
        <p>Email <a href="mailto:support@vigilspend.com?subject=Vigil%20Spend%20account%20deletion">support@vigilspend.com</a> from the email address on the account and request account deletion. Do not send your password or payment details.</p>
     </div>`,
  ),
};

function getPublicPage(pathname) {
  return PUBLIC_PAGES[pathname] || null;
}

module.exports = { getPublicPage };