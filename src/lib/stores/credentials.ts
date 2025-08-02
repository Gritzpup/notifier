import { writable, derived } from 'svelte/store';
import { loadCredentials, saveCredentials, clearCredentials, hasStoredCredentials, type Credentials } from '$lib/utils/crypto';

interface CredentialsState {
  isUnlocked: boolean;
  passphrase: string;
  credentials: Credentials | null;
}

function createCredentialsStore() {
  const { subscribe, set, update } = writable<CredentialsState>({
    isUnlocked: false,
    passphrase: '',
    credentials: null
  });

  return {
    subscribe,
    
    unlock: (passphrase: string): boolean => {
      const credentials = loadCredentials(passphrase);
      if (credentials) {
        set({
          isUnlocked: true,
          passphrase,
          credentials
        });
        return true;
      }
      return false;
    },
    
    lock: () => {
      set({
        isUnlocked: false,
        passphrase: '',
        credentials: null
      });
    },
    
    save: (credentials: Credentials, passphrase: string) => {
      saveCredentials(credentials, passphrase);
      set({
        isUnlocked: true,
        passphrase,
        credentials
      });
    },
    
    update: (updater: (creds: Credentials) => Credentials) => {
      update(state => {
        if (state.credentials && state.passphrase) {
          const updated = updater(state.credentials);
          saveCredentials(updated, state.passphrase);
          return {
            ...state,
            credentials: updated
          };
        }
        return state;
      });
    },
    
    clear: () => {
      clearCredentials();
      set({
        isUnlocked: false,
        passphrase: '',
        credentials: null
      });
    },
    
    hasStored: hasStoredCredentials
  };
}

export const credentialsStore = createCredentialsStore();

export const hasDiscord = derived(
  credentialsStore,
  $store => $store.credentials?.discord?.token ? true : false
);

export const hasTelegram = derived(
  credentialsStore,
  $store => $store.credentials?.telegram?.botToken ? true : false
);

export const hasTwitch = derived(
  credentialsStore,
  $store => $store.credentials?.twitch?.oauth ? true : false
);