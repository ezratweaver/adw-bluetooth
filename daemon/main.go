package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/ezratweaver/adw-bluetooth/daemon/agents"
	"github.com/ezratweaver/adw-bluetooth/daemon/config"
	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/ezratweaver/adw-bluetooth/daemon/logger"
	"github.com/ezratweaver/adw-bluetooth/daemon/service"
	"github.com/godbus/dbus/v5"
	"github.com/godbus/dbus/v5/introspect"
)

var ServiceNode = &introspect.Node{
	Name: "/",
	Interfaces: []introspect.Interface{
		introspect.IntrospectData,
		{
			Name:    config.Iface,
			Methods: introspect.Methods(new(service.AdwBluetoothDaemon)),
			Signals: []introspect.Signal{
				{
					Name: "DisplayPinCode",
					Args: []introspect.Arg{
						{Name: "device", Type: "o", Direction: "out"},
						{Name: "pincode", Type: "s", Direction: "out"},
					},
				},
				{
					Name: "DisplayPasskey",
					Args: []introspect.Arg{
						{Name: "device", Type: "o", Direction: "out"},
						{Name: "passkey", Type: "u", Direction: "out"},
						{Name: "entered", Type: "q", Direction: "out"},
					},
				},
				{
					Name: "RequestConfirmation",
					Args: []introspect.Arg{
						{Name: "device", Type: "o", Direction: "out"},
						{Name: "passkey", Type: "u", Direction: "out"},
					},
				},
				{
					Name: "RequestAuthorization",
					Args: []introspect.Arg{
						{Name: "device", Type: "o", Direction: "out"},
					},
				},
				{
					Name: "DeviceAdded",
					Args: []introspect.Arg{
						{Name: "device", Type: "(osssbbbusasn)", Direction: "out"},
					},
				},
				{
					Name: "DeviceRemoved",
					Args: []introspect.Arg{
						{Name: "path", Type: "o", Direction: "out"},
					},
				},
				{
					Name: "DeviceUpdated",
					Args: []introspect.Arg{
						{Name: "device", Type: "(osssbbbusasn)", Direction: "out"},
					},
				},
				{
					Name: "AdapterAdded",
					Args: []introspect.Arg{
						{Name: "adapter", Type: "(osbb)", Direction: "out"},
					},
				},
				{
					Name: "AdapterRemoved",
					Args: []introspect.Arg{
						{Name: "path", Type: "o", Direction: "out"},
					},
				},
				{
					Name: "AdapterUpdated",
					Args: []introspect.Arg{
						{Name: "adapter", Type: "(osbb)", Direction: "out"},
					},
				},
			},
		},
	},
}

func registerDaemonOnDBus(daemon *service.AdwBluetoothDaemon) {
	err := connection.SessConnection.Export(daemon, config.ObjectPath, config.Iface)
	if err != nil {
		logger.L.Error("Failed to export service to session bus", "err", err)
		os.Exit(1)
	}

	err = connection.SessConnection.Export(introspect.NewIntrospectable(ServiceNode), config.ObjectPath, "org.freedesktop.DBus.Introspectable")
	if err != nil {
		logger.L.Error("Failed to export introspection", "err", err)
		os.Exit(1)
	}

	reply, err := connection.SessConnection.RequestName(config.ServiceName, dbus.NameFlagDoNotQueue)
	if err != nil {
		logger.L.Error("Failed to request D-Bus name", "err", err)
		os.Exit(1)
	}
	if reply != dbus.RequestNameReplyPrimaryOwner {
		logger.L.Error("D-Bus name already taken", "name", config.ServiceName)
		os.Exit(1)
	}
}

func main() {
	debug := flag.Bool("debug", false, "enable debug-level logging")
	flag.Parse()

	logger.Init(*debug)

	connection.SetupDBusConnections()

	defer connection.SysConnection.Close()
	defer connection.SessConnection.Close()

	connection.SetupBluezObject()

	/*
	* Register Bluetooth / OBEX agents
	 */
	err := agents.RegisterBluetoothAgent()
	if err != nil {
		logger.L.Error("Failed to register bluetooth agent", "err", err)
		os.Exit(1)
	}

	/*
	* Create and register daemon as DBus service
	 */
	daemon := service.NewAdwBluetoothDaemon()

	registerDaemonOnDBus(daemon)

	/*
	* Idle and wait for DBus calls
	 */
	logger.L.Info("Service running", "path", config.ObjectPath)

	// Wait for SIGINT or SIGTERM
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	err = agents.UnregisterBluetoothAgent()
	if err != nil {
		logger.L.Error("Failed to unregister Bluetooth agent", "err", err)
	}

	logger.L.Info("Shutting down.")
}
