import { Router, type Request, type Response } from "express";
import {
  allowAppleAuthRequest,
  appleErrorDetails,
  appleWebAuthorizationUrl,
  appleWebSignInConfigured,
  APPLE_WEB_STATE_COOKIE,
  appleAuthFailure,
  appleSignInConfigured,
  authenticateVigilRequest,
  completeAppleSignIn,
  getAppleWebConfig,
  deleteAppleAccount,
  issueAppleNonceChallenge,
  signOutAppleSession,
} from "../lib/vigilIdentity";

const router = Router();

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function bearer(req: Request) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function webAuthResultPage(payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Vigil Apple sign-in</title></head>
<body><p>Returning to Vigil…</p>
<script>
  const result = ${serialized};
  if (window.opener) {
    window.opener.postMessage({ type: "vigil-apple-auth", ...result }, "*");
    window.close();
  } else {
    document.body.innerText = result.error || "Apple sign-in completed. You can close this window.";
  }
</script></body></html>`;
}

function webFullName(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as { name?: { firstName?: unknown; lastName?: unknown } };
    return parsed.name && typeof parsed.name === "object"
      ? { givenName: parsed.name.firstName, familyName: parsed.name.lastName }
      : undefined;
  } catch {
    return undefined;
  }
}

router.get("/vigil/apple/web/start", async (req: Request, res: Response) => {
  if (!appleWebSignInConfigured()) return res.status(503).type("html").send(webAuthResultPage({ error: "Web Sign in with Apple is not configured yet." }));
  try {
    if (!(await allowAppleAuthRequest(req, res))) return;
    const challenge = await issueAppleNonceChallenge();
    res.cookie(APPLE_WEB_STATE_COOKIE, challenge.challengeId, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 5 * 60 * 1000,
    });
    return res.redirect(appleWebAuthorizationUrl(challenge));
  } catch (error) {
    req.log?.error({ error }, "Failed to start web Apple sign-in");
    return res.status(503).type("html").send(webAuthResultPage({ error: "Apple sign-in is temporarily unavailable. Please try again." }));
  }
});

router.post("/vigil/apple/web/callback", async (req: Request, res: Response) => {
  if (!appleWebSignInConfigured()) return res.status(503).type("html").send(webAuthResultPage({ error: "Web Sign in with Apple is not configured yet." }));
  res.clearCookie(APPLE_WEB_STATE_COOKIE, { path: "/" });
  const state = text(req.body?.state, 200);
  const savedState = text(req.cookies?.[APPLE_WEB_STATE_COOKIE], 200);
  if (!state || !savedState || state !== savedState) {
    return res.status(400).type("html").send(webAuthResultPage({ error: "Apple sign-in could not be verified. Please try again." }));
  }
  const identityToken = text(req.body?.id_token, 12_000);
  const authorizationCode = text(req.body?.code, 3_000);
  if (!identityToken || !authorizationCode) {
    return res.status(400).type("html").send(webAuthResultPage({ error: "Apple sign-in response was incomplete. Please try again." }));
  }
  try {
    if (!(await allowAppleAuthRequest(req, res))) return;
    const webConfig = getAppleWebConfig();
    const result = await completeAppleSignIn({
      challengeId: state,
      identityToken,
      authorizationCode,
      clientId: webConfig.clientId,
      redirectUri: webConfig.redirectUri,
      fullName: webFullName(req.body?.user),
    });
    return res.type("html").send(webAuthResultPage(result));
  } catch (error) {
    req.log?.warn({ error: appleErrorDetails(error) }, "Web Apple sign-in rejected");
    return res.status(400).type("html").send(webAuthResultPage({ error: "Apple sign-in could not be completed. Please try again." }));
  }
});

router.get("/vigil/apple/challenge", async (req: Request, res: Response) => {
  if (!appleSignInConfigured()) {
    return res.status(503).json({ message: "Sign in with Apple is not configured for this build. Please use email or Google." });
  }
  try {
    if (!(await allowAppleAuthRequest(req, res))) return;
    return res.json(await issueAppleNonceChallenge());
  } catch (error) {
    req.log?.error({ error }, "Failed to issue Apple sign-in challenge");
    return res.status(503).json({ message: "Apple sign-in is temporarily unavailable. Please try again." });
  }
});

router.post("/vigil/apple/exchange", async (req: Request, res: Response) => {
  if (!appleSignInConfigured()) {
    return res.status(503).json({ message: "Sign in with Apple is not configured for this build. Please use email or Google." });
  }
  if (!(await allowAppleAuthRequest(req, res))) return;
  const challengeId = text(req.body?.challengeId, 200);
  const identityToken = text(req.body?.identityToken, 12_000);
  const authorizationCode = text(req.body?.authorizationCode, 3_000);
  if (!challengeId || !identityToken || !authorizationCode) {
    return res.status(400).json({ message: "Apple sign-in response was incomplete. Please try again." });
  }
  try {
    const fullName = req.body?.fullName;
    const result = await completeAppleSignIn({
      challengeId,
      identityToken,
      authorizationCode,
      fullName: fullName && typeof fullName === "object" ? fullName as { givenName?: unknown; familyName?: unknown } : undefined,
    });
    return res.json(result);
  } catch (error) {
    req.log?.warn({ error: appleErrorDetails(error) }, "Apple sign-in rejected");
    return appleAuthFailure(res, error);
  }
});

router.post("/vigil/apple/logout", async (req: Request, res: Response) => {
  const token = bearer(req);
  if (!token || token.includes(".")) return res.status(401).json({ message: "Authentication required" });
  await signOutAppleSession(token);
  return res.status(204).end();
});

router.get("/vigil/identity", async (req: Request, res: Response) => {
  const identity = await authenticateVigilRequest(req, res);
  if (!identity) return;
  return res.json({ identity });
});

router.delete("/vigil/apple/account", async (req: Request, res: Response) => {
  const identity = await authenticateVigilRequest(req, res);
  if (!identity) return;
  if (identity.provider !== "apple") return res.status(400).json({ message: "This account is managed by Clerk." });
  try {
    await deleteAppleAccount(identity);
    return res.status(204).end();
  } catch (error) {
    req.log?.error({ error }, "Apple account deletion failed");
    return res.status(503).json({ message: "Account deletion could not complete because Apple token revocation failed. Your account remains active; please try again." });
  }
});

export default router;