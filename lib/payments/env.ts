import { z } from "zod";

const cashfreeSchema = z.object({
  CASHFREE_APP_ID: z.string().min(1),
  CASHFREE_SECRET_KEY: z.string().min(1),
  CASHFREE_ENV: z.enum(["SANDBOX", "PRODUCTION"]),
});

export function cashfreeEnv() {
  return cashfreeSchema.parse({
    CASHFREE_APP_ID: process.env.CASHFREE_APP_ID,
    CASHFREE_SECRET_KEY: process.env.CASHFREE_SECRET_KEY,
    CASHFREE_ENV: process.env.CASHFREE_ENV ?? "SANDBOX",
  });
}

export function cashfreeCheckoutMode() {
  return cashfreeEnv().CASHFREE_ENV === "PRODUCTION" ? "production" : "sandbox";
}
