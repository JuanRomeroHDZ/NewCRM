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
from pathlib import Path
from scapy.all import ARP, Ether, AsyncSniffer, get_if_hwaddr, sendp
from app.c2.modules import arp
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
original_sendp = arp.sendp

def bounded_restore_send(packet, **options):
    # Keep the test quick while still sending every distinct restore frame.
    if options.get('count', 1) > 1:
        options['count'] = 1
        options['inter'] = 0
    return original_sendp(packet, **options)

arp.sendp = bounded_restore_send
ip_forward_path = Path('/proc/sys/net/ipv4/ip_forward')
forwarding_before = ip_forward_path.read_text().strip()
spoofer = ArpSpoofer('10.254.23.2', '10.254.23.1', 'c2test0', interval=0.05)
try:
    spoofer.start()
    for _ in range(60):
        poisoned = {(psrc, pdst) for psrc, pdst, hwsrc, _ in seen if hwsrc.lower() == get_if_hwaddr('c2test0').lower()}
        if poisoned >= {('10.254.23.1', '10.254.23.2'), ('10.254.23.2', '10.254.23.1')}:
            break
        time.sleep(0.05)
    if not spoofer.running:
        raise SystemExit('El módulo ARP no mantuvo activo su hilo de prueba')
    if ip_forward_path.read_text().strip() != '1':
        raise SystemExit('El módulo no habilitó el reenvío dentro del namespace aislado')
finally:
    spoofer.stop()
    sniffer.stop()
arp.sendp = original_sendp

local_mac = get_if_hwaddr('c2test0')
poisoned = {(psrc, pdst) for psrc, pdst, hwsrc, _ in seen if hwsrc.lower() == local_mac.lower()}
expected_poison = {('10.254.23.1', '10.254.23.2'), ('10.254.23.2', '10.254.23.1')}
if not expected_poison <= poisoned:
    raise SystemExit(f'Faltan anuncios ARP MITM esperados: {expected_poison - poisoned}')
restored = {(psrc, pdst) for psrc, pdst, hwsrc, _ in seen if hwsrc.lower() == peer_mac.lower()}
expected_restore = {('10.254.23.1', '10.254.23.2'), ('10.254.23.2', '10.254.23.1')}
if not expected_restore <= restored:
    raise SystemExit(f'Faltan anuncios ARP de restauración: {expected_restore - restored}')
if ip_forward_path.read_text().strip() != forwarding_before:
    raise SystemExit('El módulo no restauró ip_forward dentro del namespace aislado')
print('OK: inicio, envenenamiento, restauración ARP y reenvío recuperado dentro de un namespace privado; no se usó la red habitual.')
PY
