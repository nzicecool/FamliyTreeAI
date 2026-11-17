import React from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';

const questions = [
  {
    question: 'How do I start a family workspace?',
    answer:
      'Sign up first, then create a private family or join one you have been invited to. FamilyTreeAI keeps each family’s records in its own shared workspace.',
  },
  {
    question: 'How do I join a relative’s family?',
    answer:
      'Open your invitation link, sign in or create an account using the invited email address, and accept the invitation. Alternatively, choose Join a family, search for a discoverable family, and send a request. Search-based requests need the family owner’s approval before you can access the tree.',
  },
  {
    question: 'Can anyone find or view my family tree?',
    answer:
      'Your tree and personal records are visible only to family members. If the owner opts into discovery, only the family name and description appear in search—not its records or member details. Search requires at least two characters. Requests stay pending until the owner approves them; pending users cannot view the tree.',
  },
  {
    question: 'Who can manage family access?',
    answer:
      'The family owner can manage invitations, membership requests, and discoverability in Family & access. Members who have joined can work with the family’s shared records.',
  },
  {
    question: 'Can more than one relative edit the records?',
    answer:
      'Yes. Members of the same family share its records and can add or edit people and their relationships. Coordinate changes with relatives so the shared history reflects what your family has agreed to preserve.',
  },
  {
    question: 'Where do I add or update a person?',
    answer:
      'Use Add Member in the sidebar to start a new record. Select someone in Visualize to edit their record in Manage Records. Enter details such as dates, places, relationships, and a biography, then save the record to the family workspace.',
  },
  {
    question: 'How do I explore the visual family tree?',
    answer:
      'In Visualize, choose a person to inspect their record or make them the tree root. Use the Ancestors and Descendants controls to change the view, drag empty space to pan, and scroll or use the zoom controls to zoom. You can drag a person node to reposition it.',
  },
  {
    question: 'What does AI Import do?',
    answer:
      'AI Quick Import can extract person details from text you paste, such as an obituary or a short biography. Review the extracted information in the record editor and correct it before saving.',
  },
  {
    question: 'Can AI write a family narrative?',
    answer:
      'AI Family Narrative creates a draft from the records in your family tree. Treat generated text as a starting point: review names, dates, relationships, and other facts with your family before relying on or sharing it.',
  },
  {
    question: 'Do AI features require a key or have a fee?',
    answer:
      'AI availability depends on your selected provider. Check Settings to see which providers are ready; some providers require your own API key. Provider usage may be subject to that provider’s terms or charges.',
  },
  {
    question: 'How can I keep a backup of my family history?',
    answer:
      'Use Export GEDCOM in the sidebar to download your family’s genealogy records for safekeeping or use with compatible genealogy software. This is not a full backup of uploaded files. Store the export securely because it contains personal family information.',
  },
];

export const FAQSection: React.FC = () => (
  <section
    id="faq"
    aria-labelledby="faq-heading"
    className="bg-slate-950 px-5 py-16 text-slate-100 sm:px-8 sm:py-20"
  >
    <div className="mx-auto max-w-4xl">
      <div className="mb-9 max-w-2xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/[.07] px-3 py-1.5 text-xs font-semibold uppercase tracking-[.16em] text-brand-200">
          <CircleHelp size={14} aria-hidden="true" />
          A few useful answers
        </div>
        <h2 id="faq-heading" className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Frequently asked questions
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
          The practical details of building a private family history together.
        </p>
      </div>

      <div className="divide-y divide-slate-800 border-y border-slate-800">
        {questions.map(({ question, answer }, index) => (
          <details key={question} className="group">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-base font-medium text-slate-100 transition-colors marker:hidden hover:text-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300 [&::-webkit-details-marker]:hidden sm:py-6"
            >
              <span className="flex items-start gap-4">
                <span className="mt-0.5 font-mono text-xs tracking-wide text-brand-300/80">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{question}</span>
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className="shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180 group-open:text-brand-300"
              />
            </summary>
            <p className="max-w-3xl pb-5 pl-9 text-sm leading-7 text-slate-400 sm:pb-6 sm:pl-10 sm:text-[15px]">
              {answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  </section>
);
