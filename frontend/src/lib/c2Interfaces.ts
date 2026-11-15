import type { C2Gateway, C2Interface } from '../types/c2';

/** Preserve an explicit selection; otherwise prefer the default route's interface. */
export function selectC2Interface(interfaces: C2Interface[], gateway: C2Gateway | null | undefined, previous: string): string {
  if (previous && interfaces.some((iface) => iface.name === previous)) return previous;
  if (gateway?.iface && interfaces.some((iface) => iface.name === gateway.iface)) return gateway.iface;
  return interfaces[0]?.name || '';
}
