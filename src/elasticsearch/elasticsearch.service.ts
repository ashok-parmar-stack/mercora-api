import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client?: Client;
  private isConnected = false;

  constructor(private configService: ConfigService) {
    const isEnabled =
      this.configService.get<boolean>('elasticsearch.enabled') ??
      process.env.ELASTICSEARCH_ENABLED === 'true';
    const node = this.configService.get<string>('elasticsearch.node');
    const isServerless = Boolean(
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NOW_REGION
    );

    // Skip connecting if disabled, no node configured, or if pointing to localhost in serverless/cloud
    if (!isEnabled || !node || (isServerless && (node.includes('localhost') || node.includes('127.0.0.1')))) {
      this.logger.log('Elasticsearch service is disabled.');
      return;
    }

    const apiKey = this.configService.get<string>('elasticsearch.apiKey')?.trim();

    let auth: any = undefined;
    if (apiKey) {
      if (apiKey.startsWith('Bearer ')) {
        auth = { bearer: apiKey.replace(/^Bearer\s+/i, '') };
      } else {
        auth = { apiKey };
      }
    }

    this.client = new Client({
      node,
      auth,
      maxRetries: 2,
      requestTimeout: 5000,
    });
  }

  async onModuleInit() {
    if (this.client) {
      try {
        await this.checkHealth();
      } catch (err: any) {
        this.logger.warn(`Elasticsearch initial health check: ${err?.message || err}`);
      }
    }
  }

  getClient(): Client | undefined {
    return this.client;
  }

  async checkHealth(): Promise<{ status: string; isConnected: boolean; clusterInfo?: any; error?: string }> {
    if (!this.client) {
      return {
        status: 'disabled',
        isConnected: false,
      };
    }
    try {
      const health = await this.client.cluster.health({});
      this.isConnected = true;
      return {
        status: health.status,
        isConnected: true,
        clusterInfo: {
          clusterName: health.cluster_name,
          numberOfNodes: health.number_of_nodes,
          activePrimaryShards: health.active_primary_shards,
        },
      };
    } catch (err: any) {
      this.isConnected = false;
      this.logger.warn(`Elasticsearch health check failed: ${err?.message || err}`);
      return {
        status: 'disconnected_or_local_fallback',
        isConnected: false,
        error: err?.message || 'Connection failed',
      };
    }
  }
}
