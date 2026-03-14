import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  openDatabase,
  getDb,
  getSyncFolderSetting,
  onSyncFolderChanged,
} from "../services/db";
import type { SportEntry, SportType } from "../hooks/useSport";
import type { Exercise, WorkoutLog } from "../hooks/useExercises";
import type { Flight, FlightKind, FlightStatus } from "../hooks/useFlights";
import type { RoutineItem } from "../hooks/useRoutines";
import type { CheckItem } from "../hooks/useChecklist";

interface DbState {
  ready: boolean;
  syncFolder: string | null;
  // Sport
  sportEntries: SportEntry[];
  addSportEntry: (
    type: SportType,
    count: number,
    label?: string,
  ) => Promise<void>;
  removeSportEntry: (id: string) => Promise<void>;
  updateSportEntry: (
    id: string,
    updates: { count?: number; label?: string },
  ) => Promise<void>;
  // Exercises
  exercises: Exercise[];
  workoutLogs: WorkoutLog[];
  addExercise: (
    name: string,
    weightType: number,
    tag?: string,
    description?: string,
  ) => Promise<number>;
  updateExercise: (
    id: number,
    u: Partial<Pick<Exercise, "name" | "weightType" | "tag" | "description">>,
  ) => Promise<void>;
  removeExercise: (id: number) => Promise<void>;
  addWorkoutLog: (
    exerciseId: number,
    weight: number,
    reps: number,
    setNum: number,
  ) => Promise<void>;
  removeWorkoutLog: (id: number) => Promise<void>;
  // Flights
  flights: Flight[];
  addFlight: (f: Omit<Flight, "id" | "createdAt">) => Promise<void>;
  updateFlight: (
    id: string,
    fields: Partial<Omit<Flight, "id" | "createdAt">>,
  ) => Promise<void>;
  removeFlight: (id: string) => Promise<void>;
  // Routines
  routineItems: RoutineItem[];
  routineCompletedToday: string[];
  addRoutineItem: (title: string) => Promise<void>;
  updateRoutineItem: (id: string, title: string) => Promise<void>;
  removeRoutineItem: (id: string) => Promise<void>;
  toggleRoutineComplete: (id: string) => Promise<void>;
  reorderRoutine: (fromIdx: number, toIdx: number) => Promise<void>;
  // Checklist
  checkItems: CheckItem[];
  addCheckItem: (title: string) => Promise<void>;
  toggleCheckItem: (id: string) => Promise<void>;
  updateCheckItem: (id: string, title: string) => Promise<void>;
  removeCheckItem: (id: string) => Promise<void>;
  // Reload
  reload: () => Promise<void>;
}

