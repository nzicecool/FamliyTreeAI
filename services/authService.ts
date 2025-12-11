
// Mock User Interface
export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
}

// In a real app, this would use Firebase Auth or Google Identity Services
export const authService = {
  
  loginWithGoogle: async (): Promise<User> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Return mock user
    const user: User = {
      id: 'usr_123456',
      name: 'Alex Pendragon',
      email: 'alex.pendragon@example.com',
      photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex'
    };
    
    localStorage.setItem('familytreeai_user', JSON.stringify(user));
    return user;
  },

  logout: async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    localStorage.removeItem('familytreeai_user');
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem('familytreeai_user');
    return stored ? JSON.parse(stored) : null;
  }
};