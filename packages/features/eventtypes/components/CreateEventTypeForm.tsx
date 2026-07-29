import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import type { createEventTypeInput } from "@calcom/features/eventtypes/lib/types";
import { MAX_EVENT_DURATION_MINUTES, MIN_EVENT_DURATION_MINUTES } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { md } from "@calcom/lib/markdownIt";
import slugify from "@calcom/lib/slugify";
import turndown from "@calcom/lib/turndownService";
import { SchedulingType } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { Editor } from "@calcom/ui/components/editor";
import { Form, TextAreaField, TextField } from "@calcom/ui/components/form";
import { Tooltip } from "@calcom/ui/components/tooltip";
import type { ReactNode } from "react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { z } from "zod";

type CreateEventTypeFormValues = z.infer<typeof createEventTypeInput>;

const SCHEDULING_TYPE_OPTIONS = [
  { value: SchedulingType.ROUND_ROBIN, labelKey: "round_robin", descriptionKey: "round_robin_description" },
  { value: SchedulingType.COLLECTIVE, labelKey: "collective", descriptionKey: "collective_description" },
  { value: SchedulingType.MANAGED, labelKey: "managed_event", descriptionKey: "managed_event_description" },
] as const;

export default function CreateEventTypeForm({
  form,
  isManagedEventType,
  handleSubmit,
  pageSlug,
  isPending,
  urlPrefix,
  SubmitButton,
  teamId,
}: {
  form: UseFormReturn<CreateEventTypeFormValues>;
  isManagedEventType: boolean;
  handleSubmit: (values: CreateEventTypeFormValues) => void;
  pageSlug?: string;
  isPending: boolean;
  urlPrefix?: string;
  SubmitButton: (isPending: boolean) => ReactNode;
  /** Set for team event types, which additionally require a scheduling type. */
  teamId?: number | null;
}) {
  const isPlatform = useIsPlatform();
  const { t } = useLocale();
  const [firstRender, setFirstRender] = useState(true);

  const { register } = form;
  const schedulingType = form.watch("schedulingType");
  return (
    <Form
      form={form}
      handleSubmit={(values) => {
        handleSubmit(values);
      }}>
      <div className="mt-3 stack-y-6 pb-11">
        <TextField
          label={t("title")}
          placeholder={t("quick_chat")}
          data-testid="event-type-quick-chat"
          {...register("title")}
          onChange={(e) => {
            form.setValue("title", e?.target.value);
            if (form.formState.touchedFields["slug"] === undefined) {
              form.setValue("slug", slugify(e?.target.value));
            }
          }}
        />

        {urlPrefix && urlPrefix.length >= 21 ? (
          <div>
            <TextField
              label={isPlatform ? "Slug" : `${t("url")}: ${urlPrefix}`}
              required
              addOnLeading={
                !isPlatform ? (
                  <span className="max-w-24 md:max-w-56 inline-block overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                    {`/${!isManagedEventType ? pageSlug : t("username_placeholder")}/`}
                  </span>
                ) : undefined
              }
              containerClassName="[&>div]:gap-0"
              className="pl-0"
              {...register("slug")}
              onChange={(e) => {
                form.setValue("slug", slugify(e?.target.value), { shouldTouch: true });
              }}
            />

            {isManagedEventType && !isPlatform && (
              <p className="mt-2 text-sm text-gray-600">{t("managed_event_url_clarification")}</p>
            )}
          </div>
        ) : (
          <div>
            <TextField
              label={isPlatform ? "Slug" : t("url")}
              required
              addOnLeading={
                !isPlatform ? (
                  <Tooltip
                    content={`${urlPrefix}/${!isManagedEventType ? pageSlug : t("username_placeholder")}/`}>
                    <span className="max-w-24 md:max-w-56 inline-block overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                      {`${urlPrefix}/${!isManagedEventType ? pageSlug : t("username_placeholder")}/`}
                    </span>
                  </Tooltip>
                ) : undefined
              }
              containerClassName="[&>div]:gap-0"
              className="pl-0"
              {...register("slug")}
              onChange={(e) => {
                form.setValue("slug", slugify(e?.target.value), { shouldTouch: true });
              }}
            />
            {isManagedEventType && !isPlatform && (
              <p className="mt-2 text-sm text-gray-600">{t("managed_event_url_clarification")}</p>
            )}
          </div>
        )}
        <>
          {isPlatform ? (
            <TextAreaField {...register("description")} placeholder={t("quick_video_meeting")} />
          ) : (
            <Editor
              label={t("description")}
              getText={() => md.render(form.getValues("description") || "")}
              setText={(value: string) => form.setValue("description", turndown(value))}
              excludedToolbarItems={["blockType", "link"]}
              placeholder={t("quick_video_meeting")}
              firstRender={firstRender}
              setFirstRender={setFirstRender}
              maxHeight="200px"
            />
          )}

          <div className="relative">
            <TextField
              type="number"
              required
              min={MIN_EVENT_DURATION_MINUTES}
              max={MAX_EVENT_DURATION_MINUTES}
              placeholder="15"
              label={t("duration")}
              className="pr-4"
              {...register("length", {
                valueAsNumber: true,
                min: {
                  value: MIN_EVENT_DURATION_MINUTES,
                  message: t("duration_min_error", { min: MIN_EVENT_DURATION_MINUTES }),
                },
                max: {
                  value: MAX_EVENT_DURATION_MINUTES,
                  message: t("duration_max_error", { max: MAX_EVENT_DURATION_MINUTES }),
                },
              })}
              addOnSuffix={t("minutes").toLowerCase()}
            />
          </div>

          {teamId ? (
            <div className="mt-4">
              <p className="text-emphasis mb-2 text-sm font-medium">{t("scheduling_type")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {SCHEDULING_TYPE_OPTIONS.map((option) => {
                  const isSelected = schedulingType === option.value;
                  return (
                    <button
                      type="button"
                      key={option.value}
                      aria-pressed={isSelected}
                      onClick={() => form.setValue("schedulingType", option.value, { shouldValidate: true })}
                      className={classNames(
                        "rounded-lg border p-3 text-left",
                        isSelected ? "border-emphasis bg-subtle" : "border-subtle hover:border-emphasis"
                      )}>
                      <span className="text-emphasis block text-sm font-medium">{t(option.labelKey)}</span>
                      <span className="text-subtle mt-1 block text-xs">{t(option.descriptionKey)}</span>
                    </button>
                  );
                })}
              </div>
              {form.formState.errors.schedulingType && (
                <p className="text-error mt-2 text-sm">{t("scheduling_type_required_error")}</p>
              )}
            </div>
          ) : null}
        </>
      </div>
      {SubmitButton(isPending)}
    </Form>
  );
}
