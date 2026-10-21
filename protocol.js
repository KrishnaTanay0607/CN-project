"use strict";

const G = 100;
const MIN_RTO = 300;
const MAX_RTO = 10000;
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value))); }
function createEstimator(initialRto) { return { srtt: null, rttvar: null, rto: clamp(initialRto, MIN_RTO, MAX_RTO), samples: 0, backoffs: 0, lastRtt: null }; }
function updateEstimator(e, sample) {
  sample = clamp(sample, 1, MAX_RTO);
  if (e.srtt === null) { e.srtt = sample; e.rttvar = sample / 2; }
  else { e.rttvar = .75 * e.rttvar + .25 * Math.abs(e.srtt - sample); e.srtt = .875 * e.srtt + .125 * sample; }
  e.lastRtt = sample; e.samples++; e.rto = clamp(e.srtt + Math.max(G, 4 * e.rttvar), MIN_RTO, MAX_RTO);
  return e;
}
function backoff(e) { e.rto = clamp(e.rto * 2, MIN_RTO, MAX_RTO); e.backoffs++; return e; }
function seededRandom(seed) { let v = (Number(seed) >>> 0) || 1; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 4294967296; }; }
function hashRandom(seed, message, attempt, channel) {
  let x = ((Number(seed) >>> 0) ^ Math.imul(message + 1, 0x9e3779b1) ^ Math.imul(attempt + 1, 0x85ebca6b) ^ Math.imul(channel + 1, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function newStats() { return { sent: 0, delivered: 0, retransmissions: 0, duplicates: 0, lost: 0, corrupted: 0, ackLost: 0, timeouts: 0, failed: 0, deliveryTimes: [], rttSamples: 0 }; }

// A discrete-event stop-and-wait model. Failure outcomes are keyed by logical
// message and attempt, so fixed and adaptive modes see the same channel trace.
function simulateExperiment(config, mode, messages, seed) {
  const estimator = createEstimator(config.timeout);
  const stats = newStats();
  let now = 0, expected = 0;
  for (let message = 0; message < messages; message++) {
    const seq = expected, started = now;
    let attempt = 0, retransmitted = false, done = false, deadline = Infinity;
    const events = [];
    function sendAttempt() {
      const sentAt = now;
      const rto = mode === "adaptive" ? estimator.rto : config.timeout;
      stats.sent++; deadline = sentAt + rto;
      const packetLost = hashRandom(seed, message, attempt, 0) * 100 < config.loss;
      const corrupted = !packetLost && hashRandom(seed, message, attempt, 1) * 100 < config.corruption;
      const ackLost = !packetLost && !corrupted && hashRandom(seed, message, attempt, 2) * 100 < config.ackLoss;
      if (packetLost) stats.lost++;
      else if (corrupted) stats.corrupted++;
      else events.push({ type: "packet", at: sentAt + config.delay, sentAt, ackLost });
      return sentAt;
    }
    let lastSentAt = sendAttempt();
    while (!done && attempt < 200) {
      events.sort((a, b) => a.at - b.at);
      const next = events[0];
      if (!next || next.at > deadline) {
        now = deadline; stats.timeouts++; stats.retransmissions++; retransmitted = true; attempt++;
        if (mode === "adaptive") backoff(estimator);
        lastSentAt = sendAttempt();
        continue;
      }
      events.shift(); now = next.at;
      if (next.type === "packet") {
        if (seq === expected) { expected = 1 - expected; stats.delivered++; }
        else stats.duplicates++;
        if (next.ackLost) stats.ackLost++;
        else events.push({ type: "ack", at: now + config.delay + config.de "layedAck });
      } else {
        
        stats.deliveryTimes.push(now - started);
        if (mode === "adaptive" && !retransmitted) updateEstimator(estimator, now - lastSentAt);
        done = true;
      }
    }
    if (!done) stats.failed++;
  }
  const averageDelivery = stats.deliveryTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, stats.deliveryTimes.length);
  stats.rttSamples = estimator.samples;
  return { mode, stats: { ...stats, averageDelivery: Math.round(averageDelivery) }, estimator: summaryEstimator(estimator) };
}
function summaryEstimator(e) { return { ...e, srtt: e.srtt === null ? null : Math.round(e.srtt), rttvar: e.rttvar === null ? null : Math.round(e.rttvar), rto: Math.round(e.rto) }; }
function aggregateExperiments(config, messages, trials, seed) {
  const modes = ["fixed", "adaptive"];
  const aggregate = {};
  const runs = {};
  modes.forEach(mode => { runs[mode] = []; aggregate[mode] = { averageCompletion: 0, retransmissions: 0, timeouts: 0, duplicates: 0, rttSamples: 0, delivered: 0, failed: 0 }; });
  for (let trial = 0; trial < trials; trial++) {
    modes.forEach(mode => {
      const result = simulateExperiment(config, mode, messages, Number(seed) + trial);
      runs[mode].push(result);
      const a = aggregate[mode], s = result.stats;
      a.averageCompletion += s.averageDelivery; a.retransmissions += s.retransmissions; a.timeouts += s.timeouts; a.duplicates += s.duplicates; a.rttSamples += s.rttSamples; a.delivered += s.delivered; a.failed += s.failed;
    });
  }
  modes.forEach(mode => Object.keys(aggregate[mode]).forEach(key => aggregate[mode][key] = Math.round((aggregate[mode][key] / trials) * 100) / 100));
  return { messages, trials, seed, tracePolicy: "Each mode uses the same seeded outcome for every logical message and attempt.", fixed: runs.fixed[0], adaptive: runs.adaptive[0], aggregate };
}
module.exports = { G, MIN_RTO, MAX_RTO, clamp, createEstimator, updateEstimator, backoff, seededRandom, hashRandom, simulateExperiment, aggregateExperiments, summaryEstimator };
