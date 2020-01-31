import express, { Response } from "express";
import axios from "axios";
import BandwidthRtc from "@bandwidth/webrtc-node-sdk";

const accountId = <string>process.env.ACCOUNT_ID;
const username = <string>process.env.USERNAME;
const password = <string>process.env.PASSWORD;
const voiceAppId = <string>process.env.VOICE_APP_ID;
const voiceCallbackUrl = <string>process.env.VOICE_CALLBACK_URL;

class VoiceCallManager {
  private bandwidthRtc = new BandwidthRtc();
  private incomingCallHandler:
    | { (callId: string, res: Response): void }
    | undefined;
  private callEndedHandler: { (callId: string): void } | undefined;

  public router = express.Router();

  public onIncomingCall(callback: {
    (callId: string, res: Response): void;
  }): void {
    this.incomingCallHandler = callback;
  }

  public onCallEnded(callback: { (callId: string): void }) {
    this.callEndedHandler = callback;
  }

  public putCallOnHold(callId: string, res: Response) {
    const bxml = `<?xml version="1.0" encoding="UTF-8" ?>
      <Response>
          <SpeakSentence voice="julie">Thank you for calling customer support. Your call is very important to us. Please remain on the line while we connect you to the next available agent.</SpeakSentence>
          <PlayAudio>${voiceCallbackUrl}/public/hold_music.wav</PlayAudio>
          <Redirect redirectUrl="${voiceCallbackUrl}/callback/continueHold"/>
      </Response>`;
    res.contentType("application/xml").send(bxml);
    console.log(bxml);
  }

  public answerCall(
    callId: string,
    conferenceId: string,
    participantId: string,
    res: Response
  ) {
    const bxml = `<?xml version="1.0" encoding="UTF-8" ?>
      <Response>
          <SpeakSentence voice="julie">Thank you for calling customer support. Connecting you to an agent now.</SpeakSentence>
          <Redirect redirectUrl="${voiceCallbackUrl}/callback/connect" tag="${conferenceId},${participantId}" />
      </Response>`;
    res.contentType("application/xml").send(bxml);
    console.log(bxml);
  }

  public endCall(callId: string) {
    return axios.post(
      `https://voice.bandwidth.com/api/v2/accounts/${accountId}/calls/${callId}`,
      {
        state: "completed",
        applicationId: voiceAppId
      },
      {
        auth: {
          username: username,
          password: password
        }
      }
    );
  }

  /**
   * Connect a call into a WebRTC conference
   * This method will make a POST to the HTTP Voice API to "redirect" the call,
   * which will trigger another request for BXML to handle connecting the call
   * @param callId
   */
  async connectCallToWebRtcConference(
    callId: string,
    conferenceId: string,
    participantId: string
  ) {
    console.log(`Updating ${callId} to trigger connection`);
    let response;
    try {
      response = await axios.post(
        `https://voice.bandwidth.com/api/v2/accounts/${accountId}/calls/${callId}`,
        {
          redirectUrl: `${voiceCallbackUrl}/callback/connect`,
          applicationId: voiceAppId,
          tag: `${conferenceId},${participantId}` // We will use this in the "connect" handler
        },
        {
          auth: {
            username: username,
            password: password
          }
        }
      );
    } catch (e) {
      response = e.response;
    }
    console.log(response.data);
  }

  constructor() {
    /**
     * Callback endpoint for a new, incoming call
     */
    this.router.post("/incomingCall", (req, res) => {
      const callId = req.body.callId;
      console.log(`New incoming call ${callId}`);
      if (this.incomingCallHandler) {
        this.incomingCallHandler(callId, res);
      }
    });

    /**
     * Callback endpoint for when the hold music has ended
     * Play a message, and then loop the music again, until an agent answers
     */
    this.router.post("/continueHold", (req, res) => {
      const callId = req.body.callId;
      console.log(`Holding call ${callId}`);
      const bxml = `<?xml version="1.0" encoding="UTF-8" ?>
      <Response>
          <SpeakSentence voice="julie">Thank you for your patience. Please remain on the line while we connect you to the next available agent.</SpeakSentence>
          <PlayAudio>${voiceCallbackUrl}/public/hold_music.wav</PlayAudio>
          <Redirect redirectUrl="${voiceCallbackUrl}/callback/hold"/>
      </Response>`;
      res.contentType("application/xml").send(bxml);
      console.log(bxml);
    });

    /**
     * Callback endpoint for connecting a call
     * This is triggered in response to the HTTP Post above
     * that sets the call's redirectUrl
     */
    this.router.post("/connect", async (req, res) => {
      const callId = req.body.callId;
      console.log(`attempting to connect call ${callId}`);
      const tag = req.body.tag as string;

      // This is a shortcut, so that we don't have to go look up the conference ID and participant ID again
      const conferenceId = tag.split(",")[0];
      const participantId = tag.split(",")[1];

      const transferBxml = this.bandwidthRtc.generateTransferBxml(
        conferenceId,
        participantId
      );
      console.log(`Connecting call ${callId} to conference ${conferenceId}`);
      const bxml = `<?xml version="1.0" encoding="UTF-8" ?>
        <Response>
            ${transferBxml}
        </Response>`;
      res.contentType("application/xml").send(bxml);
    });

    /**
     * Callback endpoint that is called when the state of a call changes
     */
    this.router.post("/status", (req, res) => {
      const callId = req.body.callId;
      const eventType = req.body.eventType;
      if (eventType === "disconnect") {
        console.log(`Call ${callId} has ended`);
        res.status(200).send();
        if (this.callEndedHandler) {
          this.callEndedHandler(callId);
        }
      }
    });
  }
}

export default VoiceCallManager;
