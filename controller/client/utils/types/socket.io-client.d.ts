// Type definitions for Socket.io client loaded from CDN
interface SocketIOOptions {
  forceNew?: boolean;
  multiplex?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
  autoConnect?: boolean;
  query?: Record<string, string>;
  extraHeaders?: Record<string, string>;
}

interface Socket {
  on<T = unknown>(event: string, callback: (data: T) => void): this;
  emit(event: string, ...args: unknown[]): this;
}

// Global function declaration
declare function io(url?: string, options?: SocketIOOptions): Socket;