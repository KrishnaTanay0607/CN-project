const http = require("http");
const fs = require("fs");
const path = require("path");
const { clamp, createEstimator, updateEstimator, backoff, aggregateExperiments } = require("./protocol");

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const defaults = { timeoutMode: "fixed", timeout: 1800, delay: 450, delayedAck: 0, loss: 20, corruption: 10, ackLoss: 15 };
const emptyStats = () => ({ sent: 0, delivered: 0, retransmissions: 0, duplicates: 0, lost: 0, corrupted: 0, ackLost: 0, timeouts: 0, lastDelivery: null, averageDelivery: 0 });

const simulation = {
  config: { ...defaults }, nextSequence: 0, nextPacketId: 1, receiverExpected: 0, outstanding: null, signal: null,
  events: [], log: [], stats: emptyStats(), estimator: createEstimator(defaults.timeout), comparison: null
};

function chance(percent) { return Math.random() * 100 < percent; }
function addLog(type, text) {
  simulation.log.unshift({ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), type, text });
  simulation.log = simulation.log.slice(0, 80);
}
function effectiveRto() { return simulation.config.timeoutMode === "adaptive" ? Math.round(simulation.estimator.rto) : simulation.config.timeout; }
function snapshot() {
  const estimator = simulation.estimator;
  return { ...simulation, events: undefined, estimator: { ...estimator, srtt: estimator.srtt && Math.round(estimator.srtt), rttvar: estimator.rttvar && Math.round(estimator.rttvar), rto: Math.round(estimator.rto) }, effectiveRto: effectiveRto() };
}
function schedule(kind, payload, delay) { simulation.events.push({ kind, payload, at: Date.now() + delay }); }
function showSignal(type, label, duration) { simulation.signal = { type, label, until: Date.now() + duration }; }
function transmit(packet, retransmission = false) {
  simulation.stats.sent++;
  if (retransmission) {
    simulation.stats.retransmissions++;
    packet.wasRetransmitted = true;
    if (simulation.config.timeoutMode === "adaptive") backoff(simulation.estimator);
  }
  const rto = effectiveRto();
  packet.attempts++;
  packet.sentAt = Date.now();
  packet.deadline = packet.sentAt + rto;
  showSignal("packet", `Packet #${packet.seq}`, Math.max(simulation.config.delay, 700));
  addLog("send", `${retransmission ? "Retransmitting" : "Sending"} packet #${packet.seq} (attempt ${packet.attempts}): “${packet.message}”`);
  if (chance(simulation.config.loss)) { simulation.stats.lost++; addLog("loss", `Packet #${packet.seq} was lost in the channel.`); return; }
  if (chance(simulation.config.corruption)) { simulation.stats.corrupted++; addLog("corrupt", `Packet #${packet.seq} arrived corrupted; receiver discarded it.`); return; }
  schedule("packet", { id: packet.id, seq: packet.seq, message: packet.message }, simulation.config.delay);
}
function receivePacket(packet) {
  if (packet.seq === simulation.receiverExpected) {
    simulation.receiverExpected = 1 - simulation.receiverExpected;
    simulation.stats.delivered++;
    addLog("receive", `Receiver accepted packet #${packet.seq}: “${packet.message}”`);
  } else { simulation.stats.duplicates++; addLog("duplicate", `Receiver detected duplicate packet #${packet.seq}; message was not delivered again.`); }
  if (chance(simulation.config.ackLoss)) { simulation.stats.ackLost++; addLog("loss", `ACK #${packet.seq} was lost in the channel.`); return; }
  const ackDelay = simulation.config.delay + simulation.config.delayedAck;
  schedule("ack", { id: packet.id, seq: packet.seq }, ackDelay);
  showSignal("ack", `ACK #${packet.seq}`, Math.max(ackDelay, 700));
  addLog("ack", `Receiver sent ACK #${packet.seq}${simulation.config.delayedAck ? ` (delayed ${simulation.config.delayedAck} ms)` : ""}.`);
}
function receiveAck(ack) {
  const packet = simulation.outstanding;
  if (!packet || ack.seq !== packet.seq || ack.id !== packet.id) { addLog("duplicate", `Sender ignored stale ACK #${ack.seq}.`); return; }
  const deliveryTime = Date.now() - packet.firstSentAt;
  simulation.stats.lastDelivery = deliveryTime;
  const count = simulation.stats.delivered;
  simulation.stats.averageDelivery = Math.round(((simulation.stats.averageDelivery * Math.max(0, count - 1)) + deliveryTime) / Math.max(1, count));
  if (simulation.config.timeoutMode === "adaptive") {
    if (packet.wasRetransmitted) addLog("karn", `ACK #${ack.seq} received. RTT sample ignored by Karn's algorithm after retransmission.`);
    else { updateEstimator(simulation.estimator, Date.now() - packet.sentAt); addLog("rtt", `RTT sample ${simulation.estimator.lastRtt} ms; adaptive RTO is now ${Math.round(simulation.estimator.rto)} ms.`); }
  }
  addLog("ack", `Sender received ACK #${ack.seq}; delivery confirmed in ${deliveryTime} ms.`);
  simulation.outstanding = null;
  simulation.nextSequence = 1 - simulation.nextSequence;
}
function tick() {
  const now = Date.now();
  const due = simulation.events.filter(event => event.at <= now);
  simulation.events = simulation.events.filter(event => event.at > now);
  due.forEach(event => event.kind === "packet" ? receivePacket(event.payload) : receiveAck(event.payload));
  const packet = simulation.outstanding;
  if (packet && now >= packet.deadline) { simulation.stats.timeouts++; addLog("timeout", `Timeout at ${effectiveRto()} ms waiting for ACK #${packet.seq}; retransmission started.`); transmit(packet, true); }
}
const simulationTimer = setInterval(tick, 40);
if (require.main !== module) simulationTimer.unref();

