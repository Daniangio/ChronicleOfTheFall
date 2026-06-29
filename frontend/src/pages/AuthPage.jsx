import { useState } from "react";
import { signInWithEmail, signUpWithEmail } from "../lib/firebase.js";

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(email.trim(), password);
      }
    } catch (err) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="imperial-theme flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-amber-900/60 bg-slate-900 shadow-2xl md:grid-cols-[1fr_24rem]">
        <div className="flex min-h-[28rem] flex-col justify-between bg-[radial-gradient(circle_at_20%_20%,rgba(180,123,54,0.28),transparent_32%),linear-gradient(135deg,#1b1008,#0f0a06_55%,#2c1a0c)] p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-200">
              Echoes of Empire
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-normal text-white">
              Chronicle the rise and collapse of a shared empire.
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-300">
            Sign in to prepare the cooperative narrative strategy engine, manage the
            catalog, and join future chronicles.
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5 p-6">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              {isLogin ? "Sign in" : "Create account"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Firebase email/password authentication is used in development and production.
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
              required
              disabled={loading}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
              required
              disabled={loading}
            />
          </label>

          {error ? <p className="rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-md bg-amber-300 px-4 py-2 font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Working..." : isLogin ? "Sign in" : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsLogin((value) => !value);
              setError("");
            }}
            className="w-full text-sm font-medium text-amber-200 hover:text-amber-100"
            disabled={loading}
          >
            {isLogin ? "Need an account? Register" : "Already have an account? Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
};

export default AuthPage;
