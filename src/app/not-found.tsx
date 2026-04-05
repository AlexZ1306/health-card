import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#ffffff_45%,_#ecfeff)]">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-16 text-center">
        <Image src="/logo.svg" alt="Логотип" width={140} height={36} priority />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-foreground">Страница не найдена</h1>
          <p className="text-sm text-muted-foreground">
            Такой страницы нет. Вернитесь на главный дашборд.
          </p>
        </div>
        <Button asChild>
          <Link href="/">На дашборд</Link>
        </Button>
      </div>
    </div>
  );
}
