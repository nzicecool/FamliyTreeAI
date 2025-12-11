export enum Gender {
  Male = 'Male',
  Female = 'Female',
  Other = 'Other'
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  bio?: string;
  photo?: string; // Base64 string or URL
  // Relationships
  fatherId?: string | null;
  motherId?: string | null;
  spouseIds: string[];
  childrenIds: string[];
}

export interface TreeData {
  people: Record<string, Person>;
  rootId: string; // The primary ancestor to start the visualization from
}

export interface D3NodeDatum {
  name: string;
  attributes: {
    id: string;
    gender: Gender;
    birthDate?: string;
    birthPlace?: string;
    deathDate?: string;
    deathPlace?: string;
    photo?: string;
  };
  children?: D3NodeDatum[];
}

export type ViewMode = 'editor' | 'tree' | 'smart-add';