export interface CommunicationManager {
  send: (data: any) => void;
  sendMessage?: (channel: string, message: string, options?: any) => Promise<void>;
  onMessage?: (channel: string, handler: (message: any) => void) => void;
  connect?: () => Promise<void>;
  disconnect?: () => Promise<void>;
  isConnected?: () => boolean;
}