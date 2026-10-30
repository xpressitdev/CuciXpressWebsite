import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// An idle connection can close during autoscaling/network interruption.
// The pool removes that client itself; without a listener its error event
// crashes Node. In-flight query errors still reject normally to their caller.
pool.on("error", (error: Error & { code?: string }) => {
  console.error("[database.pool] idle connection failed", {
    code: error.code ?? "connection_error",
  });
});
export const db = drizzle({ client: pool, schema });