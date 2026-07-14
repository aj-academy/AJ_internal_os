import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

/** Consistent page title block for laptop + mobile. Additive — opt-in. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("aj-page-header", className)}>
      <div className="aj-page-header__copy">
        {kicker ? <p className="aj-page-kicker">{kicker}</p> : null}
        <h1 className="aj-page-title">{title}</h1>
        {description ? <p className="aj-page-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="aj-page-actions">{actions}</div> : null}
    </header>
  );
}