const DatabaseCtx = createContext<DbState>(null as any);
export const useDatabase = () => useContext(DatabaseCtx);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function nowTs() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [syncFolder, setSyncFolder] = useState<string | null>(
    getSyncFolderSetting(),
  );
  const [sportEntries, setSportEntries] = useState<SportEntry[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [routineItems, setRoutineItems] = useState<RoutineItem[]>([]);
  const [routineCompletedToday, setRoutineCompletedToday] = useState<string[]>(
    [],
  );
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);

  const loadAll = useCallback(async () => {
    const db = getDb();
    if (!db) return;
    const today = todayStr();
    const [sport, exs, logs, fl, rItems, rComps, checks] = await Promise.all([
      db.select<any[]>(
        "SELECT * FROM sport_entries ORDER BY date DESC, time DESC",
      ),
      db.select<any[]>("SELECT * FROM exercises ORDER BY tag, name"),
      db.select<any[]>(
        "SELECT * FROM workout_logs ORDER BY date DESC, created_at DESC",
      ),
      db.select<any[]>("SELECT * FROM flights ORDER BY depart_date DESC"),
      db.select<any[]>("SELECT * FROM routines ORDER BY sort_order"),
      db.select<any[]>(
        "SELECT routine_id FROM routine_completions WHERE date = $1",
        [today],
      ),
      db.select<any[]>("SELECT * FROM checklist ORDER BY created_at DESC"),
    ]);
    setSportEntries(
      sport.map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label || undefined,
        count: r.count,
        date: r.date,
        time: r.time,
      })),
    );
    setExercises(
      exs.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description || null,
        tag: r.tag || null,
        weightType: r.weight_type ?? 10,
        imageUri: r.image_uri || undefined,
      })),
    );
    setWorkoutLogs(
      logs.map((r) => ({
        id: r.id,
        exerciseId: r.exercise_id,
        weight: r.weight,
        reps: r.reps,
        setNum: r.set_num || 1,
        date: r.date,
        createdAt: r.created_at || r.date,
      })),
    );
    setFlights(
      fl.map((r) => ({
        id: r.id,
        kind: r.kind || "flight",
        title: r.title,
        status: r.status,
        departDate: r.depart_date,
        departTime: r.depart_time || undefined,
        arriveDate: r.arrive_date || undefined,
        arriveTime: r.arrive_time || undefined,
        notes: r.notes,
        imageUri: r.image_data || undefined,
        createdAt: r.created_at,
      })),
    );
    setRoutineItems(
      rItems.map((r) => ({ id: r.id, title: r.title, order: r.sort_order })),
    );
    setRoutineCompletedToday(rComps.map((r: any) => r.routine_id));
    setCheckItems(
      checks.map((r) => ({
        id: r.id,
        title: r.title,
        done: !!r.done,
        createdAt: r.created_at,
      })),
    );
  }, []);

  useEffect(() => {
    const folder = getSyncFolderSetting();
    if (!folder) {
      setReady(true);
      return;
    }
    setSyncFolder(folder);
    openDatabase(folder)
      .then(() => loadAll())
      .then(() => setReady(true))
      .catch((e) => {
        console.error("DB open error:", e);
        setReady(true);
      });
  }, [loadAll]);

  useEffect(() => {
    return onSyncFolderChanged((folder) => {
      setSyncFolder(folder);
      if (!folder) {
        setSportEntries([]);
        setExercises([]);
        setWorkoutLogs([]);
        setFlights([]);
        setRoutineItems([]);
        setRoutineCompletedToday([]);
        setCheckItems([]);
        setReady(true);
        return;
      }
      setReady(false);
      openDatabase(folder)
        .then(() => loadAll())
        .then(() => setReady(true))
        .catch((e) => {
          console.error("DB switch error:", e);
          setReady(true);
        });
    });
  }, [loadAll]);

  // Sport
  const addSportEntry = useCallback(
    async (type: SportType, count: number, label?: string) => {
      const id = crypto.randomUUID(),
        date = todayStr(),
        time = nowTime();
      const entry: SportEntry = { id, type, count, label, date, time };
      setSportEntries((p) => [entry, ...p]);
      const db = getDb();
      if (db)
        await db.execute(
          "INSERT INTO sport_entries (id,type,label,count,date,time) VALUES ($1,$2,$3,$4,$5,$6)",
          [id, type, label || null, count, date, time],
        );
    },
    [],
  );
  const removeSportEntry = useCallback(async (id: string) => {
    setSportEntries((p) => p.filter((e) => e.id !== id));
    const db = getDb();
    if (db) await db.execute("DELETE FROM sport_entries WHERE id=$1", [id]);
  }, []);
  const updateSportEntry = useCallback(
    async (id: string, u: { count?: number; label?: string }) => {
      setSportEntries((p) => p.map((e) => (e.id === id ? { ...e, ...u } : e)));
      const db = getDb();
      if (!db) return;
      if (u.count !== undefined)
        await db.execute("UPDATE sport_entries SET count=$1 WHERE id=$2", [
          u.count,
          id,
        ]);
      if (u.label !== undefined)
        await db.execute("UPDATE sport_entries SET label=$1 WHERE id=$2", [
          u.label,
          id,
        ]);
    },
    [],
  );

  // Exercises
  const addExercise = useCallback(
    async (
      name: string,
      weightType: number,
      tag?: string,
      description?: string,
    ) => {
      const db = getDb();
      if (!db) return 0;
      const res = await db.execute(
        "INSERT INTO exercises (name,weight_type,tag,description,is_preset) VALUES ($1,$2,$3,$4,0)",
        [name, weightType, tag || null, description || null],
      );
      const id = res.lastInsertId ?? 0;
      setExercises((p) => [
        ...p,
        {
          id,
          name,
          description: description || null,
          tag: tag || null,
          weightType,
        },
      ]);
      return id;
    },
    [],
  );
  const updateExercise = useCallback(
    async (
      id: number,
      u: Partial<Pick<Exercise, "name" | "weightType" | "tag" | "description">>,
    ) => {
      setExercises((p) => p.map((e) => (e.id === id ? { ...e, ...u } : e)));
      const db = getDb();
      if (!db) return;
      const ex = exercises.find((e) => e.id === id);
      if (!ex) return;
      const m = { ...ex, ...u };
      await db.execute(
        "UPDATE exercises SET name=$1,weight_type=$2,tag=$3,description=$4 WHERE id=$5",
        [m.name, m.weightType, m.tag, m.description, id],
      );
    },
    [exercises],
  );
  const removeExercise = useCallback(async (id: number) => {
    setExercises((p) => p.filter((e) => e.id !== id));
    setWorkoutLogs((p) => p.filter((l) => l.exerciseId !== id));
    const db = getDb();
    if (db) await db.execute("DELETE FROM exercises WHERE id=$1", [id]);
  }, []);
  const addWorkoutLog = useCallback(
    async (
      exerciseId: number,
      weight: number,
      reps: number,
      setNum: number,
    ) => {
      const db = getDb();
      if (!db) return;
      const date = todayStr(),
        createdAt = nowTs();
      const res = await db.execute(
        "INSERT INTO workout_logs (exercise_id,weight,reps,set_num,date,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [exerciseId, weight, reps, setNum, date, createdAt],
      );
      setWorkoutLogs((p) => [
        {
          id: res.lastInsertId ?? 0,
          exerciseId,
          weight,
          reps,
          setNum,
          date,
          createdAt,
        },
        ...p,
      ]);
    },
    [],
  );
  const removeWorkoutLog = useCallback(async (id: number) => {
    setWorkoutLogs((p) => p.filter((l) => l.id !== id));
    const db = getDb();
    if (db) await db.execute("DELETE FROM workout_logs WHERE id=$1", [id]);
  }, []);

  // Flights
  const addFlight = useCallback(async (f: Omit<Flight, "id" | "createdAt">) => {
    const id = crypto.randomUUID(),
      createdAt = new Date().toISOString();
    const flight: Flight = { ...f, id, createdAt };
    setFlights((p) => [flight, ...p]);
    const db = getDb();
    if (db)
      await db.execute(
        "INSERT INTO flights (id,kind,title,status,depart_date,depart_time,arrive_date,arrive_time,notes,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          id,
          f.kind,
          f.title,
          f.status,
          f.departDate,
          f.departTime || null,
          f.arriveDate || null,
          f.arriveTime || null,
          f.notes,
          createdAt,
        ],
      );
  }, []);
  const updateFlight = useCallback(
    async (id: string, fields: Partial<Omit<Flight, "id" | "createdAt">>) => {
      setFlights((p) => p.map((f) => (f.id === id ? { ...f, ...fields } : f)));
      const db = getDb();
      if (!db) return;
      const cols: string[] = [],
        vals: any[] = [];
      const map: Record<string, string> = {
        kind: "kind",
        title: "title",
        status: "status",
        departDate: "depart_date",
        departTime: "depart_time",
        arriveDate: "arrive_date",
        arriveTime: "arrive_time",
        notes: "notes",
      };
      let i = 1;
      for (const [k, col] of Object.entries(map)) {
        if ((fields as any)[k] !== undefined) {
          cols.push(`${col}=$${i}`);
          vals.push((fields as any)[k]);
          i++;
        }
      }
      if (cols.length) {
        vals.push(id);
        await db.execute(
          `UPDATE flights SET ${cols.join(",")} WHERE id=$${i}`,
          vals,
        );
      }
    },
    [],
  );
  const removeFlight = useCallback(async (id: string) => {
    setFlights((p) => p.filter((f) => f.id !== id));
    const db = getDb();
    if (db) await db.execute("DELETE FROM flights WHERE id=$1", [id]);
  }, []);

  // Routines
  const addRoutineItem = useCallback(
    async (title: string) => {
      const id = crypto.randomUUID(),
        order = routineItems.length;
      setRoutineItems((p) => [...p, { id, title, order }]);
      const db = getDb();
      if (db)
        await db.execute(
          "INSERT INTO routines (id,title,sort_order) VALUES ($1,$2,$3)",
          [id, title, order],
        );
    },
    [routineItems.length],
  );
  const updateRoutineItem = useCallback(async (id: string, title: string) => {
    setRoutineItems((p) => p.map((i) => (i.id === id ? { ...i, title } : i)));
    const db = getDb();
    if (db)
      await db.execute("UPDATE routines SET title=$1 WHERE id=$2", [title, id]);
  }, []);
  const removeRoutineItem = useCallback(async (id: string) => {
    setRoutineItems((p) => p.filter((i) => i.id !== id));
    const db = getDb();
    if (db) {
      await db.execute("DELETE FROM routines WHERE id=$1", [id]);
      await db.execute("DELETE FROM routine_completions WHERE routine_id=$1", [
        id,
      ]);
    }
  }, []);
  const toggleRoutineComplete = useCallback(
    async (id: string) => {
      const today = todayStr();
      setRoutineCompletedToday((p) =>
        p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
      );
      const db = getDb();
      if (!db) return;
      const has = routineCompletedToday.includes(id);
      if (has)
        await db.execute(
          "DELETE FROM routine_completions WHERE routine_id=$1 AND date=$2",
          [id, today],
        );
      else
        await db.execute(
          "INSERT OR IGNORE INTO routine_completions (routine_id,date) VALUES ($1,$2)",
          [id, today],
        );
    },
    [routineCompletedToday],
  );
  const reorderRoutine = useCallback(
    async (fromIdx: number, toIdx: number) => {
      setRoutineItems((p) => {
        const sorted = [...p].sort((a, b) => a.order - b.order);
        const [moved] = sorted.splice(fromIdx, 1);
        sorted.splice(toIdx, 0, moved);
        return sorted.map((item, i) => ({ ...item, order: i }));
      });
      // Save all orders
      const db = getDb();
      if (!db) return;
      const sorted = [...routineItems].sort((a, b) => a.order - b.order);
      const [moved] = sorted.splice(fromIdx, 1);
      sorted.splice(toIdx, 0, moved);
      for (let i = 0; i < sorted.length; i++) {
        await db.execute("UPDATE routines SET sort_order=$1 WHERE id=$2", [
          i,
          sorted[i].id,
        ]);
      }
    },
    [routineItems],
  );

  // Checklist
  const addCheckItem = useCallback(async (title: string) => {
    const id = crypto.randomUUID(),
      createdAt = new Date().toISOString();
    setCheckItems((p) => [{ id, title, done: false, createdAt }, ...p]);
    const db = getDb();
    if (db)
      await db.execute(
        "INSERT INTO checklist (id,title,done,created_at) VALUES ($1,$2,0,$3)",
        [id, title, createdAt],
      );
  }, []);
  const toggleCheckItem = useCallback(
    async (id: string) => {
      setCheckItems((p) =>
        p.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
      );
      const db = getDb();
      if (!db) return;
      const item = checkItems.find((i) => i.id === id);
      if (item)
        await db.execute("UPDATE checklist SET done=$1 WHERE id=$2", [
          item.done ? 0 : 1,
          id,
        ]);
    },
    [checkItems],
  );
  const updateCheckItem = useCallback(async (id: string, title: string) => {
    setCheckItems((p) => p.map((i) => (i.id === id ? { ...i, title } : i)));
    const db = getDb();
    if (db)
      await db.execute("UPDATE checklist SET title=$1 WHERE id=$2", [
        title,
        id,
      ]);
  }, []);
  const removeCheckItem = useCallback(async (id: string) => {
    setCheckItems((p) => p.filter((i) => i.id !== id));
    const db = getDb();
    if (db) await db.execute("DELETE FROM checklist WHERE id=$1", [id]);
  }, []);

  const value: DbState = {
    ready,
    syncFolder,
    sportEntries,
    addSportEntry,
    removeSportEntry,
    updateSportEntry,
    exercises,
    workoutLogs,
    addExercise,
    updateExercise,
    removeExercise,
    addWorkoutLog,
    removeWorkoutLog,
    flights,
    addFlight,
    updateFlight,
    removeFlight,
    routineItems,
    routineCompletedToday,
    addRoutineItem,
    updateRoutineItem,
    removeRoutineItem,
    toggleRoutineComplete,
    reorderRoutine,
    checkItems,
    addCheckItem,
    toggleCheckItem,
    updateCheckItem,
    removeCheckItem,
    reload: loadAll,
  };

  return <DatabaseCtx.Provider value={value}>{children}</DatabaseCtx.Provider>;
}
