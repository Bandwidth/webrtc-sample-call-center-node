import BandwidthRtc, {
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  ParticipantPublishedEvent
} from "@bandwidth/webrtc-node-sdk";

import { Agent, AgentNotFoundError, AgentOfflineError } from "./types";

const websocketUrl = <string>process.env.WEBRTC_SERVER_URL;
const sipDestination = <string>process.env.SIP_DESTINATION;

class WebRtcAgentManager {
  /**
   * Bandwidth WebRTC server SDK
   */
  private bandwidthRtc: BandwidthRtc;

  /**
   * Map of agent ids to agents
   */
  private agents: Map<string, Agent>;

  /**
   * Map of conference ids to agent ids
   */
  private conferences: Map<string, string>;

  /**
   * Event handlers
   */
  private agentAvailableHandler?: { (agent: Agent): void };
  private callEndedHandler?: { (callId: string): void };

  constructor() {
    this.bandwidthRtc = new BandwidthRtc();
    this.agents = new Map();
    this.conferences = new Map();
  }

  /**
   * Connect to Bandwidth WebRTC and register event handlers
   * @param accountId Bandwidth account id
   * @param username Bandwidth username
   * @param password Bandwidth password
   */
  async initialize(accountId: string, username: string, password: string) {
    let options: any = {};
    if (websocketUrl) {
      options.websocketUrl = websocketUrl;
    }
    if (sipDestination) {
      options.sipDestination = sipDestination;
    }
    await this.bandwidthRtc.connect({
      accountId: accountId,
      username: username,
      password: password
    }, options);
    console.log("Bandwidth WebRTC websocket connected");

    this.bandwidthRtc.onParticipantJoined(
      async (event: ParticipantJoinedEvent) => {
        const agentId = this.conferences.get(event.conferenceId);
        if (agentId) {
          const agent = this.agents.get(agentId);
          if (
            agent &&
            agent.participantId !== event.participantId &&
            agent.streamId &&
            agent.activeCallId
          ) {
            agent.callParticipants.set(event.participantId, agent.activeCallId);
            this.bandwidthRtc.subscribe(
              event.conferenceId,
              event.participantId,
              agent.streamId
            );
          }
        }
      }
    );

    this.bandwidthRtc.onParticipantLeft(async (event: ParticipantLeftEvent) => {
      const agentId = this.conferences.get(event.conferenceId);
      if (agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
          if (event.participantId === agent.participantId) {
            let conferenceId = event.conferenceId;
            agent.conferenceId = null;
            agent.participantId = null;
            agent.streamId = null;
            agent.activeCallId = null;
            agent.callParticipants = new Map();
            await this.bandwidthRtc.endConference(conferenceId);
          } else {
            const participantCallId = agent.callParticipants.get(
              event.participantId
            );
            agent.callParticipants.delete(event.participantId);

            if (participantCallId === agent.activeCallId) {
              this.raiseCallEnded(participantCallId);
              agent.activeCallId = null;
              this.raiseAgentAvailable(agent);
            }
          }
        }
      }
    });

    this.bandwidthRtc.onParticipantPublished(
      async (event: ParticipantPublishedEvent) => {
        const agentId = this.conferences.get(event.conferenceId);
        if (agentId) {
          const agent = this.agents.get(agentId);
          if (agent) {
            if (event.participantId === agent.participantId) {
              // Agent has come online, let them start fielding calls
              agent.streamId = event.streamId;
              this.raiseAgentAvailable(agent);
            } else if (agent.participantId) {
              this.bandwidthRtc.subscribe(
                event.conferenceId,
                agent.participantId,
                event.streamId
              );
            }
          }
        }
      }
    );
  }

  /**
   * Set the callback for when an agent becomes available
   * @param callback
   */
  onAgentAvailable(callback: { (agent: Agent): void }): void {
    this.agentAvailableHandler = callback;
  }

  /**
   * Set the callback for when a call ends
   * @param callback
   */
  onCallEnded(callback: { (agentId: string): void }): void {
    this.callEndedHandler = callback;
  }

  raiseAgentAvailable(agent: Agent) {
    if (this.agentAvailableHandler) {
      this.agentAvailableHandler(agent);
    }
  }

  raiseCallEnded(callId: string) {
    if (this.callEndedHandler) {
      this.callEndedHandler(callId);
    }
  }

  /**
   * Add a new agent to the manager
   * @param id unique agent id
   */
  addAgent(id: string, username?: string) {
    const agent = {
      id: id,
      conferenceId: null,
      participantId: null,
      streamId: null,
      activeCallId: null,
      callParticipants: new Map<string, string>()
    };
    this.agents.set(id, agent);
  }

  /**
   * Remove an agent from the manager
   * @param id agent id
   */
  removeAgent(id: string) {
    this.agents.delete(id);
  }

  /**
   * Bring an agent online so they can start fielding calls.
   * They won't actually be able to start taking calls until their browser has connected to Bandwidth WebRTC,
   * see the `onParticipantPublished` handler above.
   * @param id agent id
   */
  async bringAgentOnline(id: string) {
    const agent = this.getAgent(id);
    let conferenceId = await this.bandwidthRtc.startConference();
    let participantId = await this.bandwidthRtc.createParticipant(conferenceId);

    agent.conferenceId = conferenceId;
    agent.participantId = participantId;
    this.conferences.set(conferenceId, agent.id);
    return { conferenceId: conferenceId, participantId: participantId };
  }

  /**
   * Take agent offline. Any ongoing calls will be dropped.
   * @param id agent id
   */
  async takeAgentOffline(id: string) {
    const agent = this.getAgent(id);
    const conferenceId = agent.conferenceId;
    agent.conferenceId = null;
    agent.participantId = null;
    agent.streamId = null;
    agent.activeCallId = null;
    if (conferenceId) {
      await this.bandwidthRtc.endConference(conferenceId);
    }
  }

  /**
   * Return the first availabe agent's id, or null
   */
  getAvailableAgent() {
    // TODO: grab agents more fairly if there are multiple available
    for (const [_, agent] of this.agents) {
      if (this.isOnline(agent) && !agent.activeCallId) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Assign a call to an agent
   * @param agentId agent id
   * @param callId call id
   */
  assignCall(agentId: string, callId: string) {
    const agent = this.getAgent(agentId);
    agent.activeCallId = callId;
  }

  /**
   * Unassign a call from an agent
   * @param agentId agent id
   * @param callId call id
   */
  unassignCall(agentId: string, callId: string) {
    const agent = this.getAgent(agentId);
    if (agent.activeCallId === callId) {
      agent.activeCallId = null;
      this.raiseAgentAvailable(agent);
    }
  }

  /**
   * Get the active call id for an agent, if any
   * @param agentId agent id
   */
  getActiveCallId(agentId: string) {
    const agent = this.getAgent(agentId);
    return agent.activeCallId;
  }

  public getParticipantIdForCaller(conferenceId: string) {
    return this.bandwidthRtc.createParticipant(conferenceId);
  }

  private getAgent(id: string) {
    const agent = this.agents.get(id);
    if (agent) {
      return agent;
    } else {
      throw new AgentNotFoundError(id);
    }
  }

  private isOnline(agent: Agent) {
    return agent.conferenceId && agent.participantId && agent.streamId;
  }
}

export default WebRtcAgentManager;
