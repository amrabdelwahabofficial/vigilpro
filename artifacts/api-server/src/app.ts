import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import publicLegalRouter from "./routes/public-legal";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
const trustedProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "0", 10);
// Honor forwarding headers only through an explicitly bounded proxy chain.
app.set("trust proxy", Number.isInteger(trustedProxyHops) && trustedProxyHops >= 0 && trustedProxyHops <= 10 ? trustedProxyHops : 0);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
    secretKey: process.env.CLERK_SECRET_KEY,
  })),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

// Public App Store and support links use clean URLs on the production domain.
// The same router remains under /api through the main API router for backwards compatibility.
app.use("/", publicLegalRouter);
app.use("/api", router);

export default app;
