import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pt-12">
      <h1 className="font-serif text-3xl font-bold">Página não encontrada</h1>
      <Link href="/" className="btn btn-primary mt-4">
        Voltar ao início
      </Link>
    </div>
  );
}
