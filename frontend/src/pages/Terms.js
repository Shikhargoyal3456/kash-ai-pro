import { Link } from "react-router-dom";
import { Leaf, ArrowLeft } from "lucide-react";

const sections = [
  { h: "1. Acceptance of Terms", p: "By creating an account or using Kash AI (the \"Platform\"), you agree to these Terms & Conditions. If you do not agree, please do not use the Platform." },
  { h: "2. The Platform", p: "Kash AI connects patients, Ayurvedic doctors, pharmacy stores and delivery partners. It provides voice-assisted consultation tooling, an e-pharmacy marketplace, order fulfilment and delivery tracking. Kash AI is a technology intermediary and is not a manufacturer, seller, or licensed medical provider." },
  { h: "3. Not Medical Advice", p: "AI-generated case sheets, Samhita analysis, and any content on the Platform are for informational and support purposes only and are not a substitute for professional medical diagnosis or treatment. Always consult a qualified, licensed practitioner before acting on any recommendation. Prescription medicines are dispensed only against a valid prescription approved by a registered pharmacy." },
  { h: "4. Accounts & Roles", p: "You must provide accurate information and keep your credentials secure. Doctor, pharmacy and delivery accounts may require verification. You are responsible for all activity under your account. We may suspend or block accounts that violate these terms or applicable law." },
  { h: "5. Orders, Payments & Refunds", p: "Prices, availability and delivery estimates are set by pharmacies and may change. Payment is processed securely by our payment partner (Stripe); we do not store your full card details. Rejected or undelivered orders are eligible for refund per the fulfilling pharmacy's policy and applicable law." },
  { h: "6. Prescriptions", p: "For prescription (Rx) medicines you must upload a valid prescription. The dispensing pharmacy may approve or reject it at its discretion. Uploading forged or invalid prescriptions is prohibited and may be reported to authorities." },
  { h: "7. Acceptable Use", p: "You agree not to misuse the Platform, attempt unauthorized access, scrape data, or upload unlawful, infringing or harmful content. Delivery partners and pharmacies must comply with all licensing and safety regulations." },
  { h: "8. Limitation of Liability", p: "To the maximum extent permitted by law, Kash AI is provided \"as is\" without warranties, and shall not be liable for indirect or consequential damages arising from use of the Platform, third-party products, or clinical decisions." },
  { h: "9. Changes", p: "We may update these Terms from time to time. Continued use after changes constitutes acceptance of the revised Terms." },
  { h: "10. Contact", p: "Questions about these Terms can be sent to support@kashaipro.example." },
];

export default function Terms() {
  return <LegalPage title="Terms & Conditions" sections={sections} />;
}

export function LegalPage({ title, sections }) {
  return (
    <div className="min-h-screen bg-[#F4F7F5]">
      <header className="glass sticky top-0 z-50 border-b border-white/50">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#2C5545] grid place-items-center"><Leaf className="h-5 w-5 text-white" /></div>
            <span className="font-display font-bold text-lg">Kash AI</span>
          </Link>
          <Link to="/" data-testid="legal-back" className="text-sm text-[#2C5545] hover:bg-white/70 rounded-full px-4 py-2 font-medium transition-colors flex items-center gap-1.5"><ArrowLeft className="h-4 w-4" /> Home</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
        <h1 className="font-display text-4xl font-bold tracking-tight text-[#0F1C17]">{title}</h1>
        <p className="text-sm text-[#4A5E55] mt-2">Last updated: June 2026</p>
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
          This is a starter template provided for convenience. Please have it reviewed by a qualified lawyer before relying on it in production.
        </div>
        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-lg font-semibold text-[#0F1C17]">{s.h}</h2>
              <p className="text-[#4A5E55] mt-2 leading-relaxed">{s.p}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
