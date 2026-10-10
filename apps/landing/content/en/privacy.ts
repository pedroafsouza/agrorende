import type { LegalDocument } from "../types";

export const privacy: LegalDocument = {
  title: "Privacy policy",
  intro:
    "This policy explains how AgroRende processes personal data on this website, in the field app and in the office web app, under Brazil's General Data Protection Law (Law 13,709/2018, LGPD). The Portuguese version prevails if the two differ.",
  sections: [
    {
      id: "roles",
      heading: "Who is responsible",
      paragraphs: [
        "The customer company that subscribes to AgroRende is the controller of the data about its crew, its customers and its operations. AgroRende acts as the processor and processes that data only to provide the contracted service, as set out in the Data processing agreement (DPA).",
        "AgroRende is the controller for company account, billing and support data.",
      ],
    },
    {
      id: "data",
      heading: "What data we process",
      paragraphs: ["We process only what the service needs to work:"],
      list: [
        "Account data: name, email, phone, optional photo, language and company.",
        "Access data: Google or Apple identifiers when you sign in with those accounts, sessions and connected devices.",
        "Work data: reports, photos, videos, voice notes, checklists, signatures, work orders, rentals, parts and costs recorded by the crew.",
        "Location: the device position while you are on shift in the field app, and the location attached to photos and reports.",
        "Diagnostics: app version, device model and technical sync logs, without form contents.",
      ],
    },
    {
      id: "purposes",
      heading: "What we use it for",
      paragraphs: [
        "We use the data to perform the contract with the customer company: to record and route reports, organize repairs and rentals, show the operation live to the office, work out costs and charges, and provide support. We do not sell data and do not use it for advertising.",
      ],
    },
    {
      id: "location",
      heading: "Location while on shift",
      paragraphs: [
        "The field app records the position only while a shift is active and shows a persistent notice during that time. Raw positions are kept for 30 days and then deleted. No position is collected off shift.",
      ],
    },
    {
      id: "retention",
      heading: "How long we keep it",
      paragraphs: [
        "Work records are kept while the company keeps its subscription. After cancellation, they stay available for export for 90 days and are then deleted. Technical diagnostics are kept for 30 days. Backups follow a cycle of 30 daily and 12 monthly recovery points and expire after that.",
      ],
    },
    {
      id: "sharing",
      heading: "Who we share it with",
      paragraphs: [
        "Data is stored on servers in Brazil. We use infrastructure, database, email delivery and social sign-in providers only to run the service, under contract and with confidentiality and security obligations.",
      ],
    },
    {
      id: "website",
      heading: "This website",
      paragraphs: [
        "This website uses no cookies and no third-party scripts, and it does not store what you type. Fonts and images are served by the site itself. The WhatsApp and email buttons only open the app on your device.",
      ],
    },
    {
      id: "rights",
      heading: "Your rights",
      paragraphs: [
        "You can ask for confirmation of processing, access, correction, anonymization, portability, information about sharing and deletion of your data. When AgroRende is the processor, we forward the request to the controlling company and help it respond. You can also delete your account in the app or on the web.",
      ],
    },
    {
      id: "contact",
      heading: "Data protection officer",
      paragraphs: [
        "Contact AgroRende's data protection officer at the email address shown in the footer of this page. You can also contact Brazil's National Data Protection Authority (ANPD).",
      ],
    },
  ],
};
