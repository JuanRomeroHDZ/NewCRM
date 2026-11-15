# C2 routes, authorization and verification

The CRM gateway at `/api/v1/c2` is the trust boundary. The worker currently defines exactly 11 GET and 46 POST routes; the gateway also exposes `GET /service`, `GET /engagements`, `GET /clients`, `POST /engagements`, and read-only `WS /ws`. All HTTP routes require an unlocked vault and an active owner session. In real mode, non-read routes require `X-C2-Engagement-Id`; the gateway reloads the engagement from the database and checks its state and UTC window on every request. Unknown GET routes fail closed until explicitly classified.

## Route inventory

| Worker route(s) | Classification | Scope checks |
| --- | --- | --- |
| `GET /service`, `/engagements`, `/clients` (CRM gateway) | Status and selector data | Owner + unlocked vault; no operation scope |
| `GET /meta`, `/interfaces`, `/status`, `/wifi/ifaces`, `/wifi/clients`, `/wifi/captures`, `/wifi/download`, `/creds/export`, `/opsec`, `/cleanup`, `/envcheck` | Read-only state/list/download | Owner + unlocked vault; `/wifi/download` filename is reduced to a capture basename and resolved under the capture directory |
| `GET /ws` | Event stream | Owner + unlocked vault; `engagement.<id>` is carried as a subprotocol and forwarded in a private header; no operation scope because it cannot start actions |
| `POST /discovery`, `/portscan`, `/fingerprint`, `/exploits/check`, `/camera/discover`, `/camera/audit`, `/topology` | Active reconnaissance | Active engagement, state/window, plus full target containment for supplied IP/CIDR; camera and topology targets are bounded before dispatch |
| `POST /arp/start` | ARP MITM | Active engagement and exact containment for both target and gateway IPv4; Scapy absence is 503 |
| `POST /httpinject/start` | HTTP redirect/injection | Active engagement and exact authorized `target_ip`; firewall redirect is source-restricted to that IPv4 and the listener binds only to the local address chosen for that target route |
| `POST /dns/start` | DNS spoof/capture | Active engagement, interface IPv4 network fully inside the scope, and mapped names/answer addresses must be in scope |
| `POST /sniff/start`, `/creds/start` | Packet capture | Active engagement and interface IPv4 network fully inside the scope; missing Scapy is 503 |
| `POST /wifi/monitor/start`, `/wifi/scan/start` | Local monitor setup and RF survey | Active engagement and selected interface IPv4 network fully inside the scope; monitor setup also requires a verified, disconnected adapter with an exclusive Wi-Fi PHY and no default route; the survey is receive-only |
| `POST /wifi/kill` | Deprecated compatibility response | Owner + unlocked vault; returns that LESSSO does not stop global services, performs no action, and does not require an engagement. `/wifi/restore-services` only restores services explicitly tracked as stopped by this process |
| `POST /wifi/deauth/start`, `/wifi/pmkid/start` | Targeted Wi-Fi operation | Active engagement and exact authorized AP BSSID; unicast deauth client must also be a detected client; PMKID BSSID is validated before capture |
| `POST /wifi/handshake/start` | Handshake capture | Active engagement, exact authorized BSSID, and an interface that exists on the worker. The capture persists only matching AP beacons and EAPOL frames |
| `POST /poison/start` | LLMNR/NBT-NS/mDNS spoofing | Active engagement, interface network containment, and spoof IPv4 target containment; missing Scapy is 503 |
| `POST /wpad/start` | WPAD service | Active engagement and interface network containment; PAC and proxy listeners bind only to the selected interface IPv4 |
| `POST /mitm6/start` | IPv6 RA/DNS operation | Active engagement, `authorized_ipv6_targets` must contain valid IPv6 CIDRs, selected interface must expose a matching non-link-local IPv6 CIDR, and mapping names/addresses must be in the approved scope |
| `POST /opsec/mac`, `/opsec/apply`, `/opsec/profile` | Local interface identity change | Active engagement and full interface IPv4 network containment; worker requires the selected interface to be down, unaddressed except IPv6 link-local, and without a default route; MAC changes leave it down and do not renew DHCP |
| `POST /opsec/hostname` | Local host identity change | Active engagement and authorization window; this action has no remote target to compare |
| `POST /wifi/convert` | Local capture conversion | Active engagement; input is reduced to a basename under the capture directory |
| `POST /opsec/preview`, `/opsec/generate` | Local preview/generation only | Owner + unlocked vault; these do not change machine state and are scope-exempt |
| `POST */stop`, `/wifi/monitor/stop`, `/wifi/restore-services`, `/opsec/restore`, `/creds/clear`, `/cleanup`, `/panic` | Stop, restore, or emergency cleanup | Owner + unlocked vault, no engagement required so expired scope cannot prevent shutdown/restoration |

The worker route inventory is defined in `backend/app/api/v1/c2.py`; the gateway classification is in `backend/app/api/v1/c2_proxy.py`, and target/interface checks are in `backend/app/services/c2_scope.py`.

## Authorization data

`PentestEngagement.authorized_targets` accepts IPs, IPv4/IPv6 networks, domains, wildcard domains and exact MAC addresses. The additional `authorized_ipv6_targets` field accepts only IPv6 CIDRs and is used for MITM6; it is additive and defaults to empty for old engagements. An empty or invalid IPv6 list blocks MITM6. The creation form validates this field server-side and exposes it beside ordinary targets.

The gateway checks target and interface scope before forwarding to the local Unix socket. Monitor-mode interfaces may temporarily have no IPv4 CIDR; a previously observed CIDR can be reused for up to 15 minutes, then the operation fails closed until the operator restores managed mode (the interface remains down) and reselects scope.

## Local network mutation safeguards

LESSSO never stops NetworkManager, wpa_supplicant, DHCP clients, or other host-wide services, and it does not call `airmon-ng check kill`. The legacy `POST /wifi/kill` endpoint is non-destructive and returns an explanation only. Monitor-mode changes fail closed unless the interface is already down, disconnected, has no routed IP address or default route, and is the only netdev on its Wi-Fi PHY. Leaving monitor mode switches only that adapter to managed mode and keeps it down.

OPSEC MAC changes, profile application, and restoration use the same down/no-address/no-default-route checks. They leave the adapter down and never renew DHCP or reconnect it automatically. Cleanup starts only services explicitly recorded as stopped by this LESSSO process; the current code records none. If a saved MAC cannot be restored safely, cleanup preserves it for later and reports the reason.

## Tests and limits

Unit tests cover target parsing/containment, exact BSSID authorization, IPv6 CIDR parsing/interface matching, engagement state/window, route classification, Wi-Fi client snapshot concurrency, unavailable optional tools, mocked lifecycle failures, and network mutation safety. Worker proxy tests use a temporary Unix socket and a demo worker. No tests send RF frames, ARP packets, IPv6 advertisements, firewall changes, or traffic to a physical network.

Hardware-only verification remains unavailable in this audit: channel changes, monitor-mode transitions, packet capture permissions, camera/device traffic, and recovery behavior require a separate isolated lab. Wi-Fi scans enumerate nearby RF observations even though they are receive-only; detected APs are not translated to IP assets. MITM6 is now blocked unless the interface's full global IPv6 CIDR is explicitly authorized.
