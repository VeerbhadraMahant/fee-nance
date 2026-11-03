export interface GroupMember {
  userId: { _id: string; name: string; email: string; upiId?: string };
  role: "owner" | "member";
}

export interface Group {
  _id: string;
  name: string;
  inviteCode: string;
  members: GroupMember[];
}

export type SplitType = "equal" | "custom" | "percentage" | "itemized";

export interface GroupExpense {
  _id: string;
  title: string;
  amount: number;
  splitType: SplitType;
  incurredAt: string;
  notes?: string;
  createdBy: string;
  categoryId?: string;
  paidBy: Array<{ userId: string; amount: number }>;
  splits: Array<{ userId: string; amount?: number; percentage?: number; shareAmount: number }>;
  lineItems: Array<{ _id?: string; label: string; amount: number; sharedBy: string[]; proportional?: boolean }>;
}

export interface MemberBalance {
  memberId: string;
  netAmount: number;
  formerMember?: boolean;
}

export interface PairwiseSettlement {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface Settlement {
  _id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  settledAt: string;
  note?: string;
  createdBy: string;
}
