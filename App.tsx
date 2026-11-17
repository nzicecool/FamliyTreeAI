import React, { useState, useEffect, useMemo } from 'react';
import { NAV_ITEMS } from './constants';
import { TreeData, Person, ViewMode, Gender, User, Marriage } from './types';
import { TreeVisualizer } from './components/TreeVisualizer';
import { EditorPanel } from './components/EditorPanel';
import { SmartAdd } from './components/SmartAdd';
import { LoginScreen } from './components/LoginScreen';
import { FamilyManager } from './components/FamilyManager';
import { FamilyGate } from './components/FamilyGate';
import { FAQSection } from './components/FAQSection';
import { SiteFooter } from './components/SiteFooter';
import { Family } from './familyTypes';
import { NarrativeView } from './components/NarrativeView';
import { SettingsView } from './components/SettingsView';
import { storageService } from './services/storageService';
import { marriageService } from './services/marriageService';
import { generateGedcom } from './services/gedcomService';
import { Leaf, Plus, PanelLeftClose, PanelLeft, LogOut, Loader2, Download, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useUser, useAuth, useClerk } from '@clerk/clerk-react';

// Error Boundary Component
class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error?.message || "");
        if (parsedError.error) {
          errorMessage = `Firestore Error: ${parsedError.error} during ${parsedError.operationType} on ${parsedError.path}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-6 text-center">
          <AlertTriangle size={48} className="text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Oops! An error occurred</h1>
          <p className="text-slate-400 mb-6 max-w-md">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const FamilyTreeApp: React.FC<{
  user: User; family: Family; onFamilyChanged: () => Promise<void>; onBrowse: () => void;
}> = ({ user, family, onFamilyChanged, onBrowse }) => {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [dataError, setDataError] = useState('');
  
  // Tree State
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [marriages, setMarriages] = useState<Marriage[]>([]);
  const [activeView, setActiveView] = useState<ViewMode>('tree');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('familytree:sidebar-open');
    return stored === null ? true : stored === '1';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('familytree:sidebar-open', isSidebarOpen ? '1' : '0');
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    void loadData();
  }, [user.id, family.id]);

  useEffect(() => {
    if (activeView !== 'tree') return;
    const refresh = () => { if (!document.hidden) void loadData(); };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [activeView, family.id]);

  const loadData = async () => {
    try {
      const [data, marriageList] = await Promise.all([
        storageService.loadTree(getToken),
        marriageService.listAll(getToken),
      ]);
      setTreeData(data);
      setMarriages(marriageList);
      setDataError('');
    } catch (e) {
      console.error("Failed to load tree data", e);
      setDataError(e instanceof Error ? e.message : 'Could not load this family’s records.');
    }
  };

  const handleMarriagesChanged = async () => {
    // Reload both tree (spouseIds updated server-side) and marriages list.
    try {
      const [data, marriageList] = await Promise.all([
        storageService.loadTree(getToken),
        marriageService.listAll(getToken),
      ]);
      setTreeData(data);
      setMarriages(marriageList);
    } catch (e) {
      console.error("Failed to reload after marriage change", e);
      setDataError(e instanceof Error ? e.message : 'Could not refresh marriage records.');
    }
  };

  // Helper to get array of people
  const peopleList = treeData ? (Object.values(treeData.people) as Person[]) : [];

  const handleSavePerson = async (updatedPerson: Person) => {
    if (!treeData) return;

    const oldPerson = treeData.people[updatedPerson.id];
    const oldSpouseIds = oldPerson ? oldPerson.spouseIds : [];
    const newSpouseIds = updatedPerson.spouseIds;
    const removedSpouseIds = oldSpouseIds.filter(id => !newSpouseIds.includes(id));
    const addedSpouseIds = newSpouseIds.filter(id => !oldSpouseIds.includes(id));

    const oldFatherId = oldPerson ? oldPerson.fatherId : null;
    const newFatherId = updatedPerson.fatherId;
    const oldMotherId = oldPerson ? oldPerson.motherId : null;
    const newMotherId = updatedPerson.motherId;

    // Optimistic Update
    setTreeData(prev => {
      if (!prev) return null;
      const newData = { ...prev, people: { ...prev.people } };
      newData.people[updatedPerson.id] = updatedPerson;
      
      if (oldFatherId !== newFatherId) {
          if (oldFatherId && newData.people[oldFatherId]) {
              const oldFather = { ...newData.people[oldFatherId] };
              oldFather.childrenIds = oldFather.childrenIds.filter(id => id !== updatedPerson.id);
              newData.people[oldFatherId] = oldFather;
              storageService.savePerson(oldFather, getToken);
          }
          if (newFatherId && newData.people[newFatherId]) {
              const newFather = { ...newData.people[newFatherId] };
              if (!newFather.childrenIds.includes(updatedPerson.id)) {
                  newFather.childrenIds = [...newFather.childrenIds, updatedPerson.id];
                  newData.people[newFatherId] = newFather;
                  storageService.savePerson(newFather, getToken);
              }
          }
      }

      if (oldMotherId !== newMotherId) {
          if (oldMotherId && newData.people[oldMotherId]) {
              const oldMother = { ...newData.people[oldMotherId] };
              oldMother.childrenIds = oldMother.childrenIds.filter(id => id !== updatedPerson.id);
              newData.people[oldMotherId] = oldMother;
              storageService.savePerson(oldMother, getToken);
          }
          if (newMotherId && newData.people[newMotherId]) {
              const newMother = { ...newData.people[newMotherId] };
              if (!newMother.childrenIds.includes(updatedPerson.id)) {
                  newMother.childrenIds = [...newMother.childrenIds, updatedPerson.id];
                  newData.people[newMotherId] = newMother;
                  storageService.savePerson(newMother, getToken);
              }
          }
      }

      removedSpouseIds.forEach(exSpouseId => {
          const exSpouse = newData.people[exSpouseId];
          if (exSpouse) {
              const updatedEx = { ...exSpouse };
              updatedEx.spouseIds = updatedEx.spouseIds.filter(id => id !== updatedPerson.id);
              newData.people[exSpouseId] = updatedEx;
              storageService.savePerson(updatedEx, getToken);
          }
      });

      addedSpouseIds.forEach(newSpouseId => {
          const newSpouse = newData.people[newSpouseId];
          if (newSpouse && !newSpouse.spouseIds.includes(updatedPerson.id)) {
              const updatedNew = { ...newSpouse };
              updatedNew.spouseIds = [...updatedNew.spouseIds, updatedPerson.id];
              newData.people[newSpouseId] = updatedNew;
              storageService.savePerson(updatedNew, getToken);
          }
      });

      return newData;
    });

    await storageService.savePerson(updatedPerson, getToken);
    if (!treeData.rootId) {
      await storageService.saveTreeMeta(updatedPerson.id, getToken);
      setTreeData(prev => prev ? { ...prev, rootId: updatedPerson.id } : prev);
    }
    setSelectedPersonId(null);
    setActiveView('tree');
  };

  const handleDeletePerson = async (id: string) => {
    if (!treeData) return;

    const personToDelete = treeData.people[id];
    if (!personToDelete) return;

    setTreeData(prev => {
      if (!prev) return null;
      const newData = { ...prev, people: { ...prev.people } };
      
      personToDelete.spouseIds.forEach(sid => {
          const spouse = newData.people[sid];
          if (spouse) {
              const updatedSpouse = { ...spouse };
              updatedSpouse.spouseIds = updatedSpouse.spouseIds.filter(pid => pid !== id);
              newData.people[sid] = updatedSpouse;
              storageService.savePerson(updatedSpouse, getToken);
          }
      });

      if (personToDelete.fatherId && newData.people[personToDelete.fatherId]) {
          const father = { ...newData.people[personToDelete.fatherId] };
          father.childrenIds = father.childrenIds.filter(cid => cid !== id);
          newData.people[personToDelete.fatherId] = father;
          storageService.savePerson(father, getToken);
      }
      if (personToDelete.motherId && newData.people[personToDelete.motherId]) {
          const mother = { ...newData.people[personToDelete.motherId] };
          mother.childrenIds = mother.childrenIds.filter(cid => cid !== id);
          newData.people[personToDelete.motherId] = mother;
          storageService.savePerson(mother, getToken);
      }

      personToDelete.childrenIds.forEach(cid => {
          const child = newData.people[cid];
          if (child) {
              const updatedChild = { ...child };
              if (updatedChild.fatherId === id) updatedChild.fatherId = null;
              if (updatedChild.motherId === id) updatedChild.motherId = null;
              newData.people[cid] = updatedChild;
              storageService.savePerson(updatedChild, getToken);
          }
      });

      delete newData.people[id];

      if (newData.rootId === id) {
          const remainingIds = Object.keys(newData.people);
          const newRootId = remainingIds.length > 0 ? remainingIds[0] : '';
          newData.rootId = newRootId;
          if (newRootId) storageService.saveTreeMeta(newRootId, getToken);
      }

      return newData;
    });

    await storageService.deletePerson(id, getToken);
    setSelectedPersonId(null);
    setActiveView('tree');
  };

  const handleSetRoot = async (id: string) => {
    setTreeData(prev => {
        if (!prev) return null;
        return { ...prev, rootId: id };
    });
    await storageService.saveTreeMeta(id, getToken);
    setActiveView('tree');
  };

  const handleSmartAdd = async (partialPerson: Partial<Person>) => {
    const newPerson: Person = {
      id: crypto.randomUUID(),
      firstName: partialPerson.firstName || 'Unknown',
      lastName: partialPerson.lastName || 'Unknown',
      gender: (partialPerson.gender as Gender) || Gender.Other,
      spouseIds: [],
      childrenIds: [],
      birthDate: partialPerson.birthDate,
      birthPlace: partialPerson.birthPlace,
      deathDate: partialPerson.deathDate,
      deathPlace: partialPerson.deathPlace,
      bio: partialPerson.bio,
      fatherId: null,
      motherId: null,
    };
    
    setTreeData(prev => {
        if(!prev) return null;
        return {
            ...prev,
            people: { ...prev.people, [newPerson.id]: newPerson }
        }
    });

    await storageService.savePerson(newPerson, getToken);
    setSelectedPersonId(newPerson.id);
    setActiveView('editor');
  };

  const handleLogout = async () => {
    await signOut({ redirectUrl: '/' });
  };

  const handleSelectPerson = (id: string) => {
    setSelectedPersonId(id);
    setActiveView('editor');
  };

  const createNewPerson = () => {
    setSelectedPersonId(null);
    setActiveView('editor');
  };

  const handleExportGedcom = () => {
      if (!treeData) return;
      const gedcomString = generateGedcom(treeData);
      const blob = new Blob([gedcomString], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `family_tree_${new Date().toISOString().split('T')[0]}.ged`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  if (!treeData) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-4">
            {dataError ? (
              <>
                <p role="alert" className="max-w-md text-center text-rose-300">{dataError}</p>
                <button onClick={() => void loadData()} className="rounded-lg bg-brand-600 px-4 py-2 text-white">Try again</button>
                <button onClick={onBrowse}>Choose another family</button>
                <button onClick={handleLogout}>Sign out</button>
              </>
            ) : <><Loader2 size={32} className="animate-spin text-brand-500" /><p>Loading your family history...</p></>}
        </div>
      );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <div className={clsx("relative flex flex-col border-r border-slate-800 bg-slate-900 transition-all duration-300", isSidebarOpen ? "w-64" : "w-16")}>
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-brand-600 p-2 rounded-lg shrink-0">
            <Leaf size={24} className="text-white" />
          </div>
          {isSidebarOpen && <h1 className="font-bold text-xl tracking-tight text-white whitespace-nowrap">FamilyTreeAI</h1>}
        </div>

        {/* Floating collapse handle on the right edge */}
        <button
          type="button"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-6 z-20 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center shadow-lg transition-colors"
          title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id as ViewMode)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors",
                activeView === item.id
                  ? "bg-brand-900/50 text-brand-400 border border-brand-800"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
              title={!isSidebarOpen ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {isSidebarOpen && <span className="font-medium whitespace-nowrap">{item.label}</span>}
            </button>
          ))}
          
          <div className="border-t border-slate-800 my-2"></div>

           <button
              onClick={handleExportGedcom}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              title={!isSidebarOpen ? "Export GEDCOM" : undefined}
            >
              <span className="shrink-0"><Download size={20} /></span>
              {isSidebarOpen && <span className="font-medium whitespace-nowrap">Export GEDCOM</span>}
            </button>

        </nav>

        <div className="p-4 border-t border-slate-800">
            <button 
              onClick={createNewPerson}
              className={clsx(
                  "w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-brand-600 text-white p-3 rounded-lg transition-all mb-4",
                  !isSidebarOpen && "aspect-square p-0"
              )}
              title="Add Person Manually"
            >
                <Plus size={20} />
                {isSidebarOpen && <span className="whitespace-nowrap">Add Member</span>}
            </button>
            
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-full flex justify-center p-2 text-slate-500 hover:text-slate-300"
            >
              {isSidebarOpen ? <PanelLeftClose size={20}/> : <PanelLeft size={20} />}
            </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex items-center justify-between px-6 shrink-0">
            <h2 className="text-lg font-medium text-white">
                {activeView === 'tree' && 'Family Tree Visualization'}
                {activeView === 'editor' && 'Record Management'}
                {activeView === 'smart-add' && 'AI Quick Import'}
                {activeView === 'narrative' && 'AI Family Narrative'}
                {activeView === 'settings' && 'Settings'}
                {activeView === 'faq' && 'FAQ & help'}
                {(activeView === 'family' || activeView === 'invites') && 'Family & access'}
            </h2>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 pr-4 border-r border-slate-800">
                   <div className="text-right hidden sm:block">
                       <div className="text-sm font-medium text-white">{user.name}</div>
                       <div className="text-xs text-slate-400">
                         {family.name} · {family.role === 'owner' ? 'Owner' : 'Member'}
                       </div>
                   </div>
                   <img src={user.photoUrl} alt="User" className="w-8 h-8 rounded-full border border-slate-600" />
                </div>
                <button 
                    onClick={handleLogout}
                    className="text-slate-400 hover:text-white transition-colors"
                    title="Sign Out"
                >
                    <LogOut size={20} />
                </button>
            </div>
        </header>

        {dataError && <p role="alert" className="bg-rose-950 px-6 py-2 text-sm text-rose-200">{dataError}</p>}
        <div className="flex-1 overflow-hidden p-4 sm:p-6 relative">
             {activeView === 'tree' && Object.keys(treeData.people).length === 0 && (
               <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                 <Leaf size={40} className="text-brand-400" />
                 <h3 className="text-xl font-semibold text-white">Start {family.name}’s story</h3>
                 <p className="max-w-md text-slate-400">Your new family tree is empty. Add the first person to begin.</p>
                 <button onClick={createNewPerson} className="rounded-xl bg-brand-600 px-5 py-3 text-white hover:bg-brand-500">Add first person</button>
                 <button onClick={() => setActiveView('family')} className="text-brand-300">Invite your relatives</button>
               </div>
             )}
             {activeView === 'tree' && Object.keys(treeData.people).length > 0 && (
                 <TreeVisualizer
                    data={treeData}
                    marriages={marriages}
                    onSelectPerson={handleSelectPerson}
                    onSetRoot={handleSetRoot}
                 />
             )}

             {activeView === 'editor' && (
                 <div className="h-full max-w-4xl mx-auto bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
                    <EditorPanel 
                        person={selectedPersonId ? treeData.people[selectedPersonId] : null} 
                        onSave={handleSavePerson}
                        onDelete={handleDeletePerson}
                        onSetRoot={handleSetRoot}
                        onCancel={() => setActiveView('tree')}
                        allPeople={peopleList}
                        onMarriagesChanged={handleMarriagesChanged}
                    />
                 </div>
             )}

             {activeView === 'smart-add' && (
                 <div className="max-w-2xl mx-auto mt-10">
                    <SmartAdd onParsed={handleSmartAdd} />
                 </div>
             )}

             {activeView === 'narrative' && (
                 <NarrativeView data={treeData} />
             )}

             {activeView === 'settings' && (
                 <SettingsView />
             )}

             {activeView === 'faq' && (
                 <div className="h-full overflow-y-auto"><FAQSection /></div>
             )}

             {(activeView === 'family' || activeView === 'invites') && (
                 <div className="h-full overflow-y-auto">
                   <FamilyManager family={family} onChanged={onFamilyChanged} onBrowse={onBrowse} />
                 </div>
             )}
        </div>
        <div className="shrink-0"><SiteFooter compact /></div>
      </main>
    </div>
  );
}

function AppContent() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const user = useMemo<User | null>(() => {
    if (!clerkUser || !isSignedIn) return null;
    const email = clerkUser.primaryEmailAddress?.emailAddress || '';
    return {
      id: clerkUser.id,
      name: clerkUser.fullName || clerkUser.username || email.split('@')[0],
      email,
      photoUrl: clerkUser.imageUrl,
      role: email.toLowerCase() === 'myozscoop@gmail.com' ? 'superadmin' : 'user',
    };
  }, [clerkUser, isSignedIn]);

  if (!isLoaded) return <div className="h-screen bg-slate-950 text-brand-400 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!user) return <LoginScreen onLogin={() => {}} />;
  return (
    <FamilyGate key={user.id}>
      {(family, onChanged, onBrowse) => (
        <FamilyTreeApp key={`${user.id}:${family.id}`} user={user} family={family} onFamilyChanged={onChanged} onBrowse={onBrowse} />
      )}
    </FamilyGate>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
