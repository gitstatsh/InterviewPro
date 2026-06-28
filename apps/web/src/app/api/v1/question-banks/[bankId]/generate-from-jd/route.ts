import { NextRequest } from "next/server";

export const maxDuration = 300;

const API = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest, { params }: { params: { bankId: string } }) {
  const body = await req.text();
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!["host", "connection", "transfer-encoding"].includes(k)) headers.set(k, v);
  });

  const res = await fetch(`${API}/api/v1/question-banks/${params.bankId}/generate-from-jd`, {
    method: "POST",
    headers,
    body,
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
