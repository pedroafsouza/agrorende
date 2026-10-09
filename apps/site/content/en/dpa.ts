import type { LegalDocument } from "../types";

export const dpa: LegalDocument = {
  title: "Data processing agreement (DPA)",
  intro:
    "This agreement supplements the Terms of use and sets out how AgroRende, as the processor, processes personal data on behalf of the customer company, which is the controller, under the LGPD. The Portuguese version prevails if the two differ.",
  sections: [
    {
      id: "scope",
      heading: "Scope",
      paragraphs: [
        "AgroRende processes personal data about the customer company's crew, customers and contacts only to provide the contracted service and following the controller's documented instructions, including the settings made in the product itself.",
      ],
    },
    {
      id: "categories",
      heading: "Data categories and data subjects",
      paragraphs: ["Data subjects are the company's users and the customers and contacts it records. The categories are:"],
      list: [
        "identification and contact: name, email, phone and photo;",
        "work data: reports, media, checklists, signatures, work orders and rentals;",
        "location while on shift, with raw positions kept for 30 days.",
      ],
    },
    {
      id: "security",
      heading: "Security",
      paragraphs: [
        "AgroRende keeps appropriate technical and organizational measures: per-company data isolation, encryption in transit, role-based access control, audit logs, backups with a monthly restore drill, and confidentiality duties for authorized staff.",
      ],
    },
    {
      id: "subprocessors",
      heading: "Subprocessors",
      paragraphs: [
        "The controller authorizes subprocessors for infrastructure, database, email delivery and social sign-in. AgroRende keeps the list up to date, gives notice of changes and requires each subprocessor to accept obligations equivalent to this agreement.",
      ],
    },
    {
      id: "incidents",
      heading: "Incidents",
      paragraphs: [
        "AgroRende notifies the controller without undue delay of any security incident that may cause relevant risk or harm to data subjects, with the information available so the controller can meet its duties to the ANPD and to data subjects.",
      ],
    },
    {
      id: "rights",
      heading: "Data subject rights",
      paragraphs: [
        "AgroRende helps the controller answer data subject requests by offering export, correction and account deletion with anonymization. Requests received directly by AgroRende are forwarded to the controller.",
      ],
    },
    {
      id: "termination",
      heading: "Termination",
      paragraphs: [
        "When the contract ends, the data stays available for export for 90 days and is then deleted, including from backups as they expire, unless the law requires it to be kept.",
      ],
    },
  ],
};
