import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Usuario, Token } from '@/types';
import { api } from '@/lib/api';

interface AuthState {
  usuario: Usuario | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      usuario: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<Token>('/auth/login', { username, password }, undefined);
          set({
            usuario: response.usuario,
            token: response.access_token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Error al iniciar sesión',
          });
          throw error;
        }
      },

      logout: () => {
        set({
          usuario: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, usuario: state.usuario, isAuthenticated: state.isAuthenticated }),
    }
  )
);