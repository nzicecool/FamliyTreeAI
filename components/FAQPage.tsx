import React, { useEffect } from 'react';
import { ArrowLeft, Leaf } from 'lucide-react';
import { FAQSection } from './FAQSection';
import { SiteFooter } from './SiteFooter';

export const FAQPage: React.FC = () => {
  useEffect(() => {
    const title = document.title;
    document.title = 'FAQ & usage guide | FamilyTreeAI';
    return () => { document.title = title; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <a href="/" className="inline-flex items-center gap-3 font-semibold text-white">
            <Leaf className="text-brand-400" size={24} aria-hidden="true" /> FamilyTreeAI
          </a>
          <a href="/" className="inline-flex items-center gap-2 text-sm text-brand-300 hover:text-white">
            <ArrowLeft size={16} aria-hidden="true" /> Back to FamilyTreeAI
          </a>
        </div>
      </header>
      <main><FAQSection /></main>
      <SiteFooter />
    </div>
  );
};
