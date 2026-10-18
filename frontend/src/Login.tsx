import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import { ClipboardCheck, LoaderCircle } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", { email, password });
      const token = response.data.data?.accessToken;

      if (!token) {
        throw new Error("The server did not return an access token.");
      }

      localStorage.setItem("accessToken", token);
      navigate("/dashboard");
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : undefined;

      setError(
        message || (err instanceof Error ? err.message : "Login failed."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-icon">
          <ClipboardCheck size={28} />
        </div>

        <p className="eyebrow">INTERNAL OPERATIONS</p>
        <h1>Newtonite Ops</h1>
        <p className="subtitle">
          Sign in to manage work, track progress, and review approvals.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Work email</label>
          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            type="password"
            name="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spinner" size={18} /> : null}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="login-footer">Secure access for your team</p>
      </section>
    </main>
  );
}
