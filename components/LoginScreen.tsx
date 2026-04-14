import React, { useState } from 'react';
import { Network, ArrowRight, Loader2, Mail, Github } from 'lucide-react';
import { useSignIn } from '@clerk/clerk-react';

interface LoginScreenProps {
  onLogin: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form States
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleGoogleLogin = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (e: any) {
      console.error(e);
      setError(e.errors?.[0]?.message || 'An error occurred during login.');
      setLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signIn.create({
        identifier: email,
      });
      const firstFactor = signIn.supportedFirstFactors.find(f => f.strategy === 'email_code');
      if (firstFactor && 'emailAddressId' in firstFactor) {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: (firstFactor as any).emailAddressId,
        });
        setVerifying(true);
      } else {
        throw new Error('Email code strategy not available');
      }
    } catch (e: any) {
      setError(e.errors?.[0]?.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        onLogin();
      }
    } catch (e: any) {
      setError(e.errors?.[0]?.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col lg:grid lg:grid-cols-2 relative overflow-hidden">
      {/* GitHub Link */}
      <a 
        href="https://github.com/nzicecool/FamliyTreeAI" 
        target="_blank" 
        rel="noopener noreferrer"
        className="absolute top-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all backdrop-blur-md group"
      >
        <Github size={20} />
        <span className="text-sm font-medium">View on GitHub</span>
      </a>

      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-600/10 rounded-full blur-[100px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]"></div>
      </div>

      {/* Left Side: Mission & Image */}
      <div className="z-10 flex flex-col justify-center p-8 lg:p-16 xl:p-24 order-2 lg:order-1">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            Open Source & Free Forever
          </div>
          
          <h2 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Your family history <br />
            <span className="text-brand-500">belongs to you</span>.
          </h2>
          
          <p className="text-lg text-slate-400 mb-8 leading-relaxed">
            Born out of frustration with exorbitant fees, FamilyTreeAI is a labor of love designed to put your heritage back in your own hands. Capture, preserve, and explore your family tree without the premium price tag.
          </p>

          <div className="relative group rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <img 
              src="https://github.com/user-attachments/assets/214e3ea5-8511-448e-9ad8-17911b6850b0" 
              alt="FamilyTreeAI Preview" 
              className="w-full h-auto transform group-hover:scale-105 transition-transform duration-700"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="mt-12 flex items-center gap-6 grayscale opacity-50">
            <div className="text-xs font-mono text-slate-500 uppercase tracking-widest">Built with</div>
            <div className="flex gap-4 items-center">
              <span className="text-white font-semibold text-sm">Firebase</span>
              <span className="text-white font-semibold text-sm">Gemini AI</span>
              <span className="text-white font-semibold text-sm">React</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="z-10 flex items-center justify-center p-8 order-1 lg:order-2">
        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-brand-600 rounded-xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-brand-600/20">
              <Network size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">FamilyTreeAI</h1>
            <p className="text-slate-400">The next generation of genealogy.</p>
          </div>

          <div className="space-y-6">
            {/* Google Auth */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white hover:bg-slate-50 text-slate-900 font-semibold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-3 group relative overflow-hidden"
            >
              {loading && !verifying ? (
                 <Loader2 size={20} className="animate-spin text-slate-600" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>Continue with Google</span>
                  <ArrowRight size={18} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all text-slate-400" />
                </>
              )}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-2 text-slate-500">Or email code</span>
              </div>
            </div>

            {!verifying ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="email"
                    placeholder="Email Address"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white focus:ring-2 focus:ring-brand-500/50 outline-none transition-all"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : 'Send Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter 6-digit code"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white text-center tracking-[0.5em] font-mono text-xl focus:ring-2 focus:ring-brand-500/50 outline-none transition-all"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : 'Verify & Sign In'}
                </button>
                <button 
                  type="button"
                  onClick={() => setVerifying(false)}
                  className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Back to email
                </button>
              </form>
            )}
          </div>

          <div className="text-xs text-slate-500 text-center mt-8">
            By continuing, you agree to our <span className="underline cursor-pointer hover:text-slate-400">Terms</span> and <span className="underline cursor-pointer hover:text-slate-400">Privacy Policy</span>.
          </div>
        </div>
      </div>
    </div>
  );
};
