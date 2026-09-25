import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vigilAdminRouter from "./vigil-admin";
import vigilAdvisorRouter from "./vigil-advisor";
import vigilCaptureRouter from "./vigil-capture";
import vigilProfileRouter from "./vigil-profile";
import publicLegalRouter from "./public-legal";
import vigilAppleAuthRouter from "./vigil-apple-auth";
import vigilSupportRouter from "./vigil-support";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicLegalRouter);
router.use(vigilAppleAuthRouter);
router.use(vigilAdminRouter);
router.use(vigilAdvisorRouter);
router.use(vigilCaptureRouter);
router.use(vigilProfileRouter);
router.use(vigilSupportRouter);

export default router;
