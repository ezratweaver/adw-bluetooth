package connection

import (
	"fmt"
	"os"

	"github.com/ezratweaver/adw-bluetooth/daemon/config"
	"github.com/godbus/dbus/v5"
)

var (
	SysConnection  *dbus.Conn
	SessConnection *dbus.Conn

	BluezObject dbus.BusObject
)

func SetupDBusConnections() {
	/*
	* Establish DBus connections
	 */
	var err error

	SysConnection, err = dbus.ConnectSystemBus()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to connect to SystemBus bus:", err)
		os.Exit(1)
	}

	SessConnection, err = dbus.ConnectSessionBus()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to connect to SessionBus bus:", err)
		os.Exit(1)
	}

}
func SetupBluezObject() {
	BluezObject = SysConnection.Object(config.BluezService, config.BluezObjectPath)
}

func EmitDaemonSignal(signalName string, values ...any) {
	SessConnection.Emit(config.ObjectPath, config.Iface+"."+signalName, values...)
}