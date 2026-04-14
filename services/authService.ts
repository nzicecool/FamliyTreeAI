export type { User } from '../types';

// This service is deprecated in favor of Clerk hooks.
// It remains as a placeholder to avoid breaking imports during migration.
export const authService = {
  logout: async () => {
    // Handled by Clerk useClerk().signOut()
  },
  onAuthStateChange: () => {
    // Handled by Clerk useAuth()
    return () => {};
  }
};
