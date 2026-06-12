import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useOrganization } from "../../lib/queries";
import { ConfirmButton, ErrorText, Spinner } from "../../components/ui";

export function OrganizationTab() {
  const queryClient = useQueryClient();
  const organization = useOrganization();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["organization"] });

  const [newLocation, setNewLocation] = useState("");
  const [newDepartment, setNewDepartment] = useState<{ locationId: string; name: string }>({
    locationId: "",
    name: "",
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

  // Business details (name, industry, contact, logo) are owner-only and
  // live on the Organisation settings page, not here.
  return (
    <>
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
