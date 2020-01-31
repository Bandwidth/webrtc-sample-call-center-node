import { Response } from "express";
import WebRtcAgentManager from "./WebRtcAgentManager";
import { Agent } from "./types";

class CallQueueManager {
  /**
   * The call queue will hold any waiting calls
   */
  private callQueue: string[];

  /**
   * This field will track which agents are handling each call.
   */
  private activeCalls: Map<string, string>;

  /**
   * The WebRTC agent manager will handle agents' WebRTC connections.
   * This class uses it to assign and unassign calls to agents.
   */
  private agentManager: WebRtcAgentManager;

  /**
   * Event handlers for indicating whether a call should be
   * answered or put on hold
   */
  private putCallOnHoldHandler:
    | { (callId: string, res: Response): void }
    | undefined;
  private answerCallHandler:
    | { (callId: string, res: Response, agent: Agent): void }
    | undefined;

  public onCallShouldBeAnswered(callback: {
    (callId: string, res: Response, agent: Agent): void;
  }) {
    this.answerCallHandler = callback;
  }

  public onCallShouldBeQueued(callback: {
    (callId: string, res: Response): void;
  }) {
    this.putCallOnHoldHandler = callback;
  }

  constructor(agentManager: WebRtcAgentManager) {
    this.agentManager = agentManager;
    this.callQueue = [];
    this.activeCalls = new Map();

    this.connectOrQueueCall = this.connectOrQueueCall.bind(this);
  }

  /**
   * Assign an agent to the call if one is available, or add the call to the queue if not.
   * @param callId call ID
   */
  connectOrQueueCall(callId: string, res: Response) {
    const agent = this.agentManager.getAvailableAgent();
    if (agent) {
      console.log(`Assigning ${callId} to agent ${agent.id}`);
      this.agentManager.assignCall(agent.id, callId);
      this.activeCalls.set(callId, agent.id);
      if (this.answerCallHandler) {
        this.answerCallHandler(callId, res, agent);
      }
    } else {
      console.log(`Adding ${callId} to the queue`);
      this.callQueue.push(callId);
      if (this.putCallOnHoldHandler) {
        this.putCallOnHoldHandler(callId, res);
      }
    }
  }

  /**
   * Unassign whichever agent is assigned to this call, if any, and remove the call from active calls.
   * @param callId call ID
   */
  disconnectCall(callId: string) {
    const agentId = this.activeCalls.get(callId);
    if (agentId) {
      this.activeCalls.delete(callId);
      this.agentManager.unassignCall(agentId, callId);
    }
  }

  /**
   * Return the assigned agent for a call.
   * @param callId call ID
   */
  getAssignedAgent(callId: string) {
    return this.activeCalls.get(callId);
  }

  /**
   * Take the next call ID off the queue
   */
  public getNextActiveCallId() {
    console.log(`Handling the next call`);
    if (this.callQueue.length > 0) {
      let agent = this.agentManager.getAvailableAgent();
      if (agent) {
        let activeCallId = this.callQueue.shift();
        if (activeCallId) {
          this.agentManager.assignCall(agent.id, activeCallId);
          this.activeCalls.set(activeCallId, agent.id);
          console.log(
            `${activeCallId} is the new active call for agent ${agent.id}`
          );
          return activeCallId;
        }
      }
    } else {
      console.log(`No other calls on the queue at this time`);
    }
  }
}

export default CallQueueManager;
