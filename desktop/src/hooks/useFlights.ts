import { useState, useCallback, useEffect } from 'react';

export type FlightStatus = 'planned' | 'booked' | 'completed' | 'cancelled';
export type FlightKind = 'flight' | 'hotel';

export interface Flight {
  id: string;
  kind: FlightKind;
  title: string;
  status: FlightStatus;
  departDate: string;
  departTime?: string;
  arriveDate?: string;
  arriveTime?: string;
  notes: string;
  imageUri?: string;
  createdAt: string;
}

const STORAGE_KEY = 'flights';

function load(): Flight[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export function useFlights() {
  const [flights, setFlights] = useState<Flight[]>(load);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(flights)); }, [flights]);

  const addFlight = useCallback((f: Omit<Flight, 'id' | 'createdAt'>) => {
    const flight: Flight = { ...f, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setFlights(prev => [flight, ...prev]);
  }, []);

  const updateFlight = useCallback((id: string, fields: Partial<Omit<Flight, 'id' | 'createdAt'>>) => {
    setFlights(prev => prev.map(f => f.id === id ? { ...f, ...fields } : f));
  }, []);

  const removeFlight = useCallback((id: string) => {
    setFlights(prev => prev.filter(f => f.id !== id));
  }, []);

  return { flights, addFlight, updateFlight, removeFlight };
}
