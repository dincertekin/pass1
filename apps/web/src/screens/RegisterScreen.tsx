import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { api } from "../lib/api";
import { errorMessage } from "../session/session";
import { CreateVaultScreen } from "./CreateVaultScreen";
import { SignUpScreen } from "./SignUpScreen";
import { t } from "../lib/i18n";

// /register asks for an email. /register#token=... is the emailed link: it chooses the
// master password. The token is after "#" so the browser never sends it to the server.

const TOKEN_PATTERN = /^#token=([A-Za-z0-9_-]{43})$/;

/** Output: the sign-up token in the address bar, or null when there isn't one. */
function readTokenFromUrl(): string | null {
  return window.location.hash.match(TOKEN_PATTERN)?.[1] ?? null;
}

type LinkState = { status: "checking" } | { status: "ready"; email: string } | { status: "invalid"; message: string };

export function RegisterScreen() {
  // Kept in memory, because the effect below removes it from the URL.
  const [signupToken, setSignupToken] = useState(readTokenFromUrl);

  useEffect(() => {
    // So the token isn't left in the browser's history or shown to anyone looking at the screen.
    // In an effect, not while reading: React may run that twice in development.
    function takeTokenFromUrl() {
      const token = readTokenFromUrl();
      if (token) setSignupToken(token);
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    }
    takeTokenFromUrl();
    // Pasting the link into a tab that's already on /register changes only the part after "#",
    // and the browser doesn't reload the page for that.
    window.addEventListener("hashchange", takeTokenFromUrl);
    return () => window.removeEventListener("hashchange", takeTokenFromUrl);
  }, []);

  if (!signupToken) return <SignUpScreen />;
  return <SignupLink signupToken={signupToken} />;
}

function SignupLink({ signupToken }: { signupToken: string }) {
  const [link, setLink] = useState<LinkState>({ status: "checking" });

  useEffect(() => {
    api.checkSignup(signupToken).then(
      ({ email }) => setLink({ status: "ready", email }),
      (err) => setLink({ status: "invalid", message: errorMessage(err) }),
    );
  }, [signupToken]);

  if (link.status === "ready") return <CreateVaultScreen signupToken={signupToken} email={link.email} />;
  return (
    <AuthLayout title={t("signup.title")}>
      {link.status === "checking" ? (
        <p className="text-center text-[13px] text-muted">{t("createVault.checkingLink")}</p>
      ) : (
        <div className="grid gap-4">
          <Alert>{link.message}</Alert>
          <Link to="/register" reloadDocument className="text-center text-[13px] font-medium text-accent hover:underline">
            {t("createVault.startAgain")}
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
