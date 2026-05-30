import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';
import { PathyClientService } from '../pathy/pathy-client.service';
import { TenantScopeService } from '../pathy/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DocumentProcessingJobPayload,
} from './queue.constants';

/**
 * pathy 文档异步处理：raw 层 compile → wiki，再 wiki/embed 建索引。
 * 幂等：kb_layer_processing_job.status=done 时跳过；running 且 30 分钟内跳过。
 */
@Processor(DOCUMENT_PROCESSING_QUEUE, { concurrency: 2 })
export class DocumentProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pathy: PathyClientService,
    private readonly tenantScope: TenantScopeService,
  ) {
    super();
  }

  async process(
    job: Job<DocumentProcessingJobPayload>,
  ): Promise<Record<string, unknown>> {
    const { jobRecordId, tenantId, operation, inputPath, outputPath } = job.data;
    this.logger.log(
      `Document processing ${jobRecordId} op=${operation} path=${inputPath}`,
    );

    const record = await this.prisma.kbLayerProcessingJob.findUnique({
      where: { id: jobRecordId },
    });
    if (!record) {
      return { skipped: true, reason: 'record_not_found' };
    }

    if (record.status === 'done') {
      return { skipped: true, reason: 'already_done' };
    }

    if (
      record.status === 'running' &&
      record.startedAt &&
      Date.now() - record.startedAt.getTime() < 30 * 60 * 1000
    ) {
      return { skipped: true, reason: 'already_running' };
    }

    await this.prisma.kbLayerProcessingJob.update({
      where: { id: jobRecordId },
      data: { status: 'running', startedAt: new Date(), errorMsg: null },
    });

    try {
      const wikiPrefix = await this.tenantScope.resolveWikiPrefix(tenantId);
      const scopedInput = this.tenantScope.scopeLayerPath(wikiPrefix, inputPath);
      const results: Record<string, unknown> = {};

      if (operation === 'compile_and_embed') {
        const out = outputPath ?? inputPath;
        const scopedOutput = this.tenantScope.scopeLayerPath(wikiPrefix, out);
        results.compile = await this.pathy.compile([scopedInput], scopedOutput);
        results.embed = await this.pathy.embedWiki(scopedOutput);
      } else {
        results.embed = await this.pathy.embedWiki(scopedInput);
      }

      await this.prisma.kbLayerProcessingJob.update({
        where: { id: jobRecordId },
        data: {
          status: 'done',
          finishedAt: new Date(),
          result: results as InputJsonValue,
        },
      });

      return { success: true, jobRecordId, results };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await this.prisma.kbLayerProcessingJob.update({
        where: { id: jobRecordId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMsg: errMsg.slice(0, 1024),
        },
      });
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DocumentProcessingJobPayload>, error: Error) {
    this.logger.error(
      `Document job ${job.id} failed: ${error.message}`,
      error.stack,
    );
  }
}
