import type { LegalDocument } from "../types";

export const terms: LegalDocument = {
  title: "Terms of use",
  intro:
    "These terms govern the use of AgroRende by the customer company and by the people it invites. By creating a company or accepting an invitation, you agree to them. The Portuguese version prevails if the two differ.",
  sections: [
    {
      id: "service",
      heading: "The service",
      paragraphs: [
        "AgroRende is subscription software for managing an agricultural fleet: field reports, repairs, rentals, an operations center and agro ERP records, with a field app and a web app for the office.",
      ],
    },
    {
      id: "accounts",
      heading: "Accounts and access",
      paragraphs: [
        "The customer company is responsible for who it invites, the roles it assigns and removing access for people who leave the crew. Each person must keep their own access secure and tell the company if they suspect misuse.",
      ],
    },
    {
      id: "trial",
      heading: "Trial and subscription",
      paragraphs: [
        "Every new company gets a 30-day trial with every module. After that, use continues under the contracted plan. Billing is per active field user; office users are not billed. There is no setup fee.",
      ],
    },
    {
      id: "use",
      heading: "Acceptable use",
      paragraphs: ["You may not:"],
      list: [
        "use the service for illegal activities or to record other people's data without a legal basis;",
        "try to access another company's data or bypass access controls;",
        "deliberately overload the service or reverse engineer it.",
      ],
    },
    {
      id: "data",
      heading: "Your data",
      paragraphs: [
        "The recorded data belongs to the customer company, which can export it as CSV at any time. After cancellation, the data stays available for export for 90 days and is then deleted. Personal data is processed under the Privacy policy and the DPA.",
      ],
    },
    {
      id: "availability",
      heading: "Availability",
      paragraphs: [
        "We work to keep the service available and give advance notice of scheduled maintenance. The field app keeps recording work offline and sends everything when the service is back.",
      ],
    },
    {
      id: "liability",
      heading: "Limitation of liability",
      paragraphs: [
        "AgroRende supports fleet management, but operational, safety and maintenance decisions remain with the customer company. AgroRende's liability is limited to the amount paid in the 12 months before the event, unless the law provides otherwise.",
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      paragraphs: [
        "We may update these terms. Material changes are announced in advance in the app and by email, and the current version is shown at the top of this page.",
      ],
    },
    {
      id: "law",
      heading: "Governing law",
      paragraphs: ["These terms are governed by Brazilian law, in the courts of the district where AgroRende has its registered office."],
    },
  ],
};
