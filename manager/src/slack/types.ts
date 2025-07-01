export interface SlackConfig {
  botToken: string;
  appToken?: string;
  signingSecret?: string;
  defaultChannel: string;
  enableSocketMode?: boolean;
}

export interface SlackMessage {
  channel: string;
  text: string;
  user?: string;
  ts?: string;
  thread_ts?: string;
  blocks?: any[];
}

export interface SlackConnectionOptions {
  workspace?: string;
  channel?: string;
  threadTs?: string;
}