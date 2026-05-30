import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DocumentProcessingJobPayload,
  DocumentProcessingOperation,
} from './job-queue.constants';

export interface ScheduleLayerProcessingInput {
  tenantId: string;
  layer: string;
  inputPath: string;
  outputPath?: string;
  operation?: DocumentProcessingOperation;
}

@Injectable()
export class DocumentProcessingQueueService {
  private readonly logger = new Logger(DocumentProcessingQueueService.name);

  constructor(
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly queue: Queue<DocumentProcessingJobPayload>,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 层文件上传后调度 pathy 编译/嵌入（幂等：同 idempotencyKey 不重复入队）。
   */
  async scheduleAfterUpload(input: ScheduleLayerProcessingInput): Promise<{
    scheduled: boolean;
    jobRecordId?: string;
    reason?: string;
  }> {
    const operation =
      input.operation ?? this.resolveOperation(input.layer, input.inputPath);
    if (!operation) {
      return { scheduled: false, reason: 'unsupported_layer_or_extension' };
    }

    const idempotencyKey = `${input.tenantId}:${input.layer}:${input.inputPath}`;
    const existing = await this.prisma.kbLayerProcessingJob.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (existing.status === 'done') {
        return { scheduled: false, jobRecordId: existing.id, reason: 'already_done' };
      }
      if (existing.status === 'running') {
        return { scheduled: false, jobRecordId: existing.id, reason: 'already_running' };
      }
      if (existing.status === 'queued' && existing.bullJobId) {
        return { scheduled: false, jobRecordId: existing.id, reason: 'already_queued' };
      }
    }

    const outputPath =
      input.outputPath ??
      (operation === 'compile_and_embed'
        ? this.deriveWikiOutputPath(input.inputPath)
        : input.inputPath);

    const record = existing
      ? await this.prisma.kbLayerProcessingJob.update({
          where: { id: existing.id },
          data: {
            status: 'queued',
            operation,
            outputPath,
            errorMsg: null,
            finishedAt: null,
          },
        })
      : await this.prisma.kbLayerProcessingJob.create({
          data: {
            tenantId: input.tenantId,
            layer: input.layer,
            inputPath: input.inputPath,
            outputPath,
            operation,
            idempotencyKey,
            status: 'queued',
          },
        });

    const job = await this.queue.add(
      'process-document',
      {
        jobRecordId: record.id,
        tenantId: input.tenantId,
        layer: input.layer,
        inputPath: input.inputPath,
        outputPath,
        operation,
        idempotencyKey,
      },
      {
        jobId: idempotencyKey,
        attempts: 2,
        backoff: { type: 'fixed', delay: 10_000 },
        removeOnComplete: { count: 2000 },
        removeOnFail: { count: 5000 },
      },
    );

    if (job.id) {
      await this.prisma.kbLayerProcessingJob.update({
        where: { id: record.id },
        data: { bullJobId: job.id },
      });
    }

    this.logger.log(
      `Document processing enqueued tenant=${input.tenantId} path=${input.inputPath} job=${job.id}`,
    );

    return { scheduled: true, jobRecordId: record.id };
  }

  private resolveOperation(
    layer: string,
    path: string,
  ): DocumentProcessingOperation | null {
    const lower = path.toLowerCase();
    if (!lower.endsWith('.md')) return null;
    if (layer === 'raw') return 'compile_and_embed';
    if (layer === 'wiki') return 'embed_only';
    return null;
  }

  private deriveWikiOutputPath(rawPath: string): string {
    return rawPath.replace(/^\/?raw\//, '').replace(/^\//, '');
  }
}
