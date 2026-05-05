import { PrismaClient } from "@prisma/client";
import { config } from "./config";

const db = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
});

export default db;
