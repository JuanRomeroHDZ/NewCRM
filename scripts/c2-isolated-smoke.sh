#!/usr/bin/env bash
# Tests ARP frames on an ephemeral veth pair in a private user/network namespace.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "${LESSSO_C2_ISOLATED_TEST:-}" != 1 ]]; then
  exec unshare --user --map-root-user --net env LESSSO_C2_ISOLATED_TEST=1 "$0"
fi
python_bin="$project_dir/backend/.venv-c2/bin/python"
if [[ ! -x "$python_bin" ]]; then
  printf '%s\n' 'Falta el entorno C2; prepáralo con ./lessso.' >&2
  exit 1
fi
ip link add c2test0 type veth peer name c2test1
ip addr add 10.254.23.3/24 dev c2test0
ip link set c2test0 up
ip link set c2test1 up
cd "$project_dir/backend"
"$python_bin" - <<'PY'
import threading
import time
from scapy.all import ARP, Ether, AsyncSniffer, get_if_hwaddr, sendp
from app.c2.modules.arp import ArpSpoofer

seen = []
ready = threading.Event()
peer_mac = get_if_hwaddr('c2test1')
def receive(packet):
    if not packet.haslayer(ARP):
        return
    arp = packet[ARP]
    if arp.op == 1 and arp.pdst in ('10.254.23.1', '10.254.23.2'):
        sendp(Ether(dst=packet[Ether].src, src=peer_mac) /
              ARP(op=2, hwsrc=peer_mac, psrc=arp.pdst, hwdst=arp.hwsrc, pdst=arp.psrc),
              iface='c2test1', verbose=0)
    elif arp.op == 2:
        seen.append((arp.psrc, arp.pdst, arp.hwsrc, packet[Ether].src))

sniffer = AsyncSniffer(iface='c2test1', prn=receive, started_callback=ready.set, store=False)
sniffer.start()
if not ready.wait(3):
    raise SystemExit('No se pudo iniciar la captura aislada')
spoofer = ArpSpoofer('10.254.23.2', '10.254.23.1', 'c2test0')
spoofer.target_mac = spoofer._resolve_mac(spoofer.target_ip)
spoofer.gateway_mac = spoofer._resolve_mac(spoofer.gateway_ip)
if not spoofer.target_mac or not spoofer.gateway_mac:
    raise SystemExit('No se pudieron resolver las MAC en la red aislada')
spoofer._poison()
for _ in range(20):
    if len(seen) >= 2:
        break
    time.sleep(0.05)
sniffer.stop()
local_mac = get_if_hwaddr('c2test0')
pairs = set(seen)
expected = {('10.254.23.1', '10.254.23.2', local_mac, local_mac),
            ('10.254.23.2', '10.254.23.1', local_mac, local_mac)}
if not expected <= pairs:
    raise SystemExit(f'Faltan tramas ARP esperadas: {expected - pairs}')
print('OK: resolución y envío ARP en interfaz aislada; ninguna trama salió a la red habitual.')
PY
