import { Router } from "express";
import { AdminController } from "./admin.controller";

const router = Router();

// POST /api/admin/login
router.post("/login", AdminController.login);

export const AdminRoutes = router;
