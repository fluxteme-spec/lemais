import { forwardRef } from "react";
import { useNav } from "../router";

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean };

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, onClick, target, prefetch: _p, ...rest }, ref) {
  const nav = useNav();
  const internal = href.startsWith("/") && !target;
  return (
    <a
      ref={ref}
      href={internal ? "#" : href}
      target={internal ? undefined : target}
      onClick={(e) => {
        onClick?.(e);
        if (internal && !e.defaultPrevented) {
          e.preventDefault();
          nav.go(href);
        }
      }}
      {...rest}
    />
  );
});
export default Link;
