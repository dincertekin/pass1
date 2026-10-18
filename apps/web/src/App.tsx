import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { LoginScreen } from "./screens/LoginScreen";
import { RegisterScreen } from "./screens/RegisterScreen";
import { UnlockScreen } from "./screens/UnlockScreen";
import { VaultScreen } from "./screens/VaultScreen";
import { SessionProvider, useSession } from "./session/session";

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}

// Each session state has its own set of screens. Any other URL redirects to that state's home,
// so a locked or logged-out user can never land on the vault.
function AppRoutes() {
  const { session } = useSession();

  switch (session.status) {
    case "loading":
      return <div className="min-h-dvh bg-sunken" aria-busy="true" />;
    case "loggedOut":
      return (
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      );
    case "locked":
      return (
        <Routes>
          <Route path="/unlock" element={<UnlockScreen email={session.account.user.email} />} />
          <Route path="*" element={<Navigate to="/unlock" replace />} />
        </Routes>
      );
    case "unlocked":
      return (
        <Routes>
          <Route path="/vault" element={<VaultScreen email={session.account.user.email} />} />
          <Route path="*" element={<Navigate to="/vault" replace />} />
        </Routes>
      );
  }
}
