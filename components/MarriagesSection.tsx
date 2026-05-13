import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  Marriage, MarriageStatus, MARRIAGE_STATUS_LABELS, MARRIAGE_STATUS_ENDED, Person,
} from '../types';
import { marriageService } from '../services/marriageService';
import { Heart, Plus, Trash2, ChevronDown, ChevronUp, Loader2, Save, X } from 'lucide-react';

interface MarriagesSectionProps {
  personId: string;
  allPeople: Person[];
  onChanged: () => void;
}

const STATUS_COLORS: Record<MarriageStatus, string> = {
  [MarriageStatus.Married]:   'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  [MarriageStatus.Divorced]:  'text-amber-400  bg-amber-500/15  border-amber-500/30',
  [MarriageStatus.Widowed]:   'text-slate-400  bg-slate-500/15  border-slate-500/30',
  [MarriageStatus.Separated]: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  [MarriageStatus.Annulled]:  'text-red-400    bg-red-500/15    border-red-500/30',
};

const EMPTY_FORM = {
  marriageDate: '',
  marriagePlace: '',
  endDate: '',
  endPlace: '',
  status: MarriageStatus.Married as MarriageStatus,
  notes: '',
};

export const MarriagesSection: React.FC<MarriagesSectionProps> = ({ personId, allPeople, onChanged }) => {
  const { getToken } = useAuth();

  const [marriages, setMarriages] = useState<Marriage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<string, typeof EMPTY_FORM>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addSpouseId, setAddSpouseId] = useState('');
  const [addForm, setAddForm] = useState({ ...EMPTY_FORM });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    marriageService.listForPerson(personId, getToken)
      .then(list => { if (!cancelled) setMarriages(list); })
      .catch(err => console.error('Load marriages error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personId]);

  const spouseIdsInMarriages = new Set(
    marriages.map(m => m.person1Id === personId ? m.person2Id : m.person1Id)
  );
  const availablePeople = allPeople.filter(p => p.id !== personId && !spouseIdsInMarriages.has(p.id));

  const spouseName = (m: Marriage) => {
    const sid = m.person1Id === personId ? m.person2Id : m.person1Id;
    const sp = allPeople.find(p => p.id === sid);
    return sp ? `${sp.firstName} ${sp.lastName}` : 'Unknown';
  };

  const dateRange = (m: Marriage) => {
    const start = m.marriageDate || '?';
    if (MARRIAGE_STATUS_ENDED.has(m.status) && m.endDate) return `${start} – ${m.endDate}`;
    if (MARRIAGE_STATUS_ENDED.has(m.status)) return `${start} – ended`;
    return m.marriageDate || '';
  };

  const toggleExpand = (id: string, m: Marriage) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!editForms[id]) {
        setEditForms(prev => ({
          ...prev,
          [id]: {
            marriageDate: m.marriageDate || '',
            marriagePlace: m.marriagePlace || '',
            endDate: m.endDate || '',
            endPlace: m.endPlace || '',
            status: m.status,
            notes: m.notes || '',
          },
        }));
      }
    }
  };

  const updateEditForm = (id: string, field: string, value: string) => {
    setEditForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSaveEdit = async (id: string) => {
    const form = editForms[id];
    if (!form) return;
    setSavingId(id);
    try {
      const updated = await marriageService.update(id, {
        marriageDate: form.marriageDate || undefined,
        marriagePlace: form.marriagePlace || undefined,
        endDate: form.endDate || undefined,
        endPlace: form.endPlace || undefined,
        status: form.status,
        notes: form.notes || undefined,
      }, getToken);
      setMarriages(prev => prev.map(m => m.id === id ? updated : m));
      setExpandedId(null);
      onChanged();
    } catch (err: any) {
      console.error('Save marriage error:', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await marriageService.remove(id, getToken);
      setMarriages(prev => prev.filter(m => m.id !== id));
      if (expandedId === id) setExpandedId(null);
      onChanged();
    } catch (err: any) {
      console.error('Delete marriage error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdd = async () => {
    if (!addSpouseId) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await marriageService.create({
        person1Id: personId,
        person2Id: addSpouseId,
        marriageDate: addForm.marriageDate || undefined,
        marriagePlace: addForm.marriagePlace || undefined,
        status: addForm.status,
      }, getToken);
      setMarriages(prev => [...prev, created]);
      setAddOpen(false);
      setAddSpouseId('');
      setAddForm({ ...EMPTY_FORM });
      onChanged();
    } catch (err: any) {
      setAddError(err.message || 'Failed to add marriage.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
      <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
        <Heart size={14} className="text-pink-400" />
        Marriages
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {marriages.length === 0 && !addOpen && (
            <p className="text-xs text-slate-500">No marriages recorded yet.</p>
          )}

          <div className="space-y-2">
            {marriages.map(m => {
              const isExpanded = expandedId === m.id;
              const form = editForms[m.id];
              const ended = MARRIAGE_STATUS_ENDED.has(m.status);
              return (
                <div key={m.id} className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                  {/* Row */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Heart size={12} className={ended ? 'text-slate-500' : 'text-pink-400'} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white font-medium">{spouseName(m)}</span>
                      {dateRange(m) && (
                        <span className="ml-2 text-xs text-slate-500">{dateRange(m)}</span>
                      )}
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_COLORS[m.status as MarriageStatus]}`}>
                      {MARRIAGE_STATUS_LABELS[m.status as MarriageStatus]}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpand(m.id, m)}
                      className="text-slate-400 hover:text-white transition-colors"
                      title="Edit details"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      className="text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Delete marriage"
                    >
                      {deletingId === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>

                  {/* Edit form */}
                  {isExpanded && form && (
                    <div className="border-t border-slate-700 p-3 space-y-3 bg-slate-950/40">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Marriage Date</label>
                          <input type="date" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                            value={form.marriageDate} onChange={e => updateEditForm(m.id, 'marriageDate', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Marriage Place</label>
                          <input type="text" placeholder="City, Country" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                            value={form.marriagePlace} onChange={e => updateEditForm(m.id, 'marriagePlace', e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Status</label>
                        <select className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                          value={form.status} onChange={e => updateEditForm(m.id, 'status', e.target.value as MarriageStatus)}>
                          {Object.values(MarriageStatus).map(s => (
                            <option key={s} value={s}>{MARRIAGE_STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </div>
                      {MARRIAGE_STATUS_ENDED.has(form.status as MarriageStatus) && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-1">End Date</label>
                            <input type="date" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                              value={form.endDate} onChange={e => updateEditForm(m.id, 'endDate', e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-1">End Place</label>
                            <input type="text" placeholder="City, Country" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                              value={form.endPlace} onChange={e => updateEditForm(m.id, 'endPlace', e.target.value)} />
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Notes</label>
                        <textarea className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500 h-14 resize-none"
                          placeholder="Optional notes about this marriage…"
                          value={form.notes} onChange={e => updateEditForm(m.id, 'notes', e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleSaveEdit(m.id)} disabled={savingId === m.id}
                          className="flex items-center gap-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors">
                          {savingId === m.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save
                        </button>
                        <button type="button" onClick={() => setExpandedId(null)}
                          className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded transition-colors">
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add marriage */}
          {addOpen ? (
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Add Marriage</span>
                <button type="button" onClick={() => { setAddOpen(false); setAddError(null); }}
                  className="text-slate-500 hover:text-white"><X size={14} /></button>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Spouse / Partner</label>
                <select className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                  value={addSpouseId} onChange={e => setAddSpouseId(e.target.value)}>
                  <option value="">Select a person…</option>
                  {availablePeople.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Marriage Date</label>
                  <input type="date" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                    value={addForm.marriageDate} onChange={e => setAddForm(f => ({ ...f, marriageDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Marriage Place</label>
                  <input type="text" placeholder="City, Country" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                    value={addForm.marriagePlace} onChange={e => setAddForm(f => ({ ...f, marriagePlace: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Status</label>
                <select className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-brand-500"
                  value={addForm.status} onChange={e => setAddForm(f => ({ ...f, status: e.target.value as MarriageStatus }))}>
                  {Object.values(MarriageStatus).map(s => (
                    <option key={s} value={s}>{MARRIAGE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
              <button type="button" onClick={handleAdd} disabled={adding || !addSpouseId}
                className="w-full flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded transition-colors">
                {adding ? <Loader2 size={12} className="animate-spin" /> : <Heart size={12} />}
                Record Marriage
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors">
              <Plus size={13} /> Add Marriage
            </button>
          )}
        </>
      )}
    </div>
  );
};
