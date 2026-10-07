export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getCorsair } = await import("@/server/corsair");
  try {
    getCorsair();
  } catch (error) {
    console.error("Corsair did not start", error instanceof Error ? error.message : "error");
  }
}
