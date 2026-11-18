import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="container">
      <h1>Welcome</h1>
      <p>Your app is running. Edit <code>src/App.tsx</code> to get started.</p>
      <button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</button>
    </main>
  );
}
