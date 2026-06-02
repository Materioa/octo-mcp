import { create } from "zustand";

export interface Alert {
  id: string;
  message: string;
  type: "error" | "info" | "warning";
}

interface AlertStore {
  alerts: Alert[];
  addAlert: (message: string, type?: "error" | "info" | "warning") => void;
  removeAlert: (id: string) => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  addAlert: (message, type = "error") => {
    const id = crypto.randomUUID();
    set((state) => ({ alerts: [...state.alerts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) }));
    }, 5000);
  },
  removeAlert: (id) =>
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),
}));
