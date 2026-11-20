import { registerAs } from "@nestjs/config";

export default registerAs("security", () => ({
  jwtSecret: process.env.JWT_SECRET || "mercora_super_secret_jwt_key_2026",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "10", 10),
  rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || "60", 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
}));
