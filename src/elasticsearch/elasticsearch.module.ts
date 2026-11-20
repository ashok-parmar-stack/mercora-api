import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ElasticsearchService } from './elasticsearch.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ElasticsearchService],
  exports: [ElasticsearchService],
})
export class ElasticsearchModule {}
