import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("You must be signed in.");
  return user;
}
