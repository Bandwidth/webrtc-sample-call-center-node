import express from "express";
import path from "path";
import bodyParser from "body-parser";
import cors from "cors";

import dotenv from "dotenv";
import uuidv4 from "uuid";

dotenv.config();

import CallQueueManager from "./CallQueueManager";
import WebRtcAgentManager from "./WebRtcAgentManager";
import VoiceCallManager from "./VoiceCallManager";

const accountId = <string>process.env.ACCOUNT_ID;
const username = <string>process.env.USERNAME;
const password = <string>process.env.PASSWORD;
const deviceWebsocketUrl = <string>process.env.WEBRTC_DEVICE_URL;
const port = process.env.PORT || 3000;
const app = express();

/**
 * The WebRTC agent manager will handle agents' WebRTC connections.
 */
const agentManager = new WebRtcAgentManager();

/**
 * Call queue that will handle queuing and connecting calls to agents
 */
const callQueueManager = new CallQueueManager(agentManager);

/**
 * Manages callbacks from Bandwidth Voice API
 */
const voiceCallManager = new VoiceCallManager();

/**
 * When a new phone call comes in, hand it off to the CallQueueManager
 * to determine whether it should be queued or answered immediately
 */
voiceCallManager.onIncomingCall(callQueueManager.connectOrQueueCall);

/**
 * When the CallQueueManager determines that the call should be
 * answered, create a new participant ID for the call, and hand
 * it off to the VoiceCallManager to be answered
 */
callQueueManager.onCallShouldBeAnswered(async (callId, res, agent) => {
  if (agent.conferenceId) {
    const phoneParticipantId = await agentManager.getParticipantIdForCaller(
      agent.conferenceId
    );
    voiceCallManager.answerCall(
      callId,
      agent.conferenceId,
      phoneParticipantId,
      res
    );
  }
});

/**
 * If the call should be queued, tell the VoiceCallManager to
 * put the call on hold. This will play a message and some music
 */
callQueueManager.onCallShouldBeQueued(voiceCallManager.putCallOnHold);

/**
 * When an agent becomes available, check to see if there is call
 * able to be picked up. If there is, create a new participant ID
 * for the call, and tell the VoiceCallManager to take the call
 * off hold
 */
agentManager.onAgentAvailable(async agent => {
  const callId = callQueueManager.getNextActiveCallId();
  if (callId) {
    if (agent.conferenceId) {
      const phoneParticipantId = await agentManager.getParticipantIdForCaller(
        agent.conferenceId
      );
      voiceCallManager.connectCallToWebRtcConference(
        callId,
        agent.conferenceId,
        phoneParticipantId
      );
    }
  }
});

agentManager
  .initialize(accountId, username, password)
  .then(() => {
    console.log("Agent manager initialized");
  })
  .catch(error => {
    console.log("Error initializing agent manager", error.message);
    return process.exit(1);
  });

app.use(cors());
app.use(bodyParser.json());

/**
 * Basic (fake) login endpoint that will return a unique token to the browser.
 * This token is expected to be present on subsequent requests from the browser.
 * NOTE: this is not secure in any way.
 */
app.post("/login", async (req, res) => {
  try {
    // TODO: real auth
    const token = uuidv4();

    console.log(`Agent ${token} has connected`);
    agentManager.addAgent(token);

    res.status(200).send({ token: token });
  } catch (e) {
    res.status(400).send(e);
  }
});

/**
 * The browser will call this endpoint to update their status (online/offline)
 */
app.post("/setStatus", async (req: any, res) => {
  let agentId = req.body.token;
  if (agentId) {
    let resp = {};
    if (req.body.online) {
      console.log(`Agent ${agentId} is coming online`);
      resp = await agentManager.bringAgentOnline(agentId);
      resp = { websocketUrl: deviceWebsocketUrl, ...resp }
    } else {
      console.log(`Agent ${agentId} is going offline`);
      await agentManager.takeAgentOffline(agentId);
    }
    res.status(200).send(resp);
  } else {
    res.status(400).send({});
  }
});

/**
 * Endpoint for an agent to hangup the active call
 */
app.post("/hangup", async (req, res) => {
  const agentId = req.body.token;
  const activeCallId = agentManager.getActiveCallId(agentId);
  if (activeCallId) {
    console.log(`Hanging up ${activeCallId}`);
    let response;
    try {
      response = await voiceCallManager.endCall(activeCallId);
    } catch (e) {
      response = e.response;
    } finally {
      res.status(response.status).send(response.data);
    }
    console.log(response.data);
  } else {
    res.status(200).send();
  }
});

/**
 * Used for load balancer health checks
 */
app.get("/ping", (req, res) => {
  res.send("OK");
});

app.use("/callback", voiceCallManager.router);

/**
 * Static file mapping for serving the hold music
 */
app.use("/public", express.static("public"));

/**
 * Serve traffic to the front end assets
 */
app.use(express.static(path.join(__dirname, "..", "frontend", "build")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "build", "index.html"));
});

app.listen(port, async () => {
  console.log(`Server is listening on port ${port}`);
});
