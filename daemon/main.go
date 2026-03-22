package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/ezratweaver/adw-bluetooth/daemon/agents"
	"github.com/ezratweaver/adw-bluetooth/daemon/service"
	"github.com/godbus/dbus/v5"
	"github.com/godbus/dbus/v5/introspect"
)

const (
	BluezService    = "org.bluez"
	BluezObjectPath = "/org/bluez"

	ServiceName = "com.ezratweaver.AdwBluetoothDaemon"
	ObjectPath  = "/com/ezratweaver/AdwBluetoothDaemon"
	Iface       = "com.ezratweaver.AdwBluetoothDaemon"
)

var ServiceNode = &introspect.Node{
	Name: ObjectPath,
	Interfaces: []introspect.Interface{
		introspect.IntrospectData,
		{
			Name:    Iface,
			Methods: introspect.Methods(new(service.AdwBluetoothDaemon)),
		},
	},
}

func main() {
	/*
	* Establish DBus connections
	 */
	sysConnection, err := dbus.ConnectSystemBus()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to connect to SystemBus bus:", err)
		os.Exit(1)
	}
	defer sysConnection.Close()

	sessConnection, err := dbus.ConnectSessionBus()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to connect to SessionBus bus:", err)
		os.Exit(1)
	}
	defer sessConnection.Close()

	/*
	* Create and register daemon as DBus service
	 */
	daemon := &service.AdwBluetoothDaemon{SysConnection: sysConnection}

	err = sessConnection.Export(daemon, ObjectPath, Iface)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to export service to session bus:", err)
		os.Exit(1)
	}

	err = sessConnection.Export(introspect.NewIntrospectable(ServiceNode), ObjectPath, "org.freedesktop.DBus.Introspectable")
	if err != nil {
		log.Fatalf("Failed to export introspection: %v", err)
	}

	reply, err := sessConnection.RequestName(ServiceName, dbus.NameFlagDoNotQueue)
	if err != nil {
		log.Fatalf("Failed to request name: %v", err)
	}
	if reply != dbus.RequestNameReplyPrimaryOwner {
		log.Fatalf("Name already taken: %s", ServiceName)
	}

	/*
	* Register Bluetooth / OBEX agents
	 */
	bluezObject := sysConnection.Object(BluezService, BluezObjectPath)

	err = agents.RegisterBluetoothAgent(bluezObject, sysConnection)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to register bluetooth agent:", err)
		os.Exit(1)
	}

	/*
	* Idle and wait for DBus calls
	 */
	log.Printf("Service running on session bus at %s\n\n", ObjectPath)
	log.Println("Awaiting D-Bus calls...")

	// Wait for SIGINT or SIGTERM
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	err = agents.UnregisterBluetoothAgent(bluezObject)
	if err != nil {
		log.Printf("Failed to unregister Bluetooth agent: %v", err)
	}

	log.Println("Shutting down.")
}
