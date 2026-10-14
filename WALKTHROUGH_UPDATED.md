# Stop-and-Wait Reliable Message Delivery — Presentation Walkthrough

This guide supports a three-person, 20-minute presentation. It supplements `README.md`; the actual source code remains the authority for implementation details.

## 1. Project introduction

The project demonstrates Stop-and-Wait ARQ (Automatic Repeat reQuest) over an unreliable channel. The sender sends one packet and waits for an acknowledgement (ACK). If an ACK does not arrive before timeout, the sender retransmits. Alternating sequence numbers `0` and `1` let the receiver detect duplicate retransmissions and avoid delivering the same logical message twice.

The project has a live interactive simulation and a separate repeatable batch-experiment engine for comparing fixed and adaptive timeout modes.

## 2. Architecture and message flow

```text
public/index.html + public/app.js + public/style.css
                 | HTTP REST requests
                 v
              server.js  ---- imports ----> protocol.js
           live simulation                 estimator and batch experiments
                 ^                                  ^
                 |                                  |
             test.js tests protocol functions and experiment behavior
```

End-to-end flow:
1. The user enters a message in the browser.
2. `public/app.js` sends `POST /api/send` to `server.js`.
3. The server creates an outstanding packet with a packet ID and alternating sequence number.
4. `transmit()` starts/updates the deadline and simulates packet loss or corruption, or schedules packet arrival.
5. `tick()` processes due packet/ACK events and checks timeout deadlines.
6. `receivePacket()` accepts the expected sequence or recognizes a duplicate. A duplicate is not delivered again.
7. The receiver schedules an ACK unless ACK loss occurs.
8. `receiveAck()` validates the ACK, confirms delivery, updates adaptive RTT estimation when appropriate, and clears the outstanding packet.
9. The browser polls `GET /api/state` and refreshes the dashboard and event log.

## 3. Team division

| Person | Files | Main responsibility |
|---|---|---|
| Person 1 | `protocol.js` | Adaptive timeout estimator, deterministic outcomes, batch simulation and experiment aggregation |
| Person 2 | `server.js` | Live simulation state, sender/receiver, packet and ACK handling, timers and REST API |
| Person 3 | `public/`, `test.js`, `package.json` | Browser UI, tests, execution commands and coordinated live demo |

This is a reasonable starting split for three people. Person 2's backend file is dense; rehearse it carefully. Person 1 should also explain briefly that `POST /api/compare` in `server.js` calls the experiment aggregation function from `protocol.js`. Person 3 should inspect every file under `public/` rather than assuming the UI behavior from filenames alone.

## 4. Source-code navigation

Use VS Code `Ctrl+P` to open a file and `Ctrl+G` to jump to a line. The ranges below are based on the reviewed screenshots and previous walkthrough; re-check them if the source has changed.

| File | Sections to show | Presenter |
|---|---|---|
| `protocol.js` | Lines 3–15: estimator and backoff; 17–22: deterministic helpers and statistics; 26–73: experiment simulation; 75–90: aggregation | Person 1 |
| `server.js` | Lines 11–24: state/config; 28–81: transmit/receive/tick; 83–95: reset/helpers; 96–132: API and server | Person 2 |
| `public/index.html` | Lines 4–12, after confirming current file | Person 3 |
| `public/app.js` | Lines 4–47, after confirming current file | Person 3 |
| `public/style.css` | Lines 1–14, after confirming current file | Person 3 |
| `test.js` | Lines 6–61, after confirming current file | Person 3 |
| `package.json` | Lines 6–10, after confirming current file | Person 3 |

Do not quote line numbers on slides unless you have checked them against the latest version of each file.

## 5. Person 1 — `protocol.js`

**Opening:** “I explain the protocol experiment engine and adaptive timeout. It estimates round-trip time from successful, non-retransmitted packets, applies exponential backoff after timeouts, and compares fixed and adaptive modes under repeatable channel outcomes.”

