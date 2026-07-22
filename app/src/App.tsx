import { useEffect, useState } from "react";
import type { ModuleDef } from "./modules";
import {
  BUILTIN, deleteModule, getLastModuleId, listSavedModules, saveModule,
  setLastModuleId, setTitleOverride, titleOverrides,
} from "./modules";
import { ModuleView } from "./ModuleView";
import { Home } from "./Home";

export default function App() {
  const [modules, setModules] = useState<ModuleDef[]>([BUILTIN]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await listSavedModules();
      const all = [BUILTIN, ...saved.filter(m => m.id !== BUILTIN.id)];
      const titles = titleOverrides();
      for (const m of all) if (titles[m.id]) m.title = titles[m.id];
      setModules(all);
      /* come straight back to the last-used module — at the table you
         want the map, not a menu */
      const last = getLastModuleId();
      if (all.some(m => m.id === last)) setOpenId(last);
      setReady(true);
    })();
  }, []);

  /* swallow clicks on pin links while editing (belt and braces —
     hrefs are also removed in edit mode) */
  useEffect(() => {
    const block = (e: MouseEvent) => {
      if (document.body.classList.contains("editing") && (e.target as Element).closest?.("a.pin")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    document.addEventListener("click", block, true);
    return () => document.removeEventListener("click", block, true);
  }, []);

  const open = (id: string) => { setLastModuleId(id); setOpenId(id); };

  const create = (m: ModuleDef) => {
    void saveModule(m);
    setModules(ms => [...ms.filter(x => x.id !== m.id), m]);
    open(m.id);
  };

  const remove = (id: string) => {
    void deleteModule(id);
    setModules(ms => ms.filter(x => x.id !== id));
  };

  const rename = (id: string, title: string) => {
    setTitleOverride(id, title);
    setModules(ms => ms.map(m => {
      if (m.id !== id) return m;
      m.title = title;                      // keep the same object: open views hold it
      if (!m.builtin) void saveModule(m);
      return m;
    }));
  };

  if (!ready) return null;

  const current = openId ? modules.find(m => m.id === openId) : undefined;
  if (current) {
    return <ModuleView key={current.id} module={current} onBack={() => setOpenId(null)} />;
  }
  return <Home modules={modules} onOpen={open} onCreate={create} onDelete={remove} onRename={rename} />;
}
