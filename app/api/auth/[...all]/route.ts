import { toNextJsHandler } from "better-auth/next-js";

async function handlers() {
  // Keep the local-only app buildable before optional server credentials are filled in.
  const { auth } = await import("@/lib/auth");
  return toNextJsHandler(auth.handler);
}

export async function GET(request: Request) {
  return (await handlers()).GET(request);
}

export async function POST(request: Request) {
  return (await handlers()).POST(request);
}
