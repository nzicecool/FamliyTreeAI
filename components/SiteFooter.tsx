import React from 'react';
import { Leaf, Linkedin, Mail, Network } from 'lucide-react';
import { PublicBetaBadge } from './PublicBetaBadge';

interface SiteFooterProps {
  compact?: boolean;
}

const links = {
  faq: '/faq',
  signIn: '/sign-in',
  signUp: '/sign-up',
  company: 'https://senathltd.com',
  privacy: 'https://senathltd.com/privacy',
  terms: 'https://senathltd.com/terms',
  cookies: 'https://senathltd.com/cookies',
  email: 'mailto:support@senathltd.com',
  linkedin: 'https://www.linkedin.com/company/senath-ltd',
};

const externalLinkProps = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

export const SiteFooter: React.FC<SiteFooterProps> = ({ compact = false }) => {
  const currentYear = new Date().getFullYear();

  if (compact) {
    return (
      <footer className="border-t border-slate-800 bg-slate-900 px-5 py-5 text-slate-400 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {currentYear} SENATH Ltd — All Rights Reserved.</p>
          <nav aria-label="Footer links" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.faq}>
              FAQ
            </a>
            <a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.email}>
              Email
            </a>
            <a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.privacy} {...externalLinkProps}>
              Privacy
            </a>
            <a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.terms} {...externalLinkProps}>
              Terms
            </a>
            <a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.cookies} {...externalLinkProps}>
              Cookies
            </a>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-slate-800 bg-slate-900 px-6 py-12 text-slate-300">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <a
              href="/"
              aria-label="FamilyTreeAI home"
              className="inline-flex items-center gap-3 rounded-lg text-white transition-colors hover:text-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
                <Leaf size={21} aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold tracking-tight">FamilyTreeAI<PublicBetaBadge /></span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-400">
              A private shared space for relatives to preserve their family history together.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500">
              <Network size={14} aria-hidden="true" />
              A product of SENATH Ltd
            </p>
          </div>

          <nav aria-label="Quick links">
            <h2 className="text-sm font-semibold text-white">Quick Links</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li><a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.faq}>FAQ</a></li>
              <li><a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.signIn}>Sign in</a></li>
              <li><a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.signUp}>Sign up</a></li>
              <li><a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.company} {...externalLinkProps}>SENATH Ltd</a></li>
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-semibold text-white">Contact Us</h2>
            <a
              href={links.email}
              className="mt-4 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
            >
              <Mail size={16} aria-hidden="true" />
              support@senathltd.com
            </a>
            <a
              href={links.linkedin}
              {...externalLinkProps}
              aria-label="SENATH Ltd on LinkedIn"
              className="mt-4 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 text-slate-300 transition-colors hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
            >
              <Linkedin size={17} aria-hidden="true" />
            </a>
          </div>

          <nav aria-label="Legal">
            <h2 className="text-sm font-semibold text-white">Legal</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li><a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.privacy} {...externalLinkProps}>Privacy Policy</a></li>
              <li><a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.terms} {...externalLinkProps}>Terms of Service</a></li>
              <li><a className="transition-colors hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300" href={links.cookies} {...externalLinkProps}>Cookie Policy</a></li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-slate-800 pt-6 text-xs text-slate-500">
          © {currentYear} SENATH Ltd — All Rights Reserved.
        </div>
      </div>
    </footer>
  );
};
