import { useState, useEffect } from 'react';

export function useKernelEvents() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/v1/events/stream');

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setEvents((prev) => [parsed, ...prev.slice(0, 49)]);
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    return () => eventSource.close();
  }, []);

  return events;
}
