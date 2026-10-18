
import jwt from "jsonwebtoken";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  globalRole: "ADMIN" | "USER";
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 characters."
    );
  }

  return secret;
}

export function createAccessToken(
  payload: AuthTokenPayload
): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "15m",
  });
}

export function verifyAccessToken(
  token: string
): AuthTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (
    typeof decoded === "string" ||
    !("sub" in decoded) ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string" ||
    (decoded.globalRole !== "ADMIN" &&
      decoded.globalRole !== "USER")
  ) {
    throw new Error("Invalid authentication token payload.");
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    globalRole: decoded.globalRole,
  };
}
