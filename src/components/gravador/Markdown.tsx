/** Markdown simples (títulos, listas, tarefas e negrito) sem injetar HTML. */
import { Fragment, type ReactNode } from "react";

function inline(s: string): ReactNode {
  const partes = s.split(/\*\*(.+?)\*\*/g);
  return partes.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>));
}

export function Markdown({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: { tarefa: boolean; texto: string }[] = [];
  const fecharLista = () => {
    if (!lista.length) return;
    blocos.push(
      <ul key={blocos.length} className="my-2 space-y-1 pl-5">
        {lista.map((it, i) => (
          <li key={i} className={it.tarefa ? "list-['☐__']" : "list-disc"}>
            {inline(it.texto)}
          </li>
        ))}
      </ul>,
    );
    lista = [];
  };
  for (const l of texto.split("\n")) {
    const item = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(\[[ xX]\]\s*)?(.*)$/);
    if (item) {
      lista.push({ tarefa: !!item[1], texto: item[2] });
      continue;
    }
    fecharLista();
    const h = l.match(/^#{1,4}\s+(.*)$/) || l.match(/^\*\*(.+?)\*\*:?\s*$/);
    if (h) blocos.push(<h3 key={blocos.length} className="mt-4 font-semibold first:mt-0">{inline(h[1])}</h3>);
    else if (l.trim()) blocos.push(<p key={blocos.length} className="my-2">{inline(l)}</p>);
  }
  fecharLista();
  return <>{blocos}</>;
}
