"use strict";
const assert = require("assert");
const { createEstimator, updateEstimator, backoff, simulateExperiment, aggregateExperiments } = require("./protocol");
const { simulation, reset } = require("./server");

function test(name, fn) { try { fn(); console.log(`PASS  ${name}`); } catch (error) { console.error(`FAIL  ${name}\n${error.stack}`); process.exitCode = 1; } }

test("initial RTT sample follows RTO = SRTT + max(G, 4*RTTVAR)", () => {
  const e = createEstimator(1800); updateEstimator(e, 800);
  assert.equal(e.srtt, 800); assert.equal(e.rttvar, 400); assert.equal(e.rto, 2400);
});
test("subsequent RTT sample uses RFC-style alpha and beta smoothing", () => {
  const e = createEstimator(1800); updateEstimator(e, 800); updateEstimator(e, 1000);
  assert.equal(Math.round(e.srtt), 825); assert.equal(Math.round(e.rttvar), 350); assert.equal(Math.round(e.rto), 2225);
});
test("exponential backoff doubles RTO and is capped", () => {
  const e = createEstimator(700); backoff(e); assert.equal(e.rto, 1400); for (let i = 0; i < 10; i++) backoff(e); assert.equal(e.rto, 10000);
});
test("repeatable experiments produce identical results with identical seed", () => {
  const c = { timeout: 900, delay: 450, delayedAck: 100, loss: 20, corruption: 10, ackLoss: 15 };
  assert.deepEqual(simulateExperiment(c, "adaptive", 25, 2026), simulateExperiment(c, "adaptive", 25, 2026));
});
test("comparison uses the same trace policy and aggregates multiple trials", () => {
  const c = { timeout: 900, delay: 450, delayedAck: 100, loss: 20, corruption: 10, ackLoss: 15 };
  const comparison = aggregateExperiments(c, 10, 5, 91);
  assert.equal(comparison.trials, 5); assert.equal(comparison.aggregate.fixed.delivered, 10); assert.equal(comparison.aggregate.adaptive.delivered, 10);
  assert.match(comparison.tracePolicy, /same seeded outcome/i);
});
test("loss, corruption, ACK loss, and delayed ACK scenarios deliver eventually", () => {
  const c = { timeout: 700, delay: 200, delayedAck: 300, loss: 25, corruption: 25, ackLoss: 25 };
  const result = simulateExperiment(c, "adaptive", 20, 72);
  assert.equal(result.stats.delivered, 20); assert.ok(result.stats.retransmissions > 0); assert.ok(result.stats.timeouts > 0);
});
test("receiver delivery occurs once when an ACK loss causes retransmission", () => {
  const c = { timeout: 300, delay: 100, delayedAck: 0, loss: 0, corruption: 0, ackLoss: 100 };
  // Change seed until an ACK eventually succeeds is impossible at 100%, so use a repeatable mixed-loss trace.
  const mixed = { ...c, ackLoss: 50 };
  const result = simulateExperiment(mixed, "fixed", 12, 44);
  assert.equal(result.stats.delivered, 12); assert.ok(result.stats.duplicates > 0);
});
test("an undeliverable 100% loss experiment terminates and reports failure", () => {
  const c = { timeout: 300, delay: 100, delayedAck: 0, loss: 100, corruption: 0, ackLoss: 0 };
  const result = simulateExperiment(c, "fixed", 1, 5);
  assert.equal(result.stats.delivered, 0); assert.equal(result.stats.failed, 1); assert.equal(result.stats.retransmissions, 200);
});
test("Karn behavior is represented by no RTT samples after timeout/retransmission", () => {
  const c = { timeout: 300, delay: 500, delayedAck: 0, loss: 0, corruption: 0, ackLoss: 0 };
  const result = simulateExperiment(c, "adaptive", 1, 11);
  assert.equal(result.stats.delivered, 1); assert.equal(result.estimator.samples, 0); assert.ok(result.stats.duplicates > 0);
});
test("an ACK arriving after a timeout completes at its real arrival time", () => {
  const c = { timeout: 300, delay: 500, delayedAck: 0, loss: 0, corruption: 0, ackLoss: 0 };
  const result = simulateExperiment(c, "fixed", 1, 9);
  assert.equal(result.stats.averageDelivery, 1000); assert.equal(result.stats.delivered, 1);
  assert.equal(result.stats.retransmissions, 3);
});
test("reset clears protocol state, events, statistics, and adaptive estimates", () => {
  simulation.nextSequence = 1; simulation.nextPacketId = 9; simulation.receiverExpected = 1; simulation.outstanding = { id: 8 }; simulation.events = [{ kind: "ack" }]; simulation.stats.sent = 4; simulation.estimator.samples = 3;
  reset();
 
