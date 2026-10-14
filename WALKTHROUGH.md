# Stop-and-Wait Reliable Message Delivery — Presentation Walkthrough

This is a shareable three-person, 20-minute presentation guide. It supplements README.md and does not replace it.

## One-minute project introduction

The project demonstrates Stop-and-Wait ARQ. The sender sends exactly one packet, waits for an acknowledgement, and retransmits after timeout. Alternating sequence numbers 0 and 1 prevent a duplicated packet from delivering the same logical message twice. The project also compares a fixed retransmission timeout with an adaptive timeout.

## Module dependency diagram

    public/index.html + public/app.js + public/style.css
                           |
                           | HTTP REST requests
                           v
                       server.js
                 / live state and APIs \
                     protocol.js
          / adaptive timing and experiments \
                     test.js

## Team division

| Person | Files | Main responsibility |
| --- | --- | --- |
| Person 1 | protocol.js | Adaptive timeout estimator, deterministic failures, batch experiments, aggregation |
| Person 2 | server.js | Live sender/receiver, ACK handling, timer, state and REST API |
| Person 3 | public/, test.js, package.json | Browser UI, user interactions, tests and live demo |

The split is workable. Person 2 has the most dense backend file. Person 1 should briefly also mention server.js lines 115–122 because that endpoint calls the experiment aggregation function.

## Exact source navigation

Use Ctrl+P to open a file and Ctrl+G to jump to a line.

| File | Show these ranges |
| --- | --- |
| protocol.js | 3–15, 17–22, 26–73, 75–90 |
| server.js | 11–24, 28–81, 83–95, 96–132 |
| public/index.html | 4–12 |
| public/app.js | 4–47 |
| test.js | 6–61 |
| package.json | 6–10 |
| README.md | 9–50 |

---

## Person 1 — protocol.js

### Opening sentence

“I implemented the adaptive timeout and repeatable experiment module. It calculates RTT-based timeout values, uses exponential backoff, and compares fixed and adaptive modes under equivalent seeded channel failures.”

### Walkthrough

1. Lines 3–15 define G = 100 ms, minimum RTO = 300 ms, and maximum RTO = 10,000 ms. The estimator has SRTT, RTTVAR, RTO, samples, backoffs and last RTT.
2. updateEstimator() on lines 8–14 calculates adaptive timeout. First clean sample sets SRTT to sample and RTTVAR to sample divided by 2. Later samples use weighted smoothing. RTO is SRTT plus max(G, 4 times RTTVAR).
3. backoff() on line 15 doubles RTO after timeout but respects the configured bounds.
4. hashRandom() on lines 17–21 produces a repeatable result from seed, message number, attempt number and channel type. Type 0 is packet loss, 1 is corruption, and 2 is ACK loss.
5. simulateExperiment() on lines 26–73 uses virtual time called now. It sends logical messages one by one, queues packet/ACK events, handles deadlines, retransmits, detects duplicates and records statistics.
6. On lines 57–61, receiver logic accepts only its expected sequence. It toggles expected sequence after delivery. Other copies count as duplicates.
7. Line 64 is Karn’s algorithm: when retransmitted is true, the RTT measurement is skipped.
8. aggregateExperiments() on lines 75–90 runs fixed and adaptive modes over several trials and averages completion time, retransmissions, timeouts, duplicates, RTT samples, delivery, and failures.

### Important terms

- SRTT: smoothed round-trip time.
- RTTVAR: round-trip-time variation.
- RTO: retransmission timeout.
- Karn’s algorithm: do not measure RTT from a retransmitted packet.
- Exponential backoff: double the RTO after timeout.

### Viva questions

1. Why is adaptive mode not always faster?  
   Fixed timeout may already match the channel well; adaptive mode starts cautiously and backs off after loss.
2. Why use a seed?  
   It makes experiment failures reproducible.
3. Why is there a minimum RTO?  
   To avoid immediate repeated retransmissions.
4. Why ignore RTT after retransmission?  
   The ACK could match the original copy or the retransmitted copy.
5. What does RTTVAR contribute?  
   It makes RTO larger when delay is unstable.

---

## Person 2 — server.js

### Opening sentence

“I implemented the live Stop-and-Wait backend. It stores sender and receiver state, simulates packet and ACK movement, handles failure and timeout, prevents stale ACKs, and exposes APIs to the browser.”

### Walkthrough

