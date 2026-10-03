import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 font-display text-xl text-white">
            T
          </span>
          <span className="font-display text-2xl text-ink-50">TurnKeep</span>
        </div>
        <div className="card card-pad">
          <h1 className="mb-1 font-display text-xl text-ink-800">Sign in</h1>
          <p className="mb-5 text-sm text-ink-500">
            Cleaning, maintenance and turnover operations.
          </p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
