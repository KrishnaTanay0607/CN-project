# Stop-and-Wait Reliable Message Delivery

## Project overview

This Computer Networks project is an interactive implementatison of the **Stop-and-Wait ARQ (Automatic Repeat reQuest)** protocol. It demonstrates reliable message delivery over an unreliable channel where packets and acknowledgements may be lost or corrupted.

The sender transmits one packet at a time and waits for an acknowledgement (ACK). If the ACK does not arrive before timeout, the sender retransmits the packet. Sequence numbers `0` and `1` allow the receiver to identify duplicate packets and prevent a message from being delivered twice.

## Adaptive Timeout Optimization/
## check
The simulator supports two timeout modes:

- **Fixed timeout:** The sender always uses the timeout selected in the controls.
- **Adaptive timeout:** The sender learns from successful round-trip-time (RTT) measurements and changes its retransmission timeout (RTO) automatically.

For adaptive mode, the backend maintains a smoothed RTT (**SRTT**) and RTT variation (**RTTVAR**). After a clean, non-retransmitted packet is acknowledged, it calculates:

```text
RTO = SRTT + max(G, 4 × RTTVAR)
```

`G` is 100 ms, which prevents the timeout from becoming too small. The RTO is also limited to 300–10,000 ms so that it remains practical for the simulator.

### Important reliability decisions

- **Karn's algorithm:** RTT is not measured for a packet that was retransmitted, because its ACK could belong to the original or retransmitted copy. This prevents incorrect RTT estimates.
- **Exponential backoff:** Every adaptive-mode timeout doubles the current RTO, up to 10,000 ms. This avoids repeated premature retransmissions during congestion or delayed ACKs.
- **Sequence numbers and duplicate protection:** These remain unchanged. The receiver accepts only its expected sequence number and sends an ACK again for a duplicate without delivering the message twice.

### Responsive dashboard layout

The dashboard uses shrinkable CSS Grid columns so its channel controls, timeout metrics, protocol statistics, and event log fit within the available page width. At widths up to 1200px the cards use two columns with the event log spanning both; at widths up to 800px they stack in one column. Long event log messages wrap inside the log panel and do not widen the page. This addresses the original overflow caused by grid tracks retaining their content's minimum width and unwrapped log text.

To verify the layout, run `npm start`, open `http://localhost:3000`, and use the browser's responsive device toolbar to check approximately 1920�1080, 1366�768, and narrow viewports such as 800px and 390px. Confirm the page has no horizontal overflow and that the cards and long log entries remain readable.
### Live dashboard and comparison

The live dashboard displays the latest RTT, SRTT, RTTVAR, current RTO, latest delivery time, retransmissions, timeouts, and duplicate packets. The **Repeatable performance comparison** runs fixed and adaptive modes with the same seed and the same selected network conditions, so the bar graph is a fair comparison rather than two unrelated random runs.

### Verified comparison behavior and limitations

Adaptive mode is **not guaranteed to be faster**. With the original default settings (20 messages, 100 seeded trials, 450 ms one-way delay, 20% packet loss, 10% corruption, and 15% ACK loss), the verified average completion time was **2096.10 ms for fixed** versus **4059.37 ms for adaptive**. Both delivered all 20 messages per trial and had the same average retransmission count (13.29).

This result is expected, not manipulated: the fixed timeout of 1800 ms is already reasonable for the 900 ms normal RTT. Adaptive mode starts cautiously (its first clean RTT sample gives a larger RTO) and increases its RTO after loss using exponential backoff. Karn's algorithm also prevents a retransmitted packet from reducing the estimate. The benefit is fewer premature timeouts when the selected fixed timeout is too short or network delay changes; the trade-off can be a longer wait after loss.

For fair comparisons, the experiment engine uses a deterministic outcome derived from **seed + logical message number + attempt number**. Both modes therefore receive the same loss/corruption/ACK-loss outcome for matching attempts, even if one mode performs extra retransmissions. Each run reports aggregate results across the selected number of trials; it never claims one mode has won merely because of a single random run.

