import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export interface User {
  id: string;
  username?: string;
  displayName?: string;
  fullName?: string;
  firstName?: string;
  name?: string;
  email?: string;
  hasAdminPrivileges: boolean;
  isPlusUser: boolean;
  profilePicture?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  anonymousId: string;
  loginOpen: boolean;
  setLoginOpen: (open: boolean) => void;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      anonymousId: uuidv4(), // Generate a unique anonymous ID if one doesn't exist
      loginOpen: false,
      setLoginOpen: (open) => set({ loginOpen: open }),
      setAuth: (token, user) => set({ token, user }),
      logout: () => {
        set({ token: null, user: null });
        import("./settings").then((settingsStore) => {
          settingsStore.useSettingsStore.setState({ customConnectors: [] });
        });
      },
    }),
    {
      name: "materio-auth-storage",
      partialize: (state) => ({ 
        token: state.token, 
        user: state.user, 
        anonymousId: state.anonymousId 
      }),
    }
  )
);
