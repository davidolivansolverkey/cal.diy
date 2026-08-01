"use client";

import { Button } from "@calcom/ui/components/button";
import { useState } from "react";

type ActionResult = { ok: true } | { ok: false; error: string };
type FormAction = (formData: FormData) => Promise<ActionResult>;

export type DirectoryFormLabels = {
  createOrganization: string;
  createTeam: string;
  addMember: string;
  name: string;
  slug: string;
  email: string;
  organization: string;
  team: string;
  role: string;
  submit: string;
  add: string;
  optional: string;
  assignToEventTypes: string;
  existingPerson: string;
  orCreateNewPerson: string;
  choose: string;
};

export type MemberTarget = { slug: string; label: string; isOrganization: boolean };
export type ExistingPerson = { email: string; label: string };

const inputClassName =
  "border-default bg-default text-emphasis placeholder:text-muted w-full rounded-md border px-3 py-2 text-sm";

const Field = ({
  label,
  name,
  placeholder,
  required = true,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) => (
  <label className="flex flex-col gap-1">
    <span className="text-emphasis text-sm font-medium">{label}</span>
    <input className={inputClassName} name={name} type={type} placeholder={placeholder} required={required} />
  </label>
);

const FormCard = ({
  title,
  action,
  submitLabel,
  children,
}: {
  title: string;
  action: FormAction;
  submitLabel: string;
  children: React.ReactNode;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Submitted through onSubmit rather than <form action={…}> because this React
  // version does not type server actions on the action prop.
  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);

    const result = await action(new FormData(form));

    setPending(false);
    if (result.ok) {
      form.reset();
      return;
    }
    setError(result.error);
  };

  return (
    <form onSubmit={onSubmit} className="border-subtle bg-default flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-emphasis text-sm font-semibold">{title}</h3>
      {children}
      {error && <p className="text-error text-sm">{error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

export const DirectoryForms = ({
  actions,
  labels,
  targets,
  people,
}: {
  actions: {
    createOrganization: FormAction;
    createTeam: FormAction;
    addMember: FormAction;
  };
  labels: DirectoryFormLabels;
  targets: MemberTarget[];
  people: ExistingPerson[];
}) => (
  <div className="mb-8 grid gap-4 md:grid-cols-3">
    <FormCard
      title={labels.createOrganization}
      action={actions.createOrganization}
      submitLabel={labels.submit}>
      <Field label={labels.name} name="name" placeholder="Grupo Solverkey" />
      <Field label={labels.slug} name="slug" placeholder="solverkey" />
    </FormCard>

    <FormCard title={labels.createTeam} action={actions.createTeam} submitLabel={labels.submit}>
      <Field label={labels.name} name="name" placeholder="Ventas" />
      <Field label={labels.slug} name="slug" placeholder="ventas" />
      <label className="flex flex-col gap-1">
        <span className="text-emphasis text-sm font-medium">
          {labels.organization} ({labels.optional})
        </span>
        <select className={inputClassName} name="organizationSlug" defaultValue="">
          <option value="">{labels.choose}</option>
          {targets
            .filter((target) => target.isOrganization)
            .map((target) => (
              <option key={target.slug} value={target.slug}>
                {target.label}
              </option>
            ))}
        </select>
      </label>
    </FormCard>

    <FormCard title={labels.addMember} action={actions.addMember} submitLabel={labels.add}>
      <label className="flex flex-col gap-1">
        <span className="text-emphasis text-sm font-medium">
          {labels.organization} / {labels.team}
        </span>
        <select className={inputClassName} name="teamSlug" required defaultValue="">
          <option value="" disabled>
            {labels.choose}
          </option>
          {targets.map((target) => (
            <option key={target.slug} value={target.slug}>
              {target.isOrganization ? `${target.label} (${labels.organization})` : target.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-emphasis text-sm font-medium">{labels.existingPerson}</span>
        <select className={inputClassName} name="existingEmail" defaultValue="">
          <option value="">{labels.choose}</option>
          {people.map((person) => (
            <option key={person.email} value={person.email}>
              {person.label}
            </option>
          ))}
        </select>
      </label>

      <p className="text-subtle text-xs">{labels.orCreateNewPerson}</p>
      <Field label={labels.name} name="name" placeholder="Ana Ruiz" required={false} />
      <Field label={labels.email} name="email" type="email" placeholder="ana@empresa.es" required={false} />
      <label className="flex flex-col gap-1">
        <span className="text-emphasis text-sm font-medium">{labels.role}</span>
        <select className={inputClassName} name="role" defaultValue="MEMBER">
          <option value="MEMBER">MEMBER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="OWNER">OWNER</option>
        </select>
      </label>
      {/* Checked by default: a member who is not a host never receives round-robin bookings. */}
      <label className="flex items-center gap-2">
        <input type="checkbox" name="assignToEventTypes" defaultChecked />
        <span className="text-subtle text-sm">{labels.assignToEventTypes}</span>
      </label>
    </FormCard>
  </div>
);
