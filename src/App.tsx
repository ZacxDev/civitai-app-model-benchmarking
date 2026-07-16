import { useBlockContext } from '@civitai/blocks-react';

// Starter block: prints the slot context (model + viewer info) so the
// developer can verify the iframe handshake is alive before doing anything
// real. Replace with your actual UI.
export function App() {
  const ctx = useBlockContext();

  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        padding: 16,
        color: '#1a1b1e',
      }}
    >
      <h1 style={{ fontSize: 18, marginTop: 0 }}>Civitai App Block — starter</h1>
      <p style={{ color: '#495057', fontSize: 14 }}>
        This is the starter template. Replace <code>src/App.tsx</code> with your
        block's UI. The host has already initialised the message bridge — use
        the hooks from <code>@civitai/blocks-react</code> to talk to civitai.
      </p>
      <h2 style={{ fontSize: 14, marginTop: 24 }}>Slot context</h2>
      <pre
        style={{
          background: '#f8f9fa',
          padding: 12,
          borderRadius: 6,
          fontSize: 12,
          overflowX: 'auto',
        }}
      >
        {JSON.stringify(ctx, null, 2)}
      </pre>
    </main>
  );
}