The simulator is a teaching model, not a full TCP implementation. It uses one sender and receiver, a bounded RTO range (300–10,000 ms), constant configured base delay, and no bandwidth/queue model. It does, however, process experiment packet arrivals, ACK arrivals, and timer expiries in time order.

### Verified automated tests

The project test suite covers the initial and subsequent SRTT/RTTVAR calculations, RTO bounds, exponential backoff, deterministic repeatability, packet loss, corruption, ACK loss, delayed ACKs, retransmissions, duplicate detection, Karn's algorithm, late ACK handling, non-deliverable channel protection, and reset cleanup. The latest verified run passed **11/11 tests**.

### Comparison troubleshooting

The comparison button shows a loading message while the experiment runs, an input error for invalid messages/trials/seed values, and a server error if the request fails. If it says the response is from an older server, stop the old process with `Ctrl + C`, run `node server.js` again, and refresh the browser. This is necessary after an update because the comparison response now contains aggregate multi-trial results.

## Problem statement

In a computer network, transmitted messages can be lost, delayed, duplicated, or corrupted. Therefore, sending a message once does not guarantee successful delivery.

The problem is to design a reliable delivery mechanism over this unreliable channel. The system must ensure that every valid message reaches the receiver, no message is delivered more than once, lost packets and ACKs are handled, and the sender knows when delivery succeeds.

Our solution uses Stop-and-Wait with acknowledgements, timers, retransmission, and alternating sequence numbers.

## Novelty of the project

Unlike a static theoretical explanation, this project provides a **real-time visual simulator** of the protocol.

- Users can send their own messages and observe sender, receiver, packet, and ACK behavior.
- Packet loss, corruption, ACK loss, delay, and timeout are configurable.
- Packet and ACK movement are shown visually in the channel.
- A live event log explains every protocol event: packet loss, timeout, retransmission, ACK receipt, and duplicate detection.
- Statistics show transmissions, deliveries, lost packets, corrupted packets, retransmissions, duplicates, and lost ACKs.
- The backend performs the actual protocol simulation; the UI is not using prewritten output.

## Modules implemented

| Module | Description |
| --- | --- |
| Sender module | Creates packets, assigns sequence number `0` or `1`, starts the timer, waits for ACK, and retransmits after timeout. |
| Receiver module | Checks the expected sequence number, accepts new packets, rejects duplicates, and sends ACKs. |
| Unreliable channel module | Simulates packet loss, corruption, ACK loss, and delay with configurable probabilities. |
| ACK and timer module | Generates ACKs and checks whether the sender has exceeded the configured timeout. |
| Retransmission module | Resends the outstanding packet whenever its ACK is missing at timeout. |
| Duplicate detection module | Uses alternating sequence numbers to prevent duplicate message delivery. |
| Frontend visualization module | Displays endpoint states, animations, controls, statistics, and event logs. |
| Backend API module | Provides APIs for sending messages, setting parameters, resetting, and retrieving live simulation state. |

## Team member work sharing

Replace the placeholders with your actual team member names before submission.

| Team member | Responsibility / contribution |
| --- | --- |
| Member 1: `Your Name` | Implemented sender logic: creates one packet at a time, assigns sequence number 0 or 1, starts the timeout timer, and retransmits when the ACK is not received. |
| Member 2: `Name` | Implemented receiver logic: accepts the expected packet, sends the correct ACK, and uses sequence numbers to identify and discard duplicate retransmitted packets. |
| Member 3: `Name` | Implemented the unreliable channel and frontend: simulates packet/ACK loss, corruption, and delay, then displays animations, statistics, and the live event log. |

The responsibilities are divided among three team members. Replace the names before submission.

## Technologies used

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js built-in `http` module
- **Communication:** REST API calls between browser and backend
- **External packages:** None

## Channel settings used for demonstration

