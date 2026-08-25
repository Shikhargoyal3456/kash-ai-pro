import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Leaf, Loader2, Stethoscope, Store, Bike, ShoppingBag } from "lucide-react";
import { useAuth, roleHome } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import GoogleIcon from "@/components/GoogleIcon";

const roleOptions = [
  { key: "user", label: "Customer", icon: ShoppingBag },
  { key: "doctor", label: "Doctor", icon: Stethoscope },
  { key: "pharmacy", label: "Pharmacy", icon: Store },
  { key: "delivery", label: "Delivery", icon: Bike },
];

export default function Register() {
  const { register, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get("role") || "user");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setEx = (k) => (e) => setExtra({ ...extra, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await register({ ...form, email: form.email.trim(), role, ...extra });
      toast.success(`Account created — welcome, ${u.name}!`);
      navigate(roleHome(u.role));
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-12 bg-[#F4F7F5]">
      <div className="w-full max-w-lg">
        <Link to="/" className="flex items-center gap-2 mb-8 w-fit">
          <div className="h-9 w-9 rounded-xl bg-[#2C5545] grid place-items-center"><Leaf className="h-5 w-5 text-white" /></div>
          <span className="font-display font-bold text-lg">Kash AI</span>
        </Link>
        <h1 className="font-display text-3xl font-bold text-[#0F1C17]">Create your account</h1>
        <p className="text-[#4A5E55] mt-2">Pick your role to get a tailored experience.</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {roleOptions.map((r) => (
            <button key={r.key} type="button" onClick={() => setRole(r.key)} data-testid={`role-select-${r.key}`}
              className={`rounded-xl border p-3 flex flex-col items-center gap-2 transition-all ${role === r.key ? "border-[#2C5545] bg-[#2C5545]/5 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <r.icon className={`h-5 w-5 ${role === r.key ? "text-[#2C5545]" : "text-slate-400"}`} />
              <span className={`text-xs font-medium ${role === r.key ? "text-[#2C5545]" : "text-slate-500"}`}>{r.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Full name" testid="reg-name" value={form.name} onChange={set("name")} placeholder="Your name" required />
          <Field label="Email" type="email" testid="reg-email" value={form.email} onChange={set("email")} placeholder="you@example.com" required />
          <Field label="Password" type="password" testid="reg-password" value={form.password} onChange={set("password")} placeholder="Min 6 characters" required />

          {role === "doctor" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Specialization" testid="reg-spec" value={extra.specialization || ""} onChange={setEx("specialization")} placeholder="e.g. Panchakarma" />
              <Field label="Clinic name" testid="reg-clinic" value={extra.clinic_name || ""} onChange={setEx("clinic_name")} placeholder="Clinic" />
            </div>
          )}
          {role === "pharmacy" && (
            <>
              <Field label="Store name" testid="reg-store" value={extra.store_name || ""} onChange={setEx("store_name")} placeholder="Store name" />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Address" testid="reg-address" value={extra.address || ""} onChange={setEx("address")} placeholder="City / area" />
                <Field label="License no." testid="reg-license" value={extra.license_number || ""} onChange={setEx("license_number")} placeholder="License" />
              </div>
            </>
          )}
          {role === "delivery" && (
            <Field label="Vehicle type" testid="reg-vehicle" value={extra.vehicle_type || ""} onChange={setEx("vehicle_type")} placeholder="e.g. Bike, Scooter" />
          )}

          <button data-testid="register-submit" disabled={loading} className="w-full bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-6 py-3.5 font-medium transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Create account
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-slate-200" /><span className="text-xs text-slate-400">or</span><div className="h-px flex-1 bg-slate-200" />
        </div>
        <button type="button" data-testid="google-signup-btn" onClick={googleLogin}
          className="w-full border border-slate-200 bg-white hover:bg-slate-50 rounded-full px-6 py-3 font-medium text-[#0F1C17] transition-colors flex items-center justify-center gap-2.5">
          <GoogleIcon /> Continue with Google
        </button>
        <p className="text-[11px] text-slate-400 mt-3 text-center">Google sign-up creates a Customer account.</p>

        <p className="text-sm text-[#4A5E55] mt-6">
          Already have an account? <Link to="/login" className="text-[#2C5545] font-medium hover:underline" data-testid="to-login">Log in</Link>
        </p>
        <p className="text-[11px] text-slate-400 mt-4">
          By continuing you agree to our <Link to="/terms" className="underline hover:text-[#2C5545]">Terms</Link> & <Link to="/privacy" className="underline hover:text-[#2C5545]">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

function Field({ label, testid, type = "text", ...props }) {
  return (
    <div>
      <label className="text-sm font-medium text-[#0F1C17]">{label}</label>
      <input data-testid={testid} type={type} {...props}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#2C5545] focus:ring-2 focus:ring-[#2C5545]/15 transition" />
    </div>
  );
}
