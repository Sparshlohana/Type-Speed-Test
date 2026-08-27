import "server-only";

import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { betterAuth } from "better-auth";

import { getDb } from "@/lib/db/mongo";

export const auth = betterAuth({
  database: mongodbAdapter(await getDb()),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
});
