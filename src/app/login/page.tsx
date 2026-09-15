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
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            T
          </span>
          <span className="text-xl font-semibold text-white">TurnKeep</span>
        </div>
        <div className="card card-pad">
          <h1 className="mb-1 text-lg font-semibold text-ink-900">Sign in</h1>
          <p className="mb-4 text-sm text-ink-500">
            Cleaning, maintenance and turnover operations.
          </p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
