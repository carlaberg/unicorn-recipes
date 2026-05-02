import React, { createContext, useContext, useState } from 'react';

import { mockUser } from '@/data/mock';

type AuthContextType = {
  isLoggedIn: boolean;
  userName: string;
  userEmail: string;
  signIn: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: mockUser.isLoggedIn,
  userName: mockUser.name,
  userEmail: mockUser.email,
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(mockUser.isLoggedIn);

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        userName: mockUser.name,
        userEmail: mockUser.email,
        signIn: () => setIsLoggedIn(true),
        signOut: () => setIsLoggedIn(false),
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
