import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  name: process.env.APP_NAME || "Mercora B2B API",
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "6000", 10),
  apiPrefix: process.env.API_PREFIX || "api",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:9000,http://127.0.0.1:9000").split(","),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== "false",
}));
