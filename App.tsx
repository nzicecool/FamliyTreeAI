import React, { useState, useEffect } from 'react';
import { NAV_ITEMS } from './constants';
import { TreeData, Person, ViewMode, Gender } from './types';
import { TreeVisualizer } from './components/TreeVisualizer';
import { EditorPanel } from './components/EditorPanel';
import { SmartAdd } from './components/SmartAdd';
import { LoginScreen } from './components/LoginScreen';
import { authService, User } from './services/authService';
import { storageService } from './services/storageService';
import { generateGedcom } from './services/gedcomService';
import { Leaf, Plus, PanelLeftClose, PanelLeft, LogOut, Loader2, Download } from 'lucide-react';
import clsx from 'clsx';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Tree State
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>('tree');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Initialize Auth
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    setLoading(false);
  }, []);

  // Initialize Data when User is present
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const data = await storageService.loadTree();
      setTreeData(data);
    } catch (e) {
      console.error("Failed to load tree data", e);
    }
  };

  // Helper to get array of people
  const peopleList = treeData ? (Object.values(treeData.people) as Person[]) : [];

  const handleSavePerson = async (updatedPerson: Person) => {
    if (!treeData) return;

    // Get the previous version of this person (if exists) to check for removed spouses
    const oldPerson = treeData.people[updatedPerson.id];
    const oldSpouseIds = oldPerson ? oldPerson.spouseIds : [];
    const newSpouseIds = updatedPerson.spouseIds;

    // 1. Identify Removed Spouses: IDs in old but not in new
    const removedSpouseIds = oldSpouseIds.filter(id => !newSpouseIds.includes(id));
    
    // 2. Identify Added Spouses: IDs in new but not in old
    const addedSpouseIds = newSpouseIds.filter(id => !oldSpouseIds.includes(id));

    // Optimistic Update
    setTreeData(prev => {
      if (!prev) return null;
      const newData = { ...prev };
      
      // Update Main Person
      newData.people[updatedPerson.id] = updatedPerson;
      
      // Update Parent links (Children pointers)
      if (updatedPerson.fatherId && newData.people[updatedPerson.fatherId]) {
         const father = newData.people[updatedPerson.fatherId];
         if (!father.childrenIds.includes(updatedPerson.id)) {
            father.childrenIds = [...father.childrenIds, updatedPerson.id];
            storageService.savePerson(father); // Background save
         }
      }
      if (updatedPerson.motherId && newData.people[updatedPerson.motherId]) {
         const mother = newData.people[updatedPerson.motherId];
         if (!mother.childrenIds.includes(updatedPerson.id)) {
            mother.childrenIds = [...mother.childrenIds, updatedPerson.id];
            storageService.savePerson(mother); // Background save
         }
      }

      // Handle Reciprocal Spouse Unlinking
      removedSpouseIds.forEach(exSpouseId => {
          const exSpouse = newData.people[exSpouseId];
          if (exSpouse) {
              exSpouse.spouseIds = exSpouse.spouseIds.filter(id => id !== updatedPerson.id);
              storageService.savePerson(exSpouse);
          }
      });

      // Handle Reciprocal Spouse Linking
      addedSpouseIds.forEach(newSpouseId => {
          const newSpouse = newData.people[newSpouseId];
          if (newSpouse && !newSpouse.spouseIds.includes(updatedPerson.id)) {
              newSpouse.spouseIds = [...newSpouse.spouseIds, updatedPerson.id];
              storageService.savePerson(newSpouse);
          }
      });

      return newData;
    });

    // Persist Main Person to DB
    await storageService.savePerson(updatedPerson);

    setSelectedPersonId(null);
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
    
    // Optimistic update
    setTreeData(prev => {
        if(!prev) return null;
        return {
            ...prev,
            people: { ...prev.people, [newPerson.id]: newPerson }
        }
    });

    // Save to DB immediately so it exists for editing
    await storageService.savePerson(newPerson);

    setSelectedPersonId(newPerson.id);
    setActiveView('editor');
  };

  const handleLogout = async () => {
    await authService.logout();
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

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-950 text-brand-500">
        <Loader2 size={48} className="animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={() => setUser(authService.getCurrentUser())} />;
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
            </h2>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 pr-4 border-r border-slate-800">
                   <div className="text-right hidden sm:block">
                       <div className="text-sm font-medium text-white">{user.name}</div>
                       <div className="text-xs text-slate-400">Free Plan</div>
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
        </div>
      </main>
    </div>
  );
}

export default App;