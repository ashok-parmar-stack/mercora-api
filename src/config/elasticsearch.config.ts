import { registerAs } from "@nestjs/config";

export default registerAs("elasticsearch", () => ({
  enabled: process.env.ELASTICSEARCH_ENABLED === "true",
  node: process.env.ELASTICSEARCH_NODE || "",
  apiKey: process.env.ELASTICSEARCH_API_KEY || undefined,
  indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX || "b2b_mercora",
}));
