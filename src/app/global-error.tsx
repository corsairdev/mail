"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", padding: 32 }}>
        <h1>mail hit an unexpected error</h1>
        <button type="button" onClick={reset}>Reload</button>
      </body>
    </html>
  );
}
