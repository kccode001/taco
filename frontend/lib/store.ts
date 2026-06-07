import { create } from "zustand";
import { persist } from "zustand/middleware";
import { User, VisitDraft } from "./types";

interface AuthStore {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      clearAuth: () => set({ user: null, token: null }),
    }),
    { name: "taco-auth" }
  )
);

interface VisitDraftStore {
  drafts: Record<string, VisitDraft>;
  setDraft: (storeId: string, draft: VisitDraft) => void;
  updateSection: (
    storeId: string,
    sectionKey: string,
    data: Record<string, unknown>
  ) => void;
  clearDraft: (storeId: string) => void;
}

export const useVisitDraftStore = create<VisitDraftStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      setDraft: (storeId, draft) =>
        set((state) => ({
          drafts: { ...state.drafts, [storeId]: draft },
        })),
      updateSection: (storeId, sectionKey, data) => {
        const existing = get().drafts[storeId];
        if (!existing) return;
        set((state) => ({
          drafts: {
            ...state.drafts,
            [storeId]: {
              ...existing,
              sections: { ...existing.sections, [sectionKey]: data },
            },
          },
        }));
      },
      clearDraft: (storeId) =>
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [storeId]: _removed, ...rest } = state.drafts;
          return { drafts: rest };
        }),
    }),
    { name: "taco-visit-drafts" }
  )
);
