import { z } from "zod";
import {
  ProviderInviteStatusEnum,
  ProviderPaymentMethodEnum,
  ProviderReviewModerationStatusEnum,
  ProviderReviewPartyEnum,
  ProviderReviewThreadStatusEnum,
  WorkOrderTypeEnum,
} from "../enums";
import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from "./shared";

const NullableDateTime = IsoDateTimeSchema.nullable();
const NullableText = z.string().nullable();
const Score = z.number().int().min(1).max(5);
const DigitsPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/gu, ""))
  .pipe(z.string().min(10).max(15));

function blankToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim().length === 0 ? null : value;
}

/** Office input for "Invite from outside": a name plus WhatsApp phone or email (at least one). */
export const CreateProviderInviteInputSchema = z
  .object({
    providerName: z.string().trim().min(1).max(120),
    phone: z.preprocess(blankToNull, DigitsPhone.nullable().optional()),
    email: z.preprocess(blankToNull, z.string().trim().toLowerCase().email().max(254).nullable().optional()),
    message: z.preprocess(blankToNull, z.string().trim().max(1000).nullable().optional()),
  })
  .superRefine((value, issue) => {
    if ((value.phone ?? null) === null && (value.email ?? null) === null) {
      issue.addIssue({ code: "custom", path: ["phone"], message: "contactRequired" });
    }
  });
export type CreateProviderInviteInput = z.input<typeof CreateProviderInviteInputSchema>;

export const ProviderAgreementInputSchema = z.object({
  agreedValueCents: z.number().int().nonnegative().max(100_000_000_000).nullable(),
  paymentMethod: ProviderPaymentMethodEnum.nullable(),
});
export type ProviderAgreementInput = z.infer<typeof ProviderAgreementInputSchema>;

export const ProviderDeclineInputSchema = z.object({
  reason: z.preprocess(blankToNull, z.string().trim().max(500).nullable().optional()),
});
export type ProviderDeclineInput = z.input<typeof ProviderDeclineInputSchema>;

export const ProviderCounterInputSchema = z
  .object({
    priceCents: z.number().int().nonnegative().max(100_000_000_000).nullable().optional(),
    date: z.preprocess(blankToNull, IsoDateSchema.nullable().optional()),
    note: z.preprocess(blankToNull, z.string().trim().max(500).nullable().optional()),
  })
  .superRefine((value, issue) => {
    if ((value.priceCents ?? null) === null && (value.date ?? null) === null) {
      issue.addIssue({ code: "custom", path: ["priceCents"], message: "counterRequired" });
    }
  });
export type ProviderCounterInput = z.input<typeof ProviderCounterInputSchema>;

export const ProviderCompleteInputSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});
export type ProviderCompleteInput = z.infer<typeof ProviderCompleteInputSchema>;

export const ProviderReviewCriteriaSchema = z.object({
  punctuality: Score,
  quality: Score,
  price: Score,
  communication: Score,
});
export type ProviderReviewCriteria = z.infer<typeof ProviderReviewCriteriaSchema>;

export const CreateProviderReviewInputSchema = z.object({
  rating: Score,
  criteria: ProviderReviewCriteriaSchema,
  comment: z.preprocess(blankToNull, z.string().trim().max(2000).nullable().optional()),
});
export type CreateProviderReviewInput = z.input<typeof CreateProviderReviewInputSchema>;

export const ProviderReviewReplyInputSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type ProviderReviewReplyInput = z.infer<typeof ProviderReviewReplyInputSchema>;

export const ProviderReviewReportInputSchema = z.object({
  reason: z.preprocess(blankToNull, z.string().trim().max(500).nullable().optional()),
});
export type ProviderReviewReportInput = z.input<typeof ProviderReviewReportInputSchema>;

export const ProviderReviewReplySchema = z.object({
  body: z.string(),
  at: IsoDateTimeSchema,
});

export const ProviderReviewDTOSchema = z.object({
  id: UuidSchema,
  workOrderId: UuidSchema,
  inviteId: UuidSchema,
  providerName: z.string(),
  rating: Score,
  criteria: ProviderReviewCriteriaSchema,
  comment: NullableText,
  createdAt: IsoDateTimeSchema,
  providerReply: ProviderReviewReplySchema.nullable(),
  customerReply: ProviderReviewReplySchema.nullable(),
  threadStatus: ProviderReviewThreadStatusEnum,
  moderationStatus: ProviderReviewModerationStatusEnum,
  reportedBy: z.array(ProviderReviewPartyEnum),
});
export type ProviderReviewDTO = z.infer<typeof ProviderReviewDTOSchema>;

