"""Dangerous C2 options stay opt-in when API clients omit them."""

from app.api.v1.c2 import (
    DeauthReq,
    HandshakeReq,
    HttpInjectReq,
    PoisonReq,
    PmkidReq,
    WifiMonitorReq,
    WifiScanReq,
)


def test_interception_and_poisoners_are_disabled_by_default():
    assert HttpInjectReq(target_ip="192.0.2.2").sslstrip is False

    poison = PoisonReq(interface="test0")
    assert poison.llmnr is False
    assert poison.nbtns is False
    assert poison.mdns is False


def test_wifi_interface_preparation_is_explicit_by_default():
    assert WifiMonitorReq(interface="test0").prepare is False
    assert WifiScanReq(interface="test0").prepare is False
    assert DeauthReq(interface="test0", bssid="02:00:00:00:00:01").prepare is False
    assert PmkidReq(interface="test0", bssid="02:00:00:00:00:01").prepare is False
    assert HandshakeReq(interface="test0", bssid="02:00:00:00:00:01").prepare is False
