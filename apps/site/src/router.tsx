import {
  createContext,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface LocationState {
  pathname: string;
  search: string;
  hash: string;
}

interface RouterValue {
  location: LocationState;
  navigate(to: string, options?: { replace?: boolean }): void;
}

const RouterContext = createContext<RouterValue | null>(null);

function parseLocation(value: string): LocationState {
  const parsed = new URL(value, 'https://clervo.dev');
  return {
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
}

function currentLocation(): LocationState {
  return typeof location === 'undefined' ? parseLocation('/') : parseLocation(location.href);
}

export function Router({
  children,
  initialUrl,
}: {
  children: ReactNode;
  initialUrl?: string;
}) {
  const [value, setValue] = useState<LocationState>(() => (
    initialUrl === undefined ? currentLocation() : parseLocation(initialUrl)
  ));
  useEffect(() => {
    const update = () => setValue(currentLocation());
    addEventListener('popstate', update);
    return () => removeEventListener('popstate', update);
  }, []);
  const context = useMemo<RouterValue>(() => ({
    location: value,
    navigate(to, options = {}) {
      const target = new URL(to, location.origin);
      if (target.origin !== location.origin) throw new TypeError('cross_origin_navigation_rejected');
      const method = options.replace ? 'replaceState' : 'pushState';
      history[method](null, '', `${target.pathname}${target.search}${target.hash}`);
      setValue(currentLocation());
    },
  }), [value]);
  return <RouterContext.Provider value={context}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (value === null) throw new Error('clervo_router_missing');
  return value;
}

export function Link({
  to,
  onClick,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }) {
  const { navigate } = useRouter();
  const activate = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || props.target === '_blank'
    ) return;
    event.preventDefault();
    navigate(to);
  };
  return <a {...props} href={to} onClick={activate}>{children}</a>;
}
