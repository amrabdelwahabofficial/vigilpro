import { Router, type Response } from "express";

const router = Router();
const LAST_UPDATED = "September 12, 2026";

const page = (title: string, body: string, extra = "") => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} — Vigil</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color: #151619; background: #f8f9fa; }
      body { max-width: 760px; margin: 0 auto; padding: 48px 22px 64px; line-height: 1.65; }
      h1 { line-height: 1.15; margin-bottom: 8px; }
      h2 { margin-top: 32px; line-height: 1.25; }
      a { color: #bf1d2b; }
      .brand { color: #ef3340; font-weight: 800; letter-spacing: .12em; }
      .card { background: #fff; border: 1px solid #e1e4e7; border-radius: 18px; padding: 22px; }
      .muted { color: #4d535b; }
    </style>
  </head>
  <body>
    <div class="brand">VIGIL</div>
    ${body}
    ${extra}
  </body>
</html>`;

function sendPage(res: Response, title: string, body: string, extra?: string) {
  res.type("html").send(page(title, body, extra));
}

router.get("/", (_req, res) => {
  sendPage(
    res,
    "Vigil — Know Where It All Goes",
    `<h1>Vigil — Know Where It All Goes</h1>
     <p class="muted">A calm, practical way to plan your money, understand your spending, and make better decisions.</p>
     <div class="card">
       <h2>Plan with intention</h2>
       <p>Set a monthly starting point, give each category a purpose, and see how your choices fit together.</p>
       <h2>Capture spending simply</h2>
       <p>Log transactions manually or use optional voice notes, receipt capture, and bank-message scanning.</p>
       <h2>Keep control of your data</h2>
       <p>Your financial planning data is stored locally on your device. Vigil does not connect to your bank accounts.</p>
     </div>`,
     `<p><a href="/support">Support</a> · <a href="/legal/privacy">Privacy Policy</a> · <a href="/legal/terms">Terms of Use</a> · <a href="/legal/eula">Apple EULA</a> · <a href="/account-deletion">Account deletion</a></p>`,
  );
});

router.get("/support", (_req, res) => {
  sendPage(
    res,
    "Support",
    `<h1>Vigil Support</h1>
     <p class="muted">Help with your Vigil account, subscription, or app experience.</p>
     <div class="card">
       <p>Email us at <a href="mailto:support@vigilspend.com">support@vigilspend.com</a>.</p>
       <p>For account or subscription questions, include the email address on the account and the device type. Do not send passwords or payment details.</p>
     </div>`,
  );
});

router.get("/legal/privacy", (_req, res) => {
  sendPage(
    res,
    "Privacy Policy",
    `<h1>Privacy Policy</h1>
     <p class="muted">Last updated ${LAST_UPDATED}</p>
     <h2>Local financial data</h2>
     <p>Your financial data, including transactions, income, and bucket allocations, is stored locally on your device. Vigil does not connect to your bank accounts.</p>
     <h2>Accounts</h2>
     <p>Vigil securely handles account authentication and profile information. You may sign in with email and password, Google, or Apple. Apple sign-in uses Apple’s verified account identifier; Vigil does not receive or store your Apple password.</p>
     <h2>Media capture and AI</h2>
     <p>When you use receipt scanning or voice notes, the selected image or audio is securely transmitted to Vigil’s servers only for AI extraction or transcription. These files are processed and are not stored permanently.</p>
     <h2>Subscriptions</h2>
     <p>Apple and RevenueCat securely manage subscription status and purchase history.</p>
     <h2>Retention and deletion</h2>
     <p>Your local financial data remains on your device until you delete it. You can erase local data or permanently delete your Vigil account from Vigil Settings. Account deletion removes the account information and server-side records associated with the account, subject to limited records that must be retained by law.</p>
     <h2>Contact</h2>
     <p>Privacy questions can be sent to <a href="mailto:support@vigilspend.com">support@vigilspend.com</a>.</p>`,
  );
});

router.get("/legal/terms", (_req, res) => {
  sendPage(
    res,
    "Terms of Use",
    `<h1>Terms of Use</h1>
     <p class="muted">Last updated ${LAST_UPDATED}</p>
     <h2>Not financial advice</h2>
     <p>Vigil is a budgeting and decision-support tool. It does not provide financial, tax, investment, or legal advice.</p>
     <h2>Your responsibility</h2>
     <p>You are responsible for reviewing your entries, tax estimates, exchange rates, and subscription choices.</p>
     <h2>Acceptable use</h2>
     <p>Use Vigil lawfully. Do not attempt to disrupt, misuse, or reverse-engineer the application or its servers.</p>
     <h2>Subscriptions</h2>
     <p>Subscriptions are billed through your Apple ID account and renew automatically unless cancelled in Apple subscription settings at least 24 hours before the current period ends.</p>
     <h2>Contact</h2>
     <p>Questions can be sent to <a href="mailto:support@vigilspend.com">support@vigilspend.com</a>.</p>`,
  );
});

router.get("/legal/eula", (_req, res) => {
  sendPage(
    res,
    "End User License Agreement",
    `<h1>End User License Agreement</h1>
     <p>Vigil uses Apple’s standard Licensed Application End User License Agreement.</p>`,
    `<p><a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Read Apple’s Standard EULA</a></p>`,
  );
});

router.get("/account-deletion", (_req, res) => {
  sendPage(
    res,
    "Account Deletion",
    `<h1>Delete your Vigil account</h1>
     <p class="muted">Last updated ${LAST_UPDATED}</p>
     <div class="card">
       <h2>From the app</h2>
       <p>Open Vigil, go to Settings, choose <strong>Delete account</strong>, and confirm the deletion. This permanently deletes your Vigil account and its server-side account records. You can also use Settings to erase the financial data stored locally on your device.</p>
       <h2>If you cannot access the app</h2>
       <p>Email <a href="mailto:support@vigilspend.com?subject=Vigil%20account%20deletion">support@vigilspend.com</a> from the email address on the account and request account deletion. Do not send your password or payment details.</p>
     </div>`,
  );
});

export default router;