package service

import "github.com/godbus/dbus/v5"

type AdwBluetoothDaemon struct {
	SysConnection *dbus.Conn
}
