import { Queue, Worker, type JobsOptions } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { JOB_NAMES, JOB_REGISTRY, QUEUE_NAMES, type JobDefinition, type JobName, type QueueName } from "./jobRegistry.js";
import { JOB_PROCESSORS, createFoundationProcessorContext, type ProcessorContext } from "./processors.js";

const logger = pino({ name: "agrorende-worker" });

export interface WorkerRuntime {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

function jobOptionsFor(name: JobName): JobsOptions {
  const definition = JOB_REGISTRY[name];
  return {
    attempts: definition.attempts,
    backoff: definition.backoff,
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  };
}

function queueNameFor(name: JobName): QueueName {
  return JOB_REGISTRY[name].queueName;
}

function repeatOptionsFor(definition: JobDefinition): JobDefinition["repeat"] {
  if (definition.repeat === undefined) {
    return undefined;
  }
  if (definition.repeat.every !== undefined) {
    return { ...definition.repeat, startDate: Date.now() + definition.repeat.every };
  }
  return definition.repeat;
}

export function createWorkerRuntime(redisUrl: string, processorContext: ProcessorContext = createFoundationProcessorContext()): WorkerRuntime {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queues = Object.fromEntries(
    QUEUE_NAMES.map((queueName) => [queueName, new Queue(queueName, { connection })]),
  ) as Record<QueueName, Queue>;
  const workers = QUEUE_NAMES.map(
    (queueName) =>
      new Worker(
        queueName,
        async (job) => {
          const name = job.name as JobName;
          if (!JOB_NAMES.includes(name)) {
            throw new Error(`Unknown worker job ${job.name}`);
          }
          await JOB_PROCESSORS[name](processorContext);
        },
        { connection },
      ),
  );

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      logger.error({ jobName: job?.name, jobId: job?.id, error }, "worker job failed");
    });
  }

  return {
    async start() {
      for (const name of JOB_NAMES) {
        const definition: JobDefinition = JOB_REGISTRY[name];
        const repeat = repeatOptionsFor(definition);
        if (repeat !== undefined) {
          await queues[definition.queueName].upsertJobScheduler(
            name,
            repeat,
            { name, data: {}, opts: jobOptionsFor(name) },
          );
        }
      }
      await queues[queueNameFor("events.dispatch")].add("events.dispatch", {}, { ...jobOptionsFor("events.dispatch"), jobId: "events.dispatch-startup" });
      logger.info({ queues: QUEUE_NAMES, jobs: JOB_NAMES }, "worker started");
    },
    async stop() {
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
      await connection.quit();
      logger.info("worker stopped");
    },
  };
}
