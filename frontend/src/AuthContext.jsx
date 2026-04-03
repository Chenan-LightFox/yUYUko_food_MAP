import React, { createContext, useContext } from 'react';

const AuthContext = createContext({
    token: null,
    setToken: () => {},
    user: null,
    setUser: () => {},
    onRequireAuth: () => {}
});

export function AuthProvider({ value, children }) {
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}

export default AuthContext;
