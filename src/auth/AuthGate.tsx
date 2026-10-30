import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { AuthScreen, SetNewPassword } from './AuthScreen';

/** Shows the sign-in screen until there is a signed-in user. */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()!;
  if (auth.loading) {
    return (
      <div className="authwrap">
        <p className="sub" role="status">Loading...</p>
      </div>
    );
  }
  if (auth.recovery && auth.user) return <SetNewPassword />;
  if (!auth.user) return <AuthScreen />;
  return <>{children}</>;
}
