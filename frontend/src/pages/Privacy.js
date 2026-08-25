import { LegalPage } from "@/pages/Terms";

const sections = [
  { h: "1. Overview", p: "This Privacy Policy explains how Kash AI (the \"Platform\") collects, uses, and protects your personal information when you use our healthcare and e-pharmacy services." },
  { h: "2. Information We Collect", p: "Account data (name, email, role, and role-specific details such as clinic, store or vehicle information); health-related data you provide (symptoms, consultation transcripts, prescriptions you upload); order and delivery data (items, address, delivery status, approximate location for live tracking); and payment metadata processed by our payment partner. We do not store full card numbers." },
  { h: "3. How We Use Your Data", p: "To operate the Platform: authenticate you, process and fulfil orders, generate AI-assisted case sheets and analysis, enable delivery tracking, send order notifications, and improve our services. Health data is used only to provide the service you requested." },
  { h: "4. AI Processing", p: "Voice recordings and symptom text you submit for consultation may be processed by third-party AI providers (for transcription and analysis) solely to return results to you. We do not sell your health data." },
  { h: "5. Sharing", p: "We share the minimum necessary data with the parties fulfilling your request — e.g. the pharmacy that receives your order and the delivery partner assigned to it. We use trusted processors (payment, cloud, AI) under appropriate safeguards. We may disclose data where required by law." },
  { h: "6. Data Storage & Security", p: "Data is stored in a managed MongoDB database. Passwords are hashed with bcrypt and never stored in plain text. Access is restricted by role-based permissions. Your login session is kept as a token in your browser. No method of transmission or storage is 100% secure." },
  { h: "7. Your Rights", p: "You may request access to, correction of, or deletion of your personal data, subject to legal and record-keeping obligations for pharmacy and medical records. Contact us to exercise these rights." },
  { h: "8. Data Retention", p: "We retain data for as long as your account is active or as needed to provide services and comply with legal obligations, after which it is deleted or anonymised." },
  { h: "9. Children", p: "The Platform is not directed to children under 18. We do not knowingly collect data from minors without appropriate consent." },
  { h: "10. Contact", p: "For privacy questions or requests, contact privacy@kashaipro.example." },
];

export default function Privacy() {
  return <LegalPage title="Privacy Policy" sections={sections} />;
}