/** Office view of one invite; the token is never part of it (only its hash is stored). */
export const ProviderInviteDTOSchema = z.object({
  id: UuidSchema,
  workOrderId: UuidSchema,
  providerName: z.string(),
  phone: NullableText,
  email: NullableText,
  message: NullableText,
  status: ProviderInviteStatusEnum,
  expiresAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  openedAt: NullableDateTime,
  respondedAt: NullableDateTime,
  declineReason: NullableText,
  proposedPriceCents: z.number().int().nullable(),
  proposedDate: IsoDateSchema.nullable(),
  proposalNote: NullableText,
  acceptedAt: NullableDateTime,
  completedAt: NullableDateTime,
  completionNote: NullableText,
  revokedAt: NullableDateTime,
  agreedValueCents: z.number().int().nullable(),
  paymentMethod: ProviderPaymentMethodEnum.nullable(),
  customerPaidAt: NullableDateTime,
  providerPaidAt: NullableDateTime,
  review: ProviderReviewDTOSchema.nullable(),
});
export type ProviderInviteDTO = z.infer<typeof ProviderInviteDTOSchema>;

export const ProviderInviteLinkSchema = z.object({
  url: z.string().url(),
  expiresAt: IsoDateTimeSchema,
});
export type ProviderInviteLink = z.infer<typeof ProviderInviteLinkSchema>;

/** Returned once, on create and reissue: the only moment the plain link exists. */
export const ProviderInviteIssuedDTOSchema = z.object({
  invite: ProviderInviteDTOSchema,
  link: ProviderInviteLinkSchema,
});
export type ProviderInviteIssuedDTO = z.infer<typeof ProviderInviteIssuedDTOSchema>;

/** Minimal work-order view for the public magic-link page (LGPD: no third-party contact data). */
export const ProviderLinkViewDTOSchema = z.object({
  organizationName: z.string(),
  invite: z.object({
    providerName: z.string(),
    status: ProviderInviteStatusEnum,
    message: NullableText,
    expiresAt: IsoDateTimeSchema,
    declineReason: NullableText,
    proposedPriceCents: z.number().int().nullable(),
    proposedDate: IsoDateSchema.nullable(),
    proposalNote: NullableText,
    acceptedAt: NullableDateTime,
    completedAt: NullableDateTime,
    completionNote: NullableText,
    agreedValueCents: z.number().int().nullable(),
    paymentMethod: ProviderPaymentMethodEnum.nullable(),
    customerPaidAt: NullableDateTime,
    providerPaidAt: NullableDateTime,
  }),
  workOrder: z.object({
    number: z.string(),
    title: z.string(),
    description: NullableText,
    type: WorkOrderTypeEnum,
    scheduledFor: IsoDateSchema.nullable(),
    asset: z.object({ name: z.string(), make: NullableText, model: NullableText }).nullable(),
    site: z
      .object({
        name: z.string(),
        city: NullableText,
        state: NullableText,
        lat: z.number().nullable(),
        lng: z.number().nullable(),
        mapUrl: z.string().url().nullable(),
      })
      .nullable(),
  }),
  review: ProviderReviewDTOSchema.nullable(),
});
export type ProviderLinkViewDTO = z.infer<typeof ProviderLinkViewDTOSchema>;

/** Digits for wa.me: Brazilian numbers typed without the country code get `55` in front. */
export function whatsappDigits(phone: string): string {
  const digits = phone.replace(/\D/gu, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/** Click-to-chat link (no WhatsApp API): opens WhatsApp with the message ready to send. */
export function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(text)}`;
}

export function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Provider-link tokens are 32 random bytes in base64url (43 characters). */
export const PROVIDER_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

/** States in which the provider has not answered yet; these expire after seven days. */
export const PROVIDER_INVITE_PENDING_STATUSES = ["SENT", "OPENED", "COUNTERED"] as const;

/** States that block a second invite on the same work order. */
export const PROVIDER_INVITE_ACTIVE_STATUSES = ["SENT", "OPENED", "COUNTERED", "ACCEPTED"] as const;
