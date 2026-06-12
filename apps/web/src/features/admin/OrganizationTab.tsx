import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useOrganization } from "../../lib/queries";
import { ConfirmButton, ErrorText, Spinner } from "../../components/ui";

export function OrganizationTab() {
  const queryClient = useQueryClient();
  const organization = useOrganization();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["organization"] });

  const [orgForm, setOrgForm] = useState<{
    name: string;
    industry: string;
    address: string;
    phone: string;
    website: string;
  } | null>(null);
  const [newLocation, setNewLocation] = useState("");
  const [newDepartment, setNewDepartment] = useState<{ locationId: string; name: string }>({
    locationId: "",
    name: "",
  });

  const saveOrg = useMutation({
    mutationFn: (body: Record<string, string | null>) =>
      api("/organization", { method: "PATCH", body }),
    onSuccess: invalidate,
  });
  const addLocation = useMutation({
    mutationFn: (name: string) => api("/locations", { method: "POST", body: { name } }),
    onSuccess: () => {
      setNewLocation("");
      invalidate();
    },
  });
  const removeLocation = useMutation({
    mutationFn: (id: string) => api(`/locations/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const addDepartment = useMutation({
    mutationFn: (input: { locationId: string; name: string }) =>
      api("/departments", { method: "POST", body: input }),
    onSuccess: () => {
      setNewDepartment((d) => ({ ...d, name: "" }));
      invalidate();
    },
  });
  const removeDepartment = useMutation({
    mutationFn: (id: string) => api(`/departments/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  if (organization.isLoading) return <Spinner />;
  if (!organization.data) return <ErrorText error={organization.error} />;
  const org = organization.data;
  const form = orgForm ?? {
    name: org.name,
    industry: org.industry ?? "",
    address: org.address ?? "",
    phone: org.phone ?? "",
    website: org.website ?? "",
  };

  function onSaveOrg(e: FormEvent) {
    e.preventDefault();
    saveOrg.mutate({
      name: form.name,
      industry: form.industry || null,
      address: form.address || null,
      phone: form.phone || null,
      website: form.website || null,
    });
  }

  return (
    <>
      <div className="card">
        <h2>Business details</h2>
        <form onSubmit={onSaveOrg}>
          <div className="form-row">
            <div className="field">
              <label>Business name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setOrgForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Industry</label>
              <input
                className="input"
                value={form.industry}
                onChange={(e) => setOrgForm({ ...form, industry: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Address</label>
              <input
                className="input"
                value={form.address}
                onChange={(e) => setOrgForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                className="input"
                type="tel"
                value={form.phone}
                onChange={(e) => setOrgForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Website</label>
              <input
                className="input"
                type="url"
                placeholder="https://example.com"
                value={form.website}
                onChange={(e) => setOrgForm({ ...form, website: e.target.value })}
              />
            </div>
          </div>
          <ErrorText error={saveOrg.error} />
          <button className="btn btn-primary btn-sm" disabled={saveOrg.isPending}>
            {saveOrg.isPending ? "Saving…" : "Save"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Locations & departments</h2>
        <ErrorText
          error={
            addLocation.error ?? removeLocation.error ?? addDepartment.error ?? removeDepartment.error
          }
        />
        {org.locations.map((loc) => (
          <div key={loc.id} style={{ padding: "0.6rem 0", borderTop: "1px solid var(--border)" }}>
            <div className="row">
              <strong>{loc.name}</strong>
              <span className="small muted">{loc.timezone}</span>
              <span className="spacer" />
              <ConfirmButton
                label="Delete"
                confirmLabel={`Delete location "${loc.name}"?`}
                onConfirm={() => removeLocation.mutate(loc.id)}
                disabled={loc.departments.length > 0}
              />
            </div>
            <div className="row" style={{ marginTop: "0.4rem", paddingLeft: "1rem" }}>
              {loc.departments.map((d) => (
                <span key={d.id} className="badge">
                  {d.name}{" "}
                  <a
                    href="#remove"
                    onClick={(e) => {
                      e.preventDefault();
                      if (window.confirm(`Delete department "${d.name}"?`)) {
                        removeDepartment.mutate(d.id);
                      }
                    }}
                  >
                    ✕
                  </a>
                </span>
              ))}
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newDepartment.name && newDepartment.locationId === loc.id) {
                    addDepartment.mutate(newDepartment);
                  }
                }}
              >
                <input
                  className="input"
                  style={{ width: "12rem" }}
                  placeholder="New department…"
                  value={newDepartment.locationId === loc.id ? newDepartment.name : ""}
                  onChange={(e) => setNewDepartment({ locationId: loc.id, name: e.target.value })}
                />
                <button
                  className="btn btn-sm"
                  disabled={addDepartment.isPending || newDepartment.locationId !== loc.id || !newDepartment.name}
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        ))}
        <form
          className="row"
          style={{ marginTop: "0.75rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (newLocation) addLocation.mutate(newLocation);
          }}
        >
          <input
            className="input"
            style={{ width: "14rem" }}
            placeholder="New location…"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />
          <button className="btn btn-sm" disabled={addLocation.isPending || !newLocation}>
            Add location
          </button>
        </form>
      </div>
    </>
  );
}
