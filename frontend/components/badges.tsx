import { Badge, type BadgeColor } from "@/components/ui/badge";
import type { Invite } from "@/lib/types";

const severityColors: Record<string, BadgeColor> = {
  info: "slate",
  low: "blue",
  medium: "amber",
  high: "orange",
  critical: "red",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge color={severityColors[severity] ?? "slate"} className="capitalize">
      {severity}
    </Badge>
  );
}

const reportStatusColors: Record<string, BadgeColor> = {
  new: "blue",
  triaging: "amber",
  duplicate: "slate",
  informative: "violet",
  accepted: "green",
  resolved: "green",
};

export function ReportStatusBadge({ status }: { status: string }) {
  return (
    <Badge color={reportStatusColors[status] ?? "slate"} className="capitalize">
      {status}
    </Badge>
  );
}

const programStatusColors: Record<string, BadgeColor> = {
  draft: "slate",
  active: "green",
  paused: "amber",
  closed: "red",
};

export function ProgramStatusBadge({ status }: { status: string }) {
  return (
    <Badge color={programStatusColors[status] ?? "slate"} className="capitalize">
      {status}
    </Badge>
  );
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  return (
    <Badge color={visibility === "public" ? "indigo" : visibility === "internal" ? "violet" : "slate"} className="capitalize">
      {visibility}
    </Badge>
  );
}

const researcherStatusColors: Record<string, BadgeColor> = {
  active: "green",
  applicant: "blue",
  banned: "red",
};

export function ResearcherStatusBadge({ status }: { status: string }) {
  return (
    <Badge color={researcherStatusColors[status] ?? "slate"} className="capitalize">
      {status}
    </Badge>
  );
}

const programRoleColors: Record<string, BadgeColor> = {
  owner: "indigo",
  triager: "blue",
  viewer: "slate",
};

export function ProgramRoleBadge({ role }: { role: string }) {
  return (
    <Badge color={programRoleColors[role] ?? "slate"} className="capitalize">
      {role}
    </Badge>
  );
}

/** Invite lifecycle is derived: revoked > accepted > expired > pending. */
export function inviteStatus(invite: Invite): { label: string; color: BadgeColor } {
  if (invite.revoked) return { label: "revoked", color: "red" };
  if (invite.accepted_at) return { label: "accepted", color: "green" };
  if (new Date(invite.expires_at).getTime() < Date.now()) return { label: "expired", color: "slate" };
  return { label: "pending", color: "blue" };
}

export function InviteStatusBadge({ invite }: { invite: Invite }) {
  const { label, color } = inviteStatus(invite);
  return <Badge color={color}>{label}</Badge>;
}
