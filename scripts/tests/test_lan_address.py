"""Tests for choosing a private LAN address without widening the bind scope."""

import json
from unittest import mock
import unittest

from scripts import lan_address


class LanAddressTest(unittest.TestCase):
    def test_prefers_the_default_route_interface_and_excludes_containers(self):
        addr = [
            {"ifname": "docker0", "addr_info": [{"local": "172.18.0.1"}]},
            {"ifname": "wlo1", "addr_info": [{"local": "192.168.100.17"}]},
            {"ifname": "enp1s0", "addr_info": [{"local": "10.2.0.4"}]},
        ]
        routes = [{"dev": "wlo1", "gateway": "192.168.100.1"}]

        def run(command, **_kwargs):
            return mock.Mock(stdout=json.dumps(addr if "addr" in command else routes))

        with mock.patch.object(lan_address.subprocess, "run", side_effect=run):
            self.assertEqual(
                lan_address.list_private_ipv4(),
                [("wlo1", "192.168.100.17"), ("enp1s0", "10.2.0.4")],
            )

    def test_rejects_public_and_unassigned_addresses(self):
        with self.assertRaises(ValueError):
            lan_address.validate_bind_address("8.8.8.8")
        socket_mock = mock.MagicMock()
        socket_mock.__enter__.return_value = socket_mock
        socket_mock.bind.side_effect = OSError("unassigned")
        with mock.patch.object(lan_address.socket, "socket", return_value=socket_mock):
            with self.assertRaises(OSError):
                lan_address.validate_bind_address("192.168.100.17")

    def test_accepts_only_configured_local_address_or_loopback(self):
        socket_mock = mock.MagicMock()
        socket_mock.__enter__.return_value = socket_mock
        with mock.patch.object(lan_address.socket, "socket", return_value=socket_mock):
            lan_address.validate_bind_address("192.168.100.17")
            socket_mock.bind.assert_called_once_with(("192.168.100.17", 0))
            lan_address.validate_bind_address("127.0.0.1")
        with self.assertRaises(ValueError):
            lan_address.validate_bind_address("0.0.0.0")


if __name__ == "__main__":
    unittest.main()
