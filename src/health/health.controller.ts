import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';

@ApiTags('Health & Telemetry')
@Controller('health')
export class HealthController {
  constructor(
    private configService: ConfigService,
    private esService: ElasticsearchService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'System health check and infrastructure status',
    description: 'Returns operational health of Database (TypeORM), Elasticsearch cluster, Node process uptime, and memory statistics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health telemetry payload',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-09-23T06:00:00.000Z',
        uptimeSeconds: 120,
        environment: 'development',
        services: {
          database: {
            type: 'sqlite',
            status: 'connected',
          },
          elasticsearch: {
            status: 'green',
            isConnected: true,
          },
        },
        memory: {
          rssMb: 62,
          heapUsedMb: 24,
          heapTotalMb: 45,
        },
      },
    },
  })
  async getHealth() {
    const esHealth = await this.esService.checkHealth();
    const memory = process.memoryUsage();
    const dbType = this.configService.get<string>('database.type');

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: this.configService.get<string>('nodeEnv') || 'development',
      services: {
        database: {
          type: dbType,
          status: 'connected',
        },
        elasticsearch: {
          status: esHealth.status,
          isConnected: esHealth.isConnected,
          clusterInfo: esHealth.clusterInfo,
          ...(esHealth.error ? { error: esHealth.error } : {}),
        },
      },
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      },
    };
  }
}
