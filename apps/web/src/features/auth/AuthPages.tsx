import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, signupSchema } from "@assetflow/contracts";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "./AuthProvider";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "admin@assetflow.local", password: "AssetFlow123!" },
  });
  const errs = form.formState.errors;
  if (auth.user) return <Navigate to="/dashboard" replace />;
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to manage your organization's assets.">
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setError("");
          try {
            await auth.login(values);
            navigate("/dashboard");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to sign in.");
          }
        })}
      >
        <label>
          Email
          <input type="email" autoComplete="email" {...form.register("email")} />
          {errs.email && <span className="field-error">{errs.email.message}</span>}
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" {...form.register("password")} />
          {errs.password && <span className="field-error">{errs.password.message}</span>}
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </button>
        <p className="auth-switch">
          New employee? <Link to="/signup">Create account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });
  const errs = form.formState.errors;
  if (auth.user) return <Navigate to="/dashboard" replace />;
  return (
    <AuthLayout title="Join AssetFlow" subtitle="New accounts start with Employee access.">
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setError("");
          try {
            await auth.signup(values);
            navigate("/dashboard");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to create account.");
          }
        })}
      >
        <div className="form-grid">
          <label>
            First name
            <input {...form.register("firstName")} />
            {errs.firstName && <span className="field-error">{errs.firstName.message}</span>}
          </label>
          <label>
            Last name
            <input {...form.register("lastName")} />
            {errs.lastName && <span className="field-error">{errs.lastName.message}</span>}
          </label>
        </div>
        <label>
          Email
          <input type="email" {...form.register("email")} />
          {errs.email && <span className="field-error">{errs.email.message}</span>}
        </label>
        <label>
          Password
          <input type="password" {...form.register("password")} />
          {errs.password && <span className="field-error">{errs.password.message}</span>}
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full">Create employee account</button>
        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <span className="auth-logo">AF</span>
        <div>
          <p className="eyebrow">One operational source of truth</p>
          <h1>Know where every asset is, who has it, and what happens next.</h1>
        </div>
        <p>Allocation, scheduling, maintenance, and audit workflows in one calm workspace.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">AssetFlow</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

