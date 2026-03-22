package connection

import (
	"fmt"
	"os"

	"github.com/godbus/dbus/v5"
)

var (
	SysConnection  *dbus.Conn
	SessConnection *dbus.Conn
)

func SetupDBusConnections() {
	/*
	* Establish DBus connections
	 */
	SysConnection, err := dbus.ConnectSystemBus()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to connect to SystemBus bus:", err)
		os.Exit(1)
	}
	defer SysConnection.Close()

	SessConnection, err := dbus.ConnectSessionBus()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to connect to SessionBus bus:", err)
		os.Exit(1)
	}
	defer SessConnection.Close()
}
