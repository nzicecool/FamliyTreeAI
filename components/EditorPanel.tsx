import React, { useState, useEffect, useRef } from 'react';
import { Person, Gender } from '../types';
import { generateBio } from '../services/geminiService';
import { Wand2, Save, X, Loader2, Heart, Trash2, Camera, Upload, Image as ImageIcon } from 'lucide-react';

interface EditorPanelProps {
  person: Person | null;
  onSave: (person: Person) => void;
  onCancel: () => void;
  allPeople: Person[];
}

export const EditorPanel: React.FC<EditorPanelProps> = ({ person, onSave, onCancel, allPeople }) => {
  const [formData, setFormData] = useState<Partial<Person>>({
    gender: Gender.Male,
    firstName: '',
    lastName: '',
    spouseIds: [],
    childrenIds: [],
  });
  
  const [generatingBio, setGeneratingBio] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (person) {
      setFormData({ ...person });
    } else {
      // Reset for new entry
      setFormData({
        id: crypto.randomUUID(),
        gender: Gender.Male,
        firstName: '',
        lastName: '',
        spouseIds: [],
        childrenIds: [],
        bio: '',
        birthPlace: '',
        deathPlace: '',
        photo: '',
      });
    }
  }, [person]);

  const handleChange = (field: keyof Person, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (limit to ~2MB for browser storage performance)
      if (file.size > 2 * 1024 * 1024) {
        alert("Image is too large. Please choose an image under 2MB.");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange('photo', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateBio = async () => {
    if (!formData.firstName || !formData.lastName) return;
    setGeneratingBio(true);
    try {
      const bio = await generateBio(formData as Person);
      handleChange('bio', bio);
    } finally {
      setGeneratingBio(false);
    }
  };

  const addSpouse = (spouseId: string) => {
    if (!spouseId) return;
    const currentSpouses = formData.spouseIds || [];
    if (!currentSpouses.includes(spouseId)) {
        handleChange('spouseIds', [...currentSpouses, spouseId]);
    }
  };

  const removeSpouse = (spouseId: string) => {
    const currentSpouses = formData.spouseIds || [];
    handleChange('spouseIds', currentSpouses.filter(id => id !== spouseId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.firstName && formData.lastName) {
        // Ensure arrays are initialized
        const cleanData = {
            ...formData,
            spouseIds: formData.spouseIds || [],
            childrenIds: formData.childrenIds || [],
        }
        onSave(cleanData as Person);
    }
  };

  // Filter potential spouses (exclude self and already selected)
  const availableSpouses = allPeople.filter(p => 
      p.id !== formData.id && 
      !formData.spouseIds?.includes(p.id)
  );

  return (
    <div className="h-full bg-slate-800 border-l border-slate-700 p-6 overflow-y-auto no-scrollbar">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">
          {person ? 'Edit Person' : 'Add Person'}
        </h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-white">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Photo Upload Section */}
        <div className="flex flex-col items-center gap-3">
          <div 
            className="relative group w-28 h-28 rounded-full bg-slate-900 border-2 border-slate-600 flex items-center justify-center overflow-hidden cursor-pointer hover:border-brand-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {formData.photo ? (
              <img src={formData.photo} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <Camera size={32} className="text-slate-500 group-hover:text-brand-400 transition-colors" />
            )}
            
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Upload size={20} className="text-white" />
            </div>
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
          />
          
          <div className="flex gap-2">
             <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium"
             >
               {formData.photo ? 'Change Photo' : 'Upload Photo'}
             </button>
             {formData.photo && (
               <>
                 <span className="text-slate-600">|</span>
                 <button 
                    type="button"
                    onClick={() => handleChange('photo', '')}
                    className="text-xs text-red-400 hover:text-red-300 font-medium"
                 >
                   Remove
                 </button>
               </>
             )}
          </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">First Name</label>
            <input
              type="text"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-brand-500 outline-none"
              value={formData.firstName || ''}
              onChange={e => handleChange('firstName', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Last Name</label>
            <input
              type="text"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-brand-500 outline-none"
              value={formData.lastName || ''}
              onChange={e => handleChange('lastName', e.target.value)}
            />
          </div>
        </div>

        <div>
           <label className="block text-xs font-medium text-slate-400 mb-1">Gender</label>
           <select 
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-brand-500 outline-none"
              value={formData.gender}
              onChange={e => handleChange('gender', e.target.value)}
           >
              <option value={Gender.Male}>Male</option>
              <option value={Gender.Female}>Female</option>
              <option value={Gender.Other}>Other</option>
           </select>
        </div>

        {/* Birth Info */}
        <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Birth Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
              <input
                type="date"
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-brand-500 outline-none"
                value={formData.birthDate || ''}
                onChange={e => handleChange('birthDate', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Place</label>
              <input
                type="text"
                placeholder="City, Country"
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-brand-500 outline-none"
                value={formData.birthPlace || ''}
                onChange={e => handleChange('birthPlace', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Death Info */}
        <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Death Details (Optional)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
              <input
                type="date"
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-brand-500 outline-none"
                value={formData.deathDate || ''}
                onChange={e => handleChange('deathDate', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Place</label>
              <input
                type="text"
                placeholder="City, Country"
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-brand-500 outline-none"
                value={formData.deathPlace || ''}
                onChange={e => handleChange('deathPlace', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Relationships */}
        <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-400">Spouses / Partners</label>
            <div className="flex gap-2">
               <select 
                  className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white outline-none text-sm"
                  onChange={(e) => {
                      addSpouse(e.target.value);
                      e.target.value = "";
                  }}
               >
                  <option value="">+ Add Spouse...</option>
                  {availableSpouses.map(p => (
                      <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                  ))}
               </select>
            </div>
            <div className="flex flex-wrap gap-2">
                {formData.spouseIds?.map(sid => {
                    const spouse = allPeople.find(p => p.id === sid);
                    if (!spouse) return null;
                    return (
                        <div key={sid} className="bg-slate-700 text-slate-200 px-2 py-1 rounded text-sm flex items-center gap-2">
                            <Heart size={12} className="text-pink-400" />
                            {spouse.firstName} {spouse.lastName}
                            <button type="button" onClick={() => removeSpouse(sid)} className="hover:text-white"><X size={14}/></button>
                        </div>
                    )
                })}
            </div>
        </div>

        {/* Biography */}
        <div>
           <div className="flex justify-between items-end mb-1">
              <label className="block text-xs font-medium text-slate-400">Biography</label>
              <button
                type="button"
                onClick={handleGenerateBio}
                disabled={generatingBio || !formData.firstName}
                className="text-xs flex items-center gap-1 text-brand-400 hover:text-brand-300 disabled:opacity-50"
              >
                {generatingBio ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                Generate with AI
              </button>
           </div>
           <textarea
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-brand-500 outline-none h-32 text-sm leading-relaxed"
              value={formData.bio || ''}
              onChange={e => handleChange('bio', e.target.value)}
              placeholder="Write a short biography..."
           />
        </div>

        {/* Actions */}
        <div className="pt-4 flex items-center gap-3 border-t border-slate-700">
          <button
            type="submit"
            className="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Save size={18} />
            Save Record
          </button>
        </div>
      </form>
    </div>
  );
};