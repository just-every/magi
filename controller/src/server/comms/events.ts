/**
 * Events Module
 *
 * Provides communication with the MAGI system via events
 */
import EventEmitter from 'events';

// Create a shared event emitter for MAGI communication
const magiEmitter = new EventEmitter();

/**
 * Get the shared MAGI event emitter
 *
 * @returns The shared event emitter
 */
export function getMagiEmitter(): EventEmitter {
    return magiEmitter;
}

// Configure the emitter for a higher number of listeners
// as we might have many handlers for different event types
magiEmitter.setMaxListeners(50);
