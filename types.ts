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

export enum MarriageStatus {
  Married = 'married',
  Divorced = 'divorced',
  Widowed = 'widowed',
  Separated = 'separated',
  Annulled = 'annulled',
}

export const MARRIAGE_STATUS_LABELS: Record<MarriageStatus, string> = {
  [MarriageStatus.Married]: 'Married',
  [MarriageStatus.Divorced]: 'Divorced',
  [MarriageStatus.Widowed]: 'Widowed',
  [MarriageStatus.Separated]: 'Separated',
  [MarriageStatus.Annulled]: 'Annulled',
};

export const MARRIAGE_STATUS_ENDED = new Set<MarriageStatus>([
  MarriageStatus.Divorced,
  MarriageStatus.Widowed,
  MarriageStatus.Annulled,
]);

export interface Marriage {
  id: string;
  person1Id: string;
  person2Id: string;
  marriageDate?: string;
  marriagePlace?: string;
  endDate?: string;
  endPlace?: string;
  status: MarriageStatus;
  notes?: string;
  createdAt?: string;
}

export enum DocumentType {
  BirthCertificate = 'birth_certificate',
  MarriageCertificate = 'marriage_certificate',
  DeathCertificate = 'death_certificate',
  Passport = 'passport',
  CensusRecord = 'census_record',
  Photograph = 'photograph',
  Other = 'other',
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.BirthCertificate]: 'Birth Certificate',
  [DocumentType.MarriageCertificate]: 'Marriage Certificate',
  [DocumentType.DeathCertificate]: 'Death Certificate',
  [DocumentType.Passport]: 'Passport',
  [DocumentType.CensusRecord]: 'Census Record',
  [DocumentType.Photograph]: 'Photograph',
  [DocumentType.Other]: 'Other',
};

export interface PersonDocument {
  id: string;
  personId: string;
  name: string;
  docType: DocumentType;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export type ViewMode = 'editor' | 'tree' | 'smart-add' | 'invites' | 'family' | 'narrative' | 'settings' | 'faq';

export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
  role: 'user' | 'admin' | 'superadmin';
}
