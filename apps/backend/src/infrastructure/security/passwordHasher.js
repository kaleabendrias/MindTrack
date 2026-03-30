import crypto from "node:crypto";

const ITERATIONS = 120000;
const KEYLEN = 64;
const DIGEST = "sha512";

function pbkdf2Async(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEYLEN, DIGEST, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("hex"));
    });
  });
}

export async function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await pbkdf2Async(secret, salt);
  return `${salt}:${hash}`;
}

export async function verifySecret(secret, storedHash) {
  if (!storedHash || typeof storedHash !== "string" || !storedHash.includes(":")) {
    return false;
  }

  const [salt, hash] = storedHash.split(":");
  const calculated = await pbkdf2Async(secret, salt);

  const hashBuffer = Buffer.from(hash, "hex");
  const calcBuffer = Buffer.from(calculated, "hex");

  if (hashBuffer.length !== calcBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, calcBuffer);
}
