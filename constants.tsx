import { Person, Gender, TreeData } from './types';
import { User, Users, Baby, Heart, Sparkles, Network, FileText, Plus } from 'lucide-react';

export const INITIAL_DATA: TreeData = {
  rootId: '1',
  people: {
    '1': {
      id: '1',
      firstName: 'Arthur',
      lastName: 'Pendragon',
      gender: Gender.Male,
      birthDate: '1920-05-15',
      birthPlace: 'London, UK',
      bio: 'The patriarch of the family. Served in the navy and loved woodworking.',
      spouseIds: ['2'],
      childrenIds: ['3', '4'],
      fatherId: null,
      motherId: null,
    },
    '2': {
      id: '2',
      firstName: 'Guinevere',
      lastName: 'Pendragon',
      gender: Gender.Female,
      birthDate: '1922-08-20',
      spouseIds: ['1'],
      childrenIds: ['3', '4'],
      fatherId: null,
      motherId: null,
    },
    '3': {
      id: '3',
      firstName: 'Mordred',
      lastName: 'Pendragon',
      gender: Gender.Male,
      birthDate: '1950-02-10',
      spouseIds: [],
      childrenIds: ['5'],
      fatherId: '1',
      motherId: '2',
    },
    '4': {
      id: '4',
      firstName: 'Morgana',
      lastName: 'Le Fay',
      gender: Gender.Female,
      birthDate: '1955-11-30',
      spouseIds: [],
      childrenIds: [],
      fatherId: '1',
      motherId: '2',
    },
    '5': {
      id: '5',
      firstName: 'Galahad',
      lastName: 'Pendragon',
      gender: Gender.Male,
      birthDate: '1980-01-01',
      spouseIds: [],
      childrenIds: [],
      fatherId: '3',
      motherId: null, // Unknown mother
    }
  }
};

export const NAV_ITEMS = [
  { id: 'tree', label: 'Visualize', icon: <Network size={20} /> },
  { id: 'editor', label: 'Manage Records', icon: <Users size={20} /> },
  { id: 'smart-add', label: 'AI Import', icon: <Sparkles size={20} /> },
];