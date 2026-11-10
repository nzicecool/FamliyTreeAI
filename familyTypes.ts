export interface PublicFamily {
  id: string;
  name: string;
  description: string;
}

export interface Family extends PublicFamily {
  discoverable: boolean;
  role: 'owner' | 'member';
}

export interface ReceivedInvitation {
  id: string;
  familyId: string;
  familyName: string;
  expiresAt: string;
}

export interface MyJoinRequest {
  id: string;
  familyId: string;
  familyName: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface FamilyContext {
  families: Family[];
  activeFamilyId: string | null;
  invitations: ReceivedInvitation[];
  requests: MyJoinRequest[];
}

export interface FamilyDetails {
  members: { userId: string; name: string; email: string; role: 'owner' | 'member' }[];
  invitations: { id: string; email: string; status: 'pending' | 'accepted' | 'revoked'; expiresAt: string }[];
  requests: { id: string; name: string; email: string; message: string; status: 'pending' | 'approved' | 'rejected' }[];
}

export interface FamilyInput {
  name: string;
  description: string;
  discoverable: boolean;
}
