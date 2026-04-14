import React, { useState, useEffect, ReactNode } from 'react';
import { NAV_ITEMS } from './constants';
import { TreeData, Person, ViewMode, Gender, User } from './types';
import { TreeVisualizer } from './components/TreeVisualizer';
import { EditorPanel } from './components/EditorPanel';
import { SmartAdd } from './components/SmartAdd';
import { LoginScreen } from './components/LoginScreen';
import { InviteManager } from './components/InviteManager';
import { storageService } from './services/storageService';
import { generateGedcom } from './services/gedcomService';
import { Leaf, Plus, PanelLeftClose, PanelLeft, LogOut, Loader2, Download, AlertTriangle } from 'lucide-react';
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

function AppContent() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  
  const [user, setUser] = useState<User | null>(null);
  
  // Tree State
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>('tree');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Map Clerk User to App User
  useEffect(() => {
    if (isLoaded && isSignedIn && clerkUser) {
      const email = clerkUser.primaryEmailAddress?.emailAddress || '';
      const SUPERADMIN_EMAIL = 'myozscoop@gmail.com';
      const isSuperAdmin = email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
      
      setUser({
        id: clerkUser.id,
        name: clerkUser.fullName || clerkUser.username || email.split('@')[0],
        email: email,
        photoUrl: clerkUser.imageUrl,
        role: isSuperAdmin ? 'superadmin' : 'user'
      });
    } else if (isLoaded && !isSignedIn) {
      setUser(null);
    }
  }, [isLoaded, isSignedIn, clerkUser]);

  // Initialize Data when User is present
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const data = await storageService.loadTree(getToken);
      setTreeData(data);
    } catch (e) {
      console.error("Failed to load tree data", e);
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
      const newData = { ...prev };
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
    setSelectedPersonId(null);
    setActiveView('tree');
  };

  const handleDeletePerson = async (id: string) => {
    if (!treeData) return;

    const personToDelete = treeData.people[id];
    if (!personToDelete) return;

    setTreeData(prev => {
      if (!prev) return null;
      const newData = { ...prev };
      
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
    await signOut();
    setUser(null);
    setTreeData(null);
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

  if (!isLoaded) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-950 text-brand-500">
        <Loader2 size={48} className="animate-spin" />
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return <LoginScreen onLogin={() => {}} />;
  }

  if (!treeData) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-4">
            <Loader2 size={32} className="animate-spin text-brand-500" />
            <p>Loading your family history...</p>
        </div>
      );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <div className={clsx("flex flex-col border-r border-slate-800 bg-slate-900 transition-all duration-300", isSidebarOpen ? "w-64" : "w-16")}>
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-brand-600 p-2 rounded-lg shrink-0">
            <Leaf size={24} className="text-white" />
          </div>
          {isSidebarOpen && <h1 className="font-bold text-xl tracking-tight text-white whitespace-nowrap">FamilyTreeAI</h1>}
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.filter(item => !item.adminOnly || user.role === 'admin' || user.role === 'superadmin').map(item => (
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
            </h2>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 pr-4 border-r border-slate-800">
                   <div className="text-right hidden sm:block">
                       <div className="text-sm font-medium text-white">{user.name}</div>
                       <div className="text-xs text-slate-400">
                         {user.role === 'superadmin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'Family Member'}
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

        <div className="flex-1 overflow-hidden p-6 relative">
             {activeView === 'tree' && (
                 <TreeVisualizer data={treeData} onSelectPerson={handleSelectPerson} />
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
                    />
                 </div>
             )}

             {activeView === 'smart-add' && (
                 <div className="max-w-2xl mx-auto mt-10">
                    <SmartAdd onParsed={handleSmartAdd} />
                 </div>
             )}

             {activeView === 'invites' && (
                 <InviteManager currentUser={user} />
             )}
        </div>
      </main>
    </div>
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