1. `G = 100`, `MIN_RTO = 300`, and `MAX_RTO = 10000` define the timeout calculation's granularity and bounds.
2. `createEstimator()` initializes SRTT, RTTVAR, RTO and sample counters.
3. `updateEstimator()` uses the first clean RTT sample to initialize SRTT and RTTVAR; subsequent samples use weighted smoothing. The RTO is `SRTT + max(G, 4 × RTTVAR)` and is bounded.
4. `backoff()` doubles the RTO after a timeout, up to the maximum.
5. `hashRandom()` makes simulated channel outcomes repeatable based on seed, message, attempt and channel type.
6. `simulateExperiment()` uses a virtual clock and event queue to simulate packet/ACK arrivals, deadlines, retransmissions, duplicate detection and statistics.
7. Karn's algorithm is represented by skipping RTT updates for retransmitted packets, whose ACK timing is ambiguous.
8. `aggregateExperiments()` runs fixed and adaptive modes across multiple trials and aggregates their results.

**Viva prompts:** What are SRTT, RTTVAR and RTO? Why use a seed? Why ignore RTT samples after retransmission? Why cap RTO? Why might adaptive mode be slower?

## 6. Person 2 — `server.js`

**Opening:** “I explain the live simulation backend. It stores sender and receiver state, simulates packet and ACK movement, handles loss and timeout, rejects stale ACKs, and exposes REST endpoints to the browser.”

1. The simulation state stores configuration, sender sequence, next packet ID, expected receiver sequence, outstanding packet, queued events, logs, statistics and estimator.
2. `effectiveRto()` selects the configured fixed timeout or current adaptive RTO.
3. `transmit()` updates send/retransmission statistics, applies adaptive backoff when relevant, sets the deadline, simulates packet loss/corruption, or schedules packet arrival.
4. `receivePacket()` accepts the expected sequence and advances the receiver's expectation. A duplicate is not delivered again; the receiver can send the ACK again.
5. `receiveAck()` checks the packet ID and sequence so stale ACKs are ignored. A valid ACK confirms delivery, updates timing when valid, clears the outstanding packet and advances the sender sequence.
6. `tick()` processes due events and starts retransmission when the deadline has passed.
7. `reset()` clears protocol state, events, statistics and comparison state.
8. The HTTP server serves the UI and API endpoints: `GET /api/state`, `POST /api/send`, `POST /api/config`, `POST /api/compare` and `POST /api/reset`.

**Viva prompts:** Why is only one packet outstanding? What happens if an ACK is lost? Why use packet ID as well as sequence number? What does `tick()` do? What happens if the sender is already waiting for an ACK?

## 7. Person 3 — frontend, tests and execution

**Opening:** “I explain the browser UI and how we test and run the project. The frontend sends API requests, renders live state and statistics, and displays the repeatable comparison.”

1. `public/index.html` defines the page structure and controls; confirm exact elements in the actual file.
2. `public/app.js` uses `fetch` to communicate with backend routes, renders state, polls `/api/state`, sends messages and requests comparisons; confirm exact functions in the actual file.
3. `public/style.css` styles the dashboard, logs, comparison display and responsive layout; confirm exact selectors in the actual file.
4. `test.js` uses Node's `assert` module and tests estimator calculations, backoff, deterministic runs, delivery under failures, duplicate behavior, Karn's rule, late ACK handling and reset behavior.
5. `package.json` defines the project scripts. Use the commands that are actually present there.

**Viva prompts:** How does the UI get live state? Why validate input in both frontend and backend? What does the event log show? Why are automated tests useful? How do you run the app and tests?

## 8. Live simulation versus batch experiment

| Live simulation (`server.js`) | Batch experiment (`protocol.js`) |
|---|---|
| Uses `Date.now()` and a real interval for event processing | Uses a virtual time variable and a discrete event queue |
| Live channel failures use `Math.random()` | Seeded outcomes use deterministic hashing |
| Interactive single outstanding message | Runs multiple messages and trials for comparison |
| Updates dashboard through `/api/state` | Returns aggregate comparison data |