1. Lines 11–14 create the simulation object. It stores configuration, next sender sequence, next packet ID, receiver expectation, outstanding packet, events, log, statistics, estimator, and comparison result.
2. effectiveRto() on line 21 returns fixed timeout or adaptive RTO.
3. transmit() on lines 28–44 sends a packet. It increments sent statistics, applies backoff on adaptive retransmission, sets a deadline, checks live packet loss/corruption, and otherwise schedules packet arrival.
4. receivePacket() on lines 45–56 compares packet sequence to receiverExpected. An expected packet is delivered and receiverExpected switches between 0 and 1. A repeated packet is counted as duplicate and is not delivered again.
5. Receiver schedules ACK unless ACK loss occurs. ACK includes packet ID and sequence number.
6. receiveAck() on lines 57–71 rejects stale ACKs by checking both ID and sequence. A valid ACK records delivery time, optionally updates adaptive estimator, clears outstanding packet, and toggles sender sequence.
7. tick() on lines 72–79 runs every 40 ms. It processes due packet/ACK events and starts retransmission when the deadline is passed.
8. reset() on lines 83–87 clears protocol state, queued events, stats, estimator, and comparison state.
9. Lines 96–132 create the HTTP server. API routes are GET /api/state, POST /api/send, POST /api/config, POST /api/compare, and POST /api/reset.

### Viva questions

1. Why is only one packet outstanding?  
   That is the Stop-and-Wait rule.
2. What happens when ACK is lost?  
   Receiver has delivered the message; sender times out, retransmits, receiver detects duplicate and ACKs again.
3. Why have packet ID as well as sequence number?  
   To reject stale ACKs from a previous packet with the same alternating sequence number.
4. What is an outstanding packet?  
   A sent packet that is still waiting for valid ACK.
5. What HTTP response is sent if sender is busy?  
   HTTP 409 Conflict.

---

## Person 3 — frontend, tests and demo

### Opening sentence

“I implemented the interactive browser UI, dashboard, logs, packet/ACK animations, comparison graph, automated tests, and commands used to run the project.”

### Walkthrough

1. public/index.html lines 4–12 defines the message input, sender/receiver channel view, controls, dashboard, event log, and repeatable comparison form.
2. public/app.js line 4 defines api(), which uses fetch to communicate with backend routes and turns server errors into readable messages.
3. render() on lines 14–30 updates sender/receiver state, packet and ACK animation, timeout metrics, statistics, event log, controls, and comparison output.
4. refresh() on line 32 polls GET /api/state every 250 ms.
5. The Send button handler on line 34 sends POST /api/send.
6. The comparison handler on lines 39–46 validates message count, trials, and seed; shows loading; posts to /api/compare; renders results; and displays errors.
7. public/style.css lines 1–14 styles the dashboard, comparison bars, loading/error output, packet/ACK animation, and responsive layout.
8. test.js lines 8–61 verifies estimator calculations, backoff, deterministic experiments, network failures, duplicates, impossible loss, Karn’s rule, late ACK handling, and reset.
9. package.json lines 6–10 defines start, dev and test commands.

### Viva questions

1. How does the UI receive live simulation data?  
   refresh() requests GET /api/state every 250 ms.
2. Why validate experiment inputs in browser and backend?  
   Browser gives immediate feedback; backend remains protected from invalid direct requests.
3. Why disable comparison button while running?  
   To prevent overlapping experiment requests.
4. What does the event log explain?  
   Sends, loss, corruption, receiver delivery, ACKs, timeouts, duplicates, RTT updates, and Karn events.
5. Why have tests in a networking project?  
   They verify formulas and edge cases after code changes.

---

## End-to-end message trace

    1. User enters message in public/index.html.
    2. app.js sends POST /api/send.
    3. server.js creates outstanding packet with ID and sequence number.
    4. transmit() starts timer and either loses/corrupts or schedules packet arrival.
    5. tick() processes packet event.
    6. receivePacket() accepts expected packet or identifies duplicate.
    7. Receiver schedules ACK unless it is lost.
    8. tick() processes ACK event.
    9. receiveAck() verifies ACK and confirms delivery.
    10. Browser polls /api/state and redraws dashboard and log.

## Live simulation versus batch experiment

| Live simulation in server.js | Batch experiment in protocol.js |
| --- | --- |
| Uses Date.now() and actual timers | Uses virtual clock named now |
| Uses Math.random() | Uses deterministic hashRandom() |
| One interactive outstanding message | Multiple messages and trials |
| tick() runs every 40 ms | Runs synchronously through events |
| Updates UI dashboard | Returns aggregate comparison data |

## Running and demo

Run the project:

    node server.js

Open http://localhost:3000.

Run tests:

    node test.js

If PowerShell blocks npm.ps1, use npm.cmd start and npm.cmd test instead.

Demo order:

1. Send one normal message.
2. Increase ACK loss and send another message.
3. Show timeout, retransmission, duplicate detection, and ACK.
4. Run fixed-vs-adaptive comparison with default values.

## Final 20-minute schedule

| Time | Activity |
| --- | --- |
| 0:00–2:00 | Title, problem statement and Stop-and-Wait overview |
| 2:00–7:00 | Person 1: protocol.js and adaptive timeout |
| 7:00–12:00 | Person 2: server.js live delivery flow |
| 12:00–17:00 | Person 3: UI, tests and commands |
| 17:00–19:00 | Live demo and comparison |
| 19:00–20:00 | Conclusion and limitations |

## Verification status

The test command npm.cmd test was run while preparing this walkthrough. All 11 tests passed.
