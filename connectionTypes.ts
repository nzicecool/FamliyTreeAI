export interface SharedPerson {
  personId: string;
  displayName: string;
  birthYear?: string;
  deathYear?: string;
}
export type ConnectionKind = 'same_person' | 'marriage' | 'other';
export interface PersonConnection {
  id: string;
  local: SharedPerson | null;
  remote: SharedPerson | null;
  kind: ConnectionKind;
  description: string;
  version: number;
  approvedByYou: boolean;
  approvedByOther: boolean;
  active: boolean;
}
export interface LinkedFamily {
  id: string;
  otherFamily: { id: string; name: string };
  connections: PersonConnection[];
}
export interface ConnectionsResponse {
  owner: boolean;
  links: LinkedFamily[];
  invitations: { id: string; expiresAt: string; targetName: string | null }[];
}
export interface ConnectionInput {
  personId: string;
  displayName: string;
  birthYear?: string;
  deathYear?: string;
  kind: ConnectionKind;
  description: string;
  version?: number;
}
export interface VoiceMemory {
  id: string;
  personId: string;
  title: string;
  mimeType: string;
  fileSize: number;
  duration: number;
  createdAt: string;
}
