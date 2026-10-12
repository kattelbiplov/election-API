import { FamilyRelationType } from '@prisma/client';
import { prisma } from '../../config/db';

// Assembles a household's family tree from VoterRelationship edges, rooted at
// Household.headOfHouseholdId. Split out from households.service.ts because
// it's a distinct recursive-graph concern, not household CRUD — same reason
// households.geo.ts is its own file. See the design note on VoterRelationship
// in prisma/schema.prisma for why SPOUSE/PARENT_OF is enough to represent an
// arbitrarily deep tree (grandchildren, etc.) with no dedicated "grandchild"
// relation type.

const VOTER_SUMMARY_SELECT = {
  id: true,
  fullName: true,
  dateOfBirth: true,
  gender: true,
} as const;

interface FamilyTreeVoter {
  id: string;
  fullName: string;
  dateOfBirth: Date;
  gender: string | null;
}

export interface FamilyTreeNode {
  voter: FamilyTreeVoter;
  children: FamilyTreeNode[];
}

export interface FamilyTree {
  headOfHousehold: FamilyTreeVoter | null;
  spouse: FamilyTreeVoter | null;
  children: FamilyTreeNode[];
  totalFamilyMembers: number;
}

const EMPTY_TREE: FamilyTree = { headOfHousehold: null, spouse: null, children: [], totalFamilyMembers: 0 };

async function findSpouse(voterId: string): Promise<FamilyTreeVoter | null> {
  const relationship = await prisma.voterRelationship.findFirst({
    where: { type: FamilyRelationType.SPOUSE, OR: [{ voterId }, { relatedVoterId: voterId }] },
    include: {
      voter: { select: VOTER_SUMMARY_SELECT },
      relatedVoter: { select: VOTER_SUMMARY_SELECT },
    },
  });
  if (!relationship) return null;
  return relationship.voterId === voterId ? relationship.relatedVoter : relationship.voter;
}

// `visited` guards against an accidental cycle in PARENT_OF edges (not
// expected from normal UI use, but a recursive walk needs a hard stop
// regardless — see the schema's design note on why cycles aren't actively
// detected/prevented on write).
async function buildDescendants(voterId: string, visited: Set<string>): Promise<FamilyTreeNode[]> {
  const childRelationships = await prisma.voterRelationship.findMany({
    where: { voterId, type: FamilyRelationType.PARENT_OF },
    include: { relatedVoter: { select: VOTER_SUMMARY_SELECT } },
  });

  const nodes: FamilyTreeNode[] = [];
  for (const relationship of childRelationships) {
    if (visited.has(relationship.relatedVoterId)) continue;
    visited.add(relationship.relatedVoterId);
    const grandchildren = await buildDescendants(relationship.relatedVoterId, visited);
    nodes.push({ voter: relationship.relatedVoter, children: grandchildren });
  }
  return nodes;
}

function countNodes(nodes: FamilyTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
}

export async function buildFamilyTree(headOfHouseholdId: string | null): Promise<FamilyTree> {
  if (!headOfHouseholdId) return EMPTY_TREE;

  const head = await prisma.voter.findUnique({
    where: { id: headOfHouseholdId },
    select: VOTER_SUMMARY_SELECT,
  });
  if (!head) return EMPTY_TREE; // stale reference (e.g. head was deleted) — treat as unset rather than error

  const spouse = await findSpouse(headOfHouseholdId);
  const visited = new Set<string>([headOfHouseholdId, ...(spouse ? [spouse.id] : [])]);
  const children = await buildDescendants(headOfHouseholdId, visited);

  return {
    headOfHousehold: head,
    spouse,
    children,
    totalFamilyMembers: 1 + (spouse ? 1 : 0) + countNodes(children),
  };
}
