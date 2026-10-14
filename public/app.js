const $ = id => document.getElementById(id);
const controls = ["loss", "corruption", "ackLoss", "delay", "delayedAck", "timeout"];
let state;
async function api(path, options = {}) { const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data; }
function ms(value) { return value === null || value === undefined ? "—" : `${Math.round(value)} ms`; }
function comparisonMessage(text, type = "empty") { $("comparison-result").innerHTML = `<p class="${type}">${text}</p>`; }
function renderComparison(comparison) {
  if (!comparison) return;
  if (!comparison.aggregate?.fixed || !comparison.aggregate?.adaptive || !comparison.fixed?.estimator || !comparison.adaptive?.estimator) throw new Error("Comparison response is from an older server. Stop the server, run node server.js again, then refresh this page.");
  const rows = ["averageCompletion", "retransmissions", "timeouts", "duplicates", "rttSamples", "failed"];
  const names = { averageCompletion: "Average completion", retransmissions: "Average retransmissions", timeouts: "Average timeouts", duplicates: "Average duplicates", rttSamples: "Average RTT samples", failed: "Average undelivered" };
  $("comparison-result").innerHTML = `<p class="compare-note">${comparison.messages} messages × ${comparison.trials} trials · seed ${comparison.seed}</p><p class="compare-note">${comparison.tracePolicy}</p><div class="bar-legend"><span>Fixed</span><span>Adaptive</span></div>${rows.map(key => { const fixed = comparison.aggregate.fixed[key] ?? 0, adaptive = comparison.aggregate.adaptive[key] ?? 0, max = Math.max(fixed, adaptive, 1), suffix = key === "averageCompletion" ? " ms" : ""; return `<div class="compare-row"><strong>${names[key]}</strong><div><i class="fixed" style="width:${(fixed / max) * 100}%"></i><b>${fixed}${suffix}</b></div><div><i class="adaptive" style="width:${(adaptive / max) * 100}%"></i><b>${adaptive}${suffix}</b></div></div>`; }).join("")}<p class="compare-note">First trial’s final adaptive RTO: ${ms(comparison.adaptive.estimator.rto)} · SRTT: ${ms(comparison.adaptive.estimator.srtt)}</p>`;
}
function render() {
  if (!state) return;
  const packet = state.outstanding;
  $("sender-state").textContent = packet ? `Waiting for ACK #${packet.seq} · attempt ${packet.attempts}` : `Ready · next packet #${state.nextSequence}`;
  $("receiver-state").textContent = `Waiting for packet #${state.receiverExpected}`;
  const active = state.signal && state.signal.until > Date.now() ? state.signal : null;
  $("packet").classList.toggle("hidden", !active || active.type !== "packet"); $("packet").textContent = active?.type === "packet" ? active.label : "Packet";
  $("ack").classList.toggle("hidden", !active || active.type !== "ack"); $("ack").textContent = active?.type === "ack" ? active.label : "ACK";
  $("mode-status").textContent = state.config.timeoutMode === "adaptive" ? "Adaptive: learning from clean RTT samples" : "Fixed: using selected timeout";
  $("adaptive-dashboard").classList.toggle("dim", state.config.timeoutMode !== "adaptive");
  $("rtt-value").textContent = ms(state.estimator.lastRtt); $("srtt-value").textContent = ms(state.estimator.srtt); $("rttvar-value").textContent = ms(state.estimator.rttvar); $("rto-value").textContent = ms(state.effectiveRto); $("delivery-value").textContent = ms(state.stats.lastDelivery);
  const stats = [["Packets sent", state.stats.sent], ["Delivered", state.stats.delivered], ["Retransmissions", state.stats.retransmissions], ["Timeouts", state.stats.timeouts], ["Duplicates", state.stats.duplicates], ["ACKs lost", state.stats.ackLost]];
  $("stats").innerHTML = stats.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
  $("log").innerHTML = state.log.length ? state.log.map(item => `<p class="log-${item.type}"><time>${item.time}</time>${item.text}</p>`).join("") : "<p class='empty'>Events will appear here.</p>";
  controls.forEach(key => { if (document.activeElement !== $(key)) $(key).value = state.config[key]; }); $("timeout-mode").value = state.config.timeoutMode; updateOutputs();
  try { renderComparison(state.comparison); } catch (error) { comparisonMessage(error.message, "compare-error"); }
}
function updateOutputs() { controls.forEach(key => { const unit = ["delay", "delayedAck", "timeout"].includes(key) ? " ms" : "%"; $(`${key}-out`).value = `${$(key).value}${unit}`; }); }
async function refresh() { try { state = await api("/api/state"); render(); } catch { $("notice").textContent = "Server connection lost."; } }
async function saveConfig() { const body = Object.fromEntries(controls.map(key => [key, Number($(key).value)])); body.timeoutMode = $("timeout-mode").value; state = await api("/api/config", { method: "POST", body: JSON.stringify(body) }); render(); }
$("send").addEventListener("click", async () => { try { state = await api("/api/send", { method: "POST", body: JSON.stringify({ message: $("message").value }) }); $("message").value = ""; $("notice").textContent = "Packet entered the channel."; render(); } catch (error) { $("notice").textContent = error.message; } });
$("message").addEventListener("keydown", e => { if (e.key === "Enter") $("send").click(); });
controls.forEach(key => $(key).addEventListener("input", updateOutputs)); controls.forEach(key => $(key).addEventListener("change", () => saveConfig().catch(e => $("notice").textContent = e.message)));
$("timeout-mode").addEventListener("change", () => saveConfig().catch(e => $("notice").textContent = e.message));
$("reset").addEventListener("click", async () => { state = await api("/api/reset", { method: "POST" }); $("notice").textContent = "Simulation reset."; render(); });
$("compare").addEventListener("click", async () => {
  const messages = Number($("experiment-count").value), trials = Number($("experiment-trials").value), seed = Number($("experiment-seed").value);
  if (!Number.isInteger(messages) || messages < 1 || messages > 100 || !Number.isInteger(trials) || trials < 1 || trials > 1000 || !Number.isInteger(seed) || seed < 1) { const error = "Enter whole-number values: messages 1–100, trials 1–1000, and a positive seed."; $("notice").textContent = error; comparisonMessage(error, "compare-error"); return; }
  const button = $("compare"); button.disabled = true; button.textContent = "Running…"; comparisonMessage("Running repeatable comparison…", "compare-loading");
  try { const comparison = await api("/api/compare", { method: "POST", body: JSON.stringify({ messages, trials, seed }) }); state = state || {}; state.comparison = comparison; renderComparison(comparison); $("notice").textContent = "Comparison completed."; }
  catch (error) { const message = error.message || "Comparison could not be run."; $("notice").textContent = message; comparisonMessage(message, "compare-error"); }
  finally { button.disabled = false; button.textContent = "Run comparison"; }
});
updateOutputs(); refresh(); setInterval(refresh, 250);
