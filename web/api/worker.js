// The cloud converter. pg_cron in Supabase calls this every minute while a job is due (see db/bookreel.sql);
// it works through job steps for up to about four minutes, saving after every step, so the phone can be closed.
const { send } = require("./_lib.js");
const { rpc, quotaState, TOKEN } = require("./_store.js");
const { runStep } = require("./_pipeline.js");

const START_STEPS_FOR_MS = 100000; // start another step only this early (a step can take ~150 s)
const RETRY_UNTIL_MS = 160000; // a second attempt at a chapter only this early

module.exports = async (req, res) => {
  const token = TOKEN();
  if (!token || req.headers["x-bookreel-token"] !== token) return send(res, 403, { error: "forbidden" });
  const t0 = Date.now();
  const done = [];
  try {
    const quota = await quotaState();
    while (Date.now() - t0 < START_STEPS_FOR_MS) {
      const job = await rpc("claim", { lease: 290 });
      if (!job) break;
      const patch = await runStep(job, quota, { canRetry: () => Date.now() - t0 < RETRY_UNTIL_MS, deadline: t0 + 285000 });
      await rpc("save", { id: job.id, patch });
      done.push(`${job.stage}${job.n ? ` ${job.n}` : ""}: ${patch.status}${patch.wait_reason ? ` (${patch.wait_reason})` : ""}`);
      if (patch.status === "waiting" && patch.wait_reason === "quota") break;
    }
    return send(res, 200, { steps: done, ms: Date.now() - t0 });
  } catch (e) {
    console.error("worker", e.message);
    return send(res, 500, { error: e.message, steps: done });
  }
};
