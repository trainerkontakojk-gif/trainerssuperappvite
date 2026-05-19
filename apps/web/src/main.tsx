import React from 'react';
import ReactDOM from 'react-dom/client';
import { hc } from 'hono/client';
import type { AppType } from '@trainers/api';

const client = hc<AppType>('http://localhost:3001');

function App() {
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    client.api.health.$get().then(res => res.json()).then(setData);
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Trainers SuperApp</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
