import { registerAs } from "@nestjs/config";

export default registerAs("elasticsearch", () => ({
  node: process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
  apiKey: process.env.ELASTICSEARCH_API_KEY || undefined,
  enabled: process.env.ELASTICSEARCH_ENABLED === "true",
  indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX || "b2b_mercora",
}));
