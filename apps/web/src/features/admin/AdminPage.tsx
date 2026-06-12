import { useState } from "react";
import { useSession } from "../auth/session";
import { MembersTab } from "./MembersTab";
import { RolesTab } from "./RolesTab";
import { OrganizationTab } from "./OrganizationTab";

export function AdminPage() {
  const session = useSession();
  const tabs = [
    {
      id: "members",
      label: "Members",
      show: session.can("member.manage") || session.can("member.invite"),
    },
    { id: "roles", label: "Roles", show: session.can("role.manage") },
    {
      id: "organization",
      label: "Locations & departments",
      show: session.can("org.manage"),
    },
  ].filter((t) => t.show);
  const [active, setActive] = useState(tabs[0]?.id ?? "members");

  return (
    <>
      <div className="page-header">
        <h1>Admin</h1>
      </div>
      <div className="row" style={{ marginBottom: "1rem" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={active === t.id ? "btn btn-primary btn-sm" : "btn btn-sm"}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === "members" && <MembersTab />}
      {active === "roles" && <RolesTab />}
      {active === "organization" && <OrganizationTab />}
    </>
  );
}
