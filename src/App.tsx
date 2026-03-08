import { GoogleOAuthProvider } from "@react-oauth/google";
import "./App.css";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import LoginScreen from "./components/LoginScreen";
import Dashboard from "./components/Dashboard";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function AppContent() {
  const { isAuthenticated } = useAuth();

  if (!GOOGLE_CLIENT_ID) {
    return <Dashboard />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <Dashboard />;
}

export default function App() {
  if (!GOOGLE_CLIENT_ID) {
    // No OAuth configured — show dashboard without auth (dev mode)
    return (
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