## 9. Performance comparison

Use the README's documented default experiment as the primary result. Do not mix these figures with screenshots from a different experiment configuration.

| Setting/result | Value |
|---|---:|
| Messages per trial | 20 |
| Seeded trials | 100 |
| One-way delay | 450 ms |
| Packet loss | 20% |
| Corruption | 10% |
| ACK loss | 15% |
| Fixed timeout | 1800 ms |
| Average completion time — fixed | 2096.10 ms |
| Average completion time — adaptive | 4059.37 ms |
| Average retransmissions — fixed | 13.29 |
| Average retransmissions — adaptive | 13.29 |
| Delivery | All 20 messages delivered in each mode per trial, as documented |
| Failed per trial | 0 for both modes, as documented |

Interpretation: adaptive mode was slower under these conditions. The fixed timeout was already reasonable for the normal RTT of about 900 ms. Adaptive mode starts cautiously and backs off after timeouts; it is not guaranteed to be faster. A potential benefit is avoiding premature timeouts when the fixed timeout is too short or delay varies.

The README reports 11/11 automated tests passing. Re-run the tests on the current project before presenting that as a fresh verification.

## 10. Test mapping checklist

The README describes coverage of the following behaviors. Before presenting individual test names and exact assertions, inspect the current `test.js` and map each named test to its assertion and expected result.

- Initial and subsequent SRTT/RTTVAR calculations.
- RTO bounds and exponential backoff.
- Repeatability with identical seeds.
- Packet loss, corruption, ACK loss and delayed ACK behavior.
- Successful delivery with retransmissions and duplicate detection.
- Karn's algorithm after retransmission.
- Late ACK handling.
- Termination/reporting when delivery is impossible due to 100% loss.
- Reset clears protocol state, queued events, statistics and estimates.

Run the tests and record the actual output. Do not claim a pass unless the command completes successfully.

## 11. Run instructions and demo

Start the project from its root folder using the documented command, normally:

```powershell
node server.js
```

Open `http://localhost:3000`.

Run tests using the current `package.json` script or:

```powershell
node test.js
```

If PowerShell blocks `npm.ps1`, use `npm.cmd start` and `npm.cmd test` when those scripts exist.

**Three-minute demo plan:**
1. Send one message with default settings and show delivery/ACK.
2. Increase ACK loss and send another message; show timeout, retransmission and duplicate protection if that outcome occurs.
3. Run the fixed-versus-adaptive comparison and explain the documented trade-off.

Because the channel is probabilistic in the live simulator, a specific failure is not guaranteed on every attempt. Set a high loss probability or retry the demo if needed. Keep a screenshot of a successful comparison as a fallback.

## 12. Final 20-minute schedule

| Time | Activity |
|---|---|
| 0:00–5:00 | Person 1 — protocol engine and adaptive timeout |
| 5:00–10:00 | Person 2 — live backend and sender/receiver/ACK flow |
| 10:00–15:00 | Person 3 — frontend, tests and execution |
| 15:00–18:00 | Coordinated live demonstration |
| 18:00–20:00 | Conclusion and questions |

**Timing assumption:** this schedule assumes questions are included in the 20 minutes. Each person must open and explain their actual source code during their own five-minute segment. If the teacher expects a separate Q&A outside the 20 minutes, adjust the final two minutes accordingly.

## Final checklist

- [ ] Confirm team names and actual responsibilities.
- [ ] Recheck source line numbers before presenting.
- [ ] Run the current automated tests and record the real result.
- [ ] Start the server and confirm the page loads.
- [ ] Rehearse each person's source-code walkthrough to five minutes.
- [ ] Test the demo settings and prepare a screenshot fallback.
- [ ] Use the README's documented performance figures and state the conditions clearly.
