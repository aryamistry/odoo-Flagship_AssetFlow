import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string, pepper: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = (await scrypt(`${password}:${pepper}`, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, envelope: string, pepper: string) {
  const [algorithm, salt, encoded] = envelope.split("$");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;
  const candidate = (await scrypt(`${password}:${pepper}`, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(encoded, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

