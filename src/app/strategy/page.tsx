import { redirect } from "next/navigation";

export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const strategyId = params.id;

  if (strategyId) {
    redirect(`/dashboard?id=${encodeURIComponent(strategyId)}`);
  }

  redirect("/dashboard");
}
