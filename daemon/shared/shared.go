package shared

import "github.com/godbus/dbus/v5"

const (
	BluezService    = "org.bluez"
	BluezObjectPath = "/org/bluez"

	ServiceName = "com.ezratweaver.AdwBluetoothDaemon"
	ObjectPath  = "/com/ezratweaver/AdwBluetoothDaemon"
	Iface       = "com.ezratweaver.AdwBluetoothDaemon"
)

type DBusConnections struct {
	SysConnection  *dbus.Conn
	SessConnection *dbus.Conn
}