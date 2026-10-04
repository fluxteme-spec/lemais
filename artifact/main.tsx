import { createRoot } from "react-dom/client";
import { RouterProvider, useNav } from "./router";
import { AppStateProvider, StorageBanner } from "@/components/AppState";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { repo, setRepo, IndexedDbRepository } from "@/lib/persistence";
import { MemoryRepository } from "./memory-repo";
import HomePage from "@/app/page";
import TrainPage from "@/app/treinar/page";
import ProgressPage from "@/app/progresso/page";
import SettingsPage from "@/app/configuracoes/page";
import PreparePage from "@/app/preparar/[id]/page";
import ReaderPage from "@/app/ler/[id]/page";
import SessionPage from "@/app/sessao/[id]/page";
import TermsPage from "@/app/termos/page";
import PrivacyPage from "@/app/privacidade/page";
import ConectarIAPage from "./ConectarIA";

let memoryOnly = false;

function Page() {
  const { path } = useNav();
  const first = "/" + (path.split("/")[1] ?? "");
  switch (first) {
    case "/treinar":
      return <TrainPage />;
    case "/progresso":
      return <ProgressPage />;
    case "/configuracoes":
      return <SettingsPage />;
    case "/preparar":
      return <PreparePage key={path} />;
    case "/ler":
      return <ReaderPage key={path} />;
    case "/sessao":
      return <SessionPage key={path} />;
    case "/termos":
      return <TermsPage />;
    case "/privacidade":
      return <PrivacyPage />;
    case "/conectar-ia":
      return <ConectarIAPage />;
    default:
      return <HomePage key={path} />;
  }
}

function App() {
  return (
    <RouterProvider>
      <AppStateProvider>
        <div role="note" className="border-b border-line bg-surface px-4 py-2 text-center text-xs text-muted">
          Versão de teste. Sem login: {memoryOnly ? "os dados ficam só enquanto a página estiver aberta." : "os dados ficam neste navegador."}
        </div>
        <StorageBanner />
        <Nav />
        <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pb-12">
          <Page />
        </main>
        <Footer />
      </AppStateProvider>
    </RouterProvider>
  );
}

/** Usa o IndexedDB quando o navegador permite; senão, memória. */
async function chooseStorage() {
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const req = indexedDB.open("lemais-teste-sonda");
      const t = setTimeout(() => resolve(false), 1500);
      req.onsuccess = () => {
        clearTimeout(t);
        req.result.close();
        resolve(true);
      };
      req.onerror = () => {
        clearTimeout(t);
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
  if (ok) {
    try {
      await new IndexedDbRepository().listSessions();
      setRepo(new IndexedDbRepository());
      return;
    } catch {
      /* cai para memória */
    }
  }
  memoryOnly = true;
  setRepo(new MemoryRepository());
}

chooseStorage().then(() => {
  void repo();
  createRoot(document.getElementById("app")!).render(<App />);
});
