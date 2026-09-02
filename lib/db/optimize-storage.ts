import nextEnv from "@next/env";
import { ObjectId } from "mongodb";

import type { StoredResult } from "../storage.ts";
import { collections, type ResultDoc } from "./mongo.ts";
import { createIndexes } from "./indexes.ts";
import { updateUserProgress } from "./progress-storage.ts";
import {
  DAILY_RETENTION_DAYS,
  MAX_STORED_SAMPLE_POINTS,
  RESULT_HISTORY_LIMIT,
  SAMPLE_HISTORY_LIMIT,
  aggregateWeaknessSummaries,
  compactSamples,
  pruneUserStorage,
  updatePersonalBest,
} from "./result-storage.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

type MigrationReport = {
  users: number;
  results: number;
  inlineSampleDocuments: number;
  samplesKept: number;
  samplesDownsampled: number;
  resultsPruned: number;
  personalBests: number;
  analyticsCreated: number;
  progressCreated: number;
  progressUpdated: number;
  dailyExpiryUpdated: number;
};

function fromDocument(doc: ResultDoc): StoredResult {
  return {
    id: doc.clientId,
    ts: doc.ts,
    mode: doc.mode,
    modeKey: doc.modeKey,
    durationMs: doc.durationMs,
    wpm: doc.wpm,
    raw: doc.raw,
    accuracy: doc.accuracy,
    consistency: doc.consistency,
    chars: doc.chars,
    keystrokes: doc.keystrokes,
    errors: doc.errors,
    samples: doc.samples ?? [],
    weaknesses: doc.weaknesses,
  };
}

function isBetter(candidate: ResultDoc, current: ResultDoc): boolean {
  return (
    candidate.wpm > current.wpm ||
    (candidate.wpm === current.wpm && candidate.accuracy > current.accuracy)
  );
}

export async function optimizeStorage(apply: boolean): Promise<MigrationReport> {
  const {
    results,
    resultSamples,
    userTypingAnalytics,
    userProgress,
    dailyChallengeResults,
  } = await collections();
  const userIds = await results.distinct("userId");
  const report: MigrationReport = {
    users: userIds.length,
    results: 0,
    inlineSampleDocuments: 0,
    samplesKept: 0,
    samplesDownsampled: 0,
    resultsPruned: 0,
    personalBests: 0,
    analyticsCreated: 0,
    progressCreated: 0,
    progressUpdated: 0,
    dailyExpiryUpdated: 0,
  };

  for (const userId of userIds) {
    const docs = await results.find({ userId }).sort({ ts: -1 }).toArray();
    report.results += docs.length;
    report.inlineSampleDocuments += docs.filter((doc) => (doc.samples?.length ?? 0) > 0).length;
    report.resultsPruned += Math.max(0, docs.length - RESULT_HISTORY_LIMIT);

    const bestByMode = new Map<string, ResultDoc>();
    for (const doc of docs) {
      const current = bestByMode.get(doc.modeKey);
      if (!current || isBetter(doc, current)) bestByMode.set(doc.modeKey, doc);
    }
    report.personalBests += bestByMode.size;

    const sampleDocs = docs
      .filter((doc) => (doc.samples?.length ?? 0) > 0)
      .slice(0, SAMPLE_HISTORY_LIMIT);
    report.samplesKept += sampleDocs.length;
    const analyticsExists = await userTypingAnalytics.countDocuments({ userId }, { limit: 1 });
    const progressDocument = await userProgress.findOne(
      { userId },
      { projection: { "progress.processedResultIds": 1 } },
    );
    const progressPending = docs.some(
      (doc) => !progressDocument?.progress.processedResultIds.includes(doc.clientId),
    );
    if (analyticsExists === 0) report.analyticsCreated++;
    if (!progressDocument) report.progressCreated++;
    else if (progressPending) report.progressUpdated++;
    if (!apply) continue;

    if (sampleDocs.length > 0) {
      await resultSamples.bulkWrite(
        sampleDocs.map((doc) => ({
          updateOne: {
            filter: { userId, clientId: doc.clientId },
            update: {
              $set: { ts: doc.ts, samples: compactSamples(doc.samples ?? []) },
              $setOnInsert: { _id: new ObjectId(), userId, clientId: doc.clientId },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    await Promise.all(
      [...bestByMode.values()].map((doc) =>
        updatePersonalBest(
          { id: userId, name: doc.username, image: doc.image },
          fromDocument(doc),
        ),
      ),
    );

    if (analyticsExists === 0) {
      const analytics = aggregateWeaknessSummaries(docs.map((doc) => doc.weaknesses));
      await userTypingAnalytics.updateOne(
        { userId },
        {
          $setOnInsert: {
            _id: new ObjectId(),
            userId,
            ...analytics,
            processedResultIds: docs
              .slice(0, RESULT_HISTORY_LIMIT)
              .map((doc) => doc.clientId),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }

    if (!progressDocument || progressPending) {
      await updateUserProgress(userId, docs.map(fromDocument));
    }

    await results.updateMany({ userId }, { $unset: { samples: "" } });
    await pruneUserStorage(userId);
  }

  const oversizedSamples = await resultSamples
    .find(
      { [`samples.${MAX_STORED_SAMPLE_POINTS}`]: { $exists: true } },
      { projection: { _id: 1, samples: 1 } },
    )
    .toArray();
  report.samplesDownsampled = oversizedSamples.length;
  if (apply && oversizedSamples.length > 0) {
    await resultSamples.bulkWrite(
      oversizedSamples.map((doc) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { samples: compactSamples(doc.samples) } },
        },
      })),
      { ordered: false },
    );
  }

  const dailyWithoutExpiry = await dailyChallengeResults
    .find({ expiresAt: { $exists: false } }, { projection: { _id: 1, updatedAt: 1 } })
    .toArray();
  report.dailyExpiryUpdated = dailyWithoutExpiry.length;
  if (apply && dailyWithoutExpiry.length > 0) {
    const retentionMs = DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    await dailyChallengeResults.bulkWrite(
      dailyWithoutExpiry.map((doc) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { expiresAt: new Date(doc.updatedAt + retentionMs) } },
        },
      })),
      { ordered: false },
    );
  }

  if (apply) await createIndexes();
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const apply = process.argv.includes("--apply");
  optimizeStorage(apply)
    .then((report) => {
      console.log(`${apply ? "Applied" : "Dry run for"} TypeFlow storage optimization:`);
      console.table(report);
      if (!apply) console.log("No data changed. Re-run with --apply after reviewing this report.");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
