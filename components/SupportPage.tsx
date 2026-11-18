import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CircleHelp, Leaf, LockKeyhole, Send } from 'lucide-react';
import { SiteFooter } from './SiteFooter';
import { PublicBetaBadge } from './PublicBetaBadge';
import { productAnalyticsHeaders } from '../services/productEvents';

type SupportValues = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const emptyValues: SupportValues = {
  name: '',
  email: '',
  subject: '',
  message: '',
};

export const SupportPage: React.FC = () => {
  const [values, setValues] = useState<SupportValues>(emptyValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const title = document.title;
    document.title = 'Customer Support | FamilyTreeAI';
    return () => { document.title = title; };
  }, []);

  const updateValue = (field: keyof SupportValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const website = new FormData(event.currentTarget).get('website') ?? '';

    const trimmed = {
      name: values.name.trim(),
      email: values.email.trim(),
      subject: values.subject.trim(),
      message: values.message.trim(),
    };

    if (!trimmed.name || !trimmed.email || !trimmed.subject || trimmed.message.length < 10) {
      setError('Please complete each field. Your message needs at least 10 characters.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...productAnalyticsHeaders() },
        body: JSON.stringify({ ...trimmed, website }),
      });
      const result = await response.json().catch(() => null);

      if (response.status === 201 && result?.success === true) {
        setValues(emptyValues);
        setIsSubmitted(true);
      } else {
        setError(typeof result?.error === 'string' && result.error.trim()
          ? result.error
          : 'We couldn’t send your request just now. Please try again.');
      }
    } catch {
      setError('We couldn’t reach support just now. Your message is still here—please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAnother = () => {
    setIsSubmitted(false);
    setError('');
    window.requestAnimationFrame(() => nameInput.current?.focus());
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/90 px-5 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <a
            href="/"
            aria-label="FamilyTreeAI home"
            data-testid="link-home"
            className="inline-flex min-h-11 items-center gap-3 rounded-lg text-white transition-colors hover:text-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300">
              <Leaf size={19} aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight sm:text-lg">
              FamilyTreeAI<PublicBetaBadge />
            </span>
          </a>
          <nav aria-label="Support navigation" className="flex items-center gap-4 sm:gap-6">
            <a
              href="/faq"
              data-testid="link-faq"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-300 transition-colors hover:text-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              <CircleHelp size={16} aria-hidden="true" />
              FAQ
            </a>
            <a
              href="/"
              data-testid="link-back-home"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-brand-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Back to FamilyTreeAI</span>
              <span className="sm:hidden">Home</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="relative isolate overflow-hidden px-5 py-10 sm:px-6 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_at_top,rgba(29,161,191,0.12),transparent_66%)]" />
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)] lg:items-start lg:gap-16">
          <section className="pt-1 sm:pt-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/[0.07] px-3 py-1.5 text-xs font-semibold tracking-wide text-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden="true" />
              HERE TO HELP
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl sm:leading-[1.08]">
              Customer Support
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              Need a hand with your family archive? Tell us what’s going on and our team will take a look.
            </p>

            <div className="mt-8 flex max-w-lg gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
                <LockKeyhole size={17} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Your family’s privacy comes first</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-400">
                  Requests are sent securely to the GrowthFlowAI support workspace. Please don’t include passwords, API keys, or private family records in your message.
                </p>
              </div>
            </div>

            <p className="mt-6 max-w-lg text-sm leading-6 text-slate-500">
              For questions about using FamilyTreeAI, the <a href="/faq" className="font-medium text-brand-300 underline decoration-brand-300/40 underline-offset-4 hover:text-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300">FAQ and usage guide</a> may have a quick answer.
            </p>
          </section>

          <section
            aria-labelledby="support-form-heading"
            className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-[0_24px_80px_-44px_rgba(0,0,0,0.85)] sm:p-8"
          >
            {isSubmitted ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center" data-testid="status-support-success">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
                  <Check size={27} strokeWidth={2.5} aria-hidden="true" />
                </span>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Request sent</p>
                <h2 id="support-form-heading" className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">
                  Thank you for reaching out.
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">
                  Your support request has been sent securely. You can return to the FAQ or send another request.
                </p>
                <div className="mt-8 flex flex-col-reverse items-center gap-3 sm:flex-row">
                  <a
                    href="/faq"
                    data-testid="link-success-faq"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
                  >
                    Visit the FAQ
                  </a>
                  <button
                    type="button"
                    onClick={handleSubmitAnother}
                    data-testid="button-submit-another"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
                  >
                    Submit another request
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-7">
                  <h2 id="support-form-heading" className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
                    Send us a message
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Fields marked <span className="text-brand-300" aria-hidden="true">*</span> are required.
                  </p>
                </div>

                <form onSubmit={handleSubmit} noValidate={false}>
                  <div
                    aria-hidden="true"
                    className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
                  >
                    <label htmlFor="support-website">Website</label>
                    <input
                      id="support-website"
                      name="website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="support-name" className="mb-2 block text-sm font-medium text-slate-200">
                        Name <span className="text-brand-300" aria-hidden="true">*</span>
                      </label>
                      <input
                        ref={nameInput}
                        id="support-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        required
                        maxLength={100}
                        value={values.name}
                        onChange={(event) => updateValue('name', event.target.value)}
                        data-testid="input-name"
                        className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 hover:border-slate-600 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/20"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="support-email" className="mb-2 block text-sm font-medium text-slate-200">
                        Email <span className="text-brand-300" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="support-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={values.email}
                        onChange={(event) => updateValue('email', event.target.value)}
                        data-testid="input-email"
                        className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 hover:border-slate-600 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/20"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div className="mt-5">
                    <label htmlFor="support-subject" className="mb-2 block text-sm font-medium text-slate-200">
                      Subject <span className="text-brand-300" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="support-subject"
                      name="subject"
                      type="text"
                      required
                      maxLength={160}
                      value={values.subject}
                      onChange={(event) => updateValue('subject', event.target.value)}
                      data-testid="input-subject"
                      className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 hover:border-slate-600 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/20"
                      placeholder="What can we help with?"
                    />
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <label htmlFor="support-message" className="block text-sm font-medium text-slate-200">
                        Message <span className="text-brand-300" aria-hidden="true">*</span>
                      </label>
                      <span className="text-xs text-slate-500">10–5,000 characters</span>
                    </div>
                    <textarea
                      id="support-message"
                      name="message"
                      required
                      minLength={10}
                      maxLength={5000}
                      rows={6}
                      value={values.message}
                      onChange={(event) => updateValue('message', event.target.value)}
                      data-testid="input-message"
                      className="min-h-36 w-full resize-y rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition-colors placeholder:text-slate-500 hover:border-slate-600 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/20"
                      placeholder="Share a little detail so we can point you in the right direction."
                    />
                  </div>

                  {error && (
                    <p
                      role="alert"
                      aria-live="assertive"
                      data-testid="status-support-error"
                      className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-4 py-3 text-sm leading-6 text-rose-200"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="button-submit-support"
                    className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-wait disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="h-4 w-4 animate-pulse rounded-full bg-slate-950/60" aria-hidden="true" />
                        Sending your request…
                      </>
                    ) : (
                      <>
                        <Send size={16} aria-hidden="true" />
                        Send support request
                      </>
                    )}
                  </button>
                  <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                    Your message is sent securely to our support workspace.
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};
