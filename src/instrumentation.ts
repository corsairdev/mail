export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getCorsair } = await import("@/server/corsair");
  try {
    getCorsair();
    setTimeout(() => {
      void import("@/server/sync")
        .then(({ renewAllWatches }) => renewAllWatches())
        .then((result) => {
          console.info("[webhook] watches renewed", result.renewed.join(",") || "none");
        })
        .catch((error: unknown) => {
          console.error("[webhook] watch", error instanceof Error ? error.message : "failed");
        });
    }, 8000);
  } catch (error) {
    console.error("Corsair did not start", error instanceof Error ? error.message : "error");
  }
}
