import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Loader2, Users, ClipboardList, FileText, Leaf, Salad, Activity, Stethoscope, Plus } from "lucide-react";
import DashboardLayout, { StatCard } from "@/components/DashboardLayout";
import api, { formatApiError } from "@/lib/api";

export default function DoctorDashboard() {
  const [stats, setStats] = useState({ patients: 0, consultations: 0, prescriptions: 0 });
  const [consultations, setConsultations] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [tab, setTab] = useState("consult");

  const load = async () => {
    try {
      const [s, c, p] = await Promise.all([
        api.get("/doctor/stats"), api.get("/doctor/consultations"), api.get("/doctor/prescriptions"),
      ]);
      setStats(s.data); setConsultations(c.data); setPrescriptions(p.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  return (
    <DashboardLayout title="Doctor Console" subtitle="Voice-first Ayurvedic consultations & Samhita analysis">
      <div className="grid sm:grid-cols-3 gap-6 mb-8">
        <StatCard icon={Users} label="Patients" value={stats.patients} testid="stat-patients" />
        <StatCard icon={ClipboardList} label="Consultations" value={stats.consultations} tone="#E88D67" testid="stat-consultations" />
        <StatCard icon={FileText} label="Prescriptions" value={stats.prescriptions} tone="#0EA5A0" testid="stat-prescriptions" />
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <VoicePanel onDone={load} />
          <SamhitaPanel onDone={load} />
          <PrescriptionPanel onDone={load} />
        </div>

        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex gap-2 mb-5">
              <TabBtn active={tab === "consult"} onClick={() => setTab("consult")} testid="tab-consult">Consultations & Case Sheets</TabBtn>
              <TabBtn active={tab === "presc"} onClick={() => setTab("presc")} testid="tab-presc">Prescriptions</TabBtn>
            </div>
            {tab === "consult" ? (
              <div className="space-y-4" data-testid="consult-list">
                {consultations.length === 0 && <Empty text="No consultations yet. Use voice or Samhita analysis to begin." />}
                {consultations.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-100 p-4 bg-[#F4F7F5]/60">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-[#0F1C17]">{c.patient_name}</p>
                      <span className="text-xs text-[#4A5E55]">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    {c.transcript && <p className="text-sm text-[#4A5E55] mt-2 italic">“{c.transcript}”</p>}
                    {c.diagnosis && (<p className="text-sm mt-3"><span className="font-semibold text-[#2C5545]">Diagnosis:</span> {c.diagnosis}</p>)}
                    <div className="grid sm:grid-cols-3 gap-3 mt-3">
                      <ChipList icon={Leaf} title="Treatment" items={c.treatment} />
                      <ChipList icon={Salad} title="Diet" items={c.diet} />
                      <ChipList icon={Activity} title="Lifestyle" items={c.lifestyle} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3" data-testid="presc-list">
                {prescriptions.length === 0 && <Empty text="No prescriptions generated yet." />}
                {prescriptions.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-[#0F1C17]">{p.patient_name}</p>
                      <span className="text-xs text-[#4A5E55]">{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm mt-2"><span className="font-medium text-[#2C5545]">Medicines:</span> {p.medicines}</p>
                    <p className="text-sm text-[#4A5E55] mt-1">{p.instructions}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function VoicePanel({ onDone }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [patient, setPatient] = useState("");
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    if (!patient.trim()) { toast.error("Enter patient name first"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); upload(); };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stop = () => { mediaRef.current?.stop(); setRecording(false); };

  const upload = async () => {
    setProcessing(true);
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("audio", blob, "consult.webm");
    fd.append("patient_name", patient.trim());
    try {
      await api.post("/doctor/consultation/voice", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Case sheet generated from voice");
      setPatient("");
      onDone();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" data-testid="voice-panel">
      <div className="flex items-center gap-2 mb-4">
        <Mic className="h-5 w-5 text-[#E88D67]" />
        <h3 className="font-display text-lg font-semibold text-[#0F1C17]">Voice Consultation</h3>
      </div>
      <input data-testid="voice-patient" value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Patient name"
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545] mb-4" />
      <div className="flex flex-col items-center py-2">
        {!recording ? (
          <button data-testid="voice-record-btn" onClick={start} disabled={processing}
            className="h-20 w-20 rounded-full bg-[#E88D67] hover:bg-[#d97a54] text-white grid place-items-center transition-colors disabled:opacity-60">
            {processing ? <Loader2 className="h-7 w-7 animate-spin" /> : <Mic className="h-8 w-8" />}
          </button>
        ) : (
          <button data-testid="voice-stop-btn" onClick={stop} className="h-20 w-20 rounded-full bg-red-500 hover:bg-red-600 text-white grid place-items-center mic-pulse transition-colors">
            <Square className="h-7 w-7" />
          </button>
        )}
        <p className="text-sm text-[#4A5E55] mt-3">
          {processing ? "Transcribing & analysing…" : recording ? "Recording… speak in Hindi" : "Tap to record complaint"}
        </p>
      </div>
    </div>
  );
}

function SamhitaPanel({ onDone }) {
  const [patient, setPatient] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!patient.trim() || !symptoms.trim()) { toast.error("Enter patient & symptoms"); return; }
    setLoading(true);
    try {
      await api.post("/doctor/samhita/analyze", { patient_name: patient.trim(), symptoms: symptoms.trim() });
      toast.success("Samhita analysis complete");
      setPatient(""); setSymptoms(""); onDone();
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" data-testid="samhita-panel">
      <div className="flex items-center gap-2 mb-4">
        <Stethoscope className="h-5 w-5 text-[#2C5545]" />
        <h3 className="font-display text-lg font-semibold text-[#0F1C17]">Samhita Analysis</h3>
      </div>
      <input data-testid="samhita-patient" value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Patient name"
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545] mb-3" />
      <textarea data-testid="samhita-symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={3} placeholder="Describe symptoms (e.g. chronic indigestion, low energy, joint pain)…"
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545] resize-none mb-3" />
      <button data-testid="samhita-analyze-btn" onClick={analyze} disabled={loading}
        className="w-full bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-5 py-2.5 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Leaf className="h-4 w-4" />} Analyse with AI
      </button>
    </div>
  );
}

function PrescriptionPanel({ onDone }) {
  const [f, setF] = useState({ patient_name: "", medicines: "", instructions: "" });
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!f.patient_name.trim() || !f.medicines.trim()) { toast.error("Patient & medicines required"); return; }
    setLoading(true);
    try {
      await api.post("/doctor/prescription", f);
      toast.success("Prescription generated");
      setF({ patient_name: "", medicines: "", instructions: "" }); onDone();
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" data-testid="prescription-panel">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-[#0EA5A0]" />
        <h3 className="font-display text-lg font-semibold text-[#0F1C17]">New Prescription</h3>
      </div>
      <input data-testid="presc-patient" value={f.patient_name} onChange={(e) => setF({ ...f, patient_name: e.target.value })} placeholder="Patient name"
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545] mb-3" />
      <input data-testid="presc-medicines" value={f.medicines} onChange={(e) => setF({ ...f, medicines: e.target.value })} placeholder="Medicines (comma separated)"
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545] mb-3" />
      <input data-testid="presc-instructions" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="Instructions / dosage"
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545] mb-3" />
      <button data-testid="presc-submit-btn" onClick={submit} disabled={loading}
        className="w-full bg-white border border-[#2C5545] text-[#2C5545] hover:bg-[#2C5545]/5 rounded-full px-5 py-2.5 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Generate
      </button>
    </div>
  );
}

function ChipList({ icon: Icon, title, items = [] }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#2C5545] mb-1.5"><Icon className="h-3.5 w-3.5" /> {title}</p>
      <ul className="space-y-1">
        {(items || []).slice(0, 4).map((it, i) => <li key={i} className="text-xs text-[#4A5E55] leading-snug">• {it}</li>)}
        {(!items || items.length === 0) && <li className="text-xs text-slate-400">—</li>}
      </ul>
    </div>
  );
}

const TabBtn = ({ active, children, testid, ...p }) => (
  <button data-testid={testid} {...p} className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${active ? "bg-[#2C5545] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{children}</button>
);
const Empty = ({ text }) => <p className="text-sm text-slate-400 py-10 text-center">{text}</p>;
