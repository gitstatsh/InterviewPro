import type { NextApiRequest, NextApiResponse } from "next";
import http from "http";

export const config = { api: { bodyParser: false, responseLimit: false } };

const API_HOST = "localhost";
const API_PORT = parseInt(process.env.INTERNAL_API_PORT ?? "3001", 10);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const { bankId } = req.query as { bankId: string };
  const path = `/api/v1/question-banks/${bankId}/generate-from-jd`;

  const proxyReq = http.request(
    {
      hostname: API_HOST,
      port: API_PORT,
      path,
      method: "POST",
      headers: {
        ...req.headers,
        host: `${API_HOST}:${API_PORT}`,
      },
      timeout: 300_000,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    console.error("[generate-from-jd proxy] error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { code: "PROXY_ERROR", message: "AI generation request failed" } });
    }
  });

  req.pipe(proxyReq);
}
