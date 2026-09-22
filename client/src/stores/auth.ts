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

export const TEST_USER: User = {
  id: "test-user-id",
  username: "testuser",
  displayName: "Test User",
  name: "Test User",
  email: "test@example.com",
  hasAdminPrivileges: true,
  isPlusUser: true,
};

const isLocalDev = typeof window !== "undefined" && (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  Boolean(import.meta.env.DEV)
);

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: isLocalDev ? "test_token" : null,
      user: isLocalDev ? TEST_USER : null,
      anonymousId: "test_anonymous_id",
      loginOpen: false,
      setLoginOpen: (open) => set({ loginOpen: open }),
      setAuth: (token, user) => set({ token, user, loginOpen: false }),
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
