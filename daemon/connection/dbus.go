package connection

import (
	"os"

	"github.com/ezratweaver/adw-bluetooth/daemon/config"
	"github.com/ezratweaver/adw-bluetooth/daemon/logger"
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
		logger.L.Error("Failed to connect to system bus", "err", err)
		os.Exit(1)
	}

	SessConnection, err = dbus.ConnectSessionBus()
	if err != nil {
		logger.L.Error("Failed to connect to session bus", "err", err)
		os.Exit(1)
	}

	logger.L.Debug("D-Bus connections established")
}

func SetupBluezObject() {
	BluezObject = SysConnection.Object(config.BluezService, config.BluezObjectPath)
	logger.L.Debug("BlueZ object cached", "path", config.BluezObjectPath)
}

func EmitDaemonSignal(signalName string, values ...any) error {
	err := SessConnection.Emit(config.ObjectPath, config.Iface+"."+signalName, values...)
	if err != nil {
		logger.L.Error("Failed to emit signal", "signal", signalName, "err", err)
	} else {
		logger.L.Debug("Signal emitted", "signal", signalName)
	}
	return err
}
