import React, { useEffect, useRef, useState } from 'react';
import { SignIn, SignUp, useAuth } from '@clerk/clerk-react';
import { ArrowRight, Network } from 'lucide-react';
import { pendingInvitationToken } from '../services/familyService';

interface LoginScreenProps {
  onLogin: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const notified = useRef(false);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(
    window.location.pathname === '/sign-up' ? 'sign-up' : 'sign-in',
  );

  useEffect(() => {
    const syncRoute = () => setMode(window.location.pathname === '/sign-up' ? 'sign-up' : 'sign-in');
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn && !notified.current) {
      notified.current = true;
      onLogin();
    }
  }, [isLoaded, isSignedIn, onLogin]);

  const selectMode = (nextMode: 'sign-in' | 'sign-up') => {
    setMode(nextMode);
    const path = nextMode === 'sign-up' ? '/sign-up' : '/sign-in';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  };

  const externalLoginUrl = new URL(mode === 'sign-up' ? '/sign-up' : '/sign-in', window.location.origin);
  const invite = pendingInvitationToken();
  if (invite) externalLoginUrl.searchParams.set('invite', invite);

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 lg:grid lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative flex min-h-[35vh] flex-col justify-center overflow-hidden px-6 py-12 sm:px-10 lg:min-h-[100dvh] lg:px-16 xl:px-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 top-10 h-96 w-96 rounded-full bg-brand-600/10 blur-3xl" />
          <div className="absolute -bottom-48 right-0 h-[30rem] w-[30rem] rounded-full bg-cyan-400/[.07] blur-3xl" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-gradient-to-b from-transparent via-slate-700/80 to-transparent lg:block" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-2xl">
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-brand-400/20 bg-brand-400/[.07] px-4 py-2 text-xs font-semibold uppercase tracking-[.16em] text-brand-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-300 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-300" />
            </span>
            Open source · Free forever
          </div>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-.045em] text-white sm:text-5xl xl:text-6xl">
            Your family history
            <br />
            <span className="text-brand-400">belongs to you.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            FamilyTreeAI helps relatives preserve the stories they share—without exposing private records.
            Build a history together, on your terms.
          </p>
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/70 shadow-2xl shadow-black/20">
            <img
              src="https://github.com/user-attachments/assets/214e3ea5-8511-448e-9ad8-17911b6850b0"
              alt="A preview of the FamilyTreeAI family history workspace"
              className="block h-auto w-full"
              referrerPolicy="no-referrer"
            />
            <div className="flex items-center justify-between gap-4 border-t border-slate-700/70 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-100">Built for the people in your story</p>
                <p className="mt-1 text-xs text-slate-400">Private by default. Shared by choice.</p>
              </div>
              <Network aria-hidden="true" className="shrink-0 text-brand-300" size={22} />
            </div>
          </div>
          <a
            href="https://github.com/nzicecool/FamliyTreeAI"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
          >
            Explore the open-source project <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:min-h-[100dvh]">
        <div className="w-full max-w-[28rem]">
          <div className="mb-7 text-center lg:text-left">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-300/20 bg-brand-400/10 text-brand-300 lg:mx-0">
              <Network size={23} aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-300">FamilyTreeAI</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {mode === 'sign-in' ? 'Welcome back' : 'Start your family archive'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {mode === 'sign-in' ? 'Sign in to pick up where your family left off.' : 'Create an account to bring your family history together.'}
            </p>
          </div>
          <div className="mb-6 grid grid-cols-2 rounded-xl border border-slate-700 bg-slate-900/70 p-1" aria-label="Choose account action">
            <button
              type="button"
              onClick={() => selectMode('sign-in')}
              aria-current={mode === 'sign-in' ? 'page' : undefined}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${mode === 'sign-in' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => selectMode('sign-up')}
              aria-current={mode === 'sign-up' ? 'page' : undefined}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${mode === 'sign-up' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              Sign up
            </button>
          </div>
          <p className="mb-4 text-center text-xs leading-5 text-slate-400">
            Testing Google sign-in?{' '}
            <a href={externalLoginUrl.toString()} target="_blank" rel="noopener noreferrer" className="text-brand-300 underline underline-offset-2">
              Open in a separate browser tab
            </a>.
          </p>
          <div className="min-h-[25rem]">
            {mode === 'sign-in' ? (
              <SignIn
                routing="hash"
                signInUrl="/sign-in"
                signUpUrl="/sign-up"
                forceRedirectUrl="/"
                appearance={{
                  variables: {
                    colorBackground: '#111827',
                    colorText: '#f1f5f9',
                    colorTextSecondary: '#94a3b8',
                    colorPrimary: '#0284c7',
                    colorInputBackground: '#020617',
                    colorInputText: '#f1f5f9',
                    borderRadius: '0.8rem',
                  },
                  elements: {
                    card: 'bg-slate-900 border border-slate-700 shadow-xl',
                    headerTitle: 'text-white',
                    headerSubtitle: 'text-slate-400',
                    formFieldLabel: 'text-slate-300',
                    formFieldInput: 'border-slate-700',
                    footerActionLink: 'text-brand-300 hover:text-brand-200',
                    dividerLine: 'bg-slate-700',
                    dividerText: 'text-slate-500',
                    socialButtonsBlockButton: { backgroundColor: '#ffffff', color: '#0f172a', borderColor: '#cbd5e1' },
                    socialButtonsBlockButtonText: { color: '#0f172a' },
                  },
                }}
              />
            ) : (
              <SignUp
                routing="hash"
                signInUrl="/sign-in"
                forceRedirectUrl="/"
                appearance={{
                  variables: {
                    colorBackground: '#111827',
                    colorText: '#f1f5f9',
                    colorTextSecondary: '#94a3b8',
                    colorPrimary: '#0284c7',
                    colorInputBackground: '#020617',
                    colorInputText: '#f1f5f9',
                    borderRadius: '0.8rem',
                  },
                  elements: {
                    card: 'bg-slate-900 border border-slate-700 shadow-xl',
                    headerTitle: 'text-white',
                    headerSubtitle: 'text-slate-400',
                    formFieldLabel: 'text-slate-300',
                    formFieldInput: 'border-slate-700',
                    footerActionLink: 'text-brand-300 hover:text-brand-200',
                    dividerLine: 'bg-slate-700',
                    dividerText: 'text-slate-500',
                    socialButtonsBlockButton: { backgroundColor: '#ffffff', color: '#0f172a', borderColor: '#cbd5e1' },
                    socialButtonsBlockButtonText: { color: '#0f172a' },
                  },
                }}
              />
            )}
          </div>
          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Your family’s records stay private unless you choose to share them.
          </p>
        </div>
      </section>
    </main>
  );
};