| Setting | Value | Meaning |
| --- | --- | --- |
| Packet loss | 10% | There is a 10% chance that a sent packet is lost before reaching the receiver. |
| Corruption | 15% | There is a 15% chance that a packet reaches the receiver with damaged data and is discarded. |
| ACK loss | 18% | There is an 18% chance that the receiver's acknowledgement is lost before reaching the sender. |
| One-way delay | 450 ms | A packet or ACK takes 450 milliseconds to travel across the channel in one direction. |
| Timeout | 1100 ms | The sender waits 1100 milliseconds for an ACK; after that, it retransmits the packet. |

These values create realistic failures while keeping the demonstration fast enough to observe. The original application defaults are packet loss **20%**, corruption **10%**, ACK loss **15%**, one-way delay **450 ms**, and timeout **1800 ms**.

## How to run

1. Open a terminal in this project folder.
2. Run `npm start`.
3. Open `http://localhost:3000` in a browser.
4. Enter a message, click **Send packet**, and observe the protocol.

To run the automated protocol checks:

```powershell
npm.cmd test
```

`npm.cmd` works in PowerShell systems that block the `npm.ps1` script. You may also use `node test.js` directly.

## Demonstration flow

1. Send a message with default settings to show normal packet delivery and ACK receipt.
2. Increase **Packet loss** to show timeout and retransmission after a lost packet.
3. Increase **ACK loss** to show that the receiver can receive a message but the sender retransmits when its ACK is lost.
4. Observe duplicate detection: the receiver does not deliver a retransmitted message twice.
5. Increase **Corruption** to show corrupted packets being discarded and retransmitted.

## What to say during the presentation

> “Our project demonstrates reliable communication over an unreliable network using Stop-and-Wait ARQ. The sender sends only one packet and waits for its acknowledgement. If the packet, ACK, or data is lost or corrupted, the sender does not receive the expected ACK before timeout, so it retransmits. We use alternating sequence numbers 0 and 1, so the receiver can identify duplicate retransmissions and avoid delivering the same message twice. Our novelty is that the protocol is fully interactive: users can control loss, corruption, delay, and ACK loss, while the UI shows animations, protocol states, statistics, and a detailed event log in real time.”

## Individual speaking points

### Member 1 — Sender, timer, and retransmission

“I implemented the sender part of the Stop-and-Wait protocol. The sender sends only one packet and attaches a sequence number, either 0 or 1. After sending, it starts a timer and waits for the matching ACK. If the ACK does not arrive before the timeout, the sender assumes that the packet or ACK was lost and retransmits the same packet. This makes delivery reliable.”

**Be ready to explain:** A timeout means the sender waited too long for an ACK. Retransmission means sending the same packet again. The sender cannot send the next message until the current packet is acknowledged.

### Member 2 — Receiver, ACK, and duplicate detection

“I implemented the receiver part. The receiver checks whether an incoming packet has the sequence number it expects. If it is the expected packet, the receiver delivers the message and sends an ACK. If the same packet comes again because its ACK was lost, the receiver recognizes it as a duplicate using the sequence number. It does not deliver the message again, but it sends the ACK again.”

**Be ready to explain:** An ACK confirms successful receipt. Duplicate detection is important because a lost ACK can cause the sender to retransmit a packet that the receiver already received.

### Member 3 — Unreliable channel and frontend

“I implemented the network channel simulation and the user interface. The channel can randomly lose packets, corrupt packets, lose ACKs, or delay communication. The frontend lets the user control these values and see the packet and ACK movement. It also shows statistics and an event log, so users can clearly understand why a timeout or retransmission happened.”

**Be ready to explain:** Packet loss means the message never reaches the receiver. Corruption means the receiver discards damaged data. ACK loss means the receiver got the packet, but the sender does not know it and retransmits after timeout.

## Expected outcome

The project proves that Stop-and-Wait ARQ provides reliable, duplicate-free delivery despite an unreliable channel. High loss or delay reduces efficiency because the sender must wait for an ACK before sending the next message.
