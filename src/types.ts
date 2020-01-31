export interface Agent {
  id: string;
  conferenceId: string | null;
  participantId: string | null;
  streamId: string | null;
  activeCallId: string | null;
  callParticipants: Map<string, string>;
}

export class AgentNotFoundError extends Error {
  constructor(id: string) {
    super(`Agent ${id} not found`);
  }
}

export class AgentOfflineError extends Error {
  constructor(id: string) {
    super(`Agent ${id} is offline`);
  }
}
