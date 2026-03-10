import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { companionLogin, proxyRequest } from "./companion-proxy";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const data = await companionLogin(email, password);
      return res.json(data);
    } catch (err: any) {
      console.error("Login error:", err.message);
      const msg = err.message || "Login failed";
      return res.status(401).json({ message: msg });
    }
  });

  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/auth/login" && req.method === "POST") {
      return next();
    }
    return proxyRequest(req, res);
  });

  const httpServer = createServer(app);
  return httpServer;
}