function reset() {
  simulation.nextSequence = 0; simulation.nextPacketId = 1; simulation.receiverExpected = 0; simulation.outstanding = null; simulation.signal = null; simulation.events = []; simulation.log = [];
  simulation.stats = emptyStats(); simulation.estimator = createEstimator(simulation.config.timeout); simulation.comparison = null;
  addLog("system", "Simulation reset. Sender starts with sequence number 0.");
}
function positiveInteger(value, name, min, max, fallback) {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  return number;
}
function readBody(req) { return new Promise((resolve, reject) => { let body = ""; req.on("data", chunk => body += chunk); req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } }); }); }
function json(res, status, body) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/state" && req.method === "GET") return json(res, 200, snapshot());
    if (url.pathname === "/api/send" && req.method === "POST") {
      const { message } = await readBody(req);
      if (!message || !String(message).trim()) return json(res, 400, { error: "Enter a message first." });
      if (simulation.outstanding) return json(res, 409, { error: "The sender is waiting for an ACK." });
      simulation.outstanding = { id: simulation.nextPacketId++, seq: simulation.nextSequence, message: String(message).trim(), attempts: 0, deadline: 0, sentAt: 0, firstSentAt: Date.now(), wasRetransmitted: false };
      transmit(simulation.outstanding); return json(res, 201, snapshot());
    }
    if (url.pathname === "/api/config" && req.method === "POST") {
      const values = await readBody(req);
      if (values.timeoutMode !== undefined) simulation.config.timeoutMode = values.timeoutMode === "adaptive" ? "adaptive" : "fixed";
      ["timeout", "delay", "delayedAck"].forEach(key => { if (values[key] !== undefined) simulation.config[key] = clamp(values[key], key === "timeout" ? 300 : 0, 10000); });
      ["loss", "corruption", "ackLoss"].forEach(key => { if (values[key] !== undefined) simulation.config[key] = clamp(values[key], 0, 100); });
      if (values.timeout !== undefined && simulation.estimator.samples === 0) simulation.estimator = createEstimator(simulation.config.timeout);
      return json(res, 200, snapshot());
    }
    if (url.pathname === "/api/compare" && req.method === "POST") {
      const values = await readBody(req);
      const messages = positiveInteger(values.messages, "Messages", 1, 100, 20);
      const trials = positiveInteger(values.trials, "Trials", 1, 1000, 20);
      const seed = positiveInteger(values.seed, "Seed", 1, 2147483647, 2026);
      const config = { ...simulation.config };
      simulation.comparison = aggregateExperiments(config, messages, trials, seed);
      return json(res, 200, simulation.comparison);
    }
    if (url.pathname === "/api/reset" && req.method === "POST") { reset(); return json(res, 200, snapshot()); }
    const filePath = url.pathname === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, url.pathname);
    if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) { res.writeHead(404); return res.end("Not found"); }
    const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "text/plain" }); fs.createReadStream(filePath).pipe(res);
  } catch (error) { json(res, 400, { error: error.message }); }
});
if (require.main === module) server.listen(PORT, () => console.log(`Stop-and-Wait simulator running at http://localhost:${PORT}`));
module.exports = { server, simulation, reset, defaults, tick, simulationTimer };
