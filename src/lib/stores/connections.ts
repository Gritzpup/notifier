import { writable, derived } from 'svelte/store';
import type { Platform } from './messages';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  error?: string;
  lastConnected?: Date;
}

type ConnectionsState = Record<Platform, ConnectionState>;

function createConnectionsStore() {
  const { subscribe, set, update } = writable<ConnectionsState>({
    discord: { status: 'disconnected' },
    telegram: { status: 'disconnected' },
    twitch: { status: 'disconnected' }
  });

  return {
    subscribe,
    
    setStatus: (platform: Platform, status: ConnectionStatus, error?: string) => {
      update(state => ({
        ...state,
        [platform]: {
          status,
          error: status === 'error' ? error : undefined,
          lastConnected: status === 'connected' ? new Date() : state[platform].lastConnected
        }
      }));
    },
    
    setConnecting: (platform: Platform) => {
      update(state => ({
        ...state,
        [platform]: { ...state[platform], status: 'connecting', error: undefined }
      }));
    },
    
    setConnected: (platform: Platform) => {
      update(state => ({
        ...state,
        [platform]: { status: 'connected', lastConnected: new Date() }
      }));
    },
    
    setError: (platform: Platform, error: string) => {
      update(state => ({
        ...state,
        [platform]: { ...state[platform], status: 'error', error }
      }));
    },
    
    disconnect: (platform: Platform) => {
      update(state => ({
        ...state,
        [platform]: { ...state[platform], status: 'disconnected', error: undefined }
      }));
    },
    
    disconnectAll: () => {
      set({
        discord: { status: 'disconnected' },
        telegram: { status: 'disconnected' },
        twitch: { status: 'disconnected' }
      });
    }
  };
}

export const connectionsStore = createConnectionsStore();

export const isAnyConnected = derived(
  connectionsStore,
  $connections => Object.values($connections).some(conn => conn.status === 'connected')
);

export const connectedPlatforms = derived(
  connectionsStore,
  $connections => Object.entries($connections)
    .filter(([_, conn]) => conn.status === 'connected')
    .map(([platform]) => platform as Platform)
);