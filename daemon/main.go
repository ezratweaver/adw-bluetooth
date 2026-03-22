package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/ezratweaver/adw-bluetooth/daemon/service"
	"github.com/godbus/dbus/v5"
	"github.com/godbus/dbus/v5/introspect"
)

const (
	ServiceName = "com.ezratweaver.AdwBluetoothDaemon"
	ObjectPath  = "/com/ezratweaver/AdwBluetoothDaemon"
	Iface       = "com.ezratweaver.AdwBluetoothDaemon"
)

func main() {
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

	svc := &service.AdwBluetoothDaemon{Connection: sysConnection}

	err = sessConnection.Export(svc, ObjectPath, Iface)
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

	log.Printf("Service running on session bus at %s\n\n", ObjectPath)
	log.Println("Awaiting D-Bus calls...")

	// Wait for SIGINT or SIGTERM
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down.")
}
