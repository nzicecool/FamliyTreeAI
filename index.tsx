import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ClerkProvider, AuthenticateWithRedirectCallback } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

function Root() {
  const isSsoCallback = window.location.pathname === '/sso-callback';
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      signInUrl="/"
      signUpUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {isSsoCallback ? (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300">
          Signing you in…
          <AuthenticateWithRedirectCallback
            signInFallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/"
          />
        </div>
      ) : (
        <App />
      )}
    </ClerkProvider>
  );
}

if (!PUBLISHABLE_KEY) {
  root.render(
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
      <div className="max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-4">Configuration Required</h1>
        <p className="text-slate-400 mb-6 font-sans">
          To use authentication, you need to provide a Clerk Publishable Key.
        </p>
        <div className="bg-slate-950 rounded-lg p-4 text-left mb-6 font-mono text-sm text-blue-400">
          1. Go to Clerk Dashboard<br/>
          2. Copy Publishable Key<br/>
          3. Add to Settings &gt; Secrets as:<br/>
          <span className="text-white">VITE_CLERK_PUBLISHABLE_KEY</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl transition-all"
        >
          I've added the key, reload
        </button>
      </div>
    </div>
  );
} else {
  root.render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  );
}
